import { Chip, Input, Select, SelectItem, Slider, Switch, Tooltip } from "@heroui/react";
import { Info, Lock, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import { blockers, displayNumber, RESTART_KEYS, same, serialize, type Value } from "../lib/settings";
import type { Schema, SettingDef } from "../lib/types";
import { useSettingWords } from "../lib/words";

import { HotkeyInput } from "./HotkeyInput";

interface Props {
  schema: Schema;
  id: string;
  values: Record<string, Value>;
  onChange: (values: Record<string, string>) => void;
  compact?: boolean;
}

// slider position (0..1) <-> value, on a log scale for the settings the game's window shows that way
const LOG_STEPS = 1000;
const toPosition = (def: SettingDef, v: number) =>
  def.scale === "log"
    ? (Math.log(Math.max(v, def.min!) / def.min!) / Math.log(def.max! / def.min!)) * LOG_STEPS
    : v;
const fromPosition = (def: SettingDef, p: number) =>
  def.scale === "log" ? def.min! * Math.pow(def.max! / def.min!, p / LOG_STEPS) : p;

function stepOf(def: SettingDef) {
  if (def.step) return def.step;
  if (def.type === "int") return 1;

  return 10 ** -(def.decimals ?? 2);
}

export function SettingRow({ schema, id, values, onChange, compact }: Props) {
  const { t, language } = useI18n();
  const words = useSettingWords(schema);
  const def = schema.settings[id];
  const value = values[id];
  const modified = !same(def, value, def.default);
  const blocked = blockers(def, values);
  const [open, setOpen] = useState(false);
  const set = (v: Value) => onChange({ [id]: serialize(def, v) });
  const help = words.help(id);
  const restart = RESTART_KEYS.has(id);
  const wide = def.type === "zoneList" || def.type === "zoneFactors" || def.type === "text";

  const defaultText =
    def.type === "bool"
      ? def.default
        ? "✓"
        : "✗"
      : def.type === "choice"
        ? words.option(id, Number(def.default))
        : def.type === "float" || def.type === "int"
          ? displayNumber(def, Number(def.default), language)
          : def.type === "viewDistance"
            ? Number(def.default) === 0
              ? t("graphics.viewOff")
              : displayNumber(def, Number(def.default), language)
            : String(def.default).slice(0, 24);

  return (
    <div
      className={`group rounded-xl px-4 transition ${compact ? "py-3" : "py-3.5"} ${
        blocked.length ? "opacity-45" : "hover:bg-white/[0.03]"
      }`}
    >
      <div className={`flex gap-6 ${wide ? "flex-col gap-2" : "items-center"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-white/90">{words.label(id)}</span>
            {modified && (
              <Tooltip content={t("graphics.modified")} delay={300}>
                <span className="h-1.5 w-1.5 rounded-full bg-wow-gold" />
              </Tooltip>
            )}
            {restart && (
              <Chip className="h-5 text-[10px]" color="warning" size="sm" variant="flat">
                {t("graphics.restart")}
              </Chip>
            )}
          </div>
          {help && (
            <p
              className={`mt-0.5 cursor-pointer text-[12.5px] leading-snug text-white/45 ${open ? "" : "line-clamp-2"}`}
              title={open ? undefined : help}
              onClick={() => setOpen(!open)}
            >
              {help}
            </p>
          )}
          {blocked.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11.5px] text-warning-400">
              <Lock size={11} />
              {blocked
                .map((c) =>
                  t(c.is === false ? "graphics.needsNot" : c.not !== undefined ? "graphics.needsChoice" : "graphics.needs", {
                    setting: words.label(c.key),
                  }),
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <div className={`flex shrink-0 items-center gap-2 ${wide ? "w-full" : ""}`}>
          <Control def={def} id={id} set={set} value={value} />
          <Tooltip content={t("graphics.reset", { value: defaultText })} delay={300}>
            <button
              aria-label={t("graphics.reset", { value: defaultText })}
              className={`rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-wow-gold-light ${
                modified ? "visible" : "invisible"
              }`}
              onClick={() => set(def.default)}
            >
              <RotateCcw size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function Control({ def, id, value, set }: { def: SettingDef; id: string; value: Value; set: (v: Value) => void }) {
  const { t } = useI18n();
  const schemaWords = useSettingWordsFor(id);

  switch (def.type) {
    case "bool":
      return <Switch aria-label={id} color="primary" isSelected={Boolean(value)} size="sm" onValueChange={set} />;
    case "choice":
      return (
        <Select
          disableAnimation
          aria-label={id}
          className="w-64"
          classNames={{ trigger: "bg-white/5 data-[hover=true]:bg-white/10" }}
          disallowEmptySelection
          selectedKeys={[String(value)]}
          size="sm"
          onSelectionChange={(keys) => {
            const k = [...keys][0];

            if (k !== undefined) set(Number(k));
          }}
        >
          {(def.options ?? []).map((o) => (
            <SelectItem key={String(o.value)}>{schemaWords(o.value) ?? o.label}</SelectItem>
          ))}
        </Select>
      );
    case "float":
    case "int":
      return <NumberSlider def={def} id={id} set={set} value={Number(value)} />;
    case "viewDistance": {
      const lifted = Number(value) > 0;

      return (
        <div className="flex items-center gap-3">
          <Switch
            aria-label={id}
            color="primary"
            isSelected={lifted}
            size="sm"
            onValueChange={(on) => set(on ? def.max! : 0)}
          />
          {lifted ? (
            <NumberSlider def={{ ...def, type: "float" }} id={id} set={set} value={Number(value)} />
          ) : (
            <span className="w-[306px] text-sm text-white/50">{t("graphics.viewOff")}</span>
          )}
        </div>
      );
    }
    case "hotkey":
      return <HotkeyInput value={String(value)} onChange={set} />;
    default:
      return <TextSetting value={String(value)} onCommit={set} />;
  }
}

// the choices' translated names, by value
function useSettingWordsFor(id: string) {
  const { settingWords } = useI18n();

  return (value: number) => settingWords.settings?.[id]?.options?.[String(value)];
}

function TextSetting({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  return (
    <div className="w-full">
      <Input
        classNames={{ input: "font-mono text-xs", inputWrapper: "bg-white/5" }}
        size="sm"
        value={text}
        onBlur={() => text !== value && onCommit(text.replace(/\s+/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onValueChange={setText}
      />
      <p className="mt-1 flex items-center gap-1 text-[11px] text-white/35">
        <Info size={11} /> {t("graphics.zoneHint")}
      </p>
    </div>
  );
}

function NumberSlider({ def, id, value, set }: { def: SettingDef; id: string; value: number; set: (v: Value) => void }) {
  const { language } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const cancel = useRef(false);
  const lo = def.min ?? 0;
  const hi = def.max ?? 1;
  const log = def.scale === "log";
  const step = stepOf(def);
  const shown = Math.min(Math.max(value, lo), hi);

  // the typed text, in the plain form the field shows while focused ("0.5"); Escape leaves the value as it was
  const commit = () => {
    const raw = text;

    setText(null);
    if (cancel.current || raw === null || raw.trim() === "") {
      cancel.current = false;

      return;
    }
    const n = Number(raw.trim().replace(",", "."));

    if (!Number.isFinite(n)) return;
    const min = def.engineMin ?? lo;
    const max = def.engineMax ?? hi;

    set(Math.min(Math.max(n, min), max));
  };

  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label={id}
        className="w-56"
        classNames={{ filler: "bg-gradient-to-r from-wow-gold-dark to-wow-gold", thumb: "bg-wow-gold-light after:bg-wow-gold" }}
        maxValue={log ? LOG_STEPS : hi}
        minValue={log ? 0 : lo}
        size="sm"
        step={log ? 1 : step}
        value={toPosition(def, shown)}
        onChange={(v) => {
          const p = Array.isArray(v) ? v[0] : v;
          const n = fromPosition(def, p);

          set(def.type === "int" ? Math.round(n) : Number(n.toFixed(def.decimals ?? 2)));
        }}
      />
      <input
        aria-label={id}
        className="w-[74px] rounded-md border border-white/10 bg-white/5 px-2 py-1 text-right text-[13px] tabular-nums text-white/85 outline-none focus:border-wow-gold/60"
        value={text ?? displayNumber(def, value, language)}
        onBlur={commit}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setText(String(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            cancel.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
