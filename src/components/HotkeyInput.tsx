import { Kbd } from "@heroui/react";
import { useEffect, useState } from "react";

import { useI18n } from "../i18n";

// The keys CoAVolFog.ini takes (config.cpp ParseHotkey): F1-F24, a few named keys, a letter or a digit, with Ctrl+, Shift+, Alt+
const NAMED: Record<string, string> = {
  Insert: "Insert",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Pause: "Pause",
  ScrollLock: "ScrollLock",
};

export function keyName(e: KeyboardEvent): string | null {
  if (/^F([1-9]|1\d|2[0-4])$/.test(e.key)) return e.key;
  if (NAMED[e.key]) return NAMED[e.key];
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);

  return null;
}

export function HotkeyParts({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-1">
      {value.split("+").map((part, i) => (
        <Kbd key={i} classNames={{ base: "bg-white/10 text-white/90 shadow-none border border-white/10" }}>
          {part}
        </Kbd>
      ))}
    </span>
  );
}

export function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);

        return;
      }
      const key = keyName(e);

      if (!key) return; // a modifier alone, or a key the game's ini cannot name
      const combo = [e.ctrlKey && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt", key].filter(Boolean).join("+");

      onChange(combo);
      setListening(false);
    };

    window.addEventListener("keydown", onKey, true);

    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, onChange]);

  return (
    <button
      className={`flex h-9 min-w-40 items-center justify-center rounded-lg border px-3 text-sm transition ${
        listening ? "border-wow-gold bg-wow-gold/10 text-wow-gold-light" : "border-white/10 bg-white/5 hover:border-white/25"
      }`}
      onBlur={() => setListening(false)}
      onClick={() => setListening(true)}
    >
      {listening ? t("graphics.pressKey") : <HotkeyParts value={value} />}
    </button>
  );
}
