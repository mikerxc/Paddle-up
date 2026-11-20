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

function Pickleball() {
  const holes = [
    [40.2, 25.7], [53.4, 25.7], [66.6, 25.7], [79.8, 25.7],
    [33.6, 37.1], [46.8, 37.1], [60, 37.1], [73.2, 37.1], [86.4, 37.1],
    [27, 48.6], [40.2, 48.6], [53.4, 48.6], [66.6, 48.6], [79.8, 48.6], [93, 48.6],
    [20.4, 60], [33.6, 60], [46.8, 60], [60, 60], [73.2, 60], [86.4, 60], [99.6, 60],
    [27, 71.4], [40.2, 71.4], [53.4, 71.4], [66.6, 71.4], [79.8, 71.4], [93, 71.4],
    [33.6, 82.9], [46.8, 82.9], [60, 82.9], [73.2, 82.9], [86.4, 82.9],
    [40.2, 94.3], [53.4, 94.3], [66.6, 94.3], [79.8, 94.3],
  ];
  return (
    <svg
      viewBox="0 0 120 120"
      className="pointer-events-none absolute top-2 right-2 h-28 w-28 drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)]"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="52" fill="#f0c014" />
      <ellipse cx="44" cy="40" rx="20" ry="14" fill="#ffe56a" />
      {holes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.6" fill="#1a140c" />
      ))}
      <circle cx="60" cy="60" r="52" fill="none" stroke="#1a140c" strokeWidth="4" />
    </svg>
  );
}
