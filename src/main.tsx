import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element.");

if (typeof navigator !== "undefined" && navigator.storage?.persist) {
  void navigator.storage.persist();
}
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* Offline caching is optional when the browser refuses the worker. */
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
