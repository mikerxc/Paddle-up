import { describe, expect, it } from "vitest";
import {
  applyRound,
  assignmentKey,
  courtsFor,
  emptyLedger,
  inwardFeasible,
  lineupKey,
  newSched,
  pairKey,
  planRound,
  teamRatingTotal,
  teamSkillGap,
  WEIGHT,
  type EnginePlayer,
  type Ledger,
  type RoundPlan,
  type SchedState,
} from "./pairing.ts";

function player(id: string, skill: number): EnginePlayer {
  return { id, skill };
}

function balancedEight(): EnginePlayer[] {
  const skills = [3, 3.5, 4, 4.5];
  const players: EnginePlayer[] = [];
  skills.forEach((skill, index) => {
    players.push(player(`m${index}`, skill));
    players.push(player(`f${index}`, skill));
  });
  return players;
}

function many(count: number): EnginePlayer[] {
  return Array.from({ length: count }, (_, index) => {
    const skill = 2.5 + ((index * 3) % 31) / 10;
    return player(`p${String(index).padStart(2, "0")}`, Math.round(skill * 10) / 10);
  });
}

function fresh(players: EnginePlayer[]): Record<string, SchedState> {
  return Object.fromEntries(players.map((item) => [item.id, newSched()]));
}

function simulate(players: EnginePlayer[], courts: number, rounds: number, salt = 7): {
  plans: RoundPlan[];
  sched: Record<string, SchedState>;
  ledger: Ledger;
} {
  let sched = fresh(players);
  let ledger = emptyLedger();
  const plans: RoundPlan[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const plan = planRound(players, sched, ledger, courts, round, salt);
    plans.push(plan);
    const applied = applyRound(sched, ledger, plan);
    sched = applied.sched;
    ledger = applied.ledger;
  }
  return { plans, sched, ledger };
}

function playingIds(plan: RoundPlan): string[] {
  return plan.matches.flatMap((match) => [...match.teamA, ...match.teamB]).sort();
}

function teamPairs(plan: RoundPlan): string[] {
  return plan.matches
    .flatMap((match) => [pairKey(match.teamA[0], match.teamA[1]), pairKey(match.teamB[0], match.teamB[1])])
    .sort();
}

function totals(plan: RoundPlan, players: EnginePlayer[]): number[] {
  const skillOf = (id: string) => players.find((item) => item.id === id)?.skill ?? 0;
  return plan.matches.flatMap((match) => [teamRatingTotal(skillOf, match.teamA), teamRatingTotal(skillOf, match.teamB)]);
}

function assertCovered(plan: RoundPlan, players: EnginePlayer[]) {
  const playing = playingIds(plan);
  const sitting = [...plan.sittingOut].sort();
  expect(new Set(playing).size).toBe(playing.length);
  expect(playing.filter((id) => sitting.includes(id))).toEqual([]);
  expect([...playing, ...sitting].sort()).toEqual(players.map((item) => item.id).sort());
  expect(playing.length).toBe(plan.courtsUsed * 4);
}

describe("court spots", () => {
  it("uses one court when only four people fit, even if two courts are configured", () => {
    expect(courtsFor(6, 2)).toBe(1);
    expect(courtsFor(4, 2)).toBe(1);
    expect(courtsFor(3, 1)).toBe(0);
    expect(courtsFor(12, 2)).toBe(2);
    expect(courtsFor(12, 1)).toBe(1);
  });
});

describe("team floor", () => {
  it("allows 2.0 with 3.0 and refuses 2.0 with 2.0 when a legal split exists", () => {
    const players = [player("a", 2), player("b", 2), player("c", 3), player("d", 3)];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    expect(teamPairs(plan)).toEqual(["a|c", "b|d"].sort() ? ["a|c", "a|d", "b|c", "b|d"].filter((key) => teamPairs(plan).includes(key)) : []);
    for (const team of [match.teamA, match.teamB]) {
      const skills = team.map((id) => players.find((item) => item.id === id)?.skill ?? 0).sort();
      expect(skills).toEqual([2, 3]);
    }
    expect(match.short).toBeFalsy();
    expect(totals(plan, players).every((total) => total >= 5)).toBe(true);
  });

  it("falls back to the highest possible worst team and flags the game", () => {
    const players = [player("a", 2), player("b", 2), player("c", 2.1), player("d", 4.5)];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    const match = plan.matches[0];
    expect(match?.short).toBe(true);
    const lows = [match?.teamA, match?.teamB].map((team) =>
      (team ?? []).reduce((sum, id) => sum + (players.find((item) => item.id === id)?.skill ?? 0), 0),
    );
    expect(Math.min(...lows)).toBeCloseTo(4.1, 5);
    expect(teamPairs(plan)).not.toContain("a|b");
  });

  it("still builds a game when every pair is under 5.0", () => {
    const players = [player("a", 2), player("b", 2), player("c", 2), player("d", 2)];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 3);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]?.short).toBe(true);
    expect(Math.min(...totals(plan, players))).toBeCloseTo(4, 5);
  });

  it("prunes to legal teams before spending the soft costs", () => {
    const players = [player("low1", 2), player("low2", 2.2), player("high1", 3.2), player("high2", 4)];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    expect(plan.matches[0]?.short).toBeFalsy();
    expect(totals(plan, players).every((total) => total >= 5)).toBe(true);
  });
});

describe("sit-outs", () => {
  it("spreads one sit exactly once around a 5-player, 1-court session", () => {
    const players = many(5);
    const { plans, sched } = simulate(players, 1, 5);
    expect(plans.every((plan) => plan.courtsUsed === 1 && plan.sittingOut.length === 1)).toBe(true);
    for (const item of players) expect(sched[item.id]?.sitOuts).toBe(1);
    for (let index = 1; index < plans.length; index += 1) {
      expect(plans[index]?.sittingOut).not.toEqual(plans[index - 1]?.sittingOut);
    }
  });

  it("gives every player the same number of games on one court with a crowd", () => {
    const players = many(10);
    const { plans, sched } = simulate(players, 1, 10);
    expect(plans.every((plan) => plan.matches.length === 1 && plan.sittingOut.length === 6)).toBe(true);
    const games = players.map((item) => sched[item.id]?.gamesPlayed ?? -1);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
    expect(games.every((count) => count === 4)).toBe(true);
  });

  it("does not give anyone a second game before the whole group has played once", () => {
    const players = many(12);
    const { plans } = simulate(players, 1, 3);
    const seen = new Set<string>();
    for (const plan of plans) {
      for (const id of playingIds(plan)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      assertCovered(plan, players);
    }
    expect(seen.size).toBe(12);
  });

  it("sits each player once across nine rounds when one person sits on two courts", () => {
    const players = many(9);
    const { sched, plans } = simulate(players, 2, 9);
    expect(plans.every((plan) => plan.courtsUsed === 2 && plan.sittingOut.length === 1)).toBe(true);
    for (const item of players) {
      expect(sched[item.id]?.sitOuts).toBe(1);
      expect(sched[item.id]?.gamesPlayed).toBe(8);
    }
  });

  it("keeps a player with fewer games on court even when sitting them would be easier", () => {
    const players = [player("due", 2), player("b", 4), player("c", 4), player("d", 4), player("e", 4)];
    const sched = fresh(players);
    for (const item of players) {
      if (item.id === "due") continue;
      const state = sched[item.id];
      if (state) state.scheduleGames = 1;
    }
    const plan = planRound(players, sched, emptyLedger(), 1, 2, 1);
    expect(plan.sittingOut).not.toContain("due");
    expect(playingIds(plan)).toContain("due");
  });

  it("picks different sitters from a fairness tie when the salt changes", () => {
    const players = [0, 1, 2, 3, 4].map((index) => player(`p${index}`, 4));
    const sched = fresh(players);
    const due = sched.p0;
    if (due) due.scheduleGames = 0;
    for (const id of ["p1", "p2", "p3", "p4"]) {
      const state = sched[id];
      if (state) state.scheduleGames = 1;
    }
    const sitters = new Set<string>();
    for (let salt = 1; salt <= 12; salt += 1) {
      const plan = planRound(players, sched, emptyLedger(), 1, 3, salt);
      expect(plan.sittingOut).not.toContain("p0");
      expect(plan.sittingOut).toHaveLength(1);
      const sitter = plan.sittingOut[0];
      if (sitter) sitters.add(sitter);
    }
    expect(sitters.size).toBeGreaterThan(1);
  });

  it("prefers a tied bench that leaves a 5.0 inward pairing", () => {
    const players = [
      player("w1", 2),
      player("w2", 2),
      player("w3", 2),
      player("w4", 2),
      player("s1", 4),
      player("s2", 4),
    ];
    for (let salt = 1; salt <= 8; salt += 1) {
      const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, salt, { variety: salt });
      expect(plan.sittingOut.every((id) => id.startsWith("w"))).toBe(true);
      expect(inwardFeasible(players.filter((item) => !plan.sittingOut.includes(item.id)))).toBe(true);
      expect(plan.matches[0]?.short).toBeFalsy();
    }
  });
});

function assertNoImmediateRepeat(previous: RoundPlan, next: RoundPlan) {
  const before = new Set(teamPairs(previous));
  expect(teamPairs(next).filter((key) => before.has(key))).toEqual([]);
}

function assertSittersMixed(previous: RoundPlan, next: RoundPlan) {
  const stayed = new Set(playingIds(previous));
  const sat = new Set(previous.sittingOut);
  const now = new Set(playingIds(next));
  const stayers = new Set([...now].filter((id) => stayed.has(id)));
  const returners = new Set([...now].filter((id) => sat.has(id)));
  if (stayers.size === 0 || returners.size === 0) return;
  let mixed = 0;
  for (const match of next.matches) {
    for (const team of [match.teamA, match.teamB]) {
      const [a, b] = team;
      if ((returners.has(a) && stayers.has(b)) || (returners.has(b) && stayers.has(a))) mixed += 1;
    }
  }
  expect(mixed).toBe(Math.min(stayers.size, returners.size));
}

describe("sit-out mix avoids repeat partners", () => {
  function assertNight(count: number, courts: number, rounds: number) {
    const players = many(count);
    const { plans, sched } = simulate(players, courts, rounds, 9);
    for (const plan of plans) {
      assertCovered(plan, players);
      expect(plan.matches.every((match) => !match.short)).toBe(true);
    }
    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1];
      const next = plans[index];
      if (!previous || !next) continue;
      assertNoImmediateRepeat(previous, next);
      assertSittersMixed(previous, next);
    }
    const games = players.map((item) => sched[item.id]?.gamesPlayed ?? -1);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
  }

  it("mixes the two players coming off the bench with the two who stayed in a group of 6", () => {
    assertNight(6, 1, 6);
    const players = many(6);
    const { plans } = simulate(players, 1, 2, 4);
    const first = plans[0];
    const second = plans[1];
    expect(first?.sittingOut).toHaveLength(2);
    expect(second?.sittingOut).toHaveLength(2);
    if (!first || !second) return;
    const stayed = playingIds(first).filter((id) => playingIds(second).includes(id));
    const returned = first.sittingOut.filter((id) => playingIds(second).includes(id));
    expect(stayed).toHaveLength(2);
    expect(returned).toHaveLength(2);
    assertSittersMixed(first, second);
    assertNoImmediateRepeat(first, second);
  });

  it("keeps the same rule for 5 players on one court and 10 players on two courts", () => {
    const group = many(5);
    const { plans, sched } = simulate(group, 1, 5, 9);
    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1];
      const next = plans[index];
      if (!previous || !next) continue;
      assertNoImmediateRepeat(previous, next);
      assertSittersMixed(previous, next);
    }
    const games = group.map((item) => sched[item.id]?.gamesPlayed ?? -1);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
    assertNight(10, 2, 5);
  });

  it("breaks last round's partners when another lineup is available", () => {
    const players = [player("a", 2.5), player("b", 3.5), player("c", 4.5), player("d", 5.5)];
    const ledger = emptyLedger();
    ledger.lastPartners["a|d"] = 1;
    ledger.lastPartners["b|c"] = 1;
    ledger.partners["a|d"] = 1;
    ledger.partners["b|c"] = 1;
    const sched = fresh(players);
    for (const item of players) {
      const state = sched[item.id];
      if (!state) continue;
      state.lastPlayedRound = 1;
      state.scheduleGames = 1;
      state.gamesPlayed = 1;
    }
    const plan = planRound(players, sched, ledger, 1, 2, 1);
    expect(teamPairs(plan).sort()).toEqual(["a|c", "b|d"]);
  });
});

describe("partner and opponent variety", () => {
  it("weighs opponent repeats enough to matter and still under a partner repeat", () => {
    expect(WEIGHT.opponentEach).toBeGreaterThanOrEqual(800);
    expect(WEIGHT.opponentEach * 4).toBeLessThan(WEIGHT.partnerEach);
    expect(WEIGHT.unmixedPair).toBe(50_000);
    expect(WEIGHT.consecutivePartner).toBeGreaterThan(WEIGHT.unmixedPair);
    expect(WEIGHT.skillOverTenth).toBeGreaterThan(WEIGHT.skillTenth);
  });

  it("avoids a repeated opponent matchup when the players are otherwise even", () => {
    const players = [player("a", 4), player("b", 4), player("c", 4), player("d", 4)];
    const ledger = emptyLedger();
    for (const pair of ["a|c", "a|d", "b|c", "b|d"]) ledger.opponents[pair] = 4;
    const plan = planRound(players, fresh(players), ledger, 1, 2, 1);
    expect(teamPairs(plan).sort()).not.toEqual(["a|b", "c|d"]);
  });

  it("does not repeat a partnership in the first three rounds when everyone plays", () => {
    const players = balancedEight().map((item) => ({ ...item, skill: 4 }));
    const { ledger } = simulate(players, 2, 3, 11);
    const counts = Object.values(ledger.partners);
    expect(counts.length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBe(1);
    expect(Math.max(...Object.values(ledger.opponents))).toBeLessThanOrEqual(2);
  });

  it("is deterministic and does not depend on input order", () => {
    const players = balancedEight();
    const first = planRound(players, fresh(players), emptyLedger(), 2, 1, 4);
    const second = planRound([...players].reverse(), fresh(players), emptyLedger(), 2, 1, 4);
    expect(first.sittingOut).toEqual(second.sittingOut);
    expect(first.matches.map((match) => [match.teamA, match.teamB])).toEqual(
      second.matches.map((match) => [match.teamA, match.teamB]),
    );
  });

  it("can choose a different fair lineup when asked to reshuffle", () => {
    const players = many(8).map((item) => ({ ...item, skill: 4 }));
    const first = planRound(players, fresh(players), emptyLedger(), 2, 1, 3);
    const again = planRound(players, fresh(players), emptyLedger(), 2, 1, 3, {
      variety: 19,
      avoidKey: lineupKey(first.matches, first.sittingOut),
    });
    expect(assignmentKey(again.matches)).not.toBe(assignmentKey(first.matches));
    expect(again.sittingOut).toEqual(first.sittingOut);
    expect(again.matches.every((match) => !match.short)).toBe(true);
  });
});

describe("partner evenness", () => {
  it("accepts a small skill gap to avoid a repeat partnership", () => {
    const players = [player("a", 3), player("b", 3.2), player("c", 3.4), player("d", 3.6)];
    const ledger = emptyLedger();
    ledger.partners[pairKey("a", "d")] = 1;
    ledger.partners[pairKey("b", "c")] = 1;
    const plan = planRound(players, fresh(players), ledger, 1, 1, 1);
    expect(teamPairs(plan)).toEqual(["a|c", "b|d"]);
    expect(teamSkillGap((id) => players.find((item) => item.id === id)?.skill ?? 0, plan.matches[0]?.teamA ?? ["a", "c"], plan.matches[0]?.teamB ?? ["b", "d"])).toBeCloseTo(0.4, 5);
  });

  it("does not repeat last round's partners when the history counts are still empty", () => {
    const players = [player("a", 4), player("b", 4), player("c", 4), player("d", 4)];
    const ledger = emptyLedger();
    ledger.lastPartners[pairKey("a", "b")] = 1;
    ledger.lastPartners[pairKey("c", "d")] = 1;
    const plan = planRound(players, fresh(players), ledger, 1, 2, 1);
    expect(teamPairs(plan)).not.toContain("a|b");
    expect(teamPairs(plan)).not.toContain("c|d");
  });

  it("does not repeat a partnership on back-to-back rounds", () => {
    const players = [player("a", 3.5), player("b", 4), player("c", 4), player("d", 4.5)];
    const { plans } = simulate(players, 1, 2, 3);
    const first = new Set(teamPairs(plans[0] ?? { roundNumber: 0, courtsUsed: 0, matches: [], sittingOut: [] }));
    for (const key of teamPairs(plans[1] ?? { roundNumber: 0, courtsUsed: 0, matches: [], sittingOut: [] })) {
      expect(first.has(key)).toBe(false);
    }
  });

  it("adds a steep cost above a 1.0 team gap without refusing the game", () => {
    const players = [player("a", 2), player("b", 2), player("c", 5), player("d", 5.5)];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]?.short).toBeFalsy();
    const gap = teamSkillGap((id) => players.find((item) => item.id === id)?.skill ?? 0, plan.matches[0]?.teamA ?? ["a", "c"], plan.matches[0]?.teamB ?? ["b", "d"]);
    expect(gap).toBeLessThanOrEqual(1);
  });
});

describe("sit-out returners", () => {
  it("partners players coming back from a sit with people who stayed", () => {
    const players = [player("r1", 2.5), player("r2", 5.5), player("s1", 3), player("s2", 5)];
    const sched = fresh(players);
    const returning = sched.r1;
    const returningToo = sched.r2;
    const stayed = sched.s1;
    const stayedToo = sched.s2;
    if (!returning || !returningToo || !stayed || !stayedToo) throw new Error("sched");
    returning.lastSatRound = 1;
    returningToo.lastSatRound = 1;
    stayed.lastPlayedRound = 1;
    stayedToo.lastPlayedRound = 1;
    const plan = planRound(players, sched, emptyLedger(), 1, 2, 1);
    expect(teamPairs(plan)).toEqual(["r1|s2", "r2|s1"]);
  });
});

describe("no back-to-back sits", () => {
  it("does not sit the same people two rounds in a row for groups of 10, 11, and 12", () => {
    for (const count of [10, 11, 12]) {
      const players = many(count).map((item) => ({ ...item, skill: 4 }));
      const { plans } = simulate(players, 2, 20, 5);
      for (let index = 1; index < plans.length; index += 1) {
        const previous = new Set(plans[index - 1]?.sittingOut ?? []);
        for (const id of plans[index]?.sittingOut ?? []) {
          expect(previous.has(id), `${count} players round ${index + 1} sat ${id} again`).toBe(false);
        }
      }
    }
  });
});

describe("large draws", () => {
  it("fills four courts from ratings alone", () => {
    const players = many(16);
    const plan = planRound(players, fresh(players), emptyLedger(), 4, 1, 2);
    expect(plan.courtsUsed).toBe(4);
    expect(plan.matches.every((match) => !match.short)).toBe(true);
    assertCovered(plan, players);
  });
});
