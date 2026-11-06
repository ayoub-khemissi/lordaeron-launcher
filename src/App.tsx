import { Spinner } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { Sidebar, type Screen } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { I18nProvider, systemLanguage, useI18n, type Language } from "./i18n";
import { checkLauncherUpdate, inApp } from "./lib/api";
import { LauncherProvider, useLauncher } from "./lib/store";
import { GraphicsScreen } from "./screens/Graphics";
import { GuideScreen } from "./screens/Guide";
import { HomeScreen } from "./screens/Home";
import { Onboarding } from "./screens/Onboarding";
import { SettingsScreen } from "./screens/Settings";

function Shell() {
  const { status } = useLauncher();
  // in a browser (`pnpm dev`), ?screen= opens a screen directly
  const [screen, setScreen] = useState<Screen>(
    (!inApp && (new URLSearchParams(location.search).get("screen") as Screen)) || "play",
  );
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const [selfUpdate, setSelfUpdate] = useState<string | null>(null);

  // a first start, or a game folder that is gone: the welcome steps
  useEffect(() => {
    if (status && onboarding === null) setOnboarding(!status.prefs.gameDir || status.game?.problem === "missing");
  }, [status, onboarding]);

  // the launcher's own update, before anything else, when the game is not running
  useEffect(() => {
    if (!status || status.running) return;
    checkLauncherUpdate().then((update) => {
      if (!update) return;
      setSelfUpdate(update.version);
      update.install().catch(() => setSelfUpdate(null));
    });
    // once, at start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === null]);

  const language: Language = (status?.prefs.language as Language) || systemLanguage();

  return (
    <I18nProvider language={language}>
      <div className="flex h-full flex-col bg-wow-darker">
        <TitleBar />
        {!status || onboarding === null ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner color="warning" />
          </div>
        ) : onboarding ? (
          <Onboarding onDone={() => setOnboarding(false)} />
        ) : (
          <div className="flex min-h-0 flex-1">
            <Sidebar screen={screen} onScreen={setScreen} />
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
                  {screen === "play" && <HomeScreen onScreen={setScreen} />}
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

function SelfUpdate({ version }: { version: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass flex items-center gap-4 rounded-2xl px-8 py-6">
        <Spinner color="warning" size="sm" />
        <SelfUpdateText version={version} />
      </div>
    </div>
  );
}

function SelfUpdateText({ version }: { version: string }) {
  const { t } = useI18n();

  return <span>{t("home.launcherUpdate", { version })}</span>;
}

export default function App() {
  return (
    <LauncherProvider>
      <Shell />
    </LauncherProvider>
  );
}
