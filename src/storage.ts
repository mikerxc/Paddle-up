import { createInitialStore } from "./engine/session.ts";
import {
  sanitizeSettings,
  type Player,
  type Session,
  type Settings,
  type SkillEvent,
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

function isSkillEvent(value: unknown): value is SkillEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as SkillEvent;
  return (
    typeof event.at === "number" &&
    typeof event.playerId === "string" &&
    typeof event.before === "number" &&
    typeof event.after === "number" &&
    (event.source === "game" || event.source === "manual")
  );
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
    skillLog: Array.isArray(raw.skillLog) ? raw.skillLog.filter(isSkillEvent).slice(-2000) : [],
    undo: Array.isArray(raw.undo) ? (raw.undo as Snapshot[]) : [],
    view,
  };
}

export interface BackupFile {
  kind: "paddle-up-backup";
  version: 1;
  exportedAt: number;
  players: Player[];
  settings: Settings;
  past: Session[];
  active: Session | null;
  checkedIn: string[];
  /** Current hidden ratings and every recorded change. */
  skillLog: SkillEvent[];
}

export function buildBackup(store: Store, now = Date.now()): BackupFile {
  return {
    kind: "paddle-up-backup",
    version: 1,
    exportedAt: now,
    players: store.players,
    settings: store.settings,
    past: store.past,
    active: store.active,
    checkedIn: store.checkedIn,
    skillLog: store.skillLog,
  };
}

export function parseBackup(value: unknown): { ok: true; backup: BackupFile } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "That file isn't a Paddle Up backup." };
  const raw = value as Partial<BackupFile>;
  if (raw.kind !== "paddle-up-backup" || raw.version !== 1) {
    return { ok: false, error: "That file isn't a Paddle Up backup." };
  }
  if (!Array.isArray(raw.players) || !raw.players.every(isPlayer)) {
    return { ok: false, error: "The backup's player list is missing or unreadable." };
  }
  if (raw.active !== null && raw.active !== undefined && !isSession(raw.active)) {
    return { ok: false, error: "The backup's live session is unreadable." };
  }
  if (!Array.isArray(raw.past) || !raw.past.every(isSession)) {
    return { ok: false, error: "The backup's past sessions are unreadable." };
  }
  const skillLog = Array.isArray(raw.skillLog) ? raw.skillLog.filter(isSkillEvent) : [];
  const checkedIn = Array.isArray(raw.checkedIn) ? raw.checkedIn.filter((id): id is string => typeof id === "string") : [];
  return {
    ok: true,
    backup: {
      kind: "paddle-up-backup",
      version: 1,
      exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : Date.now(),
      players: raw.players,
      settings: sanitizeSettings(raw.settings),
      past: raw.past,
      active: raw.active ?? null,
      checkedIn,
      skillLog,
    },
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
