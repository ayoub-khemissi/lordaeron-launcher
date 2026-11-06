import { BookOpen, Play, Settings, Sparkles } from "lucide-react";

import { useI18n } from "../i18n";
import { useLauncher } from "../lib/store";

export type Screen = "play" | "graphics" | "guide" | "settings";

const ITEMS = [
  { id: "play", icon: Play, label: "nav.play" },
  { id: "graphics", icon: Sparkles, label: "nav.graphics" },
  { id: "guide", icon: BookOpen, label: "nav.guide" },
  { id: "settings", icon: Settings, label: "nav.settings" },
] as const;

export function Sidebar({ screen, onScreen }: { screen: Screen; onScreen: (s: Screen) => void }) {
  const { t } = useI18n();
  const { status } = useLauncher();

  return (
    <nav className="flex w-[92px] shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-black/30 py-4">
      {ITEMS.map(({ id, icon: Icon, label }) => {
        const active = screen === id;

        return (
          <button
            key={id}
            aria-current={active ? "page" : undefined}
            className={`group relative flex w-[76px] flex-col items-center gap-1.5 rounded-xl py-3 text-[11px] font-medium transition ${
              active ? "bg-wow-gold/12 text-wow-gold-light" : "text-white/55 hover:bg-white/5 hover:text-white/90"
            }`}
            onClick={() => onScreen(id)}
          >
            {active && <span className="absolute left-[-8px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-wow-gold" />}
            <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
            {t(label)}
          </button>
        );
      })}
      <div className="mt-auto text-center text-[10px] leading-tight text-white/30">
        v{status?.launcherVersion}
      </div>
    </nav>
  );
}
