import { rosterPlayers } from "../engine/session.ts";
import { MAX_COURTS } from "../model.ts";
import { useApp } from "../app-context.tsx";
import { Screen } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";

export function CheckInScreen() {
  const { store, dispatch } = useApp();
  const players = rosterPlayers(store);
  const selected = new Set(store.checkedIn);
  const courts = store.settings.courts;
  const count = players.filter((player) => selected.has(player.id)).length;
  return (
    <Screen title="Setup Games" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
      <div className="rounded-2xl border-2 border-ink bg-court px-3 py-3 text-white">
        <p className="text-xs font-black tracking-[0.16em] text-ball uppercase">Fair matchups</p>
        <p className="mt-1 text-xl font-black leading-tight">Who's playing?</p>
        <p className="mt-1 text-base font-semibold">Tap everyone who showed up. Teams stay balanced across the courts.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" variant={courts === 1 ? "default" : "secondary"} data-testid="courts-1" onClick={() => dispatch({ type: "set-settings", patch: { courts: 1 } })}>
          1 court
        </Button>
        <Button size="lg" variant={courts === 2 ? "default" : "secondary"} data-testid="courts-2" onClick={() => dispatch({ type: "set-settings", patch: { courts: 2 } })}>
          2 courts
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
        <span className="font-black">Courts</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="Fewer courts" data-testid="court-minus" disabled={courts <= 1} onClick={() => dispatch({ type: "set-settings", patch: { courts: courts - 1 } })}>
            −
          </Button>
          <span className="w-8 text-center text-2xl font-black tabular-nums">{courts}</span>
          <Button variant="secondary" size="icon" aria-label="More courts" data-testid="court-plus" disabled={courts >= MAX_COURTS} onClick={() => dispatch({ type: "set-settings", patch: { courts: courts + 1 } })}>
            +
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => dispatch({ type: "checkin-all" })}>
          Everyone
        </Button>
        <Button variant="secondary" onClick={() => dispatch({ type: "checkin-none" })}>
          Clear
        </Button>
      </div>
      {players.length === 0 ? (
        <div className="rounded-2xl border-2 border-ink bg-card p-3">
          <p className="text-lg font-black">Add people in Players first.</p>
          <Button className="mt-3" full onClick={() => dispatch({ type: "nav", view: { name: "roster" } })}>
            Open Players
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((player) => {
            const on = selected.has(player.id);
            return (
              <li key={player.id}>
                <button
                  type="button"
                  data-testid={`checkin-${player.id}`}
                  aria-pressed={on}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 border-ink px-3 text-left ${on ? "bg-court text-white" : "bg-card text-ink"}`}
                  onClick={() => dispatch({ type: "toggle-checkin", playerId: player.id })}
                >
                  <span className="text-lg font-black">{player.name}</span>
                  <span className="text-base font-bold">{on ? "Here" : "Out"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="lg" full data-testid="start-session" onClick={() => dispatch({ type: "start-session" })}>
        {count >= 4 ? `Start · ${count} here` : `Need ${4 - count} more`}
      </Button>
    </Screen>
  );
}
