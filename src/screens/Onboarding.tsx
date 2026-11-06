import { Button, Select, SelectItem, Spinner, Switch } from "@heroui/react";
import { ArrowLeft, CheckCircle2, ExternalLink, FolderSearch, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { CompareGallery } from "../components/CompareSlider";
import { PresetCard } from "../components/PresetCard";
import { LANGUAGES, systemLanguage, useI18n } from "../i18n";
import { api, pickFolder } from "../lib/api";
import { useLauncher } from "../lib/store";
import type { GameInfo } from "../lib/types";

import { gameProblemText } from "./Settings";

const STEPS = ["welcome", "game", "realm", "graphics"] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, language } = useI18n();
  const { status, setPrefs, play } = useLauncher();
  const [step, setStep] = useState(0);
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [game, setGame] = useState<GameInfo | null>(status?.game?.ok ? status.game : null);
  const [realm, setRealm] = useState(status?.prefs.realm ?? "lordaeron");
  const [graphics, setGraphics] = useState(status?.prefs.lumenveil ?? true);
  const [preset, setPreset] = useState(status?.prefs.pendingPreset ?? "ultra");
  const realms = (status?.feed?.realms ?? []).filter((r) => !r.hidden);
  const returning = Boolean(status?.prefs.gameDir);

  useEffect(() => {
    if (STEPS[step] !== "game" || games) return;
    api.findGames().then((found) => {
      setGames(found);
      if (!game) setGame(found.find((g) => g.ok) ?? null);
    });
  }, [step, games, game]);

  const browse = async () => {
    const path = await pickFolder();

    if (!path) return;
    const info = await api.checkGame(path);

    setGames((list) => [info, ...(list ?? []).filter((g) => g.path !== info.path)]);
    setGame(info);
  };

  const finish = async () => {
    await setPrefs({ gameDir: game!.path, realm, lumenveil: graphics, pendingPreset: preset });
    onDone();
    play(false);
  };

  // changing the folder later from Settings: only that step
  const steps = returning ? (["game"] as const) : STEPS;
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step === steps.length - 1;
  const canNext = current !== "game" || game?.ok;

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[2px]" src="/realms/lordaeron.webp" />
      <div className="absolute inset-0 bg-gradient-to-b from-wow-darker/60 via-wow-darker/80 to-wow-darker" />

      <div className="glass relative flex max-h-[96%] w-[760px] flex-col rounded-3xl px-9 py-7">
        {steps.length > 1 && (
          <div className="mb-6 flex gap-1.5">
            {steps.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-wow-gold" : "bg-white/10"}`} />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            animate={{ opacity: 1, x: 0 }}
            className="thin-scroll -mx-2 min-h-0 overflow-y-auto overflow-x-hidden px-2 pt-2"
            exit={{ opacity: 0, x: -16 }}
            initial={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18 }}
          >
            {current === "welcome" && (
              <div className="flex flex-col items-center text-center">
                <div className="relative flex h-32 w-32 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(199,156,62,0.35),transparent_68%)]" />
                  <img alt="" className="relative h-28 w-28" src="/logo.webp" />
                </div>
                <h1 className="mt-4 font-heading text-4xl text-gold-gradient">{t("onboarding.welcome")}</h1>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/65">{t("onboarding.welcomeText")}</p>
                <Select
          disableAnimation
                  aria-label={t("settings.language")}
                  className="mt-6 w-60"
                  classNames={{ trigger: "bg-white/5" }}
                  disallowEmptySelection
                  selectedKeys={[status?.prefs.language ?? language ?? systemLanguage()]}
                  onSelectionChange={(keys) => setPrefs({ language: String([...keys][0]) })}
                >
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.id}>{l.name}</SelectItem>
                  ))}
                </Select>
              </div>
            )}

            {current === "game" && (
              <div>
                <h2 className="font-heading text-3xl text-white/95">{t("onboarding.gameTitle")}</h2>
                <p className="mt-2 text-sm text-white/55">{t("onboarding.gameText")}</p>
                <div className="mt-5 space-y-2">
                  {games === null ? (
                    <div className="flex items-center gap-3 py-6 text-sm text-white/55">
                      <Spinner color="primary" size="sm" /> {t("onboarding.searching")}
                    </div>
                  ) : (
                    <>
                      {games.length === 0 && <p className="py-2 text-sm text-white/55">{t("onboarding.noneFound")}</p>}
                      {games.map((g) => (
                        <button
                          key={g.path}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                            game?.path === g.path
                              ? g.ok
                                ? "border-wow-gold/70 bg-wow-gold/10"
                                : "border-danger/60 bg-danger/10"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25"
                          }`}
                          onClick={() => setGame(g)}
                        >
                          {g.ok ? <CheckCircle2 className="text-success" size={18} /> : <XCircle className="text-danger" size={18} />}
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[13px] text-white/90">{g.path}</p>
                            <p className={`text-xs ${g.ok ? "text-white/45" : "text-danger-400"}`}>{gameProblemText(t, g)}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <Button startContent={<FolderSearch size={16} />} variant="flat" onPress={browse}>
                    {t("onboarding.browse")}
                  </Button>
                  <button
                    className="flex items-center gap-1 text-xs text-white/40 transition hover:text-wow-gold-light"
                    onClick={() => api.open("url", `https://lordaeron.eu/${language}/lordaeron/how-to`)}
                  >
                    {t("onboarding.noClient")} <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            )}

            {current === "realm" && (
              <div>
                <h2 className="font-heading text-3xl text-white/95">{t("onboarding.realmTitle")}</h2>
                <p className="mt-2 text-sm text-white/55">{t("onboarding.realmText")}</p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  {realms.map((r) => {
                    const active = r.id === realm;
                    const ice = r.accent === "ice";

                    return (
                      <button
                        key={r.id}
                        className={`group relative h-44 overflow-hidden rounded-2xl border-2 text-left transition ${
                          active ? (ice ? "border-wow-blue-ice" : "border-wow-gold") : "border-white/10 opacity-75 hover:opacity-100"
                        }`}
                        onClick={() => setRealm(r.id)}
                      >
                        <img alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" src={`/${r.image}`} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <p className={`font-heading text-2xl ${ice ? "text-wow-blue-ice" : "text-wow-gold-light"}`}>{r.name}</p>
                          <p className="mt-1 text-xs text-white/70">{r.tagline[language] ?? r.tagline.en}</p>
                        </div>
                        {active && (
                          <CheckCircle2 className={`absolute right-3 top-3 ${ice ? "text-wow-blue-ice" : "text-wow-gold"}`} size={22} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {current === "graphics" && (
              <div>
                <div className="flex items-start gap-6">
                  <div className="flex-1">
                    <h2 className="font-heading text-3xl text-white/95">{t("onboarding.graphicsTitle")}</h2>
                    <p className="mt-2 text-sm text-white/55">{t("onboarding.graphicsText")}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <CompareGallery height={190} />
                </div>
                <Switch className="mt-3" color="primary" isSelected={graphics} onValueChange={setGraphics}>
                  <span className="text-sm">{t("onboarding.graphicsOn")}</span>
                </Switch>
                <div className={`mt-3 grid grid-cols-3 gap-3 transition ${graphics ? "" : "pointer-events-none opacity-40"}`}>
                  {["performance", "balanced", "ultra"].map((id) => (
                    <PresetCard
                      key={id}
                      compact
                      active={preset === id}
                      id={id}
                      isDefault={id === "ultra"}
                      onSelect={() => setPreset(id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center">
          {step > 0 && (
            <Button startContent={<ArrowLeft size={16} />} variant="light" onPress={() => setStep(step - 1)}>
              {t("onboarding.back")}
            </Button>
          )}
          <Button
            className="ml-auto min-w-40 font-medium"
            color="primary"
            isDisabled={!canNext}
            size="lg"
            onPress={async () => {
              if (returning) {
                await setPrefs({ gameDir: game!.path });
                onDone();
                play(false);
              } else if (last) await finish();
              else setStep(step + 1);
            }}
          >
            {returning || last ? t("onboarding.finish") : step === 0 ? t("onboarding.start") : t("onboarding.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
