import type { GameInfo, News, Prefs, Progress, SettingsFile, Status } from "./types";

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
  rollbackLumenveil: () => call<string | null>("rollback_lumenveil"),
  uninstallLumenveil: () => call<void>("uninstall_lumenveil"),
  // turns the enhanced graphics on and installs them right away
  installLumenveil: () => call<void>("install_lumenveil"),
  news: () => call<News>("news"),
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

// the launcher's own update (tauri-plugin-updater): a signed installer from lordaeron.eu, run quietly, then a restart
export async function checkLauncherUpdate(): Promise<null | { version: string; install: () => Promise<void> }> {
  if (!inApp) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) return null;

    return {
      version: update.version,
      install: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");

        await relaunch();
      },
    };
  } catch {
    return null;
  }
}
