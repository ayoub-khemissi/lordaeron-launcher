import type { GameInfo, News, NewsPost, Prefs, Progress, SettingsFile, SpotView, Status } from "./types";

import { mock } from "./mock";

// Inside the app, the Rust backend (src-tauri/src/commands.rs); in a browser (`pnpm dev`), the stand-in of mock.ts
export const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!inApp) return mock(command, args) as Promise<T>;
  const { invoke } = await import("@tauri-apps/api/core");

  return invoke<T>(command, args);
}

export const api = {
  status: (refresh = false) => call<Status>("status", { refresh }),
  findGames: () => call<GameInfo[]>("find_games"),
  checkGame: (path: string) => call<GameInfo>("check_game", { path }),
  setPrefs: (prefs: Partial<Prefs>) => call<Status>("set_prefs", { prefs }),
  // brings everything the realm needs up to date, then starts the game (launch = false: only the update)
  play: (launch = true) => call<void>("play", { launch }),
  readSettings: () => call<SettingsFile>("read_settings"),
  writeSettings: (values: Record<string, string>) => call<SettingsFile>("write_settings", { values }),
  repair: () => call<void>("repair"),
  // the running download stops where it is; the next play() goes on from there
  pause: () => call<void>("pause"),
  rollbackLumenveil: () => call<string | null>("rollback_lumenveil"),
  uninstallLumenveil: () => call<void>("uninstall_lumenveil"),
  // turns the enhanced graphics on and installs them right away
  installLumenveil: () => call<void>("install_lumenveil"),
  news: () => call<News>("news"),
  accountLogin: (username: string, password: string, code?: string) =>
    call<Status>("account_login", { username, password, code: code || null }),
  accountLogout: () => call<Status>("account_logout"),
  spots: () => call<SpotView[]>("spots"),
  spotScreenshot: (saved: string) => call<string | null>("spot_screenshot", { saved }),
  sendReport: (number: number, saved: string, message: string, screenshot: boolean) =>
    call<number>("send_report", { number, saved, message, screenshot }),
  newsPage: (kind: "announcements" | "changelog", page: number) => call<{ posts: NewsPost[] }>("news_page", { kind, page }),
  open: (what: "game" | "logs" | "lumenveilLog" | "url", url?: string) => call<void>("open", { what, url }),
};

export async function pickFolder(): Promise<string | null> {
  if (!inApp) return mock("pick_folder") as Promise<string | null>;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });

  return typeof picked === "string" ? picked : null;
}

export async function onProgress(handler: (p: Progress) => void): Promise<() => void> {
  if (!inApp) {
    window.addEventListener("mock-progress", ((e: CustomEvent<Progress>) => handler(e.detail)) as EventListener);

    return () => {};
  }
  const { listen } = await import("@tauri-apps/api/event");

  return listen<Progress>("progress", (e) => handler(e.payload));
}

export async function onGame(handler: (running: boolean) => void): Promise<() => void> {
  if (!inApp) return () => {};
  const { listen } = await import("@tauri-apps/api/event");

  return listen<boolean>("game", (e) => handler(e.payload));
}

export async function closeWindow(action: "minimize" | "close") {
  if (!inApp) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  if (action === "close") await getCurrentWindow().close();
  else await getCurrentWindow().minimize();
}

// the launcher's own update (src-tauri commands::launcher_update): the version waiting, or with install = true the
// download (progress as the step "launcher"), the install and a restart
export async function launcherUpdate(install: boolean): Promise<string | null> {
  if (!inApp) return null;

  return call<string | null>("launcher_update", { install });
}
