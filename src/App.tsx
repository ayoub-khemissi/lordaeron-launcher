import { addToast, Progress, Spinner } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { Sidebar, type Screen } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { I18nProvider, systemLanguage, useI18n, type Language } from "./i18n";
import { inApp, launcherUpdate } from "./lib/api";
import { errorText } from "./lib/errors";
import { LauncherProvider, useLauncher } from "./lib/store";
import { GraphicsScreen } from "./screens/Graphics";
import { GuideScreen } from "./screens/Guide";
import { HomeScreen } from "./screens/Home";
import { NewsScreen, type NewsTarget } from "./screens/News";
import { Onboarding } from "./screens/Onboarding";
import { SettingsScreen } from "./screens/Settings";

function Shell() {
  const { status } = useLauncher();
  // in a browser (`pnpm dev`), ?screen= opens a screen directly
  const [screen, setScreen] = useState<Screen>(
    (!inApp && (new URLSearchParams(location.search).get("screen") as Screen)) || "play",
  );
  const [newsTarget, setNewsTarget] = useState<NewsTarget | undefined>();
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const [selfUpdate, setSelfUpdate] = useState<string | null>(null);

  // a first start, or a game folder that is gone: the welcome steps
  useEffect(() => {
    if (status && onboarding === null) setOnboarding(!status.prefs.gameDir || status.game?.problem === "missing");
  }, [status, onboarding]);

  // the launcher's own update, before anything else, when the game is not running
  useEffect(() => {
    if (!status || status.running) return;
    launcherUpdate(false)
      .then((version) => {
        if (!version) return;
        setSelfUpdate(version);

        return launcherUpdate(true);
      })
      .catch(() => setSelfUpdate(null));
    // once, at start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === null]);

  const language: Language = (status?.prefs.language as Language) || systemLanguage();

  return (
    <I18nProvider language={language}>
      <div className="flex h-full flex-col bg-wow-darker">
        <ErrorToasts />
        <TitleBar />
        {!status || onboarding === null ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner color="primary" />
          </div>
        ) : onboarding ? (
          <Onboarding onDone={() => setOnboarding(false)} />
        ) : (
          <div className="flex min-h-0 flex-1">
            <Sidebar
              screen={screen}
              onScreen={(s) => {
                setNewsTarget(undefined);
                setScreen(s);
              }}
            />
            <div className="relative min-w-0 flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute inset-0"
                  exit={{ opacity: 0, y: -6 }}
                  initial={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.16 }}
                >
                  {screen === "play" && (
                    <HomeScreen
                      onNews={(target) => {
                        setNewsTarget(target);
                        setScreen("news");
                      }}
                      onScreen={setScreen}
                    />
                  )}
                  {screen === "news" && <NewsScreen target={newsTarget} />}
                  {screen === "graphics" && <GraphicsScreen />}
                  {screen === "guide" && <GuideScreen />}
                  {screen === "settings" && <SettingsScreen onGameFolder={() => setOnboarding(true)} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
        {selfUpdate && <SelfUpdate version={selfUpdate} />}
      </div>
    </I18nProvider>
  );
}

// errors of background saves (settings, preferences), told in the player's language
function ErrorToasts() {
  const { t } = useI18n();

  useEffect(() => {
    const show = (e: Event) => addToast({ title: errorText(t, (e as CustomEvent<string>).detail).text, color: "danger" });

    window.addEventListener("launcher-error", show);

    return () => window.removeEventListener("launcher-error", show);
  }, [t]);

  return null;
}

function SelfUpdate({ version }: { version: string }) {
  const { t, bytes } = useI18n();
  const { progress } = useLauncher();
  const p = progress?.step === "launcher" ? progress : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="glass w-[420px] rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <img alt="" className="h-9 w-9" src="/logo.webp" />
          <div>
            <p className="font-heading text-lg text-wow-gold-light">{t("home.launcherUpdateTitle")}</p>
            <p className="text-[12.5px] text-white/55">{t("home.launcherUpdate", { version })}</p>
          </div>
        </div>
        <Progress
          aria-label={t("home.launcherUpdateTitle")}
          className="mt-5"
          classNames={{ indicator: "bg-gradient-to-r from-wow-gold-dark via-wow-gold to-wow-gold-light", track: "bg-white/10" }}
          isIndeterminate={!p || p.total === 0}
          size="sm"
          value={p && p.total > 0 ? (p.done / p.total) * 100 : 0}
        />
        {p && p.total > 0 && (
          <p className="mt-2 text-right text-[11.5px] tabular-nums text-white/45">
            {bytes(p.done)} / {bytes(p.total)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LauncherProvider>
      <Shell />
    </LauncherProvider>
  );
}
