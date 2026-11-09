import { Minus, X } from "lucide-react";

import { inApp } from "../lib/api";
import { isMac } from "../lib/platform";

import { AccountMenu } from "./AccountMenu";

async function windowAction(action: "minimize" | "close") {
  if (!inApp) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  if (action === "close") await getCurrentWindow().close();
  else await getCurrentWindow().minimize();
}

// The window has no Windows frame: this bar moves it, and holds its two buttons. On a Mac the system's own three
// buttons sit over its left end (tauri.macos.conf.json), so the bar leaves them room and has no buttons of its own.
export function TitleBar() {
  return (
    <div className="relative z-40 flex h-9 shrink-0 items-center border-b border-white/5 bg-black/40" data-tauri-drag-region>
      <div className={`pointer-events-none flex items-center gap-2 ${isMac ? "pl-[78px]" : "pl-3"}`}>
        <img alt="" className="h-5 w-5" src="/logo.webp" />
        <span className="font-heading text-[13px] tracking-[0.2em] text-wow-gold-light">LORDAERON</span>
      </div>
      <div className="ml-auto flex h-full items-center">
        <AccountMenu />
        {!isMac && (
          <>
            <button
              aria-label="Minimise"
              className="flex h-full w-11 items-center justify-center text-white/60 transition hover:bg-white/10 hover:text-white"
              onClick={() => windowAction("minimize")}
            >
              <Minus size={15} />
            </button>
            <button
              aria-label="Close"
              className="flex h-full w-11 items-center justify-center text-white/60 transition hover:bg-red-600 hover:text-white"
              onClick={() => windowAction("close")}
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
