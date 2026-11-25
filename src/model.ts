export interface Player {
  id: string;
  name: string;
  /**
   * Hidden skill used only for fair pairing. The host sets it, from 2.0 to 5.5
   * in 0.1 steps. Finished games do not change it.
   */
  skill: number;
  createdAt: number;
}

export interface Settings {
  /** Courts available for the session. The engine uses fewer when there aren't enough players. */
  courts: number;
  pointsToWin: number;
  winBy: number;
  /** How many rounds to lay out when a session starts. */
  initialRounds: number;
  /** Hidden skill filled in for a new player. */
  defaultSkill: number;
  /** Host-only preference. Numbers still stay hidden until the PIN unlocks this visit. */
  hostSkills: boolean;
  soundOn: boolean;
  vibrateOn: boolean;
}

export interface Match {
  id: string;
  court: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
  /** True when this game was built below the 5.0 team-total floor. */
  short?: boolean;
}

export interface Round {
  id: string;
  number: number;
  matches: Match[];
  sittingOut: string[];
  status: "pending" | "active" | "complete";
}

export interface LogEntry {
  id: string;
  at: number;
  message: string;
}

/**
 * Who was here. scheduleBase and lastPlayedBase fold a late arrival into the
 * current rotation without phantom sits and without a guaranteed next game.
 */
export interface Attendance {
  playerId: string;
  joinedAtRound: number;
  /** First round they are no longer eligible for. Null means still here. */
  leftAtRound: number | null;
  scheduleBase: number;
  /** Starting "last played" round. -1 for people here from the first game. */
  lastPlayedBase: number;
}

export interface SessionRules {
  courts: number;
  pointsToWin: number;
  winBy: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  endedAt: number | null;
  /** Changes the opening sit-out tie-break so the same people don't sit game 1 every week. */
  salt: number;
  attendance: Attendance[];
  rounds: Round[];
  /** Legacy field from older saves. Ignored. */
  paused?: boolean;
  rules: SessionRules;
  log: LogEntry[];
  /** Lineup keys already shown for each round number. Reshuffle avoids all of them. */
  lineupMemory?: Record<string, string[]>;
}

/** A quiet record of hidden-skill changes. Shown nowhere in the app. */
export interface SkillEvent {
  at: number;
  playerId: string;
  before: number;
  after: number;
  source: "game" | "manual";
}

export type View =
  | { name: "home" }
  | { name: "roster" }
  | { name: "edit"; playerId: string | null; arriveAfter: boolean }
  | { name: "checkin" }
  | { name: "play" }
  | { name: "stats"; sessionId: string | null }
  | { name: "log" }
  | { name: "past" }
  | { name: "settings" };

/** One undo step. `patch` restores the previous store without copying untouched data. */
export interface UndoStep {
  /** Active round this edit belongs to. Null when no session is live. */
  round: number | null;
  patch: unknown;
}

export interface Store {
  players: Player[];
  settings: Settings;
  checkedIn: string[];
  active: Session | null;
  past: Session[];
  /** Hidden skill changes. Kept for backup, never rendered. */
  skillLog: SkillEvent[];
  undo: UndoStep[];
  view: View;
}

export const SKILL_MIN = 2.0;
export const SKILL_MAX = 5.5;
export const SKILL_STEP = 0.1;
export const UNDO_LIMIT = 50;
export const PAST_LIMIT = 40;
export const MAX_COURTS = 8;
export const MAX_SCORE = 99;

export const defaultSettings: Settings = {
  courts: 2,
  pointsToWin: 11,
  winBy: 2,
  initialRounds: 4,
  defaultSkill: 3.0,
  hostSkills: false,
  soundOn: true,
  vibrateOn: true,
};

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return defaultSettings.defaultSkill;
  const clamped = Math.min(SKILL_MAX, Math.max(SKILL_MIN, value));
  return Math.round(clamped * 1000) / 1000;
}

/** Manual skill entry: one decimal, still inside the hidden rating bounds. */
export function clampSkill(value: number): number {
  if (!Number.isFinite(value)) return defaultSettings.defaultSkill;
  const steps = Math.round(value / SKILL_STEP);
  const stepped = steps * SKILL_STEP;
  return clampRating(stepped);
}

export function formatSkill(value: number): string {
  return clampSkill(value).toFixed(1);
}

export function skillChoices(): number[] {
  const values: number[] = [];
  for (let tenths = SKILL_MIN * 10; tenths <= SKILL_MAX * 10; tenths += 1) {
    values.push(tenths / 10);
  }
  return values;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const raw = input ?? {};
  return {
    courts: clampInt(raw.courts ?? defaultSettings.courts, 1, MAX_COURTS),
    pointsToWin: clampInt(raw.pointsToWin ?? defaultSettings.pointsToWin, 7, 21),
    winBy: clampInt(raw.winBy ?? defaultSettings.winBy, 1, 5),
    initialRounds: clampInt(raw.initialRounds ?? defaultSettings.initialRounds, 1, 12),
    defaultSkill: clampSkill(raw.defaultSkill ?? defaultSettings.defaultSkill),
    hostSkills: raw.hostSkills === true,
    soundOn: raw.soundOn ?? defaultSettings.soundOn,
    vibrateOn: raw.vibrateOn ?? defaultSettings.vibrateOn,
  };
}

export function playerName(players: readonly Player[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? "Player";
}

export function byName(a: Player, b: Player): number {
  const name = a.name.localeCompare(b.name);
  return name === 0 ? a.id.localeCompare(b.id) : name;
}

export function sessionTitle(now: number): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(now));
  return `Open play · ${formatted}`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
