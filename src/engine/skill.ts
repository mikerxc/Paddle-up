import { clampRating, type Player, type Round, type SkillEvent } from "../model.ts";

/** Small on purpose: one game nudges a hidden rating, it does not rewrite it. */
const K = 0.12;

/**
 * Expected chance that `teamRating` beats `opponentRating`.
 * A 1.0 gap is a clear favorite (about 0.89).
 */
export function expectedWin(teamRating: number, opponentRating: number): number {
  const scale = 1.1;
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / scale));
}

/**
 * Signed rating change for one team.
 * A win always moves up and a loss always moves down. The size grows with the
 * point margin and with how surprising the result was.
 */
export function ratingDelta(
  teamRating: number,
  opponentRating: number,
  scoreFor: number,
  scoreAgainst: number,
): number {
  if (scoreFor === scoreAgainst) return 0;
  const expected = expectedWin(teamRating, opponentRating);
  const surprise = scoreFor > scoreAgainst ? 1 - expected : -expected;
  const margin = Math.abs(scoreFor - scoreAgainst);
  const marginWeight = Math.min(1, 0.45 + margin / 12);
  return K * marginWeight * surprise;
}

function teamRating(skills: ReadonlyMap<string, number>, team: [string, string]): number {
  return ((skills.get(team[0]) ?? 0) + (skills.get(team[1]) ?? 0)) / 2;
}

/**
 * Apply one finished round. Both partners share the team's delta, computed from
 * the ratings they had before this round. Undo restores the previous ratings
 * because the whole player list is snapshotted with the round.
 */
export function learnFromRound(
  players: readonly Player[],
  round: Round,
  at: number,
  log: readonly SkillEvent[],
): { players: Player[]; skillLog: SkillEvent[] } {
  const base = new Map(players.map((player) => [player.id, player.skill]));
  const delta = new Map<string, number>();
  const add = (team: [string, string], change: number) => {
    for (const id of team) delta.set(id, (delta.get(id) ?? 0) + change);
  };
  for (const match of round.matches) {
    const ratingA = teamRating(base, match.teamA);
    const ratingB = teamRating(base, match.teamB);
    add(match.teamA, ratingDelta(ratingA, ratingB, match.scoreA, match.scoreB));
    add(match.teamB, ratingDelta(ratingB, ratingA, match.scoreB, match.scoreA));
  }
  const events: SkillEvent[] = [];
  const next = players.map((player) => {
    const change = delta.get(player.id);
    if (!change) return player;
    const after = clampRating(player.skill + change);
    if (after === player.skill) return player;
    events.push({ at, playerId: player.id, before: player.skill, after, source: "game" });
    return { ...player, skill: after };
  });
  return { players: next, skillLog: [...log, ...events].slice(-2000) };
}
