import type { ReactNode } from "react";
import { useApp } from "../app-context.tsx";
import { Screen, Stepper } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";
import { playRoundCue } from "../lib/sound.ts";
import { MAX_COURTS, SKILL_MAX, SKILL_MIN } from "../model.ts";

export function SettingsScreen() {
  const { store, dispatch } = useApp();
  const settings = store.settings;
  const set = (patch: Partial<typeof settings>) => dispatch({ type: "set-settings", patch });
  return (
    <Screen title="House rules" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
      <p className="text-lg font-semibold">
        These are the defaults for a new night. Court count, points, and win-by also change a live session.
      </p>
      <Rule label="Courts" hint="Most nights are 1 or 2. One court plays 4 people and sits the rest.">
        <Stepper label="courts" value={settings.courts} min={1} max={MAX_COURTS} onChange={(courts) => set({ courts })} testId="settings-courts" />
      </Rule>
      <Rule label="Points to win" hint="Rally scoring. 11 is the usual game.">
        <Stepper label="points" value={settings.pointsToWin} min={7} max={21} onChange={(pointsToWin) => set({ pointsToWin })} />
      </Rule>
      <Rule label="Win by" hint="The winner stops at the target, or at the other score plus this margin. 11–9 and 13–11 count. 15–5 and 12–5 do not. There is no cap.">
        <Stepper label="win by" value={settings.winBy} min={1} max={5} onChange={(winBy) => set({ winBy })} />
      </Rule>
      <Rule label="Rounds to plan" hint="How many rounds to lay out when you hit start. Next round keeps the night going after that, until you end it.">
        <Stepper label="rounds" value={settings.initialRounds} min={1} max={12} onChange={(initialRounds) => set({ initialRounds })} />
      </Rule>
      <Rule label="New player skill" hint="DUPR-style ratings run from 2.0 to 5.5 in steps of 0.1. This is the number the new-player form starts on.">
        <Stepper
          label="default skill"
          value={settings.defaultSkill}
          min={SKILL_MIN}
          max={SKILL_MAX}
          step={0.1}
          format={(value) => value.toFixed(1)}
          onChange={(defaultSkill) => set({ defaultSkill })}
        />
      </Rule>
      <Button size="lg" full variant={settings.soundOn ? "default" : "secondary"} onClick={() => set({ soundOn: !settings.soundOn })}>
        Sound {settings.soundOn ? "on" : "off"}
      </Button>
      <Button size="lg" full variant={settings.vibrateOn ? "default" : "secondary"} onClick={() => set({ vibrateOn: !settings.vibrateOn })}>
        Vibration {settings.vibrateOn ? "on" : "off"}
      </Button>
      <Button size="lg" full variant="yellow" data-testid="test-sound" onClick={() => playRoundCue(store.settings)}>
        Test the round cue
      </Button>
    </Screen>
  );
}

function Rule({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-ink bg-card p-3">
      <h2 className="text-lg font-black">{label}</h2>
      <p className="mb-2 text-base font-semibold text-muted">{hint}</p>
      {children}
    </section>
  );
}
