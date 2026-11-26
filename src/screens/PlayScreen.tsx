import { useState } from "react";
import { useApp } from "../app-context.tsx";
import { Button } from "../components/ui/button.tsx";
import { Sheet } from "../components/ui/dialog.tsx";
import { activeRound, presentIds, roundShareText, roundUndoCount } from "../engine/session.ts";
import { quickScores, scoreStatus, winningTotal, type ScoreStatus } from "../engine/scoring.ts";
import { shareText } from "../lib/clipboard.ts";
import { MAX_COURTS, MAX_SCORE, playerName, type Match, type Player, type Round, type Session } from "../model.ts";

export function PlayScreen() {
  const { store, dispatch } = useApp();
  const session = store.active;
  const [picked, setPicked] = useState<string | null>(null);
  const [pad, setPad] = useState<{ matchId: string; side: "A" | "B"; draft: string } | null>(null);
  const [arriveOpen, setArriveOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [win, setWin] = useState<{ matchId: string; side: "A" | "B"; draft: string } | null>(null);
  if (!session) return null;
  const round = activeRound(session);
  const here = presentIds(session).length;
  const upcoming = session.rounds.filter((item) => item.status === "pending");
  const undoCount = roundUndoCount(store);
  const nextRound = session.rounds.find((item) => item.status === "pending") ?? null;
  const roundReady =
    !!round &&
    round.matches.length > 0 &&
    round.matches.every((match) => match.capped || scoreStatus(match.scoreA, match.scoreB, session.rules.pointsToWin, session.rules.winBy) === "final");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="yellow"
            className="min-h-12 px-3"
            data-testid="undo"
            disabled={undoCount === 0}
            aria-label={undoCount > 0 ? `Undo ${undoCount} this round` : "Undo"}
            onClick={() => dispatch({ type: "undo" })}
          >
            Undo{undoCount > 0 ? ` ${undoCount}` : ""}
          </Button>
          <p className="min-w-0 flex-1 text-center text-base font-black leading-tight">
            {round ? `Round ${round.number}` : "Between rounds"}
          </p>
          <div className="flex items-center gap-0.5">
            <Button
              variant="secondary"
              className="h-10 w-10 text-xl"
              aria-label="Fewer courts"
              data-testid="court-minus"
              disabled={session.rules.courts <= 1}
              onClick={() => dispatch({ type: "set-settings", patch: { courts: session.rules.courts - 1 } })}
            >
              −
            </Button>
            <span className="w-5 text-center text-lg font-black tabular-nums" data-testid="court-count">
              {session.rules.courts}
            </span>
            <Button
              variant="secondary"
              className="h-10 w-10 text-xl"
              aria-label="More courts"
              data-testid="court-plus"
              disabled={session.rules.courts >= MAX_COURTS}
              onClick={() => dispatch({ type: "set-settings", patch: { courts: session.rules.courts + 1 } })}
            >
              +
            </Button>
          </div>
          <Button variant="secondary" className="h-10 px-2" onClick={() => dispatch({ type: "nav", view: { name: "home" } })}>
            Home
          </Button>
        </div>
        <p className="text-center text-xs font-bold text-muted">
          {here} here · to {session.rules.pointsToWin}, win by {session.rules.winBy}
        </p>
      </header>
      <div className="flex flex-col gap-2 px-2 py-2 pb-24">
        {round && round.matches.length < session.rules.courts && (
          <p className="text-center text-xs font-bold">
            Using {round.matches.length} of {session.rules.courts} courts.
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
                onWon={(side) => setWin({ matchId: match.id, side, draft: "0" })}
                onCap={() => dispatch({ type: "end-as-is", matchId: match.id })}
              />
            ))}
            <section className="rounded-lg border border-ink/50 bg-ball/40 px-2 py-1" data-testid="sitting-strip">
              <p className="text-sm leading-tight font-bold">
                <span className="font-black">Sitting this round</span>
                {round.sittingOut.length === 0 ? (
                  <span className="font-semibold"> · Everyone is on a court.</span>
                ) : (
                  round.sittingOut.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="ml-1.5 inline-flex min-h-11 items-center rounded-md px-1 font-black"
                      onClick={() => setPicked(id)}
                    >
                      {labelFor(store.players, id)}
                    </button>
                  ))
                )}
              </p>
            </section>
          </>
        ) : (
          <section className="rounded-2xl border-2 border-ink bg-card p-3">
            <h2 className="text-xl font-black">Planned rounds are done.</h2>
            <p className="mt-1 font-semibold">Next round keeps the teams balanced and rotates who sits.</p>
          </section>
        )}
        {upcoming.length > 0 && (
          <section data-testid="up-next">
            <h2 className="text-lg font-black">Up next</h2>
            {upcoming.slice(0, 8).map((item) => (
              <article key={item.id} className="mt-2 rounded-2xl border-2 border-ink bg-white p-3 text-ink" data-testid={`upcoming-${item.number}`}>
                <h3 className="text-lg font-black">Round {item.number}</h3>
                {item.matches.map((match) => (
                  <div key={match.id} className="mt-3">
                    <p className="text-xs font-black tracking-[0.14em] text-ink">COURT {match.court}</p>
                    <p className="truncate text-base font-bold whitespace-nowrap">{teamLabel(store.players, match.teamA)}</p>
                    <p className="text-base font-black">vs</p>
                    <p className="truncate text-base font-bold whitespace-nowrap">{teamLabel(store.players, match.teamB)}</p>
                  </div>
                ))}
                <p className="mt-3 text-sm font-semibold text-muted">
                  {item.sittingOut.length
                    ? `Bench: ${item.sittingOut.map((id) => playerName(store.players, id)).join(", ")}`
                    : "Bench: nobody"}
                </p>
              </article>
            ))}
          </section>
        )}
        <div className="grid grid-cols-1 gap-2">
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
            <Button size="lg" variant="secondary" data-testid="hold-up" onClick={() => dispatch({ type: "nav", view: { name: "nextup" } })}>
              Hold up next
            </Button>
            <Button
              size="lg"
              variant="secondary"
              data-testid="share-next"
              onClick={() => {
                const shared = nextRound ?? round;
                if (!shared) return;
                void shareText(`Round ${shared.number}`, roundShareText(session, store.players, shared));
              }}
            >
              Share next
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
        onBreak={(playerId) => {
          dispatch({ type: "break-next", playerId });
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
      <footer className="sticky bottom-0 z-30 border-t-2 border-ink bg-paper px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))]">
        <p className="text-center text-sm font-black" data-testid="next-line">
          {nextRound ? `Next: Round ${nextRound.number}` : "Next: add a round"}
        </p>
        {round ? (
          <Button size="lg" full data-testid="finish-round" onClick={() => dispatch({ type: "finish-round" })}>
            Finish round
          </Button>
        ) : (
          <Button size="lg" full data-testid="next-round" onClick={() => dispatch({ type: "add-rounds", count: 1 })}>
            Next round
          </Button>
        )}
      </footer>
      <Sheet
        open={endOpen}
        onOpenChange={setEndOpen}
        title="End session?"
        description={
          roundReady
            ? "This round's scores are finished, so they'll count in the results."
            : "This round isn't finished. End anyway? These scores won't count."
        }
      >
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
      <WinSheet
        win={win}
        pointsToWin={session.rules.pointsToWin}
        winBy={session.rules.winBy}
        onClose={() => setWin(null)}
        onDraft={(draft) => setWin((current) => (current ? { ...current, draft } : current))}
        onCommit={(loserScore) => {
          if (!win) return;
          dispatch({ type: "award-win", matchId: win.matchId, side: win.side, loserScore });
          setWin(null);
        }}
      />
    </div>
  );
}

function WinSheet({
  win,
  pointsToWin,
  winBy,
  onClose,
  onDraft,
  onCommit,
}: {
  win: { matchId: string; side: "A" | "B"; draft: string } | null;
  pointsToWin: number;
  winBy: number;
  onClose: () => void;
  onDraft: (draft: string) => void;
  onCommit: (loserScore: number) => void;
}) {
  const loser = Number(win?.draft ?? "0");
  const winner = winningTotal(Number.isFinite(loser) ? loser : 0, pointsToWin, winBy);
  const append = (digit: string) => {
    if (!win) return;
    const next = win.draft === "0" ? digit : `${win.draft}${digit}`;
    const value = Number(next);
    if (!Number.isFinite(value) || value > MAX_SCORE) return;
    onDraft(String(value));
  };
  return (
    <Sheet open={!!win} onOpenChange={(open) => !open && onClose()} title="They won" description="Enter the other side's score. This side's score fills in.">
      <p className="text-center text-lg font-black">
        Winner {winner} · other {win?.draft ?? "0"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => (
          <Button key={digit} size="lg" variant="secondary" className="text-2xl" onClick={() => append(digit)}>
            {digit}
          </Button>
        ))}
        <Button size="lg" variant="secondary" onClick={() => onDraft("0")}>
          Clear
        </Button>
      </div>
      <Button className="mt-3" size="lg" full data-testid="award-win" onClick={() => onCommit(Number(win?.draft ?? "0"))}>
        Set {winner}–{win?.draft ?? "0"}
      </Button>
    </Sheet>
  );
}

function labelFor(players: Player[], id: string) {
  return players.find((item) => item.id === id)?.name ?? "Player";
}

function teamLabel(players: Player[], ids: [string, string]) {
  return `${playerName(players, ids[0])} & ${playerName(players, ids[1])}`;
}

function statusLabel(status: ScoreStatus, winBy: number, capped: boolean): string {
  if (capped) return "Time-capped";
  if (status === "final") return "Game";
  if (status === "need-margin") return `Win by ${winBy}`;
  if (status === "overshot") return "Check score";
  if (status === "playing") return "In progress";
  return "Ready";
}

function MatchCard({
  match,
  players,
  pointsToWin,
  winBy,
  onPlayer,
  onNudge,
  onOpenPad,
  onWon,
  onCap,
}: {
  match: Match;
  players: Player[];
  pointsToWin: number;
  winBy: number;
  onPlayer: (id: string) => void;
  onNudge: (side: "A" | "B", delta: number) => void;
  onOpenPad: (side: "A" | "B") => void;
  onWon: (side: "A" | "B") => void;
  onCap: () => void;
}) {
  const status = scoreStatus(match.scoreA, match.scoreB, pointsToWin, winBy);
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-ink bg-court text-white shadow-[0_4px_0_#1a140c]" data-testid={`court-${match.court}`}>
      <h2 className="flex items-center justify-center gap-2 bg-[#083820] px-2 py-1 text-center text-xs font-black tracking-[0.12em] text-white uppercase">
        <span data-testid={`score-status-${match.court}`}>
          Court {match.court} · {statusLabel(status, winBy, match.capped === true)}
        </span>
        {match.short && (
          <span className="rounded-full bg-ball px-1.5 py-0.5 text-[10px] font-black tracking-normal text-ink normal-case" data-testid={`short-${match.court}`}>
            ratings short
          </span>
        )}
        {match.capped && <span className="text-[10px] font-black tracking-normal text-ball normal-case">time-capped</span>}
        {!match.capped && (
          <button type="button" className="text-[10px] font-black tracking-normal text-ball normal-case underline" data-testid={`end-as-is-${match.court}`} onClick={onCap}>
            End as is
          </button>
        )}
      </h2>
      <CourtSide
        players={players}
        ids={match.teamA}
        score={match.scoreA}
        side="A"
        matchId={match.id}
        onPlayer={onPlayer}
        onNudge={onNudge}
        onOpenPad={onOpenPad}
        onWon={onWon}
      />
      <div className="court-net mx-2" role="separator" aria-label="Net" />
      <CourtSide
        players={players}
        ids={match.teamB}
        score={match.scoreB}
        side="B"
        matchId={match.id}
        onPlayer={onPlayer}
        onNudge={onNudge}
        onOpenPad={onOpenPad}
        onWon={onWon}
      />
    </section>
  );
}

function CourtSide({
  players,
  ids,
  score,
  side,
  matchId,
  onPlayer,
  onNudge,
  onOpenPad,
  onWon,
}: {
  players: Player[];
  ids: [string, string];
  score: number;
  side: "A" | "B";
  matchId: string;
  onPlayer: (id: string) => void;
  onNudge: (side: "A" | "B", delta: number) => void;
  onOpenPad: (side: "A" | "B") => void;
  onWon: (side: "A" | "B") => void;
}) {
  return (
    <div className="flex items-center gap-1 px-1.5 py-1.5">
      <Button
        variant="secondary"
        className="h-12 w-12 shrink-0 text-2xl"
        data-testid={`score-minus-${matchId}-${side}`}
        aria-label="Minus one"
        onClick={() => onNudge(side, -1)}
      >
        −
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            className="min-h-11 truncate text-left text-base font-black text-white"
            onClick={() => onPlayer(id)}
          >
            {labelFor(players, id)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="min-h-12 min-w-12 text-5xl leading-none font-black tabular-nums text-white"
        aria-label={`Set score ${score}`}
        onClick={() => onOpenPad(side)}
      >
        {score}
      </button>
      <Button
        variant="yellow"
        className="h-12 shrink-0 px-2 text-sm"
        data-testid={`won-${matchId}-${side}`}
        aria-label="This side won"
        onClick={() => onWon(side)}
      >
        Won
      </Button>
      <Button
        variant="yellow"
        className="h-12 w-12 shrink-0 text-2xl"
        data-testid={`score-plus-${matchId}-${side}`}
        aria-label="Plus one"
        onClick={() => onNudge(side, 1)}
      >
        +
      </Button>
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
  onBreak,
}: {
  session: Session;
  players: Player[];
  round: Round | null;
  playerId: string | null;
  onClose: () => void;
  onSwap: (outId: string, inId: string) => void;
  onLeave: (playerId: string) => void;
  onBreak: (playerId: string) => void;
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
    <Sheet open={!!player && !!round} onOpenChange={(open) => !open && onClose()} title={player?.name ?? "Player"}>
      {player && playerId && round && (
        <div className="flex flex-col gap-2">
          {onCourt && sitters.length > 0 && <p className="font-black">Hurt, sub now</p>}
          {onCourt &&
            sitters.map((id) => (
              <Button key={id} size="lg" full variant="yellow" onClick={() => onSwap(playerId, id)}>
                Sub in {playerName(players, id)}
              </Button>
            ))}
          <Button size="lg" full variant="secondary" data-testid="sit-next" onClick={() => onBreak(playerId)}>
            Sit next round
          </Button>
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
            {player.name}
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
        {quickScores(session.rules.pointsToWin).map((score) => (
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
