import { createContext, useContext } from "react";
import type { Action } from "./engine/session.ts";
import type { Store } from "./model.ts";

export interface AppApi {
  store: Store;
  dispatch: (action: Action) => void;
  error: string | null;
  notice: string | null;
  planning: boolean;
  /** True only after PIN 000 this visit. Refresh and Lock both hide skill numbers. */
  hostUnlocked: boolean;
  setHostUnlocked: (value: boolean) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error("App context is missing.");
  return api;
}
