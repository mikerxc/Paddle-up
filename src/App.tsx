import { useEffect, useRef, useState } from "react";
import { AppContext } from "./app-context.tsx";
import { actionReplans, runPlanned } from "./engine/planner-client.ts";
import { reduce, type Action, type StepResult } from "./engine/session.ts";
import { playRoundCue, unlockAudio } from "./lib/sound.ts";
import { loadStore, saveStore } from "./storage.ts";
import { CheckInScreen } from "./screens/CheckInScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { PlayScreen } from "./screens/PlayScreen.tsx";
import { EditPlayerScreen, RosterScreen } from "./screens/RosterScreen.tsx";
import { LogScreen, PastScreen, StatsScreen } from "./screens/ReviewScreens.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";
import { NextUpScreen } from "./screens/NextUpScreen.tsx";

export default function App() {
  const [store, setStore] = useState(loadStore);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [hostUnlocked, setHostUnlocked] = useState(false);
  const [flash, setFlash] = useState(false);
  const storeRef = useRef(store);
  const planningRef = useRef(false);
  const queueRef = useRef<Action[]>([]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const applyResult = (result: StepResult) => {
    storeRef.current = result.store;
    setStore(result.store);
    setError(result.error ?? null);
    if (result.notice) setNotice(result.notice);
    if (result.cue) {
      playRoundCue(result.store.settings);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 220);
    }
    setSaveFailed(!saveStore(result.store));
  };

  const runAction = (action: Action) => {
    const current = storeRef.current;
    if (!actionReplans(action, current)) {
      applyResult(reduce(current, action));
      const next = queueRef.current.shift();
      if (next) runAction(next);
      return;
    }
    planningRef.current = true;
    setPlanning(true);
    const now = Date.now();
    void runPlanned(current, action, now).then((result) => {
      applyResult(result);
      planningRef.current = false;
      setPlanning(false);
      const next = queueRef.current.shift();
      if (next) runAction(next);
    });
  };

  const dispatch = (action: Action) => {
    if (planningRef.current) {
      queueRef.current.push(action);
      return;
    }
    runAction(action);
  };

  const view = store.view.name;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  return (
    <AppContext.Provider value={{ store, dispatch, error, notice, planning, hostUnlocked, setHostUnlocked }}>
      <div className="min-h-dvh bg-bench text-ink">
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-paper shadow-[0_0_0_2px_#1a140c]" data-screen={view}>
          {planning && (
            <p role="status" data-testid="planning" className="sticky top-0 z-40 bg-ink px-3 py-2 text-center text-sm font-black text-paper">
              Planning the next rounds…
            </p>
          )}
          {(error || notice || saveFailed) && (
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[480px] flex-col gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {saveFailed && (
                <p role="alert" className="rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold">
                  This phone couldn't save. Free a little storage and try the last tap again.
                </p>
              )}
              {error && (
                <p role="alert" className="rounded-xl border-2 border-ink bg-bad px-3 py-3 font-bold">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-xl border-2 border-ink bg-ball px-3 py-3 font-bold">
                  {notice}
                </p>
              )}
            </div>
          )}
          {view === "home" && <HomeScreen />}
          {view === "roster" && <RosterScreen />}
          {view === "edit" && <EditPlayerScreen />}
          {view === "checkin" && <CheckInScreen />}
          {view === "play" && <PlayScreen />}
          {view === "stats" && <StatsScreen />}
          {view === "log" && <LogScreen />}
          {view === "past" && <PastScreen />}
          {view === "settings" && <SettingsScreen />}
          {view === "nextup" && <NextUpScreen />}
          {flash && <div className="pointer-events-none fixed inset-0 z-50 bg-ball/70" data-testid="round-flash" />}
        </div>
      </div>
    </AppContext.Provider>
  );
}
