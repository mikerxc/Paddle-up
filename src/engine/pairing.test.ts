import { describe, expect, it } from "vitest";
import {
  applyRound,
  assignmentKey,
  courtsFor,
  emptyLedger,
  isLowHighStack,
  matchPattern,
  newSched,
  pairKey,
  planRound,
  teamSkillGap,
  type EnginePlayer,
  type GenderPattern,
  type Ledger,
  type RoundPlan,
  type SchedState,
} from "./pairing.ts";
import type { Gender } from "../model.ts";

function player(id: string, gender: Gender, skill: number): EnginePlayer {
  return { id, gender, skill };
}

function balancedEight(): EnginePlayer[] {
  const skills = [3, 3.5, 4, 4.5];
  const players: EnginePlayer[] = [];
  skills.forEach((skill, index) => {
    players.push(player(`m${index}`, "male", skill));
    players.push(player(`f${index}`, "female", skill));
  });
  return players;
}

function many(count: number, courtsGender: "mixed" | "men" | "women" = "mixed"): EnginePlayer[] {
  return Array.from({ length: count }, (_, index) => {
    const gender: Gender =
      courtsGender === "men" ? "male" : courtsGender === "women" ? "female" : index % 2 === 0 ? "female" : "male";
    const skill = 2.5 + ((index * 3) % 31) / 10;
    return player(`p${String(index).padStart(2, "0")}`, gender, Math.round(skill * 10) / 10);
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

function patterns(plan: RoundPlan, players: EnginePlayer[]): GenderPattern[] {
  const genderOf = (id: string) => players.find((item) => item.id === id)?.gender ?? "male";
  return plan.matches.map((match) => matchPattern(genderOf, match.teamA, match.teamB));
}

function playingIds(plan: RoundPlan): string[] {
  return plan.matches.flatMap((match) => [...match.teamA, ...match.teamB]).sort();
}

function teamPairs(plan: RoundPlan): string[] {
  return plan.matches
    .flatMap((match) => [pairKey(match.teamA[0], match.teamA[1]), pairKey(match.teamB[0], match.teamB[1])])
    .sort();
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

describe("gender balance", () => {
  it("never puts two women against two men when another shape exists", () => {
    const { plans } = simulate(balancedEight(), 2, 6);
    for (const plan of plans) {
      expect(patterns(plan, balancedEight())).not.toContain("women_vs_men");
    }
  });

  it("keeps two women from partnering against two men in a mostly-male draw", () => {
    const players = [
      player("f1", "female", 3.5),
      player("f2", "female", 4.2),
      ...Array.from({ length: 6 }, (_, index) => player(`m${index}`, "male", 3 + index * 0.3)),
    ];
    const plan = planRound(players, fresh(players), emptyLedger(), 2, 1, 3);
    expect(patterns(plan, players)).not.toContain("women_vs_men");
    const partners = plan.matches.flatMap((match) => [match.teamA, match.teamB]);
    const womenTogether = partners.some((team) => team.includes("f1") && team.includes("f2"));
    expect(womenTogether).toBe(false);
  });

  it("still refuses a women-vs-men split when that split would avoid repeat partners", () => {
    const players = [
      player("f1", "female", 4),
      player("f2", "female", 4),
      player("m1", "male", 4),
      player("m2", "male", 4),
    ];
    const ledger = emptyLedger();
    ledger.partners["f1|m1"] = 5;
    ledger.partners["f2|m2"] = 5;
    ledger.partners["f1|m2"] = 5;
    ledger.partners["f2|m1"] = 5;
    const plan = planRound(players, fresh(players), ledger, 1, 2, 1);
    expect(patterns(plan, players)).toEqual(["mixed_mixed"]);
  });

  it("allows mixed-vs-men when the court is three men and one woman", () => {
    const players = [
      player("f", "female", 3.5),
      player("m1", "male", 3.5),
      player("m2", "male", 4),
      player("m3", "male", 4.5),
    ];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    expect(patterns(plan, players)).toEqual(["mixed_same"]);
  });
});

describe("skill balance", () => {
  it("pairs 2.5s with 5.5s instead of stacking the strong players", () => {
    const players = [
      player("a", "male", 2.5),
      player("b", "male", 5.5),
      player("c", "female", 2.5),
      player("d", "female", 5.5),
    ];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    expect(teamSkillGap((id) => players.find((item) => item.id === id)?.skill ?? 0, match.teamA, match.teamB)).toBe(0);
    expect(patterns(plan, players)).toEqual(["mixed_mixed"]);
  });

  it("balances an all-men court by team total", () => {
    const players = [
      player("a", "male", 2.5),
      player("b", "male", 3),
      player("c", "male", 5),
      player("d", "male", 5.5),
    ];
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    expect(teamSkillGap((id) => players.find((item) => item.id === id)?.skill ?? 0, match.teamA, match.teamB)).toBe(0);
    expect(patterns(plan, players)).toEqual(["same_same"]);
  });
});

describe("sit-outs", () => {
  it("spreads one sit exactly once around a 5-player, 1-court session", () => {
    const players = many(5);
    const { plans, sched } = simulate(players, 1, 5);
    expect(plans.every((plan) => plan.courtsUsed === 1 && plan.sittingOut.length === 1)).toBe(true);
    for (const player of players) expect(sched[player.id]?.sitOuts).toBe(1);
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
    for (const player of players) {
      expect(sched[player.id]?.sitOuts).toBe(1);
      expect(sched[player.id]?.gamesPlayed).toBe(8);
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
      for (const match of plan.matches) expect(isLowHighStack(players, match.teamA, match.teamB)).toBe(false);
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
    const men = many(5, "men");
    const { plans, sched } = simulate(men, 1, 5, 9);
    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1];
      const next = plans[index];
      if (!previous || !next) continue;
      assertNoImmediateRepeat(previous, next);
      assertSittersMixed(previous, next);
      for (const match of next.matches) expect(isLowHighStack(men, match.teamA, match.teamB)).toBe(false);
    }
    const games = men.map((item) => sched[item.id]?.gamesPlayed ?? -1);
    expect(Math.max(...games) - Math.min(...games)).toBeLessThanOrEqual(1);
    assertNight(10, 2, 5);
  });

  it("breaks last round's partners when another lineup is not a stack or women versus men", () => {
    const players = [
      player("a", "male", 2.5),
      player("b", "male", 3.5),
      player("c", "male", 4.5),
      player("d", "male", 5.5),
    ];
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
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    expect(isLowHighStack(players, match.teamA, match.teamB)).toBe(false);
    const sides = [match.teamA, match.teamB].map((team) => pairKey(team[0], team[1])).sort();
    expect(sides).toEqual(["a|c", "b|d"]);
  });
});

describe("partner and opponent variety", () => {
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
});

describe("no low-high stack", () => {
  function expectSplit(players: EnginePlayer[], salt = 1, ledger = emptyLedger()) {
    const plan = planRound(players, fresh(players), ledger, 1, 1, salt);
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    expect(isLowHighStack(players, match.teamA, match.teamB)).toBe(false);
  }

  it("puts a strong player with a developing player on each side", () => {
    const players = [
      player("a", "male", 2.5),
      player("b", "male", 3),
      player("c", "male", 5),
      player("d", "male", 5.5),
    ];
    expectSplit(players);
    const plan = planRound(players, fresh(players), emptyLedger(), 1, 1, 1);
    const match = plan.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    const sides = [match.teamA, match.teamB].map((team) => [...team].sort().join("+")).sort();
    expect(sides).toEqual(["a+d", "b+c"]);
  });

  it("still refuses the stack when repeat partners would prefer it", () => {
    const players = [
      player("low1", "male", 2.5),
      player("low2", "male", 3),
      player("high1", "male", 5),
      player("high2", "male", 5.5),
    ];
    const ledger = emptyLedger();
    ledger.partners["high2|low1"] = 8;
    ledger.partners["high1|low2"] = 8;
    ledger.partners["high1|low1"] = 8;
    ledger.partners["high2|low2"] = 8;
    expectSplit(players, 4, ledger);
  });

  it("keeps every court split when skills differ", () => {
    const players = many(12);
    let ledger = emptyLedger();
    let sched = fresh(players);
    for (let round = 1; round <= 4; round += 1) {
      const plan = planRound(players, sched, ledger, 3, round, 5);
      for (const match of plan.matches) {
        expect(isLowHighStack(players, match.teamA, match.teamB)).toBe(false);
      }
      const applied = applyRound(sched, ledger, plan);
      sched = applied.sched;
      ledger = applied.ledger;
    }
  });

  it("can choose a different fair lineup when asked to reshuffle", () => {
    const players = many(8).map((item) => ({ ...item, skill: 4 }));
    const first = planRound(players, fresh(players), emptyLedger(), 2, 1, 3);
    const again = planRound(players, fresh(players), emptyLedger(), 2, 1, 3, {
      variety: 19,
      avoidKey: assignmentKey(first.matches),
    });
    expect(assignmentKey(again.matches)).not.toBe(assignmentKey(first.matches));
    expect(again.sittingOut).toEqual(first.sittingOut);
    expect(patterns(again, players)).not.toContain("women_vs_men");
  });
});

describe("partner evenness", () => {
  it("accepts a wider skill gap to avoid a repeat partnership", () => {
    const players = [
      player("a", "male", 2),
      player("b", "male", 4),
      player("c", "male", 4.5),
      player("d", "male", 6),
    ];
    const ledger = emptyLedger();
    ledger.partners[pairKey("a", "d")] = 1;
    ledger.partners[pairKey("b", "c")] = 1;
    const plan = planRound(players, fresh(players), ledger, 1, 1, 1);
    expect(teamPairs(plan)).toEqual(["a|c", "b|d"]);
    expect(isLowHighStack(players, plan.matches[0]?.teamA ?? [], plan.matches[0]?.teamB ?? [])).toBe(false);
  });

  it("does not repeat last round's partners when the history counts are still empty", () => {
    const players = [
      player("a", "male", 4),
      player("b", "male", 4),
      player("c", "male", 4),
      player("d", "male", 4),
    ];
    const ledger = emptyLedger();
    ledger.lastPartners[pairKey("a", "b")] = 1;
    ledger.lastPartners[pairKey("c", "d")] = 1;
    const plan = planRound(players, fresh(players), ledger, 1, 2, 1);
    expect(teamPairs(plan)).not.toContain("a|b");
    expect(teamPairs(plan)).not.toContain("c|d");
  });

  it("does not repeat a partnership on back-to-back rounds", () => {
    const players = [
      player("a", "male", 3.5),
      player("b", "male", 4),
      player("c", "male", 4),
      player("d", "male", 4.5),
    ];
    const { plans } = simulate(players, 1, 2, 3);
    const first = new Set(teamPairs(plans[0] ?? { roundNumber: 0, courtsUsed: 0, matches: [], sittingOut: [] }));
    for (const key of teamPairs(plans[1] ?? { roundNumber: 0, courtsUsed: 0, matches: [], sittingOut: [] })) {
      expect(first.has(key)).toBe(false);
    }
  });
});

describe("protecting lower-rated players", () => {
  it("does not give the lowest-rated players a court of their own when a mixed lineup exists", () => {
    const lows = ["a", "b", "c", "d"];
    const highs = ["e", "f", "g", "h"];
    const players = [
      ...lows.map((id) => player(id, "female" as const, 2)),
      ...highs.map((id) => player(id, "male" as const, 5)),
    ];
    const ledger = emptyLedger();
    for (const low of lows) {
      for (const high of highs) ledger.partners[pairKey(low, high)] = 1;
    }
    const plan = planRound(players, fresh(players), ledger, 2, 1, 4);
    expect(patterns(plan, players)).not.toContain("women_vs_men");
    for (const match of plan.matches) {
      for (const team of [match.teamA, match.teamB]) {
        expect(team.filter((id) => lows.includes(id))).toHaveLength(1);
      }
    }
  });

  it("keeps the two lowest apart even when every other partnership is already used", () => {
    const players = [
      player("low1", "male", 2.5),
      player("low2", "male", 3),
      player("mid1", "male", 4),
      player("mid2", "male", 4.5),
      player("mid3", "female", 4.2),
      player("mid4", "female", 4.8),
      player("high1", "male", 5.2),
      player("high2", "female", 5.5),
    ];
    const ledger = emptyLedger();
    const ids = players.map((item) => item.id);
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const a = ids[left];
        const b = ids[right];
        if (!a || !b || (a === "low1" && b === "low2")) continue;
        ledger.partners[pairKey(a, b)] = 2;
      }
    }
    const plan = planRound(players, fresh(players), ledger, 2, 3, 2);
    for (const match of plan.matches) {
      expect(match.teamA.includes("low1") && match.teamA.includes("low2")).toBe(false);
      expect(match.teamB.includes("low1") && match.teamB.includes("low2")).toBe(false);
      expect(isLowHighStack(players, match.teamA, match.teamB)).toBe(false);
    }
    expect(patterns(plan, players)).not.toContain("women_vs_men");
  });
});

describe("sit-out returners", () => {
  it("partners players coming back from a sit with people who stayed", () => {
    const players = [
      player("r1", "male", 2.5),
      player("r2", "male", 5.5),
      player("s1", "male", 3),
      player("s2", "male", 5),
    ];
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

describe("large draws", () => {
  it("still avoids women vs men when four courts are full", () => {
    const players = many(16);
    const plan = planRound(players, fresh(players), emptyLedger(), 4, 1, 2);
    expect(plan.courtsUsed).toBe(4);
    expect(patterns(plan, players)).not.toContain("women_vs_men");
    assertCovered(plan, players);
  });
});
