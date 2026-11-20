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
      <header className="border-b-2 border-ink bg-court text-white">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <p className="rounded-full border-2 border-white/80 bg-black/20 px-3 py-1 text-xs font-black tracking-[0.16em] text-ball uppercase">
            Paddle Up
          </p>
          <PaddleMark />
        </div>
        <div className="px-4 pb-4">
          <h1 className="max-w-[16rem] text-[2.35rem] font-black leading-[0.95] tracking-tight">Tonight's open play</h1>
          <p className="mt-3 max-w-[18rem] text-base font-semibold leading-snug text-white">
            Balanced teams and fair matchups. Check people in, run the courts, and keep score in the sun.
          </p>
        </div>
        <div className="mx-4 mb-3 h-16 overflow-hidden rounded-2xl border-2 border-white/90" aria-hidden="true">
          <div className="relative h-full bg-[#187a40]">
            <div className="absolute inset-1.5 rounded-xl border-2 border-white/85" />
            <div className="absolute inset-x-1.5 top-[30%] border-t-2 border-white/80" />
            <div className="absolute inset-x-1.5 top-1/2 h-2 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#ffffff_0_2px,rgba(16,40,24,0.28)_2px_6px)] shadow-[0_-2px_0_#fff,0_2px_0_#102216]" />
            <div className="absolute inset-x-1.5 bottom-[30%] border-t-2 border-white/80" />
            <div className="absolute top-1.5 bottom-1/2 left-1/2 w-[3px] -translate-x-1/2 bg-white/85" />
            <div className="absolute top-1/2 bottom-1.5 left-1/2 w-[3px] -translate-x-1/2 bg-white/85" />
          </div>
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
            <p className="mt-1 text-base font-semibold">Add your group once, or load a sample night and try the courts.</p>
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

function PaddleMark() {
  return (
    <svg viewBox="0 0 86 86" className="h-[4.5rem] w-[4.5rem] drop-shadow-[2px_3px_0_rgba(0,0,0,0.35)]" aria-hidden="true">
      <ellipse cx="34" cy="34" rx="22" ry="26" fill="#ffe14a" stroke="#1a140c" strokeWidth="3" />
      <circle cx="28" cy="28" r="2.2" fill="#1a140c" />
      <circle cx="38" cy="26" r="2.2" fill="#1a140c" />
      <circle cx="33" cy="36" r="2.2" fill="#1a140c" />
      <circle cx="42" cy="38" r="2.2" fill="#1a140c" />
      <path d="M48 52 L72 76" stroke="#f7f1e4" strokeWidth="8" strokeLinecap="round" />
      <path d="M48 52 L72 76" stroke="#1a140c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
