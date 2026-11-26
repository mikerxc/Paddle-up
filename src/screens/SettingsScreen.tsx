import { useRef, useState, type ReactNode } from "react";
import { useApp } from "../app-context.tsx";
import { Screen, Stepper } from "../components/Bits.tsx";
import { Button } from "../components/ui/button.tsx";
import { Sheet } from "../components/ui/dialog.tsx";
import { playRoundCue } from "../lib/sound.ts";
import { Input } from "../components/ui/input.tsx";
import { MAX_COURTS, SKILL_MAX, SKILL_MIN } from "../model.ts";
import { buildBackup, parseBackup, type BackupFile } from "../storage.ts";

const HOST_PIN = "000";

export function SettingsScreen() {
  const { store, dispatch, hostUnlocked, setHostUnlocked } = useApp();
  const settings = store.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [hostPin, setHostPin] = useState("");
  const [pinWrong, setPinWrong] = useState(false);
  const set = (patch: Partial<typeof settings>) => dispatch({ type: "set-settings", patch });

  const download = () => {
    const backup = buildBackup(store);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const day = new Date(backup.exportedAt).toISOString().slice(0, 10);
    link.href = url;
    link.download = `paddle-up-backup-${day}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Screen title="Settings" onBack={() => dispatch({ type: "nav", view: { name: "home" } })}>
      <p className="text-lg font-semibold">
        These are the defaults for a new session. Court count, points, and win-by also change a live session.
      </p>
      <Rule label="Courts" hint="Most groups use 1 or 2. One court plays 4 people and sits the rest.">
        <Stepper label="courts" value={settings.courts} min={1} max={MAX_COURTS} onChange={(courts) => set({ courts })} testId="settings-courts" />
      </Rule>
      <Rule label="Points to win" hint="Rally scoring. 11 is the usual game.">
        <Stepper label="points" value={settings.pointsToWin} min={7} max={21} onChange={(pointsToWin) => set({ pointsToWin })} />
      </Rule>
      <Rule label="Win by" hint="The winner stops at the target, or at the other score plus this margin. 11–9 and 13–11 count. 15–5 and 12–5 do not. There is no cap.">
        <Stepper label="win by" value={settings.winBy} min={1} max={5} onChange={(winBy) => set({ winBy })} />
      </Rule>
      <Rule label="Rounds to plan" hint="How many rounds to lay out when you hit start. Next round keeps the session going after that, until you end it.">
        <Stepper label="rounds" value={settings.initialRounds} min={1} max={12} onChange={(initialRounds) => set({ initialRounds })} />
      </Rule>
      <Button size="lg" full variant={settings.soundOn ? "default" : "secondary"} onClick={() => set({ soundOn: !settings.soundOn })}>
        Sound {settings.soundOn ? "on" : "off"}
      </Button>
      <Button size="lg" full variant="yellow" data-testid="test-sound" onClick={() => playRoundCue(store.settings)}>
        Test the round cue
      </Button>
      <section className="rounded-2xl border-2 border-dashed border-ink bg-card p-3">
        <h2 className="text-lg font-black">Host</h2>
        {hostUnlocked ? (
          <>
            <p className="mb-2 text-base font-semibold text-muted">
              Skill numbers show on Players while this is unlocked. Lock hides them again. A refresh locks them too. Scores never change a rating.
            </p>
            <Button
              size="lg"
              full
              variant={settings.hostSkills ? "default" : "secondary"}
              data-testid="host-skills"
              onClick={() => set({ hostSkills: !settings.hostSkills })}
            >
              Host skill controls {settings.hostSkills ? "on" : "off"}
            </Button>
            {settings.hostSkills && (
              <div className="mt-3">
                <h3 className="text-lg font-black">Starting skill</h3>
                <p className="mb-2 text-base font-semibold text-muted">
                  New players begin here, from 2.0 to 5.5. Only a host edit changes a rating.
                </p>
                <Stepper
                  label="starting skill"
                  value={settings.defaultSkill}
                  min={SKILL_MIN}
                  max={SKILL_MAX}
                  step={0.1}
                  format={(value) => value.toFixed(1)}
                  onChange={(defaultSkill) => set({ defaultSkill })}
                />
              </div>
            )}
            <Button
              size="lg"
              full
              variant="secondary"
              data-testid="host-lock"
              onClick={() => {
                setHostUnlocked(false);
                if (settings.hostSkills) set({ hostSkills: false });
              }}
            >
              Lock host controls
            </Button>
          </>
        ) : (
          <>
            <p className="mb-2 text-base font-semibold text-muted">
              Enter the 3-digit host PIN to view or change hidden skills. A wrong PIN stays locked.
            </p>
            <Input
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={hostPin}
              aria-label="Host PIN"
              placeholder="•••"
              data-testid="host-pin"
              className="text-center text-3xl tracking-[0.5em]"
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
                setPinWrong(false);
                if (digits.length < 3) {
                  setHostPin(digits);
                  return;
                }
                if (digits === HOST_PIN) {
                  setHostPin("");
                  setHostUnlocked(true);
                  return;
                }
                setHostPin("");
                setPinWrong(true);
              }}
            />
            {pinWrong && (
              <p className="mt-2 rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold" data-testid="host-pin-error">
                Wrong PIN. Host skills stay locked.
              </p>
            )}
          </>
        )}
      </section>
      <section className="rounded-2xl border-2 border-ink bg-card p-3">
        <h2 className="text-lg font-black">Backup</h2>
        <p className="mb-2 text-base font-semibold text-muted">
          Download players, settings, and past sessions, or restore a file onto this phone.
        </p>
        <div className="flex flex-col gap-2">
          <Button size="lg" full variant="secondary" data-testid="export-backup" onClick={download}>
            Export backup
          </Button>
          <Button size="lg" full data-testid="import-backup" onClick={() => fileRef.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="import-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setImportError(null);
              void file.text().then((text) => {
                let parsed: unknown;
                try {
                  parsed = JSON.parse(text) as unknown;
                } catch {
                  setImportError("That file isn't valid JSON.");
                  return;
                }
                const result = parseBackup(parsed);
                if (!result.ok) {
                  setImportError(result.error);
                  return;
                }
                setPending(result.backup);
              });
            }}
          />
        </div>
        {importError && <p className="mt-2 rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold">{importError}</p>}
      </section>
      <Sheet
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title="Restore this backup?"
        description={
          pending
            ? `This replaces what is on this phone with ${pending.players.length} players and ${pending.past.length} past sessions.`
            : undefined
        }
      >
        <Button
          size="lg"
          full
          variant="clay"
          data-testid="confirm-restore"
          onClick={() => {
            if (!pending) return;
            dispatch({
              type: "import-backup",
              players: pending.players,
              settings: pending.settings,
              past: pending.past,
              active: pending.active,
              checkedIn: pending.checkedIn,
              skillLog: pending.skillLog,
            });
            setPending(null);
          }}
        >
          Restore backup
        </Button>
      </Sheet>
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
