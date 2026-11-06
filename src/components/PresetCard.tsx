import { Check, Gauge, Scale, Sparkles } from "lucide-react";

import { useI18n } from "../i18n";

const ICONS = { performance: Gauge, balanced: Scale, ultra: Sparkles } as Record<string, typeof Gauge>;
// how each preset trades the look for smoothness, out of four
const METERS: Record<string, [number, number]> = { performance: [2, 4], balanced: [3, 3], ultra: [4, 2] };

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[11px] text-white/45">{label}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 w-5 rounded-full ${i <= value ? "bg-wow-gold" : "bg-white/10"}`} />
        ))}
      </span>
    </div>
  );
}

export function PresetCard({
  id,
  active,
  isDefault,
  onSelect,
  disabled,
  compact = false,
}: {
  id: string;
  active: boolean;
  isDefault: boolean;
  onSelect: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const Icon = ICONS[id] ?? Sparkles;
  const [look, speed] = METERS[id] ?? [3, 3];

  return (
    <button
      aria-pressed={active}
      className={`relative flex h-full flex-col items-start rounded-2xl border ${compact ? "p-3" : "p-4"} text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-wow-gold/80 bg-wow-gold/[0.09] shadow-[0_0_30px_rgba(199,156,62,0.16)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
      }`}
      disabled={disabled}
      onClick={onSelect}
    >
      <div className="flex w-full items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            active ? "bg-wow-gold text-black" : "bg-white/[0.07] text-wow-gold-light"
          }`}
        >
          <Icon size={18} />
        </span>
        <span className="font-heading text-[18px] leading-none text-white/95">{t(`preset.${id}` as "preset.ultra")}</span>
        {isDefault && (
          <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-white/55">
            {t("graphics.default")}
          </span>
        )}
      </div>
      {!compact && (
        <p className="mt-3 flex-1 text-[12.5px] leading-snug text-white/55">{t(`preset.${id}.help` as "preset.ultra.help")}</p>
      )}
      <div className={`${compact ? "mt-3" : "mt-4"} space-y-1.5`}>
        <Meter label={t("preset.quality")} value={look} />
        <Meter label={t("preset.speed")} value={speed} />
      </div>
      {active && (
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-wow-gold text-black shadow-lg">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
