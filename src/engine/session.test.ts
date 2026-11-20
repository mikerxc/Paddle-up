import { describe, expect, it } from "vitest";
import { defaultSettings } from "../model.ts";
import type { Player, Store } from "../model.ts";
import { activeRound, createInitialStore, presentIds, reduce, recompute, roundLineupKey, roundUndoCount, sessionRecap, standings } from "./session.ts";
import { matchPattern } from "./pairing.ts";

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    gender: index % 2 === 0 ? "female" : "male",
    skill: Math.round((2.8 + (index % 8) * 0.3) * 10) / 10,
    createdAt: index,
  }));
}

function ready(count = 8, courts = 2): Store {
  const players = makePlayers(count);
  return {
    ...createInitialStore(),
    players,
    checkedIn: players.map((player) => player.id),
    settings: { ...defaultSettings, courts, initialRounds: 4 },
  };
}

function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(label);
  return value;
}

describe("session defaults", () => {
  it("starts from the confirmed defaults", () => {
    expect(defaultSettings.courts).toBe(2);
    expect(defaultSettings.pointsToWin).toBe(11);
    expect(defaultSettings.winBy).toBe(2);
    expect(defaultSettings.initialRounds).toBe(4);
    expect(defaultSettings.defaultSkill).toBe(2.0);
  });
});

describe("undo", () => {
  it("reverts score taps, a swap, and the session start, one level at a time", () => {
    const started = reduce(ready(9, 2), { type: "start-session" }, 1_700_000_000_000);
    const session = must(started.store.active, "session");
    const round = must(activeRound(session), "round");
    const match = must(round.matches[0], "match");
    const originalTeams = round.matches.map((item) => [item.teamA.join(), item.teamB.join()]);
    const sitter = must(round.sittingOut[0], "sitter");
    const onCourt = match.teamA[0];

    const up = reduce(started.store, { type: "nudge-score", matchId: match.id, side: "A", delta: 1 }, 2);
    const upAgain = reduce(up.store, { type: "nudge-score", matchId: match.id, side: "A", delta: 1 }, 3);
    const swapped = reduce(
      upAgain.store,
      { type: "swap", roundId: round.id, outId: onCourt, inId: sitter },
      4,
    );
    const afterSwap = must(swapped.store.active, "after swap");
    const swappedRound = must(afterSwap.rounds.find((item) => item.id === round.id), "same round");
    expect(swappedRound.matches.some((item) => [...item.teamA, ...item.teamB].includes(sitter))).toBe(true);
    expect(swappedRound.sittingOut).toContain(onCourt);

    const undoSwap = reduce(swapped.store, { type: "undo" }, 5);
    const undoOne = reduce(undoSwap.store, { type: "undo" }, 6);
    const undoBoth = reduce(undoOne.store, { type: "undo" }, 7);
    const restored = must(undoBoth.store.active, "restored");
    const restoredRound = must(restored.rounds.find((item) => item.id === round.id), "restored round");
    const restoredMatch = must(restoredRound.matches.find((item) => item.id === match.id), "restored match");
    expect(restoredMatch.scoreA).toBe(0);
    expect(restoredRound.matches.map((item) => [item.teamA.join(), item.teamB.join()])).toEqual(originalTeams);

    const backToCheckin = reduce(undoBoth.store, { type: "undo" }, 8);
    expect(backToCheckin.store.active).toBeNull();
    expect(backToCheckin.store.view.name).toBe("checkin");
    expect(reduce(backToCheckin.store, { type: "undo" }, 9).error).toMatch(/Nothing to undo/);
  });

  it("counts edits in the open round and resets that count when the next round starts", () => {
    let step = reduce(ready(4, 1), { type: "toggle-checkin", playerId: "p0" }, 1);
    step = reduce(step.store, { type: "toggle-checkin", playerId: "p0" }, 2);
    step = reduce(step.store, { type: "start-session" }, 3);
    expect(step.store.undo.length).toBeGreaterThan(2);
    expect(roundUndoCount(step.store)).toBe(0);
    const match = must(activeRound(must(step.store.active, "s"))?.matches[0], "m");
    step = reduce(step.store, { type: "nudge-score", matchId: match.id, side: "A", delta: 1 }, 4);
    step = reduce(step.store, { type: "nudge-score", matchId: match.id, side: "A", delta: 1 }, 5);
    expect(roundUndoCount(step.store)).toBe(2);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 6);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 9 }, 7);
    expect(roundUndoCount(step.store)).toBe(4);
    step = reduce(step.store, { type: "finish-round" }, 8);
    expect(activeRound(must(step.store.active, "next"))?.number).toBe(2);
    expect(roundUndoCount(step.store)).toBe(0);
    const undone = reduce(step.store, { type: "undo" }, 9);
    expect(activeRound(must(undone.store.active, "back"))?.number).toBe(1);
    expect(roundUndoCount(undone.store)).toBe(4);
    expect(undone.store.active?.rounds[0]?.matches[0]?.scoreA).toBe(11);
  });

  it("brings back a session that was ended by mistake", () => {
    const started = reduce(ready(4, 1), { type: "start-session" }, 50);
    const ended = reduce(started.store, { type: "end-session" }, 60);
    expect(ended.store.active).toBeNull();
    expect(ended.store.past).toHaveLength(1);
    const undone = reduce(ended.store, { type: "undo" }, 70);
    expect(undone.store.active?.id).toBe(started.store.active?.id);
    expect(undone.store.past).toHaveLength(0);
    expect(undone.store.view.name).toBe("play");
  });
});

describe("scores", () => {
  it("refuses to finish a round that is not win-by-2 and then records the result", () => {
    let step = reduce(ready(4, 1), { type: "start-session" }, 10);
    const round = must(activeRound(must(step.store.active, "s")), "r");
    const match = must(round.matches[0], "m");
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 11);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 10 }, 12);
    const blocked = reduce(step.store, { type: "finish-round" }, 13);
    expect(blocked.error).toMatch(/Win by 2/);
    expect(activeRound(must(blocked.store.active, "still"))?.status).toBe("active");

    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 13 }, 14);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 11 }, 15);
    const finished = reduce(step.store, { type: "finish-round" }, 16);
    expect(finished.error).toBeUndefined();
    const done = must(finished.store.active, "done").rounds[0];
    expect(done?.status).toBe("complete");
    const table = standings(must(finished.store.active, "stats"));
    const winners = match.teamA.map((id) => table.find((row) => row.playerId === id));
    const losers = match.teamB.map((id) => table.find((row) => row.playerId === id));
    for (const row of winners) {
      expect(row?.wins).toBe(1);
      expect(row?.diff).toBe(2);
    }
    for (const row of losers) {
      expect(row?.losses).toBe(1);
      expect(row?.diff).toBe(-2);
    }
  });

  it("refuses a score that ran past the ending total", () => {
    let step = reduce(ready(4, 1), { type: "start-session" }, 10);
    const match = must(activeRound(must(step.store.active, "s"))?.matches[0], "m");
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 15 }, 11);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 5 }, 12);
    expect(reduce(step.store, { type: "finish-round" }, 13).error).toMatch(/ends at 11–5/);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 12 }, 14);
    expect(reduce(step.store, { type: "finish-round" }, 15).error).toMatch(/ends at 11–5/);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 16);
    expect(reduce(step.store, { type: "finish-round" }, 17).error).toBeUndefined();
  });

  it("keeps going with one more round after the plan runs out", () => {
    let step = reduce(
      { ...ready(4, 1), settings: { ...defaultSettings, courts: 1, initialRounds: 1 } },
      { type: "start-session" },
      10,
    );
    const match = must(activeRound(must(step.store.active, "s"))?.matches[0], "m");
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 11);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 9 }, 12);
    step = reduce(step.store, { type: "finish-round" }, 13);
    expect(activeRound(must(step.store.active, "between"))).toBeNull();
    step = reduce(step.store, { type: "add-rounds", count: 1 }, 14);
    expect(activeRound(must(step.store.active, "next"))?.number).toBe(2);
    expect(step.cue).toBe(true);
  });

  it("learns a hidden skill from a finished game and undoes it with the round", () => {
    const base = ready(4, 1);
    base.players = base.players.map((player) => ({ ...player, skill: 4 }));
    let step = reduce(base, { type: "start-session" }, 10);
    const match = must(activeRound(must(step.store.active, "s"))?.matches[0], "m");
    const before = new Map(step.store.players.map((player) => [player.id, player.skill]));
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 11);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 3 }, 12);
    expect(step.store.players.every((player) => player.skill === 4)).toBe(true);
    const finished = reduce(step.store, { type: "finish-round" }, 13);
    expect(finished.error).toBeUndefined();
    const skill = (id: string) => finished.store.players.find((player) => player.id === id)?.skill ?? 0;
    expect(skill(match.teamA[0])).toBeGreaterThan(4);
    expect(skill(match.teamA[1])).toBeGreaterThan(4);
    expect(skill(match.teamB[0])).toBeLessThan(4);
    expect(skill(match.teamB[1])).toBeLessThan(4);
    expect(finished.store.skillLog.length).toBeGreaterThan(0);
    const undone = reduce(finished.store, { type: "undo" }, 14);
    for (const [id, rating] of before) {
      expect(undone.store.players.find((player) => player.id === id)?.skill).toBe(rating);
    }
    expect(undone.store.skillLog).toEqual([]);
  });
});

describe("arrivals and departures", () => {
  it("folds a late arrival into the rotation with no skip-ahead and no phantom sits", () => {
    let step = reduce(ready(8, 1), { type: "start-session" }, 100);
    const playOut = (times: number) => {
      for (let index = 0; index < times; index += 1) {
        const round = must(activeRound(must(step.store.active, "live")), "round");
        for (const match of round.matches) {
          step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 200 + index);
          step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 5 }, 300 + index);
        }
        step = reduce(step.store, { type: "finish-round" }, 400 + index);
      }
    };
    playOut(2);
    const before = structuredClone(must(step.store.active, "before").rounds.filter((round) => round.status === "complete"));
    const satLast = must(before[before.length - 1], "last").sittingOut;
    step = reduce(
      step.store,
      { type: "add-player", name: "Guest", gender: "female", skill: 2, arriveAfter: false },
      500,
    );
    const guestId = must(step.store.players.find((player) => player.name === "Guest"), "guest").id;
    step = reduce(step.store, { type: "arrive", playerId: guestId }, 501);
    const live = must(step.store.active, "with guest");
    expect(live.rounds.filter((round) => round.status === "complete")).toEqual(before);
    const first = must(live.rounds.find((round) => round.status !== "complete"), "next");
    const firstPlaying = first.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
    expect(firstPlaying).not.toContain(guestId);
    expect(first.sittingOut).toContain(guestId);
    for (const id of satLast) expect(firstPlaying).toContain(id);
    const state = recompute(live, first.number - 1);
    const played = Object.entries(state.sched).filter(([id, row]) => id !== guestId && row.gamesPlayed > 0);
    const min = Math.min(...played.map(([, row]) => row.scheduleGames));
    expect(state.sched[guestId]?.scheduleGames).toBe(min);
    expect(state.sched[guestId]?.sitOuts).toBe(0);
    step = reduce(step.store, { type: "add-rounds", count: 4 }, 600);
    const later = must(step.store.active, "later").rounds.filter((round) => round.number >= first.number);
    const guestGames = later.filter((round) =>
      round.matches.some((match) => [...match.teamA, ...match.teamB].includes(guestId)),
    ).length;
    expect(guestGames).toBeGreaterThan(0);
    expect(guestGames).toBeLessThan(later.length);
  });

  it("drops a departure from unplayed rounds and keeps a scored game intact", () => {
    let step = reduce(ready(8, 2), { type: "start-session" }, 10);
    const round = must(activeRound(must(step.store.active, "s")), "r");
    const leaving = round.matches[0]?.teamA[0];
    expect(leaving).toBeDefined();
    if (!leaving) return;
    step = reduce(step.store, { type: "nudge-score", matchId: must(round.matches[0], "m").id, side: "A", delta: 1 }, 11);
    step = reduce(step.store, { type: "depart", playerId: leaving }, 12);
    const live = must(step.store.active, "live");
    const current = must(live.rounds.find((item) => item.id === round.id), "current");
    expect(current.matches.some((match) => [...match.teamA, ...match.teamB].includes(leaving))).toBe(true);
    for (const later of live.rounds.filter((item) => item.number > current.number)) {
      const ids = [...later.sittingOut, ...later.matches.flatMap((match) => [...match.teamA, ...match.teamB])];
      expect(ids).not.toContain(leaving);
    }
    expect(presentIds(live)).not.toContain(leaving);
  });

  it("removes someone immediately when the round has not started", () => {
    let step = reduce(ready(9, 2), { type: "start-session" }, 10);
    const round = must(activeRound(must(step.store.active, "s")), "r");
    const leaving = must(round.sittingOut[0] ?? round.matches[0]?.teamA[0], "someone");
    step = reduce(step.store, { type: "depart", playerId: leaving }, 11);
    const current = must(activeRound(must(step.store.active, "live")), "now");
    const ids = [...current.sittingOut, ...current.matches.flatMap((match) => [...match.teamA, ...match.teamB])];
    expect(ids).not.toContain(leaving);
    expect(current.matches.length).toBeGreaterThan(0);
  });
});

function lineup(store: Store) {
  return store.active?.rounds.map((round) => roundLineupKey(round)) ?? [];
}

describe("reshuffle", () => {
  it("re-rolls the open round and every later round when the score is still 0–0", () => {
    const players = makePlayers(8).map((player) => ({ ...player, skill: 4 }));
    let step = reduce(
      {
        ...createInitialStore(),
        players,
        checkedIn: players.map((player) => player.id),
        settings: { ...defaultSettings, courts: 2, initialRounds: 3 },
      },
      { type: "start-session" },
      10,
    );
    const before = must(step.store.active, "before");
    const beforeKeys = lineup(step.store);
    const sits = before.rounds.map((round) => [...round.sittingOut]);
    step = reduce(step.store, { type: "reshuffle" }, 11);
    const after = must(step.store.active, "after");
    expect(after.rounds).toHaveLength(before.rounds.length);
    expect(after.rounds.map((round) => round.status)).toEqual(before.rounds.map((round) => round.status));
    after.rounds.forEach((round, index) => {
      expect(roundLineupKey(round)).not.toBe(beforeKeys[index]);
      expect(round.sittingOut).toEqual(sits[index]);
      expect(round.matches.every((match) => match.scoreA === 0 && match.scoreB === 0)).toBe(true);
    });
    expect(step.notice).toMatch(/Open rounds reshuffled/);
  });

  it("leaves a started round alone and re-rolls only the rounds after it", () => {
    const players = makePlayers(8).map((player) => ({ ...player, skill: 4 }));
    let step = reduce(
      {
        ...createInitialStore(),
        players,
        checkedIn: players.map((player) => player.id),
        settings: { ...defaultSettings, courts: 2, initialRounds: 3 },
      },
      { type: "start-session" },
      20,
    );
    const current = must(activeRound(must(step.store.active, "s")), "current");
    const liveMatch = must(current.matches[0], "match");
    step = reduce(step.store, { type: "nudge-score", matchId: liveMatch.id, side: "A", delta: 1 }, 21);
    const started = structuredClone(must(step.store.active, "started").rounds[0]);
    const laterBefore = must(step.store.active, "later").rounds.slice(1).map((round) => roundLineupKey(round));
    step = reduce(step.store, { type: "reshuffle" }, 22);
    const after = must(step.store.active, "after");
    expect(after.rounds[0]).toEqual(started);
    const laterAfter = after.rounds.slice(1).map((round) => roundLineupKey(round));
    expect(laterAfter.length).toBe(laterBefore.length);
    expect(laterAfter.some((key, index) => key !== laterBefore[index])).toBe(true);
    for (const round of after.rounds.slice(1)) {
      expect(round.status).toBe("pending");
      expect(round.matches.every((match) => match.scoreA === 0 && match.scoreB === 0)).toBe(true);
    }
    expect(step.notice).toMatch(/Later rounds reshuffled/);
  });

  it("keeps completed rounds and drops a player who has left", () => {
    let step = reduce(ready(8, 1), { type: "start-session" }, 10);
    const first = must(activeRound(must(step.store.active, "s")), "r");
    for (const match of first.matches) {
      step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 20);
      step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 3 }, 21);
    }
    step = reduce(step.store, { type: "finish-round" }, 22);
    const completed = structuredClone(must(step.store.active, "c").rounds[0]);
    const active = must(activeRound(must(step.store.active, "a")), "active");
    const leaving = must(active.sittingOut[0] ?? active.matches[0]?.teamB[0], "leave");
    step = reduce(step.store, { type: "reshuffle" }, 23);
    expect(must(step.store.active, "r").rounds[0]).toEqual(completed);
    step = reduce(step.store, { type: "depart", playerId: leaving }, 24);
    const live = must(step.store.active, "live");
    expect(live.rounds[0]).toEqual(completed);
    for (const round of live.rounds.filter((item) => item.status !== "complete")) {
      const ids = [...round.sittingOut, ...round.matches.flatMap((match) => [...match.teamA, ...match.teamB])];
      expect(ids).not.toContain(leaving);
      expect(round.matches.length).toBe(1);
    }
  });

  it("changes later rounds when the court count drops to 1", () => {
    let step = reduce(ready(12, 2), { type: "start-session" }, 10);
    expect(activeRound(must(step.store.active, "s"))?.matches.length).toBe(2);
    step = reduce(step.store, { type: "set-settings", patch: { courts: 1 } }, 11);
    const live = must(step.store.active, "live");
    expect(live.rules.courts).toBe(1);
    for (const round of live.rounds.filter((item) => item.status !== "complete")) {
      expect(round.matches.length).toBe(1);
      expect(round.sittingOut.length).toBe(8);
    }
    const genderOf = (id: string) => step.store.players.find((player) => player.id === id)?.gender ?? "male";
    for (const round of live.rounds) {
      for (const match of round.matches) {
        expect(matchPattern(genderOf, match.teamA, match.teamB)).not.toBe("women_vs_men");
      }
    }
  });
});

describe("session recap", () => {
  it("copies records, games, and point diff without hidden ratings", () => {
    let step = reduce(ready(4, 1), { type: "start-session" }, 10);
    const match = must(activeRound(must(step.store.active, "s"))?.matches[0], "m");
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "A", score: 11 }, 11);
    step = reduce(step.store, { type: "set-score", matchId: match.id, side: "B", score: 5 }, 12);
    step = reduce(step.store, { type: "finish-round" }, 13);
    step = reduce(step.store, { type: "end-session" }, 14);
    const session = must(step.store.past[0], "saved");
    const text = sessionRecap(session, step.store.players);
    expect(text).toContain(session.title);
    expect(text).toContain("1-0");
    expect(text).toContain("0-1");
    expect(text).toContain("1 played");
    expect(text).toContain("+6");
    expect(text).toContain("-6");
    expect(text).not.toMatch(/DUPR/i);
    expect(text).not.toMatch(/\b[2-5]\.\d\b/);
  });
});
