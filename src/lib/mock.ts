import type { GameInfo, Prefs, Progress, SettingsFile, Status } from "./types";

import presets from "../assets/presets.json";
import schema from "../assets/schema.json";

// The backend's stand-in for `pnpm dev` in a browser: the same answers, kept in memory, so the screens can be worked on without
// Windows. Nothing here ships in a code path the app takes (api.ts calls it only outside Tauri).

const firstRun = new URLSearchParams(location.search).has("first");
const prefs: Prefs = {
  gameDir: firstRun ? null : "C:\\Games\\World of Warcraft 3.3.5a",
  realm: new URLSearchParams(location.search).get("realm") ?? "lordaeron",
  channel: "stable",
  language: new URLSearchParams(location.search).get("lang"),
  afterPlay: "minimize",
  lumenveil: true,
  pendingPreset: null,
  downloadLimit: 0,
  autoUpdate: true,
  accountName: null,
  signedInAs: new URLSearchParams(location.search).has("signed") ? "THRALL" : null,
  autoLogin: true,
  security: null,
};
const values: Record<string, string> = Object.fromEntries(
  Object.entries(schema.settings).map(([k, s]) => [
    k,
    typeof s.default === "boolean" ? (s.default ? "1" : "0") : String(s.default),
  ]),
);
let installed: string | null = firstRun ? null : "0.7.1";
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
      notice: new URLSearchParams(location.search).has("notice")
        ? { id: "m1", level: "warning", text: { fr: "Maintenance ce soir de 23 h à 23 h 15 : les royaumes redémarrent.", en: "Maintenance tonight from 11 pm to 11:15 pm." }, url: "https://lordaeron.eu" }
        : null,
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
        version: "0.7.1",
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
    patches: [
      { name: "patch-W.MPQ", realms: ["Rimeheart"], state: prefs.realm === "rimeheart" ? "active" : "aside", version: "2026-11-06 06:01", size: 24_895_251 },
      { name: "patch-Z.MPQ", realms: ["Lordaeron"], state: prefs.realm === "lordaeron" ? "active" : "aside", version: "2026-10-19 06:04", size: 191_584 },
    ],
    running: false,
    launcherVersion: "0.1.20",
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
    case "account_login":
      if (!(args?.code as string | undefined) && String(args?.username).toUpperCase() === "TOTP") throw new Error("totpRequired|");
      Object.assign(prefs, { signedInAs: String(args?.username).toUpperCase(), accountName: String(args?.username).toUpperCase() });

      return status();
    case "account_logout":
      prefs.signedInAs = null;

      return status();
    case "spots":
      return [
        { number: 2, saved: "2026-11-06 18:09:30", map: 0, gameTime: "06:02", weather: "clear 0.00", indoors: true, screenshot: null, sent: null },
        { number: 1, saved: "2026-11-06 18:05:00", map: 571, gameTime: "21:14", weather: "rain 0.65", indoors: false, screenshot: "WoWScrnShot_110626_180502.jpg", sent: { id: 12, sentAt: 1793988000 } },
      ];
    case "spot_screenshot":
      return "/compare/02-after.webp";
    case "send_report":
      return 13;
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
