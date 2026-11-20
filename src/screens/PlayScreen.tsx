import { useState } from "react";
import { useApp } from "../app-context.tsx";
import { Button } from "../components/ui/button.tsx";
import { Sheet } from "../components/ui/dialog.tsx";
import { activeRound, presentIds, roundUndoCount } from "../engine/session.ts";
import { matchPattern } from "../engine/pairing.ts";
import { finalScoreIssue, scoreStatus } from "../engine/scoring.ts";
import { genderMark, MAX_COURTS, MAX_SCORE, playerName, type Match, type Player, type Round, type Session } from "../model.ts";

export function PlayScreen() {
  const { store, dispatch } = useApp();
  const session = store.active;
  const [picked, setPicked] = useState<string | null>(null);
  const [pad, setPad] = useState<{ matchId: string; side: "A" | "B"; draft: string } | null>(null);
  const [arriveOpen, setArriveOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  if (!session) return null;
  const round = activeRound(session);
  const here = presentIds(session).length;
  const upcoming = session.rounds.filter((item) => item.status === "pending");
  const undoCount = roundUndoCount(store);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper px-3 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="yellow"
            data-testid="undo"
            aria-label={undoCount > 0 ? `Undo ${undoCount} this round` : "Undo"}
            onClick={() => dispatch({ type: "undo" })}
          >
            Undo{undoCount > 0 ? ` ${undoCount}` : ""}
          </Button>
          <p className="min-w-0 flex-1 text-center text-lg font-black">
            {round ? `Round ${round.number}` : "Between rounds"}
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: "nav", view: { name: "home" } })}>
            Home
          </Button>
        </div>
        <p className="mt-2 text-center text-base font-bold">
          {here} here · to {session.rules.pointsToWin}, win by {session.rules.winBy}, no cap
        </p>
      </header>
      <div className="flex flex-col gap-3 px-3 py-3 pb-28">
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2">
          <span className="font-black">Courts</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Fewer courts" data-testid="court-minus" disabled={session.rules.courts <= 1} onClick={() => dispatch({ type: "set-settings", patch: { courts: session.rules.courts - 1 } })}>
              −
            </Button>
            <span className="w-8 text-center text-2xl font-black tabular-nums" data-testid="court-count">
              {session.rules.courts}
            </span>
            <Button variant="secondary" size="icon" aria-label="More courts" data-testid="court-plus" disabled={session.rules.courts >= MAX_COURTS} onClick={() => dispatch({ type: "set-settings", patch: { courts: session.rules.courts + 1 } })}>
              +
            </Button>
          </div>
        </div>
        {round && round.matches.length < session.rules.courts && (
          <p className="text-base font-bold">
            Using {round.matches.length} of {session.rules.courts} courts. Four players fill a court.
          </p>
        )}
        {round ? (
          <>
            {round.matches.length === 0 && (
              <p className="rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold">Need 4 players to make a game. {here} are still here.</p>
            )}
            {round.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                players={store.players}
                pointsToWin={session.rules.pointsToWin}
                winBy={session.rules.winBy}
                onPlayer={(id) => setPicked(id)}
                onNudge={(side, delta) => dispatch({ type: "nudge-score", matchId: match.id, side, delta })}
                onOpenPad={(side) =>
                  setPad({
                    matchId: match.id,
                    side,
                    draft: String(side === "A" ? match.scoreA : match.scoreB),
                  })
                }
              />
            ))}
            <section className="rounded-2xl border-2 border-ink bg-ball/40 p-3">
              <h2 className="text-lg font-black">Sitting this round</h2>
              {round.sittingOut.length === 0 ? (
                <p className="mt-1 font-semibold">Everyone is on a court.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  {round.sittingOut.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="min-h-12 rounded-xl border-2 border-ink bg-ball px-3 text-left text-lg font-black"
                      onClick={() => setPicked(id)}
                    >
                      {labelFor(store.players, id)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl border-2 border-ink bg-card p-3">
            <h2 className="text-xl font-black">Planned rounds are done.</h2>
            <p className="mt-1 font-semibold">Next round keeps the teams balanced and rotates who sits. Keep going until you end the session.</p>
          </section>
        )}
        {upcoming.length > 0 && (
          <section className="rounded-2xl border-2 border-dashed border-ink p-3">
            <h2 className="text-lg font-black">Up next</h2>
            {upcoming.slice(0, 2).map((item) => (
              <div key={item.id} className="mt-2 border-t-2 border-ink/15 pt-2 first:mt-2 first:border-0 first:pt-0">
                <p className="font-black">Round {item.number}</p>
                {item.matches.map((match) => (
                  <p key={match.id} className="font-semibold">
                    Court {match.court}: {playerName(store.players, match.teamA[0])} & {playerName(store.players, match.teamA[1])} vs {playerName(store.players, match.teamB[0])} & {playerName(store.players, match.teamB[1])}
                  </p>
                ))}
                <p className="font-semibold">
                  {item.sittingOut.length ? `Sitting: ${item.sittingOut.map((id) => playerName(store.players, id)).join(", ")}` : "Nobody sitting"}
                </p>
              </div>
            ))}
          </section>
        )}
        <div className="grid grid-cols-1 gap-2">
          {round ? (
            <Button size="lg" full data-testid="finish-round" onClick={() => dispatch({ type: "finish-round" })}>
              Finish round
            </Button>
          ) : (
            <Button size="lg" full data-testid="next-round" onClick={() => dispatch({ type: "add-rounds", count: 1 })}>
              Next round
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant="secondary" data-testid="reshuffle" onClick={() => dispatch({ type: "reshuffle" })}>
              Reshuffle
            </Button>
            <Button size="lg" variant="secondary" data-testid="arrive-open" onClick={() => setArriveOpen(true)}>
              Add Player
            </Button>
            {round && (
              <Button size="lg" variant="secondary" data-testid="add-round" onClick={() => dispatch({ type: "add-rounds", count: 1 })}>
                Add round
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={() => dispatch({ type: "nav", view: { name: "stats", sessionId: null } })}>
              Stats
            </Button>
            <Button size="lg" variant="secondary" data-testid="open-log" onClick={() => dispatch({ type: "nav", view: { name: "log" } })}>
              Log
            </Button>
          </div>
          <Button size="lg" full variant="clay" data-testid="end-session" onClick={() => setEndOpen(true)}>
            End session
          </Button>
        </div>
      </div>
      <PlayerSheet
        session={session}
        players={store.players}
        round={round}
        playerId={picked}
        onClose={() => setPicked(null)}
        onSwap={(outId, inId) => {
          if (!round) return;
          dispatch({ type: "swap", roundId: round.id, outId, inId });
          setPicked(null);
        }}
        onLeave={(playerId) => {
          dispatch({ type: "depart", playerId });
          setPicked(null);
        }}
      />
      <ArriveSheet
        open={arriveOpen}
        players={store.players}
        session={session}
        onClose={() => setArriveOpen(false)}
        onArrive={(playerId) => {
          dispatch({ type: "arrive", playerId });
          setArriveOpen(false);
        }}
        onCreate={() => {
          setArriveOpen(false);
          dispatch({ type: "nav", view: { name: "edit", playerId: null, arriveAfter: true } });
        }}
      />
      <Sheet open={endOpen} onOpenChange={setEndOpen} title="End session?" description="Wins, losses, and the log stay on this phone. Undo brings the session back.">
        <Button
          size="lg"
          full
          variant="clay"
          data-testid="confirm-end"
          onClick={() => {
            setEndOpen(false);
            dispatch({ type: "end-session" });
          }}
        >
          End and show results
        </Button>
      </Sheet>
      <ScorePad
        pad={pad}
        players={store.players}
        session={session}
        onClose={() => setPad(null)}
        onDraft={(draft) => setPad((current) => (current ? { ...current, draft } : current))}
        onCommit={(score) => {
          if (!pad) return;
          dispatch({ type: "set-score", matchId: pad.matchId, side: pad.side, score });
          setPad(null);
        }}
      />
    </div>
  );
}

function labelFor(players: Player[], id: string) {
  return players.find((item) => item.id === id)?.name ?? "Player";
}

function MatchCard({
  match,
  players,
  pointsToWin,
  winBy,
  onPlayer,
  onNudge,
  onOpenPad,
}: {
  match: Match;
  players: Player[];
  pointsToWin: number;
  winBy: number;
  onPlayer: (id: string) => void;
  onNudge: (side: "A" | "B", delta: number) => void;
  onOpenPad: (side: "A" | "B") => void;
}) {
  const genderOf = (id: string) => players.find((player) => player.id === id)?.gender ?? "male";
  const pattern = matchPattern(genderOf, match.teamA, match.teamB);
  const status = scoreStatus(match.scoreA, match.scoreB, pointsToWin, winBy);
  const issue = finalScoreIssue(match.scoreA, match.scoreB, pointsToWin, winBy);
  const tone = status === "final" ? "bg-good" : status === "need-margin" || status === "overshot" ? "bg-bad" : "bg-[#083820] text-white";
  return (
    <section className="overflow-hidden rounded-3xl border-2 border-ink bg-[#0c4f2e] shadow-[0_6px_0_#1a140c]" data-testid={`court-${match.court}`}>
      <h2 className="bg-[#083820] px-3 py-2 text-center text-sm font-black tracking-[0.2em] text-ball uppercase">Court {match.court}</h2>
      <div className="court-surface">
        <CourtSide
          edge="far"
          players={players}
          ids={match.teamA}
          score={match.scoreA}
          side="A"
          matchId={match.id}
          onPlayer={onPlayer}
          onNudge={onNudge}
          onOpenPad={onOpenPad}
        />
        <div className="court-net" role="separator" aria-label="Net" />
        <CourtSide
          edge="near"
          players={players}
          ids={match.teamB}
          score={match.scoreB}
          side="B"
          matchId={match.id}
          onPlayer={onPlayer}
          onNudge={onNudge}
          onOpenPad={onOpenPad}
        />
      </div>
      <p className={`px-3 py-2 text-base font-black ${tone}`} data-testid={`score-status-${match.court}`}>
        {status === "final" && `Game. Win by ${winBy}.`}
        {status === "need-margin" && `Win by ${winBy}. Keep playing.`}
        {status === "overshot" && `Check this score. ${issue}`}
        {status === "playing" && "In progress"}
        {status === "empty" && "No points yet"}
        {pattern === "women_vs_men" && " Women vs men. Swap if you can."}
      </p>
    </section>
  );
}

function CourtSide({
  edge,
  players,
  ids,
  score,
  side,
  matchId,
  onPlayer,
  onNudge,
  onOpenPad,
}: {
  edge: "far" | "near";
  players: Player[];
  ids: [string, string];
  score: number;
  side: "A" | "B";
  matchId: string;
  onPlayer: (id: string) => void;
  onNudge: (side: "A" | "B", delta: number) => void;
  onOpenPad: (side: "A" | "B") => void;
}) {
  const names = (
    <div className="grid grid-cols-2 gap-2">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="min-h-11 truncate rounded-xl border-2 border-ink bg-paper px-2 text-center text-base font-black text-ink"
          onClick={() => onPlayer(id)}
        >
          {labelFor(players, id)}
        </button>
      ))}
    </div>
  );
  const scoreBlock = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 py-0.5">
      <div />
      <button
        type="button"
        className="min-h-16 min-w-[5.5rem] justify-self-center rounded-2xl border-2 border-white/90 bg-[#083820] px-3 text-5xl font-black tabular-nums text-white"
        aria-label={`Set score ${score}`}
        onClick={() => onOpenPad(side)}
      >
        {score}
      </button>
      <div className="flex flex-col items-end gap-1.5 justify-self-end">
        <Button
          variant="yellow"
          className="h-14 w-16 shrink-0 text-3xl"
          data-testid={`score-plus-${matchId}-${side}`}
          aria-label="Plus one"
          onClick={() => onNudge(side, 1)}
        >
          +
        </Button>
        <Button
          variant="secondary"
          className="h-14 w-16 shrink-0 text-3xl"
          data-testid={`score-minus-${matchId}-${side}`}
          aria-label="Minus one"
          onClick={() => onNudge(side, -1)}
        >
          −
        </Button>
      </div>
    </div>
  );
  return (
    <div className={`court-half ${edge === "far" ? "court-half-far" : "court-half-near"}`}>
      {edge === "far" ? (
        <>
          {names}
          {scoreBlock}
          <div className="court-kitchen" />
        </>
      ) : (
        <>
          <div className="court-kitchen" />
          {scoreBlock}
          {names}
        </>
      )}
    </div>
  );
}

function PlayerSheet({
  session,
  players,
  round,
  playerId,
  onClose,
  onSwap,
  onLeave,
}: {
  session: Session;
  players: Player[];
  round: Round | null;
  playerId: string | null;
  onClose: () => void;
  onSwap: (outId: string, inId: string) => void;
  onLeave: (playerId: string) => void;
}) {
  const player = players.find((item) => item.id === playerId);
  const playing = new Set(round ? round.matches.flatMap((match) => [...match.teamA, ...match.teamB]) : []);
  const sitting = new Set(round?.sittingOut ?? []);
  const onCourt = !!playerId && playing.has(playerId);
  const othersOnCourt = [...playing].filter((id) => id !== playerId);
  const sitters = [...sitting].filter((id) => id !== playerId);
  const outsiders = players.filter((item) => !playing.has(item.id) && !sitting.has(item.id));
  const attendance = session.attendance.find((att) => att.playerId === playerId);
  const alreadyLeaving = attendance?.leftAtRound !== null && attendance?.leftAtRound !== undefined;
  return (
    <Sheet open={!!player && !!round} onOpenChange={(open) => !open && onClose()} title={player?.name ?? "Player"} description={player ? (player.gender === "female" ? "Female" : "Male") : undefined}>
      {player && playerId && round && (
        <div className="flex flex-col gap-2">
          {onCourt &&
            sitters.map((id) => (
              <Button key={id} size="lg" full variant="secondary" onClick={() => onSwap(playerId, id)}>
                Sub in {playerName(players, id)}
              </Button>
            ))}
          {!onCourt &&
            othersOnCourt.map((id) => (
              <Button key={id} size="lg" full variant="secondary" onClick={() => onSwap(id, playerId)}>
                Put in for {playerName(players, id)}
              </Button>
            ))}
          {onCourt &&
            othersOnCourt.map((id) => (
              <Button key={id} size="lg" full variant="secondary" onClick={() => onSwap(playerId, id)}>
                Trade with {playerName(players, id)}
              </Button>
            ))}
          {onCourt && outsiders.length > 0 && <p className="pt-2 font-black">Not in this round</p>}
          {onCourt &&
            outsiders.map((item) => (
              <Button key={item.id} size="lg" full variant="yellow" onClick={() => onSwap(playerId, item.id)}>
                Replace with {item.name}
              </Button>
            ))}
          {alreadyLeaving ? (
            <p className="rounded-xl border-2 border-ink bg-ball px-3 py-3 font-bold">Leaving after this game.</p>
          ) : (
            <Button size="lg" full variant="clay" data-testid="leave-player" onClick={() => onLeave(playerId)}>
              {round.matches.some((match) => match.scoreA > 0 || match.scoreB > 0) && onCourt ? "Leave after this game" : "Leave session"}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ArriveSheet({
  open,
  players,
  session,
  onClose,
  onArrive,
  onCreate,
}: {
  open: boolean;
  players: Player[];
  session: Session;
  onClose: () => void;
  onArrive: (playerId: string) => void;
  onCreate: () => void;
}) {
  const here = new Set(session.attendance.filter((att) => att.leftAtRound === null).map((att) => att.playerId));
  const options = players.filter((player) => !here.has(player.id));
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()} title="Add a player" description="They join the rotation from here, even with the group. No extra sits for the rounds they missed.">
      <div className="flex flex-col gap-2">
        {options.length === 0 && <p className="font-semibold">Everyone in Players is already here.</p>}
        {options.map((player) => (
          <Button key={player.id} size="lg" full variant="secondary" data-testid={`arrive-${player.id}`} onClick={() => onArrive(player.id)}>
            {player.name} · {genderMark(player.gender)}
          </Button>
        ))}
        <Button size="lg" full data-testid="arrive-new" onClick={onCreate}>
          New player
        </Button>
      </div>
    </Sheet>
  );
}

function ScorePad({
  pad,
  players,
  session,
  onClose,
  onDraft,
  onCommit,
}: {
  pad: { matchId: string; side: "A" | "B"; draft: string } | null;
  players: Player[];
  session: Session;
  onClose: () => void;
  onDraft: (draft: string) => void;
  onCommit: (score: number) => void;
}) {
  const match = session.rounds.flatMap((round) => round.matches).find((item) => item.id === pad?.matchId);
  const ids = pad?.side === "B" ? match?.teamB : match?.teamA;
  const title = ids ? `${playerName(players, ids[0])} & ${playerName(players, ids[1])}` : "Score";
  const append = (digit: string) => {
    if (!pad) return;
    const next = pad.draft === "0" ? digit : `${pad.draft}${digit}`;
    const value = Number(next);
    if (!Number.isFinite(value) || value > MAX_SCORE) return;
    onDraft(String(value));
  };
  return (
    <Sheet open={!!pad} onOpenChange={(open) => !open && onClose()} title={title} description="The winner stops at the target, or at the other score plus the win-by margin. 11–9 and 13–11 count. 15–5 does not.">
      <p className="text-center text-6xl font-black tabular-nums">{pad?.draft ?? "0"}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <Button key={digit} size="lg" variant="secondary" className="text-2xl" onClick={() => append(digit)}>
            {digit}
          </Button>
        ))}
        <Button size="lg" variant="secondary" onClick={() => onDraft("0")}>
          Clear
        </Button>
        <Button size="lg" variant="secondary" className="text-2xl" onClick={() => append("0")}>
          0
        </Button>
        <Button size="lg" variant="secondary" onClick={() => onDraft(String(Math.floor(Number(pad?.draft ?? "0") / 10)))}>
          ⌫
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[11, 12, 13, 15].map((score) => (
          <Button key={score} size="lg" variant="yellow" onClick={() => onCommit(score)}>
            {score}
          </Button>
        ))}
      </div>
      <Button className="mt-3" size="lg" full data-testid="set-score" onClick={() => onCommit(Number(pad?.draft ?? "0"))}>
        Set score
      </Button>
    </Sheet>
  );
}
