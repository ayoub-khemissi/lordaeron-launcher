import type { Condition, PresetDef, Presets, Schema, SettingDef } from "./types";

export type Value = number | boolean | string;

// The ini's text as the setting's value; a value the engine would not read falls back to the default
export function parse(def: SettingDef, raw: string | undefined): Value {
  if (raw === undefined) return def.default;
  const text = raw.trim();

  switch (def.type) {
    case "bool":
      return !(text === "0" || text === "" || text.toLowerCase() === "false");
    case "float":
    case "int":
    case "choice":
    case "viewDistance": {
      const n = Number(text);

      return Number.isFinite(n) ? n : def.default;
    }
    default:
      return text;
  }
}

// The value as the ini writes it: 1/0, whole numbers without a point, decimals without trailing zeros
export function serialize(def: SettingDef, value: Value): string {
  switch (def.type) {
    case "bool":
      return value ? "1" : "0";
    case "int":
    case "choice":
      return String(Math.round(Number(value)));
    case "float":
    case "viewDistance": {
      const decimals = Math.max(0, Math.min(4, (def.decimals ?? 2) + 1));

      return String(Number(Number(value).toFixed(decimals)));
    }
    default:
      return String(value);
  }
}

export function same(def: SettingDef, a: Value, b: Value): boolean {
  if (def.type === "float" || def.type === "viewDistance") {
    const step = 10 ** -((def.decimals ?? 2) + 1);

    return Math.abs(Number(a) - Number(b)) < step / 2 + 1e-9;
  }

  return a === b || String(a) === String(b);
}

// Whether a row is live, from the settings that grey it out in the game's window (enabledWhen)
export function blockers(def: SettingDef, values: Record<string, Value>): Condition[] {
  return (def.enabledWhen ?? []).filter((c) => {
    const v = values[c.key];

    if (c.is !== undefined) return Boolean(v) !== c.is;
    if (c.not !== undefined) return Number(v) === c.not;

    return false;
  });
}

export function valuesOf(schema: Schema, raw: Record<string, string>): Record<string, Value> {
  return Object.fromEntries(Object.entries(schema.settings).map(([k, def]) => [k, parse(def, raw[k])]));
}

// The keys any preset sets: a preset is "chosen" while all of them hold its values, whatever else was changed
export function presetKeys(presets: Presets): string[] {
  return [...new Set(presets.presets.flatMap((p) => Object.keys(p.values)))];
}

export function presetValue(schema: Schema, preset: PresetDef, key: string): Value {
  return preset.values[key] ?? schema.settings[key].default;
}

export function currentPreset(schema: Schema, presets: Presets, values: Record<string, Value>): string | null {
  const keys = presetKeys(presets).filter((k) => schema.settings[k]);
  const match = presets.presets.find((p) =>
    keys.every((k) => same(schema.settings[k], values[k], presetValue(schema, p, k))),
  );

  return match?.id ?? null;
}

export function presetChanges(schema: Schema, presets: Presets, preset: PresetDef): Record<string, string> {
  return Object.fromEntries(
    presetKeys(presets)
      .filter((k) => schema.settings[k])
      .map((k) => [k, serialize(schema.settings[k], presetValue(schema, preset, k))]),
  );
}

export function changedKeys(schema: Schema, values: Record<string, Value>): string[] {
  return Object.entries(schema.settings)
    .filter(([k, def]) => !same(def, values[k], def.default))
    .map(([k]) => k);
}

// Settings the game reads only when it starts (CoAVolFog.ini's header); FarClipMax only when it is lifted from 0
export const RESTART_KEYS = new Set(["Enable", "EngineHooks", "Overlay"]);

export function displayNumber(def: SettingDef, value: number, language: string): string {
  // the game's own words for a yard: "yd" in English, the metre's symbol in the other clients
  const yard = language === "en" ? "yd" : language === "ru" ? "м" : "m";
  const unit =
    def.unit === "yd" ? ` ${yard}` : def.unit === "yd/s" ? ` ${yard}/s` : def.unit === "°" ? "°" : def.unit ? ` ${def.unit}` : "";

  return (
    new Intl.NumberFormat(language, {
      maximumFractionDigits: def.decimals ?? 2,
      minimumFractionDigits: def.type === "float" ? Math.min(def.decimals ?? 2, 2) : 0,
    }).format(value) + unit
  );
}
