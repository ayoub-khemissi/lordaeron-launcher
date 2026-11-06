import { HeroUIProvider, ToastProvider } from "@heroui/react";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

// A launcher, not a web page: no browser menu on right click (text fields keep theirs, for copy and paste), and none
// of the browser's keys (reload, print, find, source, zoom)
const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName));

document.addEventListener("contextmenu", (e) => {
  if (!editable(e.target)) e.preventDefault();
});
document.addEventListener(
  "keydown",
  (e) => {
    const k = e.key.toLowerCase();
    const browserKey =
      k === "f5" ||
      k === "f7" ||
      (e.ctrlKey && ["r", "p", "f", "g", "u", "j", "s", "+", "-", "=", "0"].includes(k)) ||
      (e.ctrlKey && e.shiftKey && ["i", "c"].includes(k));

    if (browserKey) e.preventDefault();
  },
  true,
);
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ToastProvider placement="bottom-right" toastOffset={16} />
      <main className="dark h-full text-foreground">
        <App />
      </main>
    </HeroUIProvider>
  </React.StrictMode>,
);
