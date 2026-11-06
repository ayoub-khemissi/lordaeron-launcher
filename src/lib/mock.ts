import type { GameInfo, Prefs, Progress, SettingsFile, Status } from "./types";

import presets from "../assets/presets.json";
import schema from "../assets/schema.json";

// The backend's stand-in for `pnpm dev` in a browser: the same answers, kept in memory, so the screens can be worked on without
// Windows. Nothing here ships in a code path the app takes (api.ts calls it only outside Tauri).

const firstRun = new URLSearchParams(location.search).has("first");
const prefs: Prefs = {
  gameDir: firstRun ? null : "C:\\Games\\World of Warcraft 3.3.5a",
  realm: "lordaeron",
  channel: "stable",
  language: new URLSearchParams(location.search).get("lang"),
  afterPlay: "minimize",
  lumenveil: true,
  pendingPreset: null,
  downloadLimit: 0,
  autoUpdate: true,
  accountName: null,
};
const values: Record<string, string> = Object.fromEntries(
  Object.entries(schema.settings).map(([k, s]) => [
    k,
    typeof s.default === "boolean" ? (s.default ? "1" : "0") : String(s.default),
  ]),
);
let installed: string | null = firstRun ? null : "0.6.2";
let patchesDone = false;

const game = (path: string): GameInfo => ({
  path,
  ok: !path.includes("Bad"),
  locale: "frFR",
  problem: path.includes("Bad") ? "notWotlk" : null,
});

function status(): Status {
  const realmPatches = prefs.realm === "rimeheart" ? ["patch-W.MPQ"] : ["patch-Z.MPQ"];

  return {
    prefs: { ...prefs },
    game: prefs.gameDir ? game(prefs.gameDir) : null,
    online: true,
    feed: {
      realmlist: "logon.lordaeron.eu",
      patchesUrl: "https://lordaeron.eu/patches/",
      lumenveil: { stable: "", test: "" },
      realms: [
        {
          id: "lordaeron",
          name: "Lordaeron",
          tagline: { en: "Wrath of the Lich King, as it was, polished", fr: "Wrath of the Lich King, fidèle et peaufiné" },
          patches: ["patch-Z.MPQ"],
          image: "realms/lordaeron.webp",
          accent: "gold",
        },
        {
          id: "rimeheart",
          name: "Rimeheart",
          tagline: { en: "WotLK+: new spells, items and a progressive world", fr: "WotLK+ : nouveaux sorts, objets et monde progressif" },
          patches: ["patch-W.MPQ"],
          image: "realms/rimeheart.webp",
          accent: "ice",
        },
      ],
    },
    lumenveil: {
      installed,
      enabled: values.Enable !== "0",
      held: false,
      available: {
        version: "0.7.0",
        date: "2026-11-06 18:00",
        url: "",
        size: 1_400_000,
        sha256: "3b0a5a7072350597156862adb08dc26741ed9dab123b2265bf8a0bbd7cd03697",
        notes: "- The launcher installs and updates Lumenveil.",
        source: "https://github.com/ayoub-khemissi/Lumenveil",
        credits: "Lumenveil by the Lumenveil authors",
      },
    },
    pending: patchesDone
      ? []
      : [
          ...realmPatches.map((name) => ({ kind: "patch" as const, name, size: name === "patch-W.MPQ" ? 24_895_251 : 191_584 })),
          ...(prefs.lumenveil && installed !== "0.7.0"
            ? [{ kind: "lumenveil" as const, name: "Lumenveil", size: 1_400_000, from: installed, to: "0.7.0" }]
            : []),
        ],
    running: false,
    launcherVersion: "0.1.0",
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const steps = status().pending;

  for (let i = 0; i < steps.length; i++) {
    for (let done = 0; done <= 10; done++) {
      const p: Progress = {
        step: steps[i].kind,
        name: steps[i].name,
        done: (steps[i].size * done) / 10,
        total: steps[i].size,
        speed: 3_400_000,
        index: i,
        count: steps.length,
      };

      window.dispatchEvent(new CustomEvent("mock-progress", { detail: p }));
      await wait(120);
    }
  }
  patchesDone = true;
  installed = "0.7.0";
}

function settings(): SettingsFile {
  return { schema: schema as SettingsFile["schema"], presets: presets as SettingsFile["presets"], values: { ...values }, path: "CoAVolFog.ini" };
}

export async function mock(command: string, args?: Record<string, unknown>): Promise<unknown> {
  await wait(150);
  switch (command) {
    case "status":
      return status();
    case "find_games":
      return [game("C:\\Games\\World of Warcraft 3.3.5a"), game("D:\\WoW Bad Cataclysm")];
    case "check_game":
      return game(String(args?.path));
    case "pick_folder":
      return "E:\\Jeux\\WoW WotLK";
    case "set_prefs":
      Object.assign(prefs, args?.prefs);
      if ((args?.prefs as Partial<Prefs>)?.realm) patchesDone = false;

      return status();
    case "play":
      await run();

      return null;
    case "read_settings":
      return settings();
    case "write_settings":
      Object.assign(values, args?.values);

      return settings();
    case "news_page":
      return { posts: [] };
    case "news":
      return fetch("/mock-news.json").then((r) => r.json());
    case "rollback_lumenveil":
      return "0.6.1";
    default:
      return null;
  }
}
