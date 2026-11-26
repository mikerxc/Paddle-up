import { useState } from "react";
import { useApp } from "../app-context.tsx";
import { Button } from "../components/ui/button.tsx";
import { roundShareText } from "../engine/session.ts";
import { shareText } from "../lib/clipboard.ts";
import { playerName } from "../model.ts";

export function NextUpScreen() {
  const { store, dispatch } = useApp();
  const session = store.active;
  const [label, setLabel] = useState("Share this round");
  if (!session) return null;
  const round = session.rounds.find((item) => item.status === "pending") ?? session.rounds.find((item) => item.status === "active");
  return (
    <div className="flex min-h-dvh flex-col bg-ink text-paper">
      <header className="flex items-center gap-2 px-3 py-3">
        <Button variant="yellow" className="min-h-12" onClick={() => dispatch({ type: "nav", view: { name: "play" } })}>
          Back
        </Button>
        <h1 className="flex-1 text-center text-2xl font-black">{round ? `Round ${round.number}` : "Next up"}</h1>
      </header>
      {!round ? (
        <p className="px-4 text-2xl font-black">Add a round to show the group.</p>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-4 pb-8" data-testid="next-up-board">
          {round.matches.map((match) => (
            <section key={match.id} className="rounded-3xl bg-paper px-4 py-4 text-ink">
              <p className="text-sm font-black tracking-[0.16em] text-muted uppercase">Court {match.court}</p>
              <p className="mt-2 text-3xl leading-tight font-black">{team(store.players, match.teamA)}</p>
              <p className="text-2xl font-black">vs</p>
              <p className="text-3xl leading-tight font-black">{team(store.players, match.teamB)}</p>
            </section>
          ))}
          <p className="text-2xl font-black text-ball">
            {round.sittingOut.length
              ? `Sitting: ${round.sittingOut.map((id) => playerName(store.players, id)).join(", ")}`
              : "Nobody sitting"}
          </p>
          <Button
            size="lg"
            full
            variant="yellow"
            data-testid="share-board"
            onClick={() => {
              void shareText(`Round ${round.number}`, roundShareText(session, store.players, round)).then((result) => {
                setLabel(result === "shared" ? "Shared" : result === "copied" ? "Copied" : "Couldn't share");
              });
            }}
          >
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

function team(players: Parameters<typeof playerName>[0], ids: [string, string]) {
  return `${playerName(players, ids[0])} & ${playerName(players, ids[1])}`;
}
