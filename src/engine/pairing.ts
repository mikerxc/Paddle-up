import type { Gender } from "../model.ts";

/**
 * Doubles planner for open play.
 *
 * Sit-outs: the players with the fewest scheduled games play. Among a tie,
 * whoever played least recently goes first, then whoever has sat more.
 * A full cycle with a stable group keeps games and sits within one of each
 * other. One court is just this rule with 4 spots.
 *
 * Late arrivals get no priority and no guaranteed next game. Their scheduling
 * counter is set to the group's current minimum, and their "last played"
 * marker matches the most recent player in that group, so they join the
 * normal rotation. They are not given phantom sit-outs for rounds they missed,
 * and they are not left at zero games, which would make them play every
 * remaining round.
 *
 * Pairing: search the lineups and reject women-vs-men unless nothing else
 * exists. Mixed-vs-mixed and same-gender-vs-same-gender are both preferred.
 * Team skill totals stay close, but a small gap is allowed when it rotates
 * partners and opponents.
 *
 * On a court of four, the two lowest-rated players are not paired together
 * against the two highest when the skills differ. The search keeps a
 * strong+developing team on each side of the net instead. The lowest-rated
 * players in the whole round are also kept off the same team when another
 * fair lineup exists, including a court of equally low players.
 *
 * After any round, at any group size, players coming back from a sit-out are
 * mixed with players who stayed on court. Nobody partners with the same
 * person two rounds in a row when another lineup still avoids a women-vs-men
 * match and a low-vs-high stack. Older partner counts outweigh team-skill
 * gap, but they stay under that mix and the protections above.
 */

export interface EnginePlayer {
  id: string;
  gender: Gender;
  skill: number;
}

export interface SchedState {
  /** Fairness counter. Starters begin at 0. Late arrivals are seeded higher. */
  scheduleGames: number;
  gamesPlayed: number;
  sitOuts: number;
  lastPlayedRound: number;
  lastSatRound: number;
}

export interface Ledger {
  partners: Record<string, number>;
  opponents: Record<string, number>;
  /** Partnerships from the immediately previous round only. */
  lastPartners: Record<string, number>;
}

export interface PlannedMatch {
  court: number;
  teamA: [string, string];
  teamB: [string, string];
}

export interface RoundPlan {
  roundNumber: number;
  courtsUsed: number;
  matches: PlannedMatch[];
  sittingOut: string[];
}

export type GenderPattern = "mixed_mixed" | "same_same" | "mixed_same" | "women_vs_men";

/**
 * Weights are compared directly. Each tier stays larger than a realistic
 * total of the tiers under it. Who sits is chosen before this search.
 */
export const WEIGHT = {
  womenVsMen: 1_000_000_000,
  /** Two lowest on a court versus the two highest on that court. */
  stackedSkills: 100_000_000,
  /** Lowest-rated players in the whole round are partners. */
  lowestPair: 10_000_000,
  /**
   * Same partnership as the immediately previous round.
   * Below a low-high stack, above mixing and older repeat counts.
   */
  consecutivePartner: 1_000_000,
  /** Two returners together, or two stayers together, when the other group is also playing. */
  unmixedPair: 50_000,
  /** One earlier game together. Outweighs skill gap, under the mix rule. */
  partnerEach: 6_000,
  mixedSame: 800,
  /** Cost of a 0.1 gap between the two team skill totals. A full point is 200. */
  skillTenth: 20,
  opponentEach: 140,
  courtSkew: 4,
} as const;

/** How far above the best soft cost a reshuffle may reach to find another fair lineup. */
const VARIETY_BAND = 300;

export function newSched(): SchedState {
  return {
    scheduleGames: 0,
    gamesPlayed: 0,
    sitOuts: 0,
    lastPlayedRound: -1,
    lastSatRound: -1,
  };
}

export function emptyLedger(): Ledger {
  return { partners: {}, opponents: {}, lastPartners: {} };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function pairCount(map: Record<string, number>, a: string, b: string): number {
  return map[pairKey(a, b)] ?? 0;
}

export function courtsFor(playerCount: number, courts: number): number {
  if (playerCount < 4 || courts < 1) return 0;
  return Math.min(courts, Math.floor(playerCount / 4));
}

function fnv(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function skillTenths(skill: number): number {
  return Math.round(skill * 10);
}

export function teamKind(genderOf: (id: string) => Gender, team: [string, string]): "F" | "M" | "X" {
  const left = genderOf(team[0]);
  const right = genderOf(team[1]);
  if (left === "female" && right === "female") return "F";
  if (left === "male" && right === "male") return "M";
  return "X";
}

export function genderPattern(left: "F" | "M" | "X", right: "F" | "M" | "X"): GenderPattern {
  if ((left === "F" && right === "M") || (left === "M" && right === "F")) return "women_vs_men";
  if (left === "X" && right === "X") return "mixed_mixed";
  if (left === right) return "same_same";
  return "mixed_same";
}

export function matchPattern(
  genderOf: (id: string) => Gender,
  teamA: [string, string],
  teamB: [string, string],
): GenderPattern {
  return genderPattern(teamKind(genderOf, teamA), teamKind(genderOf, teamB));
}

function schedOf(sched: Record<string, SchedState>, id: string): SchedState {
  return sched[id] ?? newSched();
}

function comparePlay(
  a: EnginePlayer,
  b: EnginePlayer,
  sched: Record<string, SchedState>,
  roundNumber: number,
  salt: number,
): number {
  const sa = schedOf(sched, a.id);
  const sb = schedOf(sched, b.id);
  if (sa.scheduleGames !== sb.scheduleGames) return sa.scheduleGames - sb.scheduleGames;
  if (sa.lastPlayedRound !== sb.lastPlayedRound) return sa.lastPlayedRound - sb.lastPlayedRound;
  if (sa.sitOuts !== sb.sitOuts) return sb.sitOuts - sa.sitOuts;
  const hashA = fnv(`${a.id}#${roundNumber}#${salt}`);
  const hashB = fnv(`${b.id}#${roundNumber}#${salt}`);
  if (hashA !== hashB) return hashA < hashB ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function choosePlaying(
  players: EnginePlayer[],
  sched: Record<string, SchedState>,
  spots: number,
  roundNumber: number,
  salt: number,
): { playing: EnginePlayer[]; sittingOut: string[] } {
  const ranked = [...players].sort((a, b) => comparePlay(a, b, sched, roundNumber, salt));
  const playing = ranked.slice(0, spots);
  const playingIds = new Set(playing.map((player) => player.id));
  const sittingOut = players
    .filter((player) => !playingIds.has(player.id))
    .map((player) => player.id)
    .sort();
  return { playing, sittingOut };
}

interface Split {
  teamA: [EnginePlayer, EnginePlayer];
  teamB: [EnginePlayer, EnginePlayer];
}

function splitsOf(group: EnginePlayer[]): Split[] {
  const [a, b, c, d] = group;
  if (!a || !b || !c || !d) return [];
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];
}

function combinations<T>(items: readonly T[], count: number): T[][] {
  const found: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === count) {
      found.push([...pick]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined) continue;
      pick.push(item);
      walk(index + 1);
      pick.pop();
    }
  };
  walk(0);
  return found;
}

function partitions(players: EnginePlayer[]): EnginePlayer[][][] {
  const found: EnginePlayer[][][] = [];
  const walk = (remaining: EnginePlayer[], acc: EnginePlayer[][]) => {
    if (remaining.length === 0) {
      found.push(acc);
      return;
    }
    const first = remaining[0];
    if (!first) return;
    const rest = remaining.slice(1);
    if (rest.length < 3) return;
    for (const combo of combinations(rest, 3)) {
      const used = new Set(combo.map((player) => player.id));
      const next = rest.filter((player) => !used.has(player.id));
      walk(next, [...acc, [first, ...combo]]);
    }
  };
  walk(
    [...players].sort((a, b) => a.id.localeCompare(b.id)),
    [],
  );
  return found;
}

function orderTeam(a: EnginePlayer, b: EnginePlayer): [string, string] {
  if (a.skill !== b.skill) return a.skill > b.skill ? [a.id, b.id] : [b.id, a.id];
  return a.id < b.id ? [a.id, b.id] : [b.id, a.id];
}

function isStackedSplit(split: Split): boolean {
  const players = [split.teamA[0], split.teamA[1], split.teamB[0], split.teamB[1]];
  return isLowHighStack(players, [split.teamA[0].id, split.teamA[1].id], [split.teamB[0].id, split.teamB[1].id]);
}

interface MixContext {
  lastPartners: Record<string, number>;
  stayers: ReadonlySet<string>;
  returners: ReadonlySet<string>;
  lowestBan: ReadonlySet<string>;
}

/** Players at the bottom of the round who should not partner each other. */
function lowestBanIds(players: readonly EnginePlayer[]): Set<string> {
  if (players.length < 2) return new Set();
  const sorted = [...players].sort(bySkillThenId);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  if (!lowest || !highest || lowest.skill === highest.skill) return new Set();
  const atMin = sorted.filter((player) => player.skill === lowest.skill);
  if (atMin.length >= 2) return new Set(atMin.map((player) => player.id));
  const second = sorted[1];
  if (!second || second.skill === highest.skill) return new Set();
  return new Set([lowest.id, second.id]);
}

function mixContext(
  playing: readonly EnginePlayer[],
  sched: Record<string, SchedState>,
  ledger: Ledger,
  roundNumber: number,
): MixContext {
  const stayers = new Set<string>();
  const returners = new Set<string>();
  for (const player of playing) {
    const state = schedOf(sched, player.id);
    if (state.lastPlayedRound === roundNumber - 1) stayers.add(player.id);
    else if (state.lastSatRound === roundNumber - 1) returners.add(player.id);
  }
  return { lastPartners: ledger.lastPartners ?? {}, stayers, returners, lowestBan: lowestBanIds(playing) };
}

function sameCohort(mix: MixContext, a: string, b: string): boolean {
  if (mix.stayers.size === 0 || mix.returners.size === 0) return false;
  const cohort = (id: string) => (mix.stayers.has(id) ? "stay" : mix.returners.has(id) ? "return" : "");
  const left = cohort(a);
  const right = cohort(b);
  return left !== "" && left === right;
}

function splitCost(
  split: Split,
  ledger: Ledger,
  byId: Map<string, EnginePlayer>,
  totalTenths: number,
  playerCount: number,
  mix: MixContext,
): number {
  const genderOf = (id: string) => byId.get(id)?.gender ?? "male";
  const teamA = orderTeam(split.teamA[0], split.teamA[1]);
  const teamB = orderTeam(split.teamB[0], split.teamB[1]);
  const pattern = matchPattern(genderOf, teamA, teamB);
  let cost = 0;
  if (pattern === "women_vs_men") cost += WEIGHT.womenVsMen;
  else if (pattern === "mixed_same") cost += WEIGHT.mixedSame;
  if (isStackedSplit(split)) cost += WEIGHT.stackedSkills;
  const sumA = skillTenths(split.teamA[0].skill) + skillTenths(split.teamA[1].skill);
  const sumB = skillTenths(split.teamB[0].skill) + skillTenths(split.teamB[1].skill);
  cost += Math.abs(sumA - sumB) * WEIGHT.skillTenth;
  cost += pairCount(ledger.partners, teamA[0], teamA[1]) * WEIGHT.partnerEach;
  cost += pairCount(ledger.partners, teamB[0], teamB[1]) * WEIGHT.partnerEach;
  for (const left of teamA) {
    for (const right of teamB) cost += pairCount(ledger.opponents, left, right) * WEIGHT.opponentEach;
  }
  for (const team of [teamA, teamB]) {
    if (mix.lowestBan.size >= 2 && mix.lowestBan.has(team[0]) && mix.lowestBan.has(team[1])) {
      cost += WEIGHT.lowestPair;
    }
    if (pairCount(mix.lastPartners, team[0], team[1]) > 0) cost += WEIGHT.consecutivePartner;
    if (sameCohort(mix, team[0], team[1])) cost += WEIGHT.unmixedPair;
  }
  const courtSum = sumA + sumB;
  const skew = Math.abs(courtSum * playerCount - totalTenths * 4);
  cost += Math.floor(skew / Math.max(1, playerCount)) * WEIGHT.courtSkew;
  return cost;
}

function toMatch(split: Split, court: number): PlannedMatch {
  return {
    court,
    teamA: orderTeam(split.teamA[0], split.teamA[1]),
    teamB: orderTeam(split.teamB[0], split.teamB[1]),
  };
}

function planKey(matches: readonly PlannedMatch[]): string {
  return matches
    .map((match) => {
      const side = (team: [string, string]) => [...team].sort().join("+");
      return [side(match.teamA), side(match.teamB)].sort().join("~");
    })
    .sort()
    .join("||");
}

function numberCourts(matches: PlannedMatch[]): PlannedMatch[] {
  return [...matches]
    .sort((a, b) => planKey([a]).localeCompare(planKey([b])))
    .map((match, index) => ({ ...match, court: index + 1 }));
}

interface ScoredPlan {
  cost: number;
  key: string;
  matches: PlannedMatch[];
}

function copyMatches(matches: PlannedMatch[]): PlannedMatch[] {
  return matches.map((match) => ({
    ...match,
    teamA: [...match.teamA] as [string, string],
    teamB: [...match.teamB] as [string, string],
  }));
}

function selectPlan(best: PlannedMatch[], band: ScoredPlan[], bestCost: number, variety: number, avoidKey: string): PlannedMatch[] {
  if (!variety && !avoidKey) return best;
  const viable = new Map<string, ScoredPlan>();
  for (const item of band) {
    if (item.cost > bestCost + VARIETY_BAND) continue;
    const prev = viable.get(item.key);
    if (!prev || item.cost < prev.cost) viable.set(item.key, item);
  }
  if (best.length > 0) {
    const key = planKey(best);
    const prev = viable.get(key);
    if (!prev || bestCost < prev.cost) viable.set(key, { cost: bestCost, key, matches: best });
  }
  const pool = [...viable.values()];
  if (pool.length === 0) return best;
  const costs = [...new Set(pool.map((item) => item.cost))].sort((a, b) => a - b);
  for (const cost of costs) {
    if (cost > bestCost + VARIETY_BAND) break;
    let tier = pool.filter((item) => item.cost === cost);
    if (avoidKey) {
      const different = tier.filter((item) => item.key !== avoidKey);
      if (different.length === 0) continue;
      tier = different;
    }
    tier.sort((a, b) => {
      const hashA = fnv(`${a.key}#${variety}`);
      const hashB = fnv(`${b.key}#${variety}`);
      if (hashA !== hashB) return hashA < hashB ? -1 : 1;
      return a.key < b.key ? -1 : 1;
    });
    return tier[0]?.matches ?? best;
  }
  return best;
}

function bestAssignment(playing: EnginePlayer[], ledger: Ledger, mix: MixContext, variety = 0, avoidKey = ""): PlannedMatch[] {
  if (playing.length === 0) return [];
  if (playing.length > 12) return hillClimb(playing, ledger, mix, variety, avoidKey);
  const byId = new Map(playing.map((player) => [player.id, player]));
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKey = "";
  let best: PlannedMatch[] = [];
  const band: ScoredPlan[] = [];
  const wantsChoice = variety !== 0 || avoidKey !== "";

  for (const groups of partitions(playing)) {
    const options = groups.map((group) => splitsOf(group));
    const walk = (index: number, acc: PlannedMatch[], cost: number) => {
      if (!wantsChoice && cost > bestCost) return;
      if (wantsChoice && cost > bestCost + VARIETY_BAND) return;
      if (index === options.length) {
        const key = planKey(acc);
        const matches = copyMatches(acc);
        if (cost < bestCost || (cost === bestCost && key < bestKey)) {
          bestCost = cost;
          bestKey = key;
          best = matches;
        }
        if (wantsChoice) band.push({ cost, key, matches });
        return;
      }
      const splits = options[index] ?? [];
      for (const split of splits) {
        const added = splitCost(split, ledger, byId, totalTenths, playing.length, mix);
        walk(index + 1, [...acc, toMatch(split, index + 1)], cost + added);
      }
    };
    walk(0, [], 0);
  }
  return numberCourts(selectPlan(best, band, bestCost, variety, avoidKey));
}

function bySkillThenId(a: EnginePlayer, b: EnginePlayer): number {
  if (a.skill !== b.skill) return a.skill - b.skill;
  return a.id.localeCompare(b.id);
}

function dealCourts(players: EnginePlayer[], courtCount: number): EnginePlayer[][] {
  const groups: EnginePlayer[][] = Array.from({ length: courtCount }, () => []);
  const women = players.filter((player) => player.gender === "female").sort(bySkillThenId);
  const men = players.filter((player) => player.gender === "male").sort(bySkillThenId);
  for (let court = 0; court < courtCount; court += 1) {
    const start = Math.round((court * women.length) / courtCount);
    const end = Math.round(((court + 1) * women.length) / courtCount);
    const group = groups[court];
    if (!group) continue;
    for (let index = start; index < end; index += 1) {
      const player = women[index];
      if (player) group.push(player);
    }
  }
  let manIndex = 0;
  for (const group of groups) {
    while (group.length < 4 && manIndex < men.length) {
      const player = men[manIndex];
      if (player) group.push(player);
      manIndex += 1;
    }
  }
  return groups;
}

function bestSplit(
  group: EnginePlayer[],
  ledger: Ledger,
  totalTenths: number,
  playerCount: number,
  mix: MixContext,
  variety = 0,
): PlannedMatch {
  const byId = new Map(group.map((player) => [player.id, player]));
  let best: PlannedMatch | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const split of splitsOf(group)) {
    const match = toMatch(split, 1);
    const key = planKey([match]);
    const jitter = variety ? fnv(`${key}#${variety}`) % 11 : 0;
    const cost = splitCost(split, ledger, byId, totalTenths, playerCount, mix) + jitter;
    if (cost < bestCost || (cost === bestCost && key < bestKey)) {
      bestCost = cost;
      bestKey = key;
      best = match;
    }
  }
  if (!best) {
    throw new Error("A court of four players has no team split.");
  }
  return best;
}

function assignmentCost(matches: PlannedMatch[], playing: EnginePlayer[], ledger: Ledger, mix: MixContext): number {
  const byId = new Map(playing.map((player) => [player.id, player]));
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  let cost = 0;
  for (const match of matches) {
    const teamA = match.teamA.map((id) => byId.get(id)).filter((player): player is EnginePlayer => !!player);
    const teamB = match.teamB.map((id) => byId.get(id)).filter((player): player is EnginePlayer => !!player);
    if (teamA.length !== 2 || teamB.length !== 2) continue;
    const split: Split = {
      teamA: [teamA[0], teamA[1]],
      teamB: [teamB[0], teamB[1]],
    };
    cost += splitCost(split, ledger, byId, totalTenths, playing.length, mix);
  }
  return cost;
}

function hillClimb(playing: EnginePlayer[], ledger: Ledger, mix: MixContext, variety = 0, avoidKey = ""): PlannedMatch[] {
  const climb = (seed: number) => climbOnce(playing, ledger, mix, seed);
  let matches = climb(variety);
  if (!variety && !avoidKey) return matches;
  for (let attempt = 0; attempt < 5 && assignmentKey(matches) === avoidKey; attempt += 1) {
    const next = climb(variety + attempt + 1);
    if (assignmentKey(next) !== avoidKey) return next;
    matches = next;
  }
  return matches;
}

function climbOnce(playing: EnginePlayer[], ledger: Ledger, mix: MixContext, variety: number): PlannedMatch[] {
  const courtCount = playing.length / 4;
  const groups = dealCourts(playing, courtCount);
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  let matches = numberCourts(groups.map((group) => bestSplit(group, ledger, totalTenths, playing.length, mix, variety)));
  let bestCost = assignmentCost(matches, playing, ledger, mix);
  let bestKey = planKey(matches);

  for (let pass = 0; pass < 24; pass += 1) {
    let improved = false;
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const groupA = groups[left];
        const groupB = groups[right];
        if (!groupA || !groupB) continue;
        for (let a = 0; a < groupA.length; a += 1) {
          for (let b = 0; b < groupB.length; b += 1) {
            const nextA = [...groupA];
            const nextB = [...groupB];
            const playerA = nextA[a];
            const playerB = nextB[b];
            if (!playerA || !playerB) continue;
            nextA[a] = playerB;
            nextB[b] = playerA;
            const trialGroups = groups.map((group, index) => {
              if (index === left) return nextA;
              if (index === right) return nextB;
              return group;
            });
            const trial = numberCourts(trialGroups.map((group) => bestSplit(group, ledger, totalTenths, playing.length, mix, variety)));
            const cost = assignmentCost(trial, playing, ledger, mix);
            const key = planKey(trial);
            if (cost < bestCost || (cost === bestCost && key < bestKey)) {
              groups[left] = nextA;
              groups[right] = nextB;
              matches = trial;
              bestCost = cost;
              bestKey = key;
              improved = true;
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  return matches;
}

export function planRound(
  players: EnginePlayer[],
  sched: Record<string, SchedState>,
  ledger: Ledger,
  courts: number,
  roundNumber: number,
  salt = 1,
  variety?: PlanVariety,
): RoundPlan {
  const spots = courtsFor(players.length, courts) * 4;
  const { playing, sittingOut } = choosePlaying(players, sched, spots, roundNumber, salt);
  const mix = mixContext(playing, sched, ledger, roundNumber);
  return {
    roundNumber,
    courtsUsed: playing.length / 4,
    matches: bestAssignment(playing, ledger, mix, variety?.variety ?? 0, variety?.avoidKey ?? ""),
    sittingOut,
  };
}

export function applyRound(
  sched: Record<string, SchedState>,
  ledger: Ledger,
  plan: RoundPlan,
): { sched: Record<string, SchedState>; ledger: Ledger } {
  const nextSched: Record<string, SchedState> = {};
  for (const [id, state] of Object.entries(sched)) nextSched[id] = { ...state };
  const nextLedger: Ledger = {
    partners: { ...ledger.partners },
    opponents: { ...ledger.opponents },
    lastPartners: {},
  };
  const playing = new Set(plan.matches.flatMap((match) => [...match.teamA, ...match.teamB]));
  const touch = (id: string) => {
    const current = nextSched[id] ?? newSched();
    nextSched[id] = current;
    return current;
  };
  for (const id of playing) {
    const state = touch(id);
    state.gamesPlayed += 1;
    state.scheduleGames += 1;
    state.lastPlayedRound = plan.roundNumber;
  }
  for (const id of plan.sittingOut) {
    const state = touch(id);
    state.sitOuts += 1;
    state.lastSatRound = plan.roundNumber;
  }
  const bump = (map: Record<string, number>, a: string, b: string) => {
    const key = pairKey(a, b);
    map[key] = (map[key] ?? 0) + 1;
  };
  for (const match of plan.matches) {
    bump(nextLedger.partners, match.teamA[0], match.teamA[1]);
    bump(nextLedger.partners, match.teamB[0], match.teamB[1]);
    bump(nextLedger.lastPartners, match.teamA[0], match.teamA[1]);
    bump(nextLedger.lastPartners, match.teamB[0], match.teamB[1]);
    for (const left of match.teamA) {
      for (const right of match.teamB) bump(nextLedger.opponents, left, right);
    }
  }
  return { sched: nextSched, ledger: nextLedger };
}

export function teamSkillGap(
  skillOf: (id: string) => number,
  teamA: [string, string],
  teamB: [string, string],
): number {
  const sum = (team: [string, string]) => skillTenths(skillOf(team[0])) + skillTenths(skillOf(team[1]));
  return Math.abs(sum(teamA) - sum(teamB)) / 10;
}

/** True when one team is the two lowest-rated players and the other is the two highest. */
export function isLowHighStack(
  players: readonly { id: string; skill: number }[],
  teamA: readonly string[],
  teamB: readonly string[],
): boolean {
  const ids = [...teamA, ...teamB];
  if (ids.length !== 4 || new Set(ids).size !== 4) return false;
  const skillOf = new Map(players.map((player) => [player.id, player.skill]));
  const ranked = [...ids].sort((a, b) => {
    const diff = (skillOf.get(a) ?? 0) - (skillOf.get(b) ?? 0);
    if (diff !== 0) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const low = skillOf.get(ranked[0] ?? "");
  const high = skillOf.get(ranked[3] ?? "");
  if (low === undefined || high === undefined || low === high) return false;
  const lowest = new Set(ranked.slice(0, 2));
  const isLowPair = (team: readonly string[]) => team.every((id) => lowest.has(id));
  return isLowPair(teamA) || isLowPair(teamB);
}

export function assignmentKey(matches: readonly PlannedMatch[]): string {
  return planKey(matches);
}

export interface PlanVariety {
  /** Non-zero asks for a different fair lineup when one exists. */
  variety?: number;
  /** Lineup to skip when another fair one is available. */
  avoidKey?: string;
}
