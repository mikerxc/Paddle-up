import { createContext, useContext } from "react";
import type { Action } from "./engine/session.ts";
import type { Store } from "./model.ts";

export interface AppApi {
  store: Store;
  dispatch: (action: Action) => void;
  error: string | null;
  notice: string | null;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error("App context is missing.");
  return api;
}
