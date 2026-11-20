import { useEffect, useRef, useState } from "react";
import { useApp } from "../app-context.tsx";
import { Screen } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";
import { copyText } from "../lib/clipboard.ts";
import { sessionRecap, sortStandings, standings } from "../engine/session.ts";
import { playerName, type Session } from "../model.ts";

function findSession(storeSession: Session | null, past: Session[], sessionId: string | null): Session | null {
  if (sessionId === null) return storeSession;
  return past.find((session) => session.id === sessionId) ?? (storeSession?.id === sessionId ? storeSession : null);
}

export function StatsScreen() {
  const { store, dispatch } = useApp();
  const [copyLabel, setCopyLabel] = useState("Copy recap");
  const sessionId = store.view.name === "stats" ? store.view.sessionId : null;
  const session = findSession(store.active, store.past, sessionId);
  const readOnly = !store.active || session?.id !== store.active.id;
  if (!session) {
    return (
      <Screen title="Results" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
        <p className="text-lg font-semibold">No session to show.</p>
      </Screen>
    );
  }
  const rows = sortStandings(standings(session), store.players);
  const finished = session.rounds.filter((round) => round.status === "complete").length;
  return (
    <Screen
      title={session.title}
      onBack={() => dispatch({ type: "nav", view: readOnly ? { name: "past" } : { name: "play" } })}
    >
      <p className="text-lg font-semibold">
        {finished} finished {finished === 1 ? "round" : "rounds"}. Wins, losses, games played, and point margin.
        {readOnly ? " This session is saved on this phone." : " Only finished rounds count."}
      </p>
      <Button
        size="lg"
        full
        variant="yellow"
        data-testid="copy-recap"
        onClick={() => {
          void copyText(sessionRecap(session, store.players)).then((ok) => {
            setCopyLabel(ok ? "Copied!" : "Couldn't copy");
            window.setTimeout(() => setCopyLabel("Copy recap"), 2000);
          });
        }}
      >
        {copyLabel}
      </Button>
      {rows.every((row) => row.games === 0) ? (
        <p className="rounded-2xl border-2 border-ink bg-card p-3 font-bold">No finished games yet. Scores land here when you finish the round.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const player = store.players.find((item) => item.id === row.playerId);
            const diff = row.diff > 0 ? `+${row.diff}` : String(row.diff);
            return (
              <li key={row.playerId} className="rounded-2xl border-2 border-ink bg-card p-3" data-testid={`standing-${row.playerId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-black">
                    {index + 1}. {player?.name ?? "Player"}
                  </h2>
                  <p className={`text-3xl font-black tabular-nums ${row.diff > 0 ? "text-court" : row.diff < 0 ? "text-clay" : ""}`}>{diff}</p>
                </div>
                <p className="text-lg font-semibold">
                  {row.games === 0 ? "Hasn't finished a game" : `${row.wins} wins · ${row.losses} losses · ${row.games} played`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {readOnly && (
        <>
          <h2 className="text-lg font-black">Log</h2>
          <LogList session={session} />
          <Button variant="clay" size="lg" full onClick={() => dispatch({ type: "delete-past", sessionId: session.id })}>
            Delete this session
          </Button>
        </>
      )}
    </Screen>
  );
}

export function LogScreen() {
  const { store, dispatch } = useApp();
  const session = store.active;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [session?.log.length]);
  if (!session) return null;
  return (
    <Screen title="Session log" onBack={() => dispatch({ type: "nav", view: { name: "play" } })}>
      <p className="font-semibold">Oldest first. Rounds, scores, swaps, players joining, and undos.</p>
      <LogList session={session} />
      <div ref={end} />
    </Screen>
  );
}

function LogList({ session }: { session: Session }) {
  if (session.log.length === 0) return <p className="font-semibold">Nothing logged yet.</p>;
  return (
    <ol className="flex flex-col">
      {session.log.map((entry) => (
        <li key={entry.id} className="border-b-2 border-ink/20 py-3 text-base font-semibold">
          <time className="block text-sm font-black text-muted">{formatTime(entry.at)}</time>
          {entry.message}
        </li>
      ))}
    </ol>
  );
}

function formatTime(at: number) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

export function PastScreen() {
  const { store, dispatch } = useApp();
  return (
    <Screen title="Past sessions" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
      {store.past.length === 0 ? (
        <p className="rounded-2xl border-2 border-ink bg-card p-3 text-lg font-semibold">
          Finished sessions show up here, with the score log still on this phone.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {store.past.map((session) => {
            const rounds = session.rounds.filter((round) => round.status === "complete").length;
            const top = sortStandings(standings(session), store.players)[0];
            return (
              <li key={session.id}>
                <button
                  type="button"
                  className="flex min-h-16 w-full flex-col items-start justify-center rounded-xl border-2 border-ink bg-card px-3 py-2 text-left"
                  onClick={() => dispatch({ type: "nav", view: { name: "stats", sessionId: session.id } })}
                >
                  <span className="text-lg font-black">{session.title}</span>
                  <span className="font-semibold">
                    {rounds} rounds · {session.attendance.length} players
                    {top ? ` · ${playerName(store.players, top.playerId)} ${top.wins}-${top.losses}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
