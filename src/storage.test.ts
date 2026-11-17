import { describe, expect, it } from "vitest";
import { reduce } from "./engine/session.ts";
import { createInitialStore } from "./engine/session.ts";
import { defaultSettings } from "./model.ts";
import type { Player } from "./model.ts";
import { loadStore, saveStore, type StorageLike } from "./storage.ts";

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
    gender: index % 2 === 0 ? "female" : "male",
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
});
