import type { Store } from "../model.ts";
import { reduce, type Action, type StepResult } from "./session.ts";

/** Actions that search lineups. Scores and navigation stay on the UI thread. */
export function actionReplans(action: Action, store: Store): boolean {
  switch (action.type) {
    case "start-session":
    case "reshuffle":
    case "add-rounds":
    case "finish-round":
    case "arrive":
    case "depart":
    case "swap":
      return true;
    case "add-player":
      return action.arriveAfter && !!store.active;
    case "update-player":
      return !!store.active?.attendance.some((att) => att.playerId === action.playerId && att.leftAtRound === null);
    case "set-settings":
      return !!store.active && action.patch.courts !== undefined && action.patch.courts !== store.active.rules.courts;
    default:
      return false;
  }
}

export function runPlanned(store: Store, action: Action, now: number): Promise<StepResult> {
  if (typeof Worker === "undefined") return Promise.resolve(reduce(store, action, now));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: StepResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), { type: "module" });
      const timer = setTimeout(() => {
        worker.terminate();
        finish(reduce(store, action, now));
      }, 12_000);
      worker.onmessage = (event: MessageEvent<StepResult>) => {
        clearTimeout(timer);
        worker.terminate();
        finish(event.data);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        finish(reduce(store, action, now));
      };
      worker.postMessage({ store, action, now });
    } catch {
      finish(reduce(store, action, now));
    }
  });
}
