import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import en, { type MessageKey, type Messages } from "./en";

// The site's languages (lordaeron-front/messages). A language's file lists what it has translated; the rest is English.
// ready: offered in the launcher; a language is offered only once every word of it is translated
// (scripts/check-i18n.mjs, run by the build). Until then its players get English, never a mix.
export const ALL_LANGUAGES = [
  { id: "en", name: "English", ready: true },
  { id: "fr", name: "Français", ready: true },
  { id: "de", name: "Deutsch", ready: false },
  { id: "es", name: "Español", ready: false },
  { id: "it", name: "Italiano", ready: false },
  { id: "pl", name: "Polski", ready: false },
  { id: "pt", name: "Português", ready: false },
  { id: "ru", name: "Русский", ready: false },
] as const;

export const LANGUAGES = ALL_LANGUAGES.filter((l) => l.ready);

export type Language = (typeof ALL_LANGUAGES)[number]["id"];

const loaders: Record<Language, () => Promise<{ default: Partial<Messages> }>> = {
  en: async () => ({ default: en }),
  fr: () => import("./fr"),
  de: () => import("./de"),
  es: () => import("./es"),
  it: () => import("./it"),
  pl: () => import("./pl"),
  pt: () => import("./pt"),
  ru: () => import("./ru"),
};

// The settings' own words (labels, help, choices, sections), by language; English is the schema itself
export interface SettingWords {
  sections?: Record<string, string>;
  groups?: Record<string, string>;
  settings?: Record<string, { label?: string; help?: string; options?: Record<string, string> }>;
}

const settingLoaders: Partial<Record<Language, () => Promise<{ default: SettingWords }>>> = {
  en: () => import("./settings/en.json"),
  fr: () => import("./settings/fr.json"),
};

export function systemLanguage(): Language {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const id = tag.slice(0, 2).toLowerCase();

    if (LANGUAGES.some((l) => l.id === id)) return id as Language;
  }

  return "en";
}

type Vars = Record<string, string | number>;

const UNITS: Partial<Record<Language, [string, string]>> = { fr: ["Ko", "Mo"], ru: ["КБ", "МБ"], pl: ["kB", "MB"] };

// "{count, plural, one {# update} other {# updates}}" and "{name}": the two forms the messages use
export function format(message: string, vars: Vars | undefined, language: string): string {
  if (!vars) return message;
  const rules = new Intl.PluralRules(language);
  let out = "";
  let i = 0;

  while (i < message.length) {
    const open = message.indexOf("{", i);

    if (open < 0) {
      out += message.slice(i);
      break;
    }
    out += message.slice(i, open);
    let depth = 0;
    let close = open;

    for (; close < message.length; close++) {
      if (message[close] === "{") depth++;
      else if (message[close] === "}" && --depth === 0) break;
    }
    const body = message.slice(open + 1, close);
    const plural = body.match(/^(\w+),\s*plural,\s*([\s\S]*)$/);

    if (plural) {
      const n = Number(vars[plural[1]] ?? 0);
      const forms: Record<string, string> = {};
      const formPattern = /(\w+|=\d+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
      let m: RegExpExecArray | null;

      while ((m = formPattern.exec(plural[2]))) forms[m[1]] = m[2];
      const chosen = forms[`=${n}`] ?? forms[rules.select(n)] ?? forms.other ?? "";

      out += format(chosen.replace(/#/g, new Intl.NumberFormat(language).format(n)), vars, language);
    } else {
      out += body in vars ? String(vars[body]) : `{${body}}`;
    }
    i = close + 1;
  }

  return out;
}

interface I18n {
  language: Language;
  t: (key: MessageKey, vars?: Vars) => string;
  settingWords: SettingWords;
  bytes: (n: number) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const [messages, setMessages] = useState<Partial<Messages>>(en);
  const [settingWords, setSettingWords] = useState<SettingWords>({});

  useEffect(() => {
    let live = true;

    loaders[language]()
      .then((m) => live && setMessages(m.default))
      .catch(() => live && setMessages(en));
    const words = settingLoaders[language];

    if (words) words().then((m) => live && setSettingWords(m.default)).catch(() => live && setSettingWords({}));
    else setSettingWords({});
    document.documentElement.lang = language;

    return () => {
      live = false;
    };
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      settingWords,
      t: (key, vars) => format(messages[key] ?? en[key] ?? key, vars, language),
      bytes: (n) => {
        // each language's own symbols: ko/Mo in French, КБ/МБ in Russian
        const [kb, mb] = UNITS[language] ?? ["kB", "MB"];

        return n >= 1_000_000
          ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(n / 1_000_000)} ${mb}`
          : `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(Math.max(1, n / 1000))} ${kb}`;
      },
    }),
    [language, messages, settingWords],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);

  if (!value) throw new Error("useI18n outside I18nProvider");

  return value;
}
