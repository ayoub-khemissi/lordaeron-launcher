import { Code2, Lightbulb } from "lucide-react";
import { useMemo } from "react";

import { HotkeyParts } from "../components/HotkeyInput";
import { PageHeader } from "../components/PageHeader";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { sitePage } from "../lib/site";
import { useLauncher } from "../lib/store";

// our Lumenveil build's source: the archive published beside it on lordaeron.eu, else the site's launcher page that links it
const lordaeronSource = (url?: string | null) => (url?.startsWith("https://lordaeron.eu/") ? url : null);

// The keys as the player's CoAVolFog.ini sets them (the defaults until Lumenveil is installed)
const KEYS = [
  { id: "toggle", key: "ToggleKey", fallback: "Ctrl+F12" },
  { id: "overlay", key: "OverlayKey", fallback: "Ctrl+F7" },
  { id: "lantern", key: "LanternKey", fallback: "Ctrl+F6" },
  { id: "relief", key: "ReliefKey", fallback: "Ctrl+F4" },
  { id: "spot", key: "SpotKey", fallback: "Ctrl+F5" },
  { id: "region", key: "RegionKey", fallback: "Ctrl+F3" },
] as const;

const TIPS = ["guide.tip.live", "guide.tip.slow", "guide.tip.off", "guide.tip.screens"] as const;

export function GuideScreen() {
  const { t, language } = useI18n();
  const { settings, status } = useLauncher();
  const keys = useMemo(
    () => Object.fromEntries(KEYS.map((k) => [k.id, settings?.values[k.key] || k.fallback])),
    [settings],
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader subtitle={t("guide.subtitle")} title={t("guide.title")} />
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-10">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {KEYS.map((k, i) => (
          <div
            key={k.id}
            className={`rounded-2xl border p-5 ${
              i < 2 ? "border-wow-gold/40 bg-wow-gold/[0.07]" : "border-white/8 bg-white/[0.03]"
            }`}
          >
            <HotkeyParts value={keys[k.id]} />
            <h3 className="mt-3 font-heading text-lg text-white/95">{t(`guide.${k.id}.title` as "guide.toggle.title")}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t(`guide.${k.id}.text` as "guide.toggle.text")}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-9 flex items-center gap-2 font-heading text-xl text-white/90">
        <Lightbulb className="text-wow-gold" size={18} /> {t("guide.tips")}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-3 text-[13.5px] text-white/65">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-wow-gold" />
            {t(tip)}
          </li>
        ))}
      </ul>

      <div className="mt-10 flex items-start gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-[12.5px] leading-relaxed text-white/45">
        <p className="flex-1">{t("guide.credits")}</p>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            className="flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 px-3 text-white/70 transition hover:border-wow-gold/50 hover:text-wow-gold-light"
            onClick={() => api.open("url", "https://github.com/lumenveil/Lumenveil")}
          >
            <Code2 size={14} /> {t("guide.official")}
          </button>
          <button
            className="flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 px-3 text-white/70 transition hover:border-wow-gold/50 hover:text-wow-gold-light"
            onClick={() => api.open("url", lordaeronSource(status?.lumenveil.available?.source) ?? sitePage(language, "/launcher"))}
          >
            <Code2 size={14} /> {t("guide.source")}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
