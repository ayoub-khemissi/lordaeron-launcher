import { useMemo } from "react";

import { useI18n } from "../i18n";
import type { Schema } from "./types";

// A setting's words in the launcher's language, or the schema's English (the game's own window) when not translated
export function useSettingWords(schema: Schema | null | undefined) {
  const { settingWords } = useI18n();

  return useMemo(
    () => ({
      label: (key: string) => settingWords.settings?.[key]?.label ?? schema?.settings[key]?.label ?? key,
      help: (key: string) => settingWords.settings?.[key]?.help ?? schema?.settings[key]?.help ?? "",
      option: (key: string, value: number) =>
        settingWords.settings?.[key]?.options?.[String(value)] ??
        schema?.settings[key]?.options?.find((o) => o.value === value)?.label ??
        String(value),
      section: (id: string) => settingWords.sections?.[id] ?? schema?.sections.find((s) => s.id === id)?.title ?? id,
      group: (name: string) => settingWords.groups?.[name] ?? name,
    }),
    [schema, settingWords],
  );
}
