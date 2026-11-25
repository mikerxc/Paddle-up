import type { Action } from "./session.ts";
import { reduce } from "./session.ts";
import type { Store } from "../model.ts";

interface Request {
  store: Store;
  action: Action;
  now: number;
}

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: unknown) => void;
};

scope.onmessage = (event) => {
  const { store, action, now } = event.data;
  scope.postMessage(reduce(store, action, now));
};
