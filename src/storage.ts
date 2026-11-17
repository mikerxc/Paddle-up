import { createInitialStore } from "./engine/session.ts";
import {
  sanitizeSettings,
  type Player,
  type Session,
  type Settings,
  type Snapshot,
  type Store,
  type View,
} from "./model.ts";

const KEY = "paddle-up-v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isPlayer(value: unknown): value is Player {
  if (!value || typeof value !== "object") return false;
  const player = value as Player;
  return (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    (player.gender === "female" || player.gender === "male") &&
    typeof player.skill === "number"
  );
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Session;
  return typeof session.id === "string" && Array.isArray(session.rounds) && Array.isArray(session.attendance) && Array.isArray(session.log);
}

function isView(value: unknown): value is View {
  if (!value || typeof value !== "object") return false;
  const view = value as View;
  return (
    view.name === "home" ||
    view.name === "roster" ||
    view.name === "edit" ||
    view.name === "checkin" ||
    view.name === "play" ||
    view.name === "stats" ||
    view.name === "log" ||
    view.name === "past" ||
    view.name === "settings"
  );
}

export function normalizeStore(value: unknown): Store {
  const blank = createInitialStore();
  if (!value || typeof value !== "object") return blank;
  const raw = value as Partial<Store> & { version?: number };
  if (raw.version !== undefined && raw.version !== 1) return blank;
  const settings: Settings = sanitizeSettings(raw.settings);
  const view = isView(raw.view) ? raw.view : blank.view;
  return {
    players: Array.isArray(raw.players) ? raw.players.filter(isPlayer) : [],
    settings,
    checkedIn: Array.isArray(raw.checkedIn) ? raw.checkedIn.filter((id): id is string => typeof id === "string") : [],
    active: isSession(raw.active) ? raw.active : null,
    past: Array.isArray(raw.past) ? raw.past.filter(isSession) : [],
    undo: Array.isArray(raw.undo) ? (raw.undo as Snapshot[]) : [],
    view,
  };
}

export function loadStore(storage: StorageLike | null = browserStorage()): Store {
  if (!storage) return createInitialStore();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return createInitialStore();
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch {
    return createInitialStore();
  }
}

export function saveStore(store: Store, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  const payload = { version: 1, ...store };
  try {
    storage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    try {
      storage.setItem(KEY, JSON.stringify({ ...payload, undo: store.undo.slice(-5) }));
      return true;
    } catch {
      return false;
    }
  }
}
