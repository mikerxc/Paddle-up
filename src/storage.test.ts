import { describe, expect, it } from "vitest";
import { reduce } from "./engine/session.ts";
import { createInitialStore } from "./engine/session.ts";
import { defaultSettings } from "./model.ts";
import type { Player } from "./model.ts";
import { buildBackup, loadStore, parseBackup, saveStore, type StorageLike } from "./storage.ts";

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function players(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    skill: 3.5,
    createdAt: index,
  }));
}

describe("storage", () => {
  it("round-trips the live session, scores, and undo stack", () => {
    const roster = players(6);
    let store = {
      ...createInitialStore(),
      players: roster,
      checkedIn: roster.map((player) => player.id),
      settings: { ...defaultSettings, courts: 1, initialRounds: 2 },
    };
    store = reduce(store, { type: "start-session" }, 80).store;
    const match = store.active?.rounds[0]?.matches[0];
    expect(match).toBeDefined();
    if (!match) return;
    store = reduce(store, { type: "nudge-score", matchId: match.id, side: "A", delta: 1 }, 81).store;
    const memory = new MemoryStorage();
    expect(saveStore(store, memory)).toBe(true);
    const loaded = loadStore(memory);
    expect(loaded.active?.id).toBe(store.active?.id);
    expect(loaded.active?.rounds[0]?.matches[0]?.scoreA).toBe(1);
    expect(loaded.undo.length).toBe(store.undo.length);
    expect(loaded.players).toHaveLength(6);
    const undone = reduce(loaded, { type: "undo" }, 82);
    expect(undone.store.active?.rounds[0]?.matches[0]?.scoreA).toBe(0);
  });

  it("starts clean when the saved data is junk", () => {
    const memory = new MemoryStorage();
    memory.setItem("paddle-up-v1", "{");
    expect(loadStore(memory).players).toEqual([]);
    memory.setItem("paddle-up-v1", JSON.stringify({ version: 2 }));
    expect(loadStore(memory).settings.courts).toBe(2);
  });

  it("loads a v1 save that has no host flag and a legacy paused session", () => {
    const memory = new MemoryStorage();
    memory.setItem(
      "paddle-up-v1",
      JSON.stringify({
        version: 1,
        players: [{ id: "a", name: "Ann", gender: "female", skill: 3.2, createdAt: 1 }],
        settings: { courts: 2, pointsToWin: 11, winBy: 2, initialRounds: 4, defaultSkill: 2, soundOn: true, vibrateOn: true },
        checkedIn: ["a"],
        active: {
          id: "s",
          title: "Open play",
          createdAt: 1,
          endedAt: null,
          salt: 4,
          paused: true,
          attendance: [],
          rounds: [],
          rules: { courts: 1, pointsToWin: 11, winBy: 2 },
          log: [],
        },
        past: [],
        view: { name: "play" },
      }),
    );
    const loaded = loadStore(memory);
    expect(loaded.settings.hostSkills).toBe(false);
    expect(loaded.settings.defaultSkill).toBe(3);
    expect(loaded.settings).not.toHaveProperty("vibrateOn");
    expect(loaded.players[0]?.skill).toBe(3.2);
    expect(loaded.players[0]).not.toHaveProperty("gender");
    expect(loaded.active?.id).toBe("s");
    expect(loaded.active?.paused).toBe(true);
    expect(loaded.skillLog).toEqual([]);
    expect(reduce(loaded, { type: "undo" }, 2).error).toMatch(/Nothing to undo/);
  });

  it("rejects a backup that is not this app's file and accepts a valid one", () => {
    expect(parseBackup({ version: 1 }).ok).toBe(false);
    const store = {
      ...createInitialStore(),
      players: players(2),
      skillLog: [{ at: 1, playerId: "p0", before: 3, after: 3.1, source: "game" as const }],
    };
    const backup = buildBackup(store, 90);
    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = reduce(createInitialStore(), {
      type: "import-backup",
      players: parsed.backup.players,
      settings: parsed.backup.settings,
      past: parsed.backup.past,
      active: parsed.backup.active,
      checkedIn: parsed.backup.checkedIn,
      skillLog: parsed.backup.skillLog,
    }, 91);
    expect(restored.store.players.map((player) => player.name)).toEqual(["Player 0", "Player 1"]);
    expect(restored.store.skillLog).toEqual(store.skillLog);
    expect(restored.store.view.name).toBe("home");
  });

  it("loads players with no gender and migrates the old 2.0 default once", () => {
    const memory = new MemoryStorage();
    memory.setItem(
      "paddle-up-v1",
      JSON.stringify({
        version: 1,
        players: [
          { id: "a", name: "Ann", skill: 2, createdAt: 1 },
          { id: "b", name: "Bo", gender: "nope", skill: 2.4, createdAt: 2 },
          { id: "c", name: "Cy", gender: "female", skill: 3.1, createdAt: 3 },
        ],
        settings: { courts: 2, pointsToWin: 11, winBy: 2, initialRounds: 4, defaultSkill: 2, soundOn: true, vibrateOn: true },
        checkedIn: [],
        active: null,
        past: [],
        view: { name: "roster" },
      }),
    );
    const loaded = loadStore(memory);
    expect(loaded.players.map((player) => [player.name, player.skill])).toEqual([
      ["Ann", 3],
      ["Bo", 2.4],
      ["Cy", 3.1],
    ]);
    expect(loaded.settings.defaultSkill).toBe(3);
    expect(saveStore(loaded, memory)).toBe(true);
    const edited = loadStore(memory);
    edited.players = edited.players.map((player) => (player.id === "a" ? { ...player, skill: 2 } : player));
    expect(saveStore(edited, memory)).toBe(true);
    const again = loadStore(memory);
    expect(again.players.find((player) => player.id === "a")?.skill).toBe(2);
    expect(again.settings.defaultSkill).toBe(3);
  });

  it("accepts a backup whose players have no gender", () => {
    const parsed = parseBackup({
      kind: "paddle-up-backup",
      version: 1,
      exportedAt: 5,
      players: [{ id: "a", name: "Ann", skill: 2, createdAt: 1 }],
      settings: { ...defaultSettings, defaultSkill: 2 },
      past: [],
      active: null,
      checkedIn: [],
      skillLog: [],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.players[0]?.skill).toBe(3);
    expect(parsed.backup.settings.defaultSkill).toBe(3);
    expect(parsed.backup.skillDefaultMigrated).toBe(true);
  });
});
