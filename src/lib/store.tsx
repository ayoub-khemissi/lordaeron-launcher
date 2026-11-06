import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { api, closeWindow, onGame, onProgress } from "./api";
import type { AccountDetails, News, Prefs, Progress, SettingsFile, Status } from "./types";

interface Launcher {
  status: Status | null;
  error: string | null;
  progress: Progress | null;
  busy: boolean;
  settings: SettingsFile | null;
  news: News | null;
  loadNews: () => Promise<void>;
  refresh: (remote?: boolean) => Promise<Status | null>;
  setPrefs: (prefs: Partial<Prefs>) => Promise<void>;
  play: (launch?: boolean) => Promise<boolean>;
  paused: boolean;
  pause: () => Promise<void>;
  resume: () => Promise<boolean>;
  install: () => Promise<boolean>;
  setStatus: (s: Status) => void;
  account: AccountDetails | null;
  loadAccount: (locale: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  writeSettings: (values: Record<string, string>) => void;
}

const Context = createContext<Launcher | null>(null);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LauncherProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<SettingsFile | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [paused, setPaused] = useState(false);
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const pausedLaunch = useRef(false);
  const busyRef = useRef(false);
  const pendingWrites = useRef<Record<string, string>>({});
  const writeTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async (remote = true) => {
    try {
      const s = await api.status(remote);

      setStatus(s);
      setError(null);

      return s;
    } catch (e) {
      setError(message(e));

      return null;
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api.readSettings());
    } catch {
      setSettings(null);
    }
  }, []);

  // the signed-in account's shards and characters (none while signed out)
  const loadAccount = useCallback(async (locale: string) => {
    try {
      setAccount(await api.accountDetails(locale));
    } catch {
      /* kept as it was: shown again at the next refresh */
    }
  }, []);

  const loadNews = useCallback(async () => {
    try {
      setNews(await api.news());
    } catch {
      setNews((current) => current ?? { updated: "", announcements: [], changelog: [] });
    }
  }, []);

  // Discord's news, read again every five minutes while the launcher is open
  useEffect(() => {
    loadNews();
    const timer = window.setInterval(loadNews, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [loadNews]);

  const run = useCallback(
    async (launch: boolean, action: () => Promise<void>) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setPaused(false);
      try {
        await action();
        const s = await refresh(false);

        await loadSettings();
        if (launch && s) {
          if (s.prefs.afterPlay !== "stay") await closeWindow(s.prefs.afterPlay);
        }

        return true;
      } catch (e) {
        if (message(e).startsWith("paused|")) {
          // a pause the player asked for: the download goes on from there at Resume
          pausedLaunch.current = launch;
          setPaused(true);
        } else setError(message(e));

        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    },
    [refresh, loadSettings],
  );
  const play = useCallback((launch = true) => run(launch, () => api.play(launch)), [run]);
  const install = useCallback(() => run(false, () => api.installLumenveil()), [run]);
  const pause = useCallback(async () => {
    await api.pause();
  }, []);
  const resume = useCallback(() => play(pausedLaunch.current), [play]);

  const setPrefs = useCallback(async (prefs: Partial<Prefs>) => {
    try {
      setStatus(await api.setPrefs(prefs));
    } catch (e) {
      // translated by <ErrorToasts> (App.tsx), inside the language's provider
      window.dispatchEvent(new CustomEvent("launcher-error", { detail: message(e) }));
    }
  }, []);

  // several slider moves become one write, a quarter of a second after the last
  const writeSettings = useCallback((values: Record<string, string>) => {
    setSettings((current) => (current ? { ...current, values: { ...current.values, ...values } } : current));
    Object.assign(pendingWrites.current, values);
    window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(async () => {
      const batch = pendingWrites.current;

      pendingWrites.current = {};
      try {
        await api.writeSettings(batch);
      } catch (e) {
        // translated by <ErrorToasts> (App.tsx), inside the language's provider
      window.dispatchEvent(new CustomEvent("launcher-error", { detail: message(e) }));
      }
    }, 250);
  }, []);

  useEffect(() => {
    const stops: Promise<() => void>[] = [
      onProgress(setProgress),
      onGame((running) => setStatus((s) => (s ? { ...s, running } : s))),
    ];

    return () => {
      stops.forEach((p) => p.then((stop) => stop()));
    };
  }, []);

  // the first look: the folder's state, then the settings; a game folder that needs updates gets them right away
  useEffect(() => {
    (async () => {
      const s = await refresh(true);

      await loadSettings();
      if (s?.game?.ok && !s.running && s.prefs.autoUpdate && s.pending.length > 0) play(false);
    })();
  }, [refresh, loadSettings, play]);

  // back to the launcher: the game may have closed, or its settings changed in the game's own window
  useEffect(() => {
    const onFocus = () => {
      if (!busyRef.current) {
        refresh(false);
        loadSettings();
      }
    };

    window.addEventListener("focus", onFocus);

    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, loadSettings]);

  return (
    <Context.Provider
      value={{ status, error, progress, busy, settings, news, loadNews, refresh, setPrefs, play, paused, pause, resume, install, loadSettings, writeSettings, setStatus, account, loadAccount }}
    >
      {children}
    </Context.Provider>
  );
}

export function useLauncher(): Launcher {
  const value = useContext(Context);

  if (!value) throw new Error("useLauncher outside LauncherProvider");

  return value;
}
