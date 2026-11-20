import {
  byName,
  clampInt,
  clampRating,
  clampSkill,
  defaultSettings,
  MAX_SCORE,
  newId,
  PAST_LIMIT,
  playerName,
  UNDO_LIMIT,
  sanitizeSettings,
  sessionTitle,
  type Attendance,
  type LogEntry,
  type Match,
  type Player,
  type Round,
  type Session,
  type Settings,
  type SkillEvent,
  type Snapshot,
  type Store,
  type View,
} from "../model.ts";
import { finalScoreIssue, isFinalScore } from "./scoring.ts";
import { learnFromRound } from "./skill.ts";
import {
  applyRound,
  assignmentKey,
  emptyLedger,
  newSched,
  planRound,
  type EnginePlayer,
  type Ledger,
  type PlannedMatch,
  type RoundPlan,
  type SchedState,
} from "./pairing.ts";

export interface StepResult {
  store: Store;
  error?: string;
  notice?: string;
  cue?: boolean;
}

export type Action =
  | { type: "nav"; view: View }
  | { type: "add-player"; name: string; gender: Player["gender"]; skill: number; arriveAfter: boolean }
  | { type: "update-player"; playerId: string; name: string; gender: Player["gender"]; skill: number }
  | { type: "delete-player"; playerId: string }
  | { type: "load-sample"; players: Player[] }
  | { type: "toggle-checkin"; playerId: string }
  | { type: "checkin-all" }
  | { type: "checkin-none" }
  | { type: "set-settings"; patch: Partial<Settings> }
  | { type: "start-session" }
  | { type: "nudge-score"; matchId: string; side: "A" | "B"; delta: number }
  | { type: "set-score"; matchId: string; side: "A" | "B"; score: number }
  | { type: "swap"; roundId: string; outId: string; inId: string }
  | { type: "reshuffle" }
  | { type: "import-backup"; players: Player[]; settings: Settings; past: Session[]; active: Session | null; checkedIn: string[]; skillLog: SkillEvent[] }
  | { type: "add-rounds"; count: number }
  | { type: "arrive"; playerId: string }
  | { type: "depart"; playerId: string }
  | { type: "finish-round" }
  | { type: "end-session" }
  | { type: "delete-past"; sessionId: string }
  | { type: "undo" };

export function createInitialStore(): Store {
  return {
    players: [],
    settings: { ...defaultSettings },
    checkedIn: [],
    active: null,
    past: [],
    skillLog: [],
    undo: [],
    view: { name: "home" },
  };
}

export function isEligible(att: Attendance, roundNumber: number): boolean {
  return att.joinedAtRound <= roundNumber && (att.leftAtRound === null || roundNumber < att.leftAtRound);
}

export function activeRound(session: Session): Round | null {
  return session.rounds.find((round) => round.status === "active") ?? null;
}

export function presentIds(session: Session): string[] {
  return session.attendance.filter((att) => att.leftAtRound === null).map((att) => att.playerId);
}

function enginePlayers(players: readonly Player[], ids: Set<string>): EnginePlayer[] {
  return players
    .filter((player) => ids.has(player.id))
    .map((player) => ({ id: player.id, gender: player.gender, skill: player.skill }));
}

function eligiblePlayers(session: Session, players: readonly Player[], roundNumber: number): EnginePlayer[] {
  const ids = new Set(
    session.attendance.filter((att) => isEligible(att, roundNumber)).map((att) => att.playerId),
  );
  return enginePlayers(players, ids);
}

export function recompute(session: Session, throughRound: number): {
  sched: Record<string, SchedState>;
  ledger: Ledger;
} {
  const sched: Record<string, SchedState> = {};
  for (const att of session.attendance) {
    const state = newSched();
    state.scheduleGames = att.scheduleBase;
    state.lastPlayedRound = att.lastPlayedBase ?? -1;
    sched[att.playerId] = state;
  }
  let ledger = emptyLedger();
  let state = { sched, ledger };
  for (const round of session.rounds) {
    if (round.number > throughRound) break;
    state = applyRound(state.sched, state.ledger, toPlan(round));
  }
  return state;
}

function toPlan(round: Round): RoundPlan {
  return {
    roundNumber: round.number,
    courtsUsed: round.matches.length,
    sittingOut: [...round.sittingOut],
    matches: round.matches.map((match) => ({
      court: match.court,
      teamA: [...match.teamA] as [string, string],
      teamB: [...match.teamB] as [string, string],
    })),
  };
}

function fromPlan(plan: RoundPlan, status: Round["status"]): Round {
  return {
    id: newId(),
    number: plan.roundNumber,
    status,
    sittingOut: [...plan.sittingOut],
    matches: plan.matches.map((match) => ({
      id: newId(),
      court: match.court,
      teamA: [...match.teamA] as [string, string],
      teamB: [...match.teamB] as [string, string],
      scoreA: 0,
      scoreB: 0,
    })),
  };
}

function planFrom(
  session: Session,
  players: readonly Player[],
  startNumber: number,
  count: number,
  variety = 0,
  avoid?: ReadonlyMap<number, string>,
): RoundPlan[] {
  let { sched, ledger } = recompute(session, startNumber - 1);
  const plans: RoundPlan[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const roundNumber = startNumber + offset;
    const eligible = eligiblePlayers(session, players, roundNumber);
    const plan = planRound(eligible, sched, ledger, session.rules.courts, roundNumber, session.salt, {
      variety,
      avoidKey: avoid?.get(roundNumber) ?? "",
    });
    plans.push(plan);
    const applied = applyRound(sched, ledger, plan);
    sched = applied.sched;
    ledger = applied.ledger;
  }
  return plans;
}

function matchKey(match: { teamA: [string, string]; teamB: [string, string]; court: number }): PlannedMatch {
  return { court: match.court, teamA: match.teamA, teamB: match.teamB };
}

export function roundLineupKey(round: Round): string {
  return assignmentKey(round.matches.map(matchKey));
}

function hasScores(round: Round): boolean {
  return round.matches.some((match) => match.scoreA > 0 || match.scoreB > 0);
}

function appendLog(session: Session, at: number, message: string): Session {
  const entry: LogEntry = { id: newId(), at, message };
  return { ...session, log: [...session.log, entry] };
}

function replaceSession(store: Store, session: Session, view: View = store.view): Store {
  return { ...store, active: session, view };
}

function takeSnapshot(store: Store, includePast: boolean): Snapshot {
  return {
    players: structuredClone(store.players),
    settings: structuredClone(store.settings),
    checkedIn: [...store.checkedIn],
    active: structuredClone(store.active),
    skillLog: structuredClone(store.skillLog),
    view: structuredClone(store.view),
    ...(includePast ? { past: structuredClone(store.past) } : {}),
  };
}

function commit(
  store: Store,
  next: Store,
  extra?: { includePast?: boolean; cue?: boolean; notice?: string },
): StepResult {
  const undo = [...store.undo, takeSnapshot(store, extra?.includePast ?? false)].slice(-UNDO_LIMIT);
  return { store: { ...next, undo }, cue: extra?.cue, notice: extra?.notice };
}

function fail(store: Store, error: string): StepResult {
  return { store, error };
}

function fixView(store: Store): Store {
  if ((store.view.name === "play" || store.view.name === "log") && !store.active) {
    return { ...store, view: { name: "home" } };
  }
  if (store.view.name === "stats" && store.view.sessionId === null && !store.active) {
    return { ...store, view: { name: "home" } };
  }
  if (store.view.name === "edit" && store.view.playerId) {
    const editingId = store.view.playerId;
    if (!store.players.some((player) => player.id === editingId)) {
      return { ...store, view: { name: "roster" } };
    }
  }
  return store;
}

function entryRoundNumber(session: Session): number {
  const unscored = session.rounds.find((round) => round.status !== "complete" && !hasScores(round));
  if (unscored) return unscored.number;
  const last = session.rounds[session.rounds.length - 1];
  return last ? last.number + 1 : 1;
}

function floorSchedule(session: Session, playerId: string, throughRound: number): Session {
  const attendance = session.attendance.map((att) => ({ ...att }));
  const att = attendance.find((item) => item.playerId === playerId);
  if (!att) return session;
  const draft = { ...session, attendance };
  const { sched } = recompute(draft, throughRound);
  const mine = sched[playerId]?.scheduleGames ?? att.scheduleBase;
  const others = Object.entries(sched).filter(([id, state]) => id !== playerId && state.gamesPlayed > 0);
  if (others.length === 0) return draft;
  const min = Math.min(...others.map(([, state]) => state.scheduleGames));
  if (mine < min) att.scheduleBase += min - mine;
  const atTheMinimum = others.filter(([, state]) => state.scheduleGames === min);
  const cohort = atTheMinimum.length > 0 ? atTheMinimum : others;
  const newest = Math.max(...cohort.map(([, state]) => state.lastPlayedRound));
  const played = sched[playerId]?.gamesPlayed ?? 0;
  if (played === 0 && newest >= 0) att.lastPlayedBase = newest;
  return draft;
}

function firstDroppedIndex(session: Session): number {
  return session.rounds.findIndex((round) => round.status !== "complete" && !hasScores(round));
}

function reshuffleUnlocked(
  session: Session,
  players: readonly Player[],
  at: number,
  reason: string,
  variety = 0,
  avoid?: ReadonlyMap<number, string>,
): Session {
  const dropAt = firstDroppedIndex(session);
  if (dropAt === -1) return appendLog(session, at, reason);
  const kept = session.rounds.slice(0, dropAt);
  const dropped = session.rounds.length - kept.length;
  const activeDropped = session.rounds.slice(dropAt).some((round) => round.status === "active");
  const startNumber = (kept[kept.length - 1]?.number ?? 0) + 1;
  const draft = { ...session, rounds: kept };
  const plans = planFrom(draft, players, startNumber, dropped, variety, avoid);
  const added = plans.map((plan, index) => fromPlan(plan, activeDropped && index === 0 ? "active" : "pending"));
  const rounds = [...kept, ...added];
  return appendLog(
    { ...session, rounds },
    at,
    `${reason} Rebuilt ${dropped} unplayed round${dropped === 1 ? "" : "s"}.`,
  );
}

function reshuffleAfter(session: Session, players: readonly Player[], afterNumber: number, at: number, reason: string): Session {
  const cut = session.rounds.findIndex(
    (round) => round.number > afterNumber && round.status !== "complete" && !hasScores(round),
  );
  if (cut === -1) return appendLog(session, at, reason);
  const kept = session.rounds.slice(0, cut);
  const dropped = session.rounds.length - kept.length;
  const startNumber = (kept[kept.length - 1]?.number ?? afterNumber) + 1;
  const draft = { ...session, rounds: kept };
  const plans = planFrom(draft, players, startNumber, dropped);
  const added = plans.map((plan) => fromPlan(plan, "pending"));
  return appendLog(
    { ...draft, rounds: [...kept, ...added] },
    at,
    `${reason} Rebuilt ${dropped} later round${dropped === 1 ? "" : "s"}.`,
  );
}

function ensureUpcoming(session: Session, players: readonly Player[], at: number, reason: string): Session {
  const unscored = session.rounds.some((round) => round.status !== "complete" && !hasScores(round));
  if (unscored) return reshuffleUnlocked(session, players, at, reason);
  return addRound(session, players, at, reason);
}

function addRound(session: Session, players: readonly Player[], at: number, reason: string): Session {
  const last = session.rounds[session.rounds.length - 1];
  const start = last ? last.number + 1 : 1;
  const [plan] = planFrom(session, players, start, 1);
  if (!plan) return session;
  const hasActive = session.rounds.some((round) => round.status === "active");
  const round = fromPlan(plan, hasActive ? "pending" : "active");
  return appendLog(
    { ...session, rounds: [...session.rounds, round] },
    at,
    `${reason} Added round ${round.number}.`,
  );
}

function describeRound(players: readonly Player[], round: Round, withScore: boolean): string {
  const courts = round.matches.map((match) => {
    const team = (ids: [string, string]) => `${playerName(players, ids[0])} & ${playerName(players, ids[1])}`;
    const score = withScore ? ` ${match.scoreA}–${match.scoreB}` : "";
    return `Court ${match.court}: ${team(match.teamA)} vs ${team(match.teamB)}${score}`;
  });
  const sitting = round.sittingOut.length
    ? `Sitting: ${round.sittingOut.map((id) => playerName(players, id)).join(", ")}`
    : "Nobody sitting";
  return [`Round ${round.number}`, ...courts, sitting].join(". ");
}

function roundPlaying(round: Round): string[] {
  return round.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
}

function swapIds(round: Round, outId: string, inId: string): Round {
  const playing = new Set(roundPlaying(round));
  const wasSitting = new Set(round.sittingOut);
  const mapId = (id: string) => (id === outId ? inId : id === inId ? outId : id);
  const matches = round.matches.map((match) => ({
    ...match,
    teamA: match.teamA.map(mapId) as [string, string],
    teamB: match.teamB.map(mapId) as [string, string],
  }));
  let sittingOut = round.sittingOut.map(mapId);
  const inWasHere = playing.has(inId) || wasSitting.has(inId);
  if (!inWasHere && playing.has(outId)) sittingOut = [...sittingOut, outId];
  const nowPlaying = new Set(matches.flatMap((match) => [...match.teamA, ...match.teamB]));
  sittingOut = [...new Set(sittingOut.filter((id) => !nowPlaying.has(id)))].sort();
  return { ...round, matches, sittingOut };
}

function updateScore(session: Session, matchId: string, side: "A" | "B", score: number): Session | null {
  let found = false;
  const nextScore = clampInt(score, 0, MAX_SCORE);
  const rounds = session.rounds.map((round) => {
    if (round.status === "pending") return round;
    let changed = false;
    const matches = round.matches.map((match) => {
      if (match.id !== matchId) return match;
      found = true;
      changed = true;
      return side === "A" ? { ...match, scoreA: nextScore } : { ...match, scoreB: nextScore };
    });
    return changed ? { ...round, matches } : round;
  });
  if (!found) return null;
  return { ...session, rounds };
}

function findMatch(session: Session, matchId: string): { round: Round; match: Match } | null {
  for (const round of session.rounds) {
    const match = round.matches.find((item) => item.id === matchId);
    if (match) return { round, match };
  }
  return null;
}

export interface Standing {
  playerId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  games: number;
}

export function standings(session: Session): Standing[] {
  const table = new Map<string, Standing>();
  const ensure = (id: string) => {
    const existing = table.get(id);
    if (existing) return existing;
    const created: Standing = {
      playerId: id,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      games: 0,
    };
    table.set(id, created);
    return created;
  };
  for (const att of session.attendance) ensure(att.playerId);
  for (const round of session.rounds) {
    if (round.status !== "complete") continue;
    for (const match of round.matches) {
      if (!isFinalScore(match.scoreA, match.scoreB, session.rules.pointsToWin, session.rules.winBy)) continue;
      const apply = (ids: [string, string], scored: number, allowed: number) => {
        for (const id of ids) {
          const row = ensure(id);
          row.games += 1;
          row.pointsFor += scored;
          row.pointsAgainst += allowed;
          row.diff = row.pointsFor - row.pointsAgainst;
          if (scored > allowed) row.wins += 1;
          else row.losses += 1;
        }
      };
      apply(match.teamA, match.scoreA, match.scoreB);
      apply(match.teamB, match.scoreB, match.scoreA);
    }
  }
  return [...table.values()];
}

function cleanName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 40);
}

function requireSession(store: Store): Session | null {
  return store.active;
}

export function reduce(store: Store, action: Action, now = Date.now()): StepResult {
  switch (action.type) {
    case "nav":
      return { store: { ...store, view: action.view } };
    case "undo":
      return undo(store);
    case "add-player":
      return addPlayer(store, action, now);
    case "update-player":
      return updatePlayer(store, action, now);
    case "delete-player":
      return deletePlayer(store, action.playerId, now);
    case "load-sample":
      return loadSample(store, action.players, now);
    case "toggle-checkin":
      return toggleCheckin(store, action.playerId);
    case "checkin-all":
      return commit(store, { ...store, checkedIn: store.players.map((player) => player.id) }, { notice: "Everyone is checked in." });
    case "checkin-none":
      return commit(store, { ...store, checkedIn: [] }, { notice: "Check-in cleared." });
    case "set-settings":
      return setSettings(store, action.patch, now);
    case "start-session":
      return startSession(store, now);
    case "nudge-score":
      return nudgeScore(store, action, now);
    case "set-score":
      return setScore(store, action, now);
    case "swap":
      return swap(store, action, now);
    case "reshuffle":
      return reshuffle(store, now);
    case "import-backup":
      return importBackup(store, action);
    case "add-rounds":
      return addRounds(store, action.count, now);
    case "arrive":
      return arrive(store, action.playerId, now);
    case "depart":
      return depart(store, action.playerId, now);
    case "finish-round":
      return finishRound(store, now);
    case "end-session":
      return endSession(store, now);
    case "delete-past":
      return deletePast(store, action.sessionId);
    default:
      return { store };
  }
}

function undo(store: Store): StepResult {
  const snap = store.undo[store.undo.length - 1];
  if (!snap) return fail(store, "Nothing to undo.");
  const restored: Store = {
    ...store,
    players: snap.players,
    settings: snap.settings,
    checkedIn: snap.checkedIn,
    active: snap.active,
    past: snap.past ?? store.past,
    skillLog: snap.skillLog ?? store.skillLog,
    view: store.view,
    undo: store.undo.slice(0, -1),
  };
  if (restored.active && !store.active) restored.view = { name: "play" };
  if (!restored.active && store.view.name === "play") restored.view = { name: "checkin" };
  return { store: fixView(restored), notice: "Undid the last change." };
}

function addPlayer(
  store: Store,
  action: Extract<Action, { type: "add-player" }>,
  now: number,
): StepResult {
  const name = cleanName(action.name);
  if (!name) return fail(store, "Add a name first.");
  const player: Player = {
    id: newId(),
    name,
    gender: action.gender,
    skill: clampSkill(action.skill),
    createdAt: now,
  };
  let next: Store = {
    ...store,
    players: [...store.players, player],
    view: action.arriveAfter && store.active ? { name: "play" } : { name: "roster" },
  };
  if (action.arriveAfter && store.active) {
    const arrived = arrive(next, player.id, now);
    if (arrived.error || !arrived.store.active) return arrived;
    return commit(store, arrived.store, { notice: `${player.name} is saved and added to the session.` });
  }
  return commit(store, next, { notice: `${player.name} saved.` });
}

function updatePlayer(
  store: Store,
  action: Extract<Action, { type: "update-player" }>,
  now: number,
): StepResult {
  const name = cleanName(action.name);
  if (!name) return fail(store, "Add a name first.");
  const existing = store.players.find((player) => player.id === action.playerId);
  if (!existing) return fail(store, "That player is no longer in Players.");
  const nextSkill = Math.abs(existing.skill - action.skill) < 0.0005 ? existing.skill : clampSkill(action.skill);
  const players = store.players.map((player) =>
    player.id === action.playerId ? { ...player, name, gender: action.gender, skill: nextSkill } : player,
  );
  let skillLog = store.skillLog;
  if (existing.skill !== nextSkill) {
    skillLog = [
      ...skillLog,
      { at: now, playerId: existing.id, before: existing.skill, after: nextSkill, source: "manual" as const },
    ].slice(-2000);
  }
  let next: Store = { ...store, players, skillLog, view: { name: "roster" } };
  const session = store.active;
  const inSession = session?.attendance.some((att) => att.playerId === action.playerId && att.leftAtRound === null);
  if (session && inSession) {
    const skillChanged = existing.skill !== nextSkill || existing.gender !== action.gender;
    const updated = skillChanged ? reshuffleUnlocked({ ...session }, players, now, `Updated ${name}.`) : session;
    next = { ...next, active: updated, view: { name: "play" } };
  }
  return commit(store, next, { notice: `${name} updated.` });
}

function deletePlayer(store: Store, playerId: string, _now: number): StepResult {
  if (store.active?.attendance.some((att) => att.playerId === playerId)) {
    return fail(store, "They're in the live session. Mark them out instead of deleting.");
  }
  const player = store.players.find((item) => item.id === playerId);
  if (!player) return fail(store, "That player is already gone.");
  return commit(
    store,
    {
      ...store,
      players: store.players.filter((item) => item.id !== playerId),
      checkedIn: store.checkedIn.filter((id) => id !== playerId),
      view: { name: "roster" },
    },
    { notice: `${player.name} removed from Players.` },
  );
}

function loadSample(store: Store, sample: Player[], _now: number): StepResult {
  const known = new Set(store.players.map((player) => player.id));
  const additions = sample.filter((player) => !known.has(player.id));
  if (additions.length === 0) return fail(store, "The sample group is already in Players.");
  return commit(
    store,
    { ...store, players: [...store.players, ...additions], view: { name: "roster" } },
    { notice: `Added ${additions.length} sample players.` },
  );
}

function toggleCheckin(store: Store, playerId: string): StepResult {
  if (!store.players.some((player) => player.id === playerId)) return fail(store, "That player isn't in Players.");
  const checked = new Set(store.checkedIn);
  if (checked.has(playerId)) checked.delete(playerId);
  else checked.add(playerId);
  return commit(store, { ...store, checkedIn: [...checked] });
}

function setSettings(store: Store, patch: Partial<Settings>, now: number): StepResult {
  const settings = sanitizeSettings({ ...store.settings, ...patch });
  let next: Store = { ...store, settings };
  let notice = "Settings saved.";
  const session = store.active;
  if (session) {
    const rules = {
      courts: settings.courts,
      pointsToWin: settings.pointsToWin,
      winBy: settings.winBy,
    };
    let updated: Session = { ...session, rules };
    if (rules.courts !== session.rules.courts) {
      updated = reshuffleUnlocked(updated, store.players, now, `Courts set to ${rules.courts}.`);
      notice = rules.courts === 1 ? "Now using 1 court." : `Now using ${rules.courts} courts.`;
    } else if (rules.pointsToWin !== session.rules.pointsToWin || rules.winBy !== session.rules.winBy) {
      updated = appendLog(updated, now, `Games now go to ${rules.pointsToWin}, win by ${rules.winBy}.`);
      notice = `Games to ${rules.pointsToWin}, win by ${rules.winBy}.`;
    }
    next = { ...next, active: updated };
  }
  return commit(store, next, { notice });
}

function startSession(store: Store, now: number): StepResult {
  if (store.active) return fail(store, "Finish the live session before starting another.");
  const present = store.players.filter((player) => store.checkedIn.includes(player.id));
  if (present.length < 4) {
    return fail(store, `Need at least 4 players. ${present.length} ${present.length === 1 ? "is" : "are"} checked in.`);
  }
  const settings = sanitizeSettings(store.settings);
  const session: Session = {
    id: newId(),
    title: sessionTitle(now),
    createdAt: now,
    endedAt: null,
    salt: now,
    rules: {
      courts: settings.courts,
      pointsToWin: settings.pointsToWin,
      winBy: settings.winBy,
    },
    attendance: present.map((player) => ({
      playerId: player.id,
      joinedAtRound: 1,
      leftAtRound: null,
      scheduleBase: 0,
      lastPlayedBase: -1,
    })),
    rounds: [],
    log: [],
  };
  const plans = planFrom(session, store.players, 1, settings.initialRounds);
  const rounds = plans.map((plan, index) => fromPlan(plan, index === 0 ? "active" : "pending"));
  const withRounds = appendLog(
    { ...session, rounds },
    now,
    `Started with ${present.length} players on ${session.rules.courts} court${session.rules.courts === 1 ? "" : "s"}. ${describeRound(store.players, rounds[0] ?? fromPlan(plans[0]!, "active"), false)}`,
  );
  return commit(
    store,
    { ...store, settings, active: withRounds, view: { name: "play" } },
    { cue: true, notice: "Round 1 is up." },
  );
}

function nudgeScore(store: Store, action: Extract<Action, { type: "nudge-score" }>, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const found = findMatch(session, action.matchId);
  if (!found || found.round.status === "pending") return fail(store, "That game isn't on the court right now.");
  const current = action.side === "A" ? found.match.scoreA : found.match.scoreB;
  return writeScore(store, session, found, action.matchId, action.side, current + action.delta, now);
}

function setScore(store: Store, action: Extract<Action, { type: "set-score" }>, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const found = findMatch(session, action.matchId);
  if (!found || found.round.status === "pending") return fail(store, "That game isn't on the court right now.");
  return writeScore(store, session, found, action.matchId, action.side, action.score, now);
}

function writeScore(
  store: Store,
  session: Session,
  found: { round: Round; match: Match },
  matchId: string,
  side: "A" | "B",
  score: number,
  now: number,
): StepResult {
  const updated = updateScore(session, matchId, side, score);
  if (!updated) return fail(store, "Couldn't find that game.");
  let next = updated;
  if (found.round.status === "complete") {
    const match = findMatch(next, matchId)?.match;
    if (match) {
      next = appendLog(
        next,
        now,
        `Corrected court ${match.court} to ${match.scoreA}–${match.scoreB}.`,
      );
    }
  }
  return commit(store, replaceSession(store, next));
}

function swap(store: Store, action: Extract<Action, { type: "swap" }>, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  if (action.outId === action.inId) return { store };
  const round = session.rounds.find((item) => item.id === action.roundId);
  if (!round || round.status === "complete") return fail(store, "That round is finished.");
  const outPlaying = roundPlaying(round).includes(action.outId);
  const outSitting = round.sittingOut.includes(action.outId);
  if (!outPlaying && !outSitting) return fail(store, "That player isn't in this round.");
  const inRound = roundPlaying(round).includes(action.inId) || round.sittingOut.includes(action.inId);
  if (!inRound && !outPlaying) return fail(store, "Put a new player into an open court spot.");
  const incoming = store.players.find((player) => player.id === action.inId);
  const outgoing = store.players.find((player) => player.id === action.outId);
  if (!incoming || !outgoing) return fail(store, "Pick someone from Players.");
  let attendance = session.attendance.map((att) => ({ ...att }));
  let att = attendance.find((item) => item.playerId === action.inId);
  const alreadyHere = att && att.leftAtRound === null && isEligible(att, round.number);
  if (!alreadyHere) {
    if (!att) {
      att = { playerId: action.inId, joinedAtRound: round.number, leftAtRound: null, scheduleBase: 0, lastPlayedBase: -1 };
      attendance = [...attendance, att];
    } else {
      att.leftAtRound = null;
      att.joinedAtRound = Math.min(att.joinedAtRound, round.number);
    }
  }
  let draft: Session = { ...session, attendance };
  if (!alreadyHere) draft = floorSchedule(draft, action.inId, round.number - 1);
  const rounds = draft.rounds.map((item) => (item.id === round.id ? swapIds(item, action.outId, action.inId) : item));
  draft = { ...draft, rounds };
  draft = reshuffleAfter(draft, store.players, round.number, now, `${incoming.name} in for ${outgoing.name}.`);
  return commit(store, replaceSession(store, draft), {
    notice: `${incoming.name} in for ${outgoing.name}.`,
  });
}

function hashVariety(salt: number, at: number, attempt: number): number {
  let hash = 2166136261 ^ (salt >>> 0) ^ Math.imul(at >>> 0, 16777619) ^ Math.imul(attempt + 1, 374761393);
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  return hash || attempt + 1;
}

function reshuffle(store: Store, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  if (firstDroppedIndex(session) === -1) return fail(store, "Every round already has a score. Add a round instead.");
  const current = activeRound(session);
  const started = !!current && hasScores(current);
  const avoid = new Map<number, string>();
  for (const round of session.rounds) {
    if (round.status === "complete" || hasScores(round)) continue;
    avoid.set(round.number, roundLineupKey(round));
  }
  let next = session;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const variety = hashVariety(session.salt, now, attempt);
    next = reshuffleUnlocked(
      session,
      store.players,
      now,
      started ? "Reshuffled the later rounds." : "Reshuffled.",
      variety,
      avoid,
    );
    const changed = next.rounds.some((round) => {
      const previous = avoid.get(round.number);
      return previous !== undefined && roundLineupKey(round) !== previous;
    });
    if (changed || avoid.size === 0) break;
  }
  return commit(store, replaceSession(store, next), {
    notice: started ? "Later rounds reshuffled." : "Open rounds reshuffled.",
  });
}

function addRounds(store: Store, count: number, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const rounds = clampInt(count, 1, 6);
  let next = session;
  const hadActive = session.rounds.some((round) => round.status === "active");
  for (let index = 0; index < rounds; index += 1) {
    next = addRound(next, store.players, now, "Extra time.");
  }
  const gainedActive = !hadActive && next.rounds.some((round) => round.status === "active");
  return commit(store, replaceSession(store, next), {
    cue: gainedActive,
    notice: gainedActive ? "Next round is up." : `Added ${rounds} round${rounds === 1 ? "" : "s"}.`,
  });
}

function arrive(store: Store, playerId: string, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "Start a session before adding a late player.");
  const player = store.players.find((item) => item.id === playerId);
  if (!player) return fail(store, "Add them in Players first.");
  const existing = session.attendance.find((att) => att.playerId === playerId);
  if (existing && existing.leftAtRound === null) return fail(store, `${player.name} is already here.`);
  const entry = entryRoundNumber(session);
  let attendance = session.attendance.map((att) => ({ ...att }));
  if (!existing) {
    attendance = [
      ...attendance,
      { playerId, joinedAtRound: entry, leftAtRound: null, scheduleBase: 0, lastPlayedBase: -1 },
    ];
  } else {
    attendance = attendance.map((att) =>
      att.playerId === playerId ? { ...att, leftAtRound: null } : att,
    );
  }
  let draft: Session = { ...session, attendance };
  draft = floorSchedule(draft, playerId, entry - 1);
  const checkedIn = store.checkedIn.includes(playerId) ? store.checkedIn : [...store.checkedIn, playerId];
  draft = ensureUpcoming(draft, store.players, now, `${player.name} joined.`);
  return commit(store, { ...replaceSession(store, draft), checkedIn }, {
    notice: `${player.name} is in. First game comes before extra turns.`,
  });
}

function depart(store: Store, playerId: string, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const player = store.players.find((item) => item.id === playerId);
  const existing = session.attendance.find((att) => att.playerId === playerId);
  if (!player || !existing || existing.leftAtRound !== null) return fail(store, "They're already out.");
  const active = activeRound(session);
  const playingScored = !!active && hasScores(active) && roundPlaying(active).includes(playerId);
  const leftAt = playingScored || (active && hasScores(active)) ? active.number + 1 : entryRoundNumber(session);
  const attendance = session.attendance.map((att) =>
    att.playerId === playerId ? { ...att, leftAtRound: leftAt } : att,
  );
  let draft: Session = { ...session, attendance };
  if (playingScored && active) {
    draft = reshuffleAfter(draft, store.players, active.number, now, `${player.name} will leave after this game.`);
  } else {
    draft = reshuffleUnlocked(draft, store.players, now, `${player.name} left.`);
  }
  const checkedIn = store.checkedIn.filter((id) => id !== playerId);
  return commit(store, { ...replaceSession(store, draft), checkedIn }, {
    notice: playingScored ? `${player.name} will leave after this game.` : `${player.name} left.`,
  });
}

function finishRound(store: Store, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const round = activeRound(session);
  if (!round) return fail(store, "Add another round when you're ready.");
  if (round.matches.length === 0) return fail(store, "Need 4 players on court to finish a round.");
  for (const match of round.matches) {
    const issue = finalScoreIssue(match.scoreA, match.scoreB, session.rules.pointsToWin, session.rules.winBy);
    if (issue) return fail(store, `Court ${match.court}: ${issue}`);
  }
  const rounds = session.rounds.map((item) => {
    if (item.id !== round.id) return item;
    return { ...item, status: "complete" as const };
  });
  const finishedIndex = rounds.findIndex((item) => item.id === round.id);
  const nextRound = rounds[finishedIndex + 1];
  if (nextRound && nextRound.status === "pending") {
    rounds[finishedIndex + 1] = { ...nextRound, status: "active" };
  }
  const finished = rounds[finishedIndex] ?? round;
  let next = appendLog({ ...session, rounds }, now, describeRound(store.players, { ...finished, status: "complete" }, true));
  if (rounds.some((item) => item.status === "active")) {
    const upcoming = rounds.find((item) => item.status === "active");
    if (upcoming) next = appendLog(next, now, `Round ${upcoming.number} is up. ${describeRound(store.players, upcoming, false)}`);
  }
  const learned = learnFromRound(store.players, { ...finished, status: "complete" }, now, store.skillLog);
  return commit(store, replaceSession({ ...store, players: learned.players, skillLog: learned.skillLog }, next), {
    cue: rounds.some((item) => item.status === "active"),
    notice: rounds.some((item) => item.status === "active") ? "Next round is up." : "Planned rounds are done. Tap Next round to keep going.",
  });
}

function endSession(store: Store, now: number): StepResult {
  const session = requireSession(store);
  if (!session) return fail(store, "There's no live session.");
  const ended: Session = appendLog({ ...session, endedAt: now }, now, "Session ended.");
  const past = [ended, ...store.past].slice(0, PAST_LIMIT);
  const checkedIn = presentIds(ended);
  return commit(
    store,
    { ...store, active: null, past, checkedIn, view: { name: "stats", sessionId: ended.id } },
    { includePast: true, notice: "Session saved on this phone." },
  );
}

function deletePast(store: Store, sessionId: string): StepResult {
  if (!store.past.some((session) => session.id === sessionId)) return fail(store, "That session is already gone.");
  const past = store.past.filter((session) => session.id !== sessionId);
  const view = store.view.name === "stats" && store.view.sessionId === sessionId ? { name: "past" as const } : store.view;
  return commit(store, { ...store, past, view }, { includePast: true, notice: "Deleted that session." });
}

export function sortStandings(rows: Standing[], players: readonly Player[]): Standing[] {
  const names = new Map(players.map((player) => [player.id, player.name]));
  return [...rows].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.diff !== a.diff) return b.diff - a.diff;
    return (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? "");
  });
}

export function rosterPlayers(store: Store): Player[] {
  return [...store.players].sort(byName);
}

export function sessionRecap(session: Session, players: readonly Player[]): string {
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(session.createdAt));
  const rows = sortStandings(standings(session), players);
  const lines = [session.title, when, ""];
  if (rows.every((row) => row.games === 0)) {
    lines.push("No finished games.");
    return lines.join("\n");
  }
  lines.push("Player — record, games played, point diff");
  rows.forEach((row, index) => {
    const diff = row.diff > 0 ? `+${row.diff}` : String(row.diff);
    const record = row.games === 0 ? "no games" : `${row.wins}-${row.losses}`;
    lines.push(`${index + 1}. ${playerName(players, row.playerId)} — ${record}, ${row.games} played, ${diff}`);
  });
  return lines.join("\n");
}

function importBackup(
  store: Store,
  action: Extract<Action, { type: "import-backup" }>,
): StepResult {
  const settings = sanitizeSettings(action.settings);
  return commit(
    store,
    {
      ...store,
      players: action.players.map((player) => ({ ...player, skill: clampRating(player.skill) })),
      settings,
      past: action.past.slice(0, PAST_LIMIT),
      active: action.active,
      checkedIn: action.checkedIn.filter((id) => action.players.some((player) => player.id === id)),
      skillLog: action.skillLog.slice(-2000),
      view: action.active ? { name: "play" } : { name: "home" },
    },
    { includePast: true, notice: "Backup restored on this phone." },
  );
}

