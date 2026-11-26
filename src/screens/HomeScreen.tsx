import ballUrl from "../assets/pickleball.webp";
import { presentIds } from "../engine/session.ts";
import { useApp } from "../app-context.tsx";
import { Button } from "../components/ui/button.tsx";
import { samplePlayers } from "../sample.ts";

export function HomeScreen() {
  const { store, dispatch } = useApp();
  const live = store.active;
  const here = live ? presentIds(live).length : store.checkedIn.length;
  const roundNumber = live?.rounds.find((round) => round.status === "active")?.number ?? live?.rounds.length;
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="relative overflow-hidden border-b-2 border-ink bg-court text-white">
        <Pickleball />
        <div className="relative max-w-[calc(100%-6.75rem)] px-4 pt-4 pb-5">
          <p className="w-fit rounded-full border-2 border-white/80 bg-black/20 px-3 py-1 text-xs font-black tracking-[0.16em] text-ball uppercase">
            Paddle Up
          </p>
          <h1 className="mt-4 max-w-[12rem] text-[2.7rem] font-black leading-[0.95] tracking-tight">Open Play</h1>
          <p className="mt-3 max-w-[16rem] text-base font-semibold leading-snug text-white">
            Balanced teams and fair matchups. Check people in, run the courts, and keep score in the sun.
          </p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3 pb-28">
        {live ? (
          <Button size="lg" full variant="yellow" data-testid="continue-session" onClick={() => dispatch({ type: "nav", view: { name: "play" } })}>
            Back to round {roundNumber} · {here} here
          </Button>
        ) : (
          <Button size="lg" full variant="yellow" data-testid="nav-checkin" onClick={() => dispatch({ type: "nav", view: { name: "checkin" } })}>
            Setup Games
          </Button>
        )}
        <Button size="lg" full variant="secondary" data-testid="nav-roster" onClick={() => dispatch({ type: "nav", view: { name: "roster" } })}>
          Players · {store.players.length}
        </Button>
        <Button size="lg" full variant="secondary" data-testid="nav-past" onClick={() => dispatch({ type: "nav", view: { name: "past" } })}>
          Past sessions · {store.past.length}
        </Button>
        <Button size="lg" full variant="secondary" data-testid="nav-settings" onClick={() => dispatch({ type: "nav", view: { name: "settings" } })}>
          Settings
        </Button>
        {store.players.length === 0 && (
          <div className="rounded-2xl border-2 border-ink bg-card p-3 shadow-[0_4px_0_#1a140c]">
            <p className="text-lg font-black">No players yet</p>
            <p className="mt-1 text-base font-semibold">Add your group once, or load a sample group and try the courts.</p>
            <Button className="mt-3" full variant="yellow" data-testid="load-sample" onClick={() => dispatch({ type: "load-sample", players: samplePlayers })}>
              Load sample group
            </Button>
          </div>
        )}
        <p className="text-sm font-bold text-ink">Saved on this phone. A refresh keeps the live session.</p>
      </div>
    </div>
  );
}

/** Photo: E is for Ian, CC BY-SA 4.0. See src/assets/pickleball-license.txt. */
function Pickleball() {
  return (
    <img
      src={ballUrl}
      alt=""
      className="pointer-events-none absolute top-2 right-2 h-28 w-28 drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)]"
      aria-hidden="true"
    />
  );
}
