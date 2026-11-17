import { presentIds } from "../engine/session.ts";
import { useApp } from "../app-context.tsx";
import { Screen } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";
import { samplePlayers } from "../sample.ts";

export function HomeScreen() {
  const { store, dispatch } = useApp();
  const live = store.active;
  const here = live ? presentIds(live).length : store.checkedIn.length;
  return (
    <Screen title="Open play">
      <p className="text-lg font-semibold leading-snug">
        Check people in, put fair doubles on the courts, and keep score. Names stay on this phone for the next time you play.
      </p>
      {live ? (
        <Button size="lg" full data-testid="continue-session" onClick={() => dispatch({ type: "nav", view: { name: "play" } })}>
          Back to round {live.rounds.find((round) => round.status === "active")?.number ?? live.rounds.length} · {here} here
        </Button>
      ) : (
        <Button size="lg" full data-testid="nav-checkin" onClick={() => dispatch({ type: "nav", view: { name: "checkin" } })}>
          Who's here
        </Button>
      )}
      <Button size="lg" full variant="secondary" data-testid="nav-roster" onClick={() => dispatch({ type: "nav", view: { name: "roster" } })}>
        Roster · {store.players.length}
      </Button>
      <Button size="lg" full variant="secondary" data-testid="nav-past" onClick={() => dispatch({ type: "nav", view: { name: "past" } })}>
        Past sessions · {store.past.length}
      </Button>
      <Button size="lg" full variant="secondary" data-testid="nav-settings" onClick={() => dispatch({ type: "nav", view: { name: "settings" } })}>
        House rules
      </Button>
      {store.players.length === 0 && (
        <div className="rounded-2xl border-2 border-ink bg-card p-3">
          <p className="text-lg font-black">No roster yet</p>
          <p className="mt-1 text-base font-semibold">Add your group once, or load a sample night and try the courts.</p>
          <Button className="mt-3" full variant="yellow" data-testid="load-sample" onClick={() => dispatch({ type: "load-sample", players: samplePlayers })}>
            Load sample group
          </Button>
        </div>
      )}
      <p className="mt-auto text-sm font-bold text-muted">Saved on this phone. A refresh keeps the live session.</p>
    </Screen>
  );
}
