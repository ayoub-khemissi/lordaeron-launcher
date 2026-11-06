import { Chip } from "@heroui/react";
import { Check, Gauge, Scale, Sparkles } from "lucide-react";

import { useI18n } from "../i18n";

const ICONS = { performance: Gauge, balanced: Scale, ultra: Sparkles } as Record<string, typeof Gauge>;

export function PresetCard({ id, active, isDefault, onSelect, disabled }: { id: string; active: boolean; isDefault: boolean; onSelect: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const Icon = ICONS[id] ?? Sparkles;

  return (
    <button
      className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-wow-gold/80 bg-wow-gold/10 shadow-[0_0_30px_rgba(199,156,62,0.18)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
      }`}
      disabled={disabled}
      onClick={onSelect}
    >
      <div className="flex w-full items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-wow-gold text-black" : "bg-white/8 text-wow-gold-light"}`}>
          <Icon size={18} />
        </span>
        <span className="font-heading text-lg text-white/95">{t(`preset.${id}` as "preset.ultra")}</span>
        {isDefault && (
          <Chip className="ml-auto h-5 text-[10px]" size="sm" variant="flat">
            {t("graphics.default")}
          </Chip>
        )}
      </div>
      <p className="text-[12.5px] leading-snug text-white/55">{t(`preset.${id}.help` as "preset.ultra.help")}</p>
      {active && (
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-wow-gold text-black shadow">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
