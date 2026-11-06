// Fails when a language the launcher offers misses a word: its interface (src/i18n/<lang>.ts) or a setting's label,
// help, choice, section or group (src/i18n/settings/<lang>.json). A half-translated language is never shipped.
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const keys = (ts) => [...ts.matchAll(/^\s*"([\w.]+)":/gm)].map((m) => m[1]);
const offered = [...read("src/i18n/index.tsx").matchAll(/\{ id: "(\w+)", name: "[^"]+", ready: true \}/g)].map((m) => m[1]);
const schema = JSON.parse(read("src/assets/schema.json"));
const english = keys(read("src/i18n/en.ts"));
let missing = 0;
const miss = (lang, what) => {
  missing++;
  if (missing < 60) console.error(`${lang}: missing ${what}`);
};

for (const lang of offered) {
  if (lang !== "en") {
    const have = new Set(keys(read(`src/i18n/${lang}.ts`)));
    for (const k of english) if (!have.has(k)) miss(lang, k);
  }
  const words = JSON.parse(read(`src/i18n/settings/${lang}.json`));
  for (const s of schema.sections) if (!words.sections?.[s.id]) miss(lang, `section ${s.id}`);
  for (const [key, def] of Object.entries(schema.settings)) {
    if (def.group && !words.groups?.[def.group]) miss(lang, `group ${def.group}`);
    if (lang === "en") continue; // English falls back on the schema's own words
    const w = words.settings?.[key];
    if (!w?.label) miss(lang, `${key}.label`);
    if (!w?.help) miss(lang, `${key}.help`);
    for (const o of def.options ?? []) if (!w?.options?.[o.value]) miss(lang, `${key}.options.${o.value}`);
  }
}
if (missing) {
  console.error(`${missing} missing translation(s)`);
  process.exit(1);
}
console.log(`complete: ${offered.join(", ")}`);
