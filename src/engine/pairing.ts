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

/** Weights are compared directly. A women-vs-men match loses to any legal lineup. */
export const WEIGHT = {
  womenVsMen: 100_000,
  mixedSame: 800,
  /** Cost of a 0.1 gap between the two team skill totals. A full point is 200. */
  skillTenth: 20,
  partnerEach: 280,
  opponentEach: 140,
  courtSkew: 4,
} as const;

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
  return { partners: {}, opponents: {} };
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

function splitCost(
  split: Split,
  ledger: Ledger,
  byId: Map<string, EnginePlayer>,
  totalTenths: number,
  playerCount: number,
): number {
  const genderOf = (id: string) => byId.get(id)?.gender ?? "male";
  const teamA = orderTeam(split.teamA[0], split.teamA[1]);
  const teamB = orderTeam(split.teamB[0], split.teamB[1]);
  const pattern = matchPattern(genderOf, teamA, teamB);
  let cost = 0;
  if (pattern === "women_vs_men") cost += WEIGHT.womenVsMen;
  else if (pattern === "mixed_same") cost += WEIGHT.mixedSame;
  const sumA = skillTenths(split.teamA[0].skill) + skillTenths(split.teamA[1].skill);
  const sumB = skillTenths(split.teamB[0].skill) + skillTenths(split.teamB[1].skill);
  cost += Math.abs(sumA - sumB) * WEIGHT.skillTenth;
  cost += pairCount(ledger.partners, teamA[0], teamA[1]) * WEIGHT.partnerEach;
  cost += pairCount(ledger.partners, teamB[0], teamB[1]) * WEIGHT.partnerEach;
  for (const left of teamA) {
    for (const right of teamB) cost += pairCount(ledger.opponents, left, right) * WEIGHT.opponentEach;
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

function planKey(matches: PlannedMatch[]): string {
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

function bestAssignment(playing: EnginePlayer[], ledger: Ledger): PlannedMatch[] {
  if (playing.length === 0) return [];
  if (playing.length > 12) return hillClimb(playing, ledger);
  const byId = new Map(playing.map((player) => [player.id, player]));
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKey = "";
  let best: PlannedMatch[] = [];

  for (const groups of partitions(playing)) {
    const options = groups.map((group) => splitsOf(group));
    const walk = (index: number, acc: PlannedMatch[], cost: number) => {
      if (cost > bestCost) return;
      if (index === options.length) {
        const key = planKey(acc);
        if (cost < bestCost || (cost === bestCost && key < bestKey)) {
          bestCost = cost;
          bestKey = key;
          best = acc.map((match) => ({ ...match, teamA: [...match.teamA], teamB: [...match.teamB] }));
        }
        return;
      }
      const splits = options[index] ?? [];
      for (const split of splits) {
        const added = splitCost(split, ledger, byId, totalTenths, playing.length);
        walk(index + 1, [...acc, toMatch(split, index + 1)], cost + added);
      }
    };
    walk(0, [], 0);
  }
  return numberCourts(best);
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
): PlannedMatch {
  const byId = new Map(group.map((player) => [player.id, player]));
  let best: PlannedMatch | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const split of splitsOf(group)) {
    const cost = splitCost(split, ledger, byId, totalTenths, playerCount);
    const match = toMatch(split, 1);
    const key = planKey([match]);
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

function assignmentCost(matches: PlannedMatch[], playing: EnginePlayer[], ledger: Ledger): number {
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
    cost += splitCost(split, ledger, byId, totalTenths, playing.length);
  }
  return cost;
}

function hillClimb(playing: EnginePlayer[], ledger: Ledger): PlannedMatch[] {
  const courtCount = playing.length / 4;
  const groups = dealCourts(playing, courtCount);
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  let matches = numberCourts(groups.map((group) => bestSplit(group, ledger, totalTenths, playing.length)));
  let bestCost = assignmentCost(matches, playing, ledger);
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
            const trial = numberCourts(trialGroups.map((group) => bestSplit(group, ledger, totalTenths, playing.length)));
            const cost = assignmentCost(trial, playing, ledger);
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
): RoundPlan {
  const spots = courtsFor(players.length, courts) * 4;
  const { playing, sittingOut } = choosePlaying(players, sched, spots, roundNumber, salt);
  return {
    roundNumber,
    courtsUsed: playing.length / 4,
    matches: bestAssignment(playing, ledger),
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
