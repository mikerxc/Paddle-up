/**
 * Doubles planner for open play. Ratings only — gender is not an input.
 *
 * Who sits is decided before the lineup search. Games played and sit-outs are
 * a hard fairness order. People tied on that order are chosen with the round
 * salt (and the reshuffle variety), preferring a set that can pair to 5.0.
 *
 * Every team total, each rating rounded to 0.1, must be at least 5.0.
 * 2.0 with 3.0 is allowed. 2.0 with 2.0 is not, unless no legal teams exist.
 * Then the search keeps the lineup whose worst team total is as high as
 * possible and marks those games short.
 *
 * Soft, and never a reason to cancel a game: spread partners, spread
 * opponents, keep team totals close, and don't repeat a partnership from the
 * immediately previous round. Players coming back from a sit are mixed with
 * players who stayed on when both groups are in the round.
 */

export interface EnginePlayer {
  id: string;
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
  /** Set when this game could not reach the 5.0 team floor. */
  short?: boolean;
}

export interface RoundPlan {
  roundNumber: number;
  courtsUsed: number;
  matches: PlannedMatch[];
  sittingOut: string[];
}

/**
 * Weights are compared directly. Sit-outs and the 5.0 floor are decided
 * outside this scale. Each soft tier stays under the near-hard rules above it.
 */
export const WEIGHT = {
  /** Same partnership as the immediately previous round. */
  consecutivePartner: 1_000_000,
  /** Two returners together, or two stayers together, when the other group is also playing. */
  unmixedPair: 50_000,
  /** One earlier game as partners. */
  partnerEach: 6_000,
  /** One earlier game as opponents. Four cross-pairs stay under one partner repeat. */
  opponentEach: 1_100,
  /** Cost of a 0.1 gap between the two team skill totals. */
  skillTenth: 20,
  /** Extra cost for each 0.1 of gap above 1.0. Soft — it never blocks a game. */
  skillOverTenth: 500,
  courtSkew: 4,
} as const;

/** A reshuffle may leave the optimal soft cost, but not the floor, the mix rule, or back-to-back partners. */
const VARIETY_BAND = 40_000;

/** Combined team rating, in tenths, required before a game is a normal game. */
export const TEAM_FLOOR_TENTHS = 50;

const SITTER_ENUM_LIMIT = 4_000;

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

export function skillTenths(skill: number): number {
  return Math.round(skill * 10);
}

export function teamRatingTotal(skillOf: (id: string) => number, team: [string, string]): number {
  return (skillTenths(skillOf(team[0])) + skillTenths(skillOf(team[1]))) / 10;
}

export function matchIsShort(
  skillOf: (id: string) => number,
  teamA: [string, string],
  teamB: [string, string],
): boolean {
  return teamRatingTotal(skillOf, teamA) < TEAM_FLOOR_TENTHS / 10 || teamRatingTotal(skillOf, teamB) < TEAM_FLOOR_TENTHS / 10;
}

export function lineupKey(matches: readonly PlannedMatch[], sitting: readonly string[]): string {
  return `${planKey(matches)}::${[...sitting].sort().join(",")}`;
}

function fnv(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function schedOf(sched: Record<string, SchedState>, id: string): SchedState {
  return sched[id] ?? newSched();
}

/** Lower tuple plays sooner: fewer scheduled games, then more sit-outs. */
function fairTuple(state: SchedState): [number, number] {
  return [state.scheduleGames, -state.sitOuts];
}

function fairCmp(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

function bySkillThenId(a: EnginePlayer, b: EnginePlayer): number {
  if (a.skill !== b.skill) return a.skill - b.skill;
  return a.id.localeCompare(b.id);
}

function teamTenthsOf(a: EnginePlayer, b: EnginePlayer): number {
  return skillTenths(a.skill) + skillTenths(b.skill);
}

/** Sort, then pair the lowest with the highest inward. Every pair must clear 5.0. */
export function inwardFeasible(playing: readonly EnginePlayer[]): boolean {
  if (playing.length === 0 || playing.length % 2 !== 0) return playing.length === 0;
  const sorted = [...playing].sort(bySkillThenId);
  for (let index = 0; index < sorted.length / 2; index += 1) {
    const low = sorted[index];
    const high = sorted[sorted.length - 1 - index];
    if (!low || !high || teamTenthsOf(low, high) < TEAM_FLOOR_TENTHS) return false;
  }
  return true;
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

function binomExceeds(n: number, k: number, limit: number): boolean {
  if (k < 0 || k > n) return false;
  const use = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= use; index += 1) {
    value = (value * (n - use + index)) / index;
    if (value > limit) return true;
  }
  return false;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleCombinations(items: readonly EnginePlayer[], count: number, seed: number): EnginePlayer[][] {
  if (!binomExceeds(items.length, count, SITTER_ENUM_LIMIT)) return combinations(items, count);
  const found: EnginePlayer[][] = [];
  const seen = new Set<string>();
  const add = (combo: EnginePlayer[]) => {
    const key = combo.map((player) => player.id).sort().join(",");
    if (seen.has(key)) return;
    seen.add(key);
    found.push(combo);
  };
  const bySkill = [...items].sort(bySkillThenId);
  add(bySkill.slice(0, count));
  add(bySkill.slice(-count));
  const random = mulberry32(seed);
  for (let attempt = 0; found.length < 400 && attempt < 2_000; attempt += 1) {
    const copy = [...items];
    for (let index = 0; index < count; index += 1) {
      const swap = index + Math.floor(random() * (copy.length - index));
      const left = copy[index];
      const right = copy[swap];
      if (!left || !right) continue;
      copy[index] = right;
      copy[swap] = left;
    }
    add(copy.slice(0, count));
  }
  return found;
}

function choosePlaying(
  players: EnginePlayer[],
  sched: Record<string, SchedState>,
  spots: number,
  roundNumber: number,
  salt: number,
  variety: number,
): { playing: EnginePlayer[]; sittingOut: string[] } {
  if (spots <= 0) {
    return { playing: [], sittingOut: players.map((player) => player.id).sort() };
  }
  if (spots >= players.length) {
    return { playing: [...players], sittingOut: [] };
  }
  const ranked = [...players].sort((a, b) => {
    const diff = fairCmp(fairTuple(schedOf(sched, a.id)), fairTuple(schedOf(sched, b.id)));
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : 1;
  });
  const pivot = ranked[spots - 1];
  if (!pivot) return { playing: ranked.slice(0, spots), sittingOut: [] };
  const pivotFair = fairTuple(schedOf(sched, pivot.id));
  const mustPlay = ranked.filter((player) => fairCmp(fairTuple(schedOf(sched, player.id)), pivotFair) < 0);
  const tied = ranked.filter((player) => fairCmp(fairTuple(schedOf(sched, player.id)), pivotFair) === 0);
  const sitCount = tied.length - (spots - mustPlay.length);
  const options =
    sitCount <= 0
      ? [[]]
      : sampleCombinations(tied, sitCount, fnv(`${roundNumber}#${salt}#${variety}#sit`));
  let bestSit = options[0] ?? [];
  let bestFeasible = Number.POSITIVE_INFINITY;
  let bestHash = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const sitting of options) {
    const sitIds = new Set(sitting.map((player) => player.id));
    const playing = [...mustPlay, ...tied.filter((player) => !sitIds.has(player.id))];
    const feasible = inwardFeasible(playing) ? 0 : 1;
    const key = sitting.map((player) => player.id).sort().join(",");
    const hash = fnv(`${key}|${roundNumber}|${salt}|${variety}`);
    if (
      feasible < bestFeasible ||
      (feasible === bestFeasible && (hash < bestHash || (hash === bestHash && key < bestKey)))
    ) {
      bestFeasible = feasible;
      bestHash = hash;
      bestKey = key;
      bestSit = sitting;
    }
  }
  const sitIds = new Set(bestSit.map((player) => player.id));
  const playing = [...mustPlay, ...tied.filter((player) => !sitIds.has(player.id))];
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

interface MixContext {
  lastPartners: Record<string, number>;
  stayers: ReadonlySet<string>;
  returners: ReadonlySet<string>;
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
  return { lastPartners: ledger.lastPartners ?? {}, stayers, returners };
}

function sameCohort(mix: MixContext, a: string, b: string): boolean {
  if (mix.stayers.size === 0 || mix.returners.size === 0) return false;
  const cohort = (id: string) => (mix.stayers.has(id) ? "stay" : mix.returners.has(id) ? "return" : "");
  const left = cohort(a);
  const right = cohort(b);
  return left !== "" && left === right;
}

function floorOf(split: Split): number {
  return Math.min(teamTenthsOf(split.teamA[0], split.teamA[1]), teamTenthsOf(split.teamB[0], split.teamB[1]));
}

function gapCost(sumA: number, sumB: number): number {
  const gap = Math.abs(sumA - sumB);
  let cost = gap * WEIGHT.skillTenth;
  if (gap > 10) cost += (gap - 10) * WEIGHT.skillOverTenth;
  return cost;
}

function softCost(
  split: Split,
  ledger: Ledger,
  totalTenths: number,
  playerCount: number,
  mix: MixContext,
): number {
  const teamA = orderTeam(split.teamA[0], split.teamA[1]);
  const teamB = orderTeam(split.teamB[0], split.teamB[1]);
  const sumA = teamTenthsOf(split.teamA[0], split.teamA[1]);
  const sumB = teamTenthsOf(split.teamB[0], split.teamB[1]);
  let cost = gapCost(sumA, sumB);
  cost += pairCount(ledger.partners, teamA[0], teamA[1]) * WEIGHT.partnerEach;
  cost += pairCount(ledger.partners, teamB[0], teamB[1]) * WEIGHT.partnerEach;
  for (const left of teamA) {
    for (const right of teamB) cost += pairCount(ledger.opponents, left, right) * WEIGHT.opponentEach;
  }
  for (const team of [teamA, teamB]) {
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
    short: floorOf(split) < TEAM_FLOOR_TENTHS,
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

function copyMatches(matches: PlannedMatch[]): PlannedMatch[] {
  return matches.map((match) => ({
    ...match,
    teamA: [...match.teamA] as [string, string],
    teamB: [...match.teamB] as [string, string],
  }));
}

interface Leaf {
  cost: number;
  minTeam: number;
  legal: boolean;
  key: string;
  matches: PlannedMatch[];
}

function betterOptimum(candidate: Leaf, current: Leaf): boolean {
  if (candidate.legal !== current.legal) return candidate.legal;
  if (!candidate.legal && candidate.minTeam !== current.minTeam) return candidate.minTeam > current.minTeam;
  if (candidate.cost !== current.cost) return candidate.cost < current.cost;
  return candidate.key < current.key;
}

function betterChoice(candidate: Leaf, current: Leaf, variety: number): boolean {
  if (candidate.cost !== current.cost) return candidate.cost < current.cost;
  const left = fnv(`${candidate.key}#${variety}`);
  const right = fnv(`${current.key}#${variety}`);
  if (left !== right) return left < right;
  return candidate.key < current.key;
}

interface SearchOptions {
  variety: number;
  avoidMatches: ReadonlySet<string>;
  explore: boolean;
}

function exactAssignment(
  playing: EnginePlayer[],
  ledger: Ledger,
  mix: MixContext,
  options: SearchOptions,
): PlannedMatch[] {
  const totalTenths = playing.reduce((sum, player) => sum + skillTenths(player.skill), 0);
  const groupsList = partitions(playing);

  const run = (requireLegal: boolean): Leaf | null => {
    const found = { leaf: null as Leaf | null };
    for (const groups of groupsList) {
      const splits = groups.map((group) => {
        const all = splitsOf(group);
        if (!requireLegal) return all;
        return all.filter((split) => floorOf(split) >= TEAM_FLOOR_TENTHS);
      });
      if (splits.some((list) => list.length === 0)) continue;
      const walk = (index: number, acc: PlannedMatch[], cost: number, minTeam: number) => {
        const optimum = found.leaf;
        if (optimum) {
          if (requireLegal && cost > optimum.cost) return;
          if (!requireLegal && minTeam < optimum.minTeam) return;
          if (!requireLegal && minTeam === optimum.minTeam && cost > optimum.cost) return;
        }
        if (index === splits.length) {
          const key = planKey(acc);
          const leaf: Leaf = {
            cost,
            minTeam,
            legal: minTeam >= TEAM_FLOOR_TENTHS,
            key,
            matches: copyMatches(acc),
          };
          if (!found.leaf || betterOptimum(leaf, found.leaf)) found.leaf = leaf;
          return;
        }
        for (const split of splits[index] ?? []) {
          walk(index + 1, [...acc, toMatch(split, index + 1)], cost + softCost(split, ledger, totalTenths, playing.length, mix), Math.min(minTeam, floorOf(split)));
        }
      };
      walk(0, [], 0, Number.POSITIVE_INFINITY);
    }
    return found.leaf;
  };

  const legal = run(true);
  const optimum = legal ?? run(false);
  if (!optimum) return [];
  if (!options.explore && options.avoidMatches.size === 0) return optimum.matches;

  const picked = { leaf: null as Leaf | null };
  const band = VARIETY_BAND;
  for (const groups of groupsList) {
    const splits = groups.map((group) => {
      const all = splitsOf(group);
      if (optimum.legal) return all.filter((split) => floorOf(split) >= TEAM_FLOOR_TENTHS);
      return all;
    });
    if (splits.some((list) => list.length === 0)) continue;
    const walk = (index: number, acc: PlannedMatch[], cost: number, minTeam: number) => {
      if (optimum.legal && cost > optimum.cost + band) return;
      if (!optimum.legal && minTeam < optimum.minTeam) return;
      if (!optimum.legal && minTeam === optimum.minTeam && cost > optimum.cost + band) return;
      if (index === splits.length) {
        if (!optimum.legal && minTeam !== optimum.minTeam) return;
        if (cost > optimum.cost + band) return;
        const key = planKey(acc);
        if (options.avoidMatches.has(key)) return;
        const leaf: Leaf = {
          cost,
          minTeam,
          legal: minTeam >= TEAM_FLOOR_TENTHS,
          key,
          matches: copyMatches(acc),
        };
        if (!picked.leaf || betterChoice(leaf, picked.leaf, options.variety)) picked.leaf = leaf;
        return;
      }
      for (const split of splits[index] ?? []) {
        walk(
          index + 1,
          [...acc, toMatch(split, index + 1)],
          cost + softCost(split, ledger, totalTenths, playing.length, mix),
          Math.min(minTeam, floorOf(split)),
        );
      }
    };
    walk(0, [], 0, Number.POSITIVE_INFINITY);
  }
  return (picked.leaf ?? optimum).matches;
}

function dealCourts(players: EnginePlayer[], courtCount: number): EnginePlayer[][] {
  const sorted = [...players].sort(bySkillThenId);
  const pairs: EnginePlayer[][] = [];
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const left = sorted[low];
    const right = sorted[high];
    if (left && right) pairs.push([left, right]);
    low += 1;
    high -= 1;
  }
  const groups: EnginePlayer[][] = Array.from({ length: courtCount }, () => []);
  pairs.forEach((pair, index) => {
    groups[index % courtCount]?.push(...pair);
  });
  return groups;
}

function climbCost(
  split: Split,
  ledger: Ledger,
  totalTenths: number,
  playerCount: number,
  mix: MixContext,
): number {
  const floor = floorOf(split);
  const penalty = floor >= TEAM_FLOOR_TENTHS ? 0 : (TEAM_FLOOR_TENTHS - floor) * 100_000_000;
  return penalty + softCost(split, ledger, totalTenths, playerCount, mix);
}

function bestSplit(
  group: EnginePlayer[],
  ledger: Ledger,
  totalTenths: number,
  playerCount: number,
  mix: MixContext,
  variety: number,
): PlannedMatch {
  let best: PlannedMatch | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestKey = "";
  for (const split of splitsOf(group)) {
    const match = toMatch(split, 1);
    const key = planKey([match]);
    const jitter = variety ? fnv(`${key}#${variety}`) % 11 : 0;
    const cost = climbCost(split, ledger, totalTenths, playerCount, mix) + jitter;
    if (cost < bestCost || (cost === bestCost && key < bestKey)) {
      bestCost = cost;
      bestKey = key;
      best = match;
    }
  }
  if (!best) throw new Error("A court of four players has no team split.");
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
    const split: Split = { teamA: [teamA[0], teamA[1]], teamB: [teamB[0], teamB[1]] };
    cost += climbCost(split, ledger, totalTenths, playing.length, mix);
  }
  return cost;
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
            const trial = numberCourts(
              trialGroups.map((group) => bestSplit(group, ledger, totalTenths, playing.length, mix, variety)),
            );
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

function hillClimb(playing: EnginePlayer[], ledger: Ledger, mix: MixContext, options: SearchOptions): PlannedMatch[] {
  const first = climbOnce(playing, ledger, mix, options.variety);
  if (!options.explore || !options.avoidMatches.has(planKey(first))) return first;
  const second = climbOnce(playing, ledger, mix, options.variety + 1 || 1);
  if (!options.avoidMatches.has(planKey(second))) return second;
  return first;
}

function bestAssignment(
  playing: EnginePlayer[],
  ledger: Ledger,
  mix: MixContext,
  options: SearchOptions,
): PlannedMatch[] {
  if (playing.length === 0) return [];
  if (playing.length > 12) return hillClimb(playing, ledger, mix, options);
  return exactAssignment(playing, ledger, mix, options);
}

export interface PlanVariety {
  /** Non-zero asks for another fair lineup when one exists. */
  variety?: number;
  /** One lineup to skip when another fair one is available. */
  avoidKey?: string;
  /** Every lineup already shown for this round. */
  avoidKeys?: readonly string[];
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
  const avoidFull = new Set<string>();
  if (variety?.avoidKey) avoidFull.add(variety.avoidKey);
  for (const key of variety?.avoidKeys ?? []) avoidFull.add(key);
  const avoidMatches = new Set([...avoidFull].map((key) => key.split("::")[0] ?? key));
  const baseVariety = variety?.variety ?? 0;
  const big = players.length > 12 || spots > 8;
  const tries = avoidFull.size === 0 && baseVariety === 0 ? 1 : big ? 1 : 8;
  let chosen: RoundPlan | null = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const twist = attempt === 0 ? baseVariety : fnv(`${baseVariety}#${roundNumber}#${attempt}`) || attempt;
    const { playing, sittingOut } = choosePlaying(players, sched, spots, roundNumber, salt, twist);
    const mix = mixContext(playing, sched, ledger, roundNumber);
    const matches = numberCourts(
      bestAssignment(playing, ledger, mix, {
        variety: twist,
        avoidMatches,
        explore: twist !== 0 || avoidFull.size > 0,
      }),
    );
    const plan: RoundPlan = {
      roundNumber,
      courtsUsed: playing.length / 4,
      matches,
      sittingOut,
    };
    chosen = plan;
    if (!avoidFull.has(lineupKey(matches, sittingOut))) break;
  }
  return (
    chosen ?? {
      roundNumber,
      courtsUsed: 0,
      matches: [],
      sittingOut: players.map((player) => player.id).sort(),
    }
  );
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

export function assignmentKey(matches: readonly PlannedMatch[]): string {
  return planKey(matches);
}
