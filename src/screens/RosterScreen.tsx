import { useState } from "react";
import { rosterPlayers } from "../engine/session.ts";
import { genderMark, type Gender } from "../model.ts";
import { useApp } from "../app-context.tsx";
import { Screen, SkillStepper } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { samplePlayers } from "../sample.ts";

export function RosterScreen() {
  const { store, dispatch } = useApp();
  const players = rosterPlayers(store);
  return (
    <Screen title="Players" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
      <Button size="lg" full data-testid="add-player" onClick={() => dispatch({ type: "nav", view: { name: "edit", playerId: null, arriveAfter: false } })}>
        Add a player
      </Button>
      {players.length === 0 ? (
        <div className="rounded-2xl border-2 border-ink bg-card p-3">
          <p className="text-lg font-black">Your group isn't in here yet.</p>
          <p className="mt-1 text-base font-semibold">Add players once. After that, Setup Games is just tapping names.</p>
          <Button className="mt-3" full variant="yellow" data-testid="load-sample" onClick={() => dispatch({ type: "load-sample", players: samplePlayers })}>
            Load sample group
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 border-ink bg-card px-3 text-left"
                onClick={() => dispatch({ type: "nav", view: { name: "edit", playerId: player.id, arriveAfter: false } })}
              >
                <span className="text-lg font-black">{player.name}</span>
                <span className="text-base font-bold">
                  {genderMark(player.gender)}
                  {store.settings.hostSkills ? ` · ${player.skill.toFixed(1)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

export function EditPlayerScreen() {
  const { store, dispatch } = useApp();
  const view = store.view.name === "edit" ? store.view : null;
  const existing = store.players.find((player) => player.id === view?.playerId);
  const [name, setName] = useState(existing?.name ?? "");
  const [gender, setGender] = useState<Gender | null>(existing?.gender ?? null);
  const [skill, setSkill] = useState(existing?.skill ?? store.settings.defaultSkill);
  const [localError, setLocalError] = useState<string | null>(null);
  const inSession = !!existing && store.active?.attendance.some((att) => att.playerId === existing.id);

  if (!view) return null;

  return (
    <Screen
      title={existing ? "Edit player" : "New player"}
      onBack={() => dispatch({ type: "nav", view: view.arriveAfter ? { name: "play" } : { name: "roster" } })}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!gender) {
            setLocalError("Pick Female or Male.");
            return;
          }
          setLocalError(null);
          if (existing) {
            dispatch({ type: "update-player", playerId: existing.id, name, gender, skill });
          } else {
            dispatch({ type: "add-player", name, gender, skill, arriveAfter: view.arriveAfter });
          }
        }}
      >
        <label className="text-base font-black" htmlFor="player-name">
          Name
        </label>
        <Input id="player-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" autoComplete="name" data-testid="player-name" />
        <p className="text-base font-black">Gender</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="lg" variant={gender === "female" ? "default" : "secondary"} data-testid="gender-female" onClick={() => setGender("female")}>
            Female
          </Button>
          <Button type="button" size="lg" variant={gender === "male" ? "default" : "secondary"} data-testid="gender-male" onClick={() => setGender("male")}>
            Male
          </Button>
        </div>
        {store.settings.hostSkills && (
          <>
            <p className="text-base font-black">Hidden skill</p>
            <p className="text-base font-semibold text-muted">Only visible with host controls on. Finished games keep learning from this number.</p>
            <SkillStepper value={skill} onChange={setSkill} />
          </>
        )}
        {localError && <p className="rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold">{localError}</p>}
        <Button type="submit" size="lg" full data-testid="save-player">
          Save player
        </Button>
      </form>
      {existing && (
        <Button
          variant="clay"
          size="lg"
          full
          disabled={inSession}
          onClick={() => dispatch({ type: "delete-player", playerId: existing.id })}
        >
          {inSession ? "In the live session" : "Remove from Players"}
        </Button>
      )}
    </Screen>
  );
}
