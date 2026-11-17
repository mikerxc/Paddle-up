import { describe, expect, it } from "vitest";
import {
  applyRound,
  courtsFor,
  emptyLedger,
  matchPattern,
  newSched,
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
  it("spreads one sit exactly once around a 5-player, 1-court night", () => {
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

describe("large draws", () => {
  it("still avoids women vs men when four courts are full", () => {
    const players = many(16);
    const plan = planRound(players, fresh(players), emptyLedger(), 4, 1, 2);
    expect(plan.courtsUsed).toBe(4);
    expect(patterns(plan, players)).not.toContain("women_vs_men");
    assertCovered(plan, players);
  });
});
