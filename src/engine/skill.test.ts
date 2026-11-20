import { describe, expect, it } from "vitest";
import { SKILL_MAX, SKILL_MIN, type Player, type Round } from "../model.ts";
import { expectedWin, learnFromRound, ratingDelta } from "./skill.ts";

function player(id: string, skill: number): Player {
  return { id, name: id, gender: "female", skill, createdAt: 1 };
}

function round(scoreA: number, scoreB: number, teamA: [string, string], teamB: [string, string]): Round {
  return {
    id: "r",
    number: 1,
    status: "complete",
    sittingOut: [],
    matches: [{ id: "m", court: 1, teamA, teamB, scoreA, scoreB }],
  };
}

describe("hidden skill learning", () => {
  it("moves winners up and losers down, and a wider margin moves them more", () => {
    const close = ratingDelta(4, 4, 11, 9);
    const wide = ratingDelta(4, 4, 11, 0);
    expect(close).toBeGreaterThan(0);
    expect(wide).toBeGreaterThan(close);
    expect(ratingDelta(4, 4, 9, 11)).toBeLessThan(0);
    expect(ratingDelta(4, 4, 11, 11)).toBe(0);
  });

  it("gives an underdog win a bigger nudge than a favorite win", () => {
    const underdog = ratingDelta(2.5, 4.5, 11, 4);
    const favorite = ratingDelta(4.5, 2.5, 11, 4);
    expect(underdog).toBeGreaterThan(favorite);
    expect(favorite).toBeGreaterThan(0);
    expect(expectedWin(4.5, 2.5)).toBeGreaterThan(0.8);
  });

  it("updates both partners from the score and stays inside the rating bounds", () => {
    const floor = learnFromRound(
      [player("a", SKILL_MIN), player("b", SKILL_MIN), player("c", SKILL_MIN), player("d", SKILL_MIN)],
      round(11, 0, ["a", "b"], ["c", "d"]),
      50,
      [],
    );
    const low = (id: string) => floor.players.find((item) => item.id === id)?.skill ?? 0;
    expect(low("a")).toBeGreaterThan(SKILL_MIN);
    expect(low("b")).toBe(low("a"));
    expect(low("c")).toBe(SKILL_MIN);
    expect(low("d")).toBe(SKILL_MIN);

    const cap = learnFromRound(
      [player("a", 5.49), player("b", 5.49), player("c", 5.2), player("d", 5.2)],
      round(11, 0, ["a", "b"], ["c", "d"]),
      51,
      [],
    );
    const high = (id: string) => cap.players.find((item) => item.id === id)?.skill ?? 0;
    expect(high("a")).toBe(SKILL_MAX);
    expect(high("b")).toBe(SKILL_MAX);
    expect(high("c")).toBeLessThan(5.2);
    expect(high("c")).toBeGreaterThanOrEqual(SKILL_MIN);
    expect(cap.skillLog.every((event) => event.source === "game")).toBe(true);
  });

  it("uses the pre-round ratings for every court in the round", () => {
    const players = [player("a", 4), player("b", 4), player("c", 4), player("d", 4), player("e", 4), player("f", 4), player("g", 4), player("h", 4)];
    const played: Round = {
      id: "r",
      number: 1,
      status: "complete",
      sittingOut: [],
      matches: [
        { id: "m1", court: 1, teamA: ["a", "b"], teamB: ["c", "d"], scoreA: 11, scoreB: 3 },
        { id: "m2", court: 2, teamA: ["e", "f"], teamB: ["g", "h"], scoreA: 11, scoreB: 3 },
      ],
    };
    const learned = learnFromRound(players, played, 10, []);
    const skill = (id: string) => learned.players.find((item) => item.id === id)?.skill ?? 0;
    expect(skill("a")).toBeCloseTo(skill("e"), 5);
    expect(skill("c")).toBeCloseTo(skill("g"), 5);
    expect(skill("a")).toBeGreaterThan(4);
    expect(skill("c")).toBeLessThan(4);
  });
});
