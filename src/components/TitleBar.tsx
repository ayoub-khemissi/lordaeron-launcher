import { Tooltip } from "@heroui/react";
import { Minus, RefreshCw, X } from "lucide-react";

import { useI18n } from "../i18n";
import { inApp } from "../lib/api";

import { AccountMenu } from "./AccountMenu";

async function windowAction(action: "minimize" | "close") {
  if (!inApp) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  if (action === "close") await getCurrentWindow().close();
  else await getCurrentWindow().minimize();
}

// A newer launcher: in gold, its arrows turning, so that nobody stays on an old one; a click installs it
function UpdateButton({ version, onUpdate }: { version: string; onUpdate: () => void }) {
  const { t } = useI18n();

  return (
    <Tooltip content={t("titleBar.updateHint", { version })} delay={200} placement="bottom">
      <button
        className="relative mr-2 flex h-7 items-center gap-1.5 rounded-full bg-gradient-to-r from-wow-gold-dark via-wow-gold to-wow-gold-light px-3 text-[12px] font-semibold text-black shadow-[0_0_14px_rgba(199,156,62,0.55)] transition hover:brightness-110"
        onClick={onUpdate}
      >
        <span className="absolute inset-0 animate-[ping_2.2s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-wow-gold/40" />
        <RefreshCw className="relative animate-[spin_2.5s_linear_infinite]" size={14} strokeWidth={2.5} />
        <span className="relative">{t("titleBar.update")}</span>
      </button>
    </Tooltip>
  );
}

// The window has no Windows frame: this bar moves it, and holds its two buttons
export function TitleBar({ update, onUpdate }: { update: string | null; onUpdate: () => void }) {
  return (
    <div className="relative z-40 flex h-9 shrink-0 items-center border-b border-white/5 bg-black/40" data-tauri-drag-region>
      <div className="pointer-events-none flex items-center gap-2 pl-3">
        <img alt="" className="h-5 w-5" src="/logo.webp" />
        <span className="font-heading text-[13px] tracking-[0.2em] text-wow-gold-light">LORDAERON</span>
      </div>
      <div className="ml-auto flex h-full items-center">
        {update && <UpdateButton version={update} onUpdate={onUpdate} />}
        <AccountMenu />
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
      </div>
    </div>
  );
}
