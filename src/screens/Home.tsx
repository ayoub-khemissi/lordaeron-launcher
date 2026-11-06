import { Button, Popover, PopoverContent, PopoverTrigger, Progress as Bar, Spinner, Tooltip, useDisclosure } from "@heroui/react";
import { AlertTriangle, CheckCircle2, ChevronUp, Info, Loader2, UserRound, X, CloudOff, FolderOpen, Gamepad2, Pause, Play as PlayIcon, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { SignInModal } from "../components/SignIn";
import type { Screen } from "../components/Sidebar";
import { formatDate, RealmBadge, type NewsTarget } from "./News";
import { useI18n } from "../i18n";
import { currentPreset, valuesOf } from "../lib/settings";
import { api } from "../lib/api";
import { errorText } from "../lib/errors";
import { useLauncher } from "../lib/store";
import type { PendingItem, Progress, RealmDef } from "../lib/types";

export function HomeScreen({ onScreen, onNews }: { onScreen: (s: Screen) => void; onNews: (t: NewsTarget) => void }) {
  const { t, language } = useI18n();
  const { status, busy, progress, error, play, setPrefs, settings, refresh, news, paused, pause, resume } = useLauncher();
  const signIn = useDisclosure();

  if (!status) return null;
  // the backend sends the realms this player sees (the team's ones too for an account of their level)
  const realms = status.feed?.realms ?? [];
  const realm = realms.find((r) => r.id === status.prefs.realm) ?? realms[0];
  const ice = realm?.accent === "ice";
  const preset = settings
    ? currentPreset(settings.schema, settings.presets, valuesOf(settings.schema, settings.values))
    : null;
  const graphicsLabel = !status.prefs.lumenveil
    ? t("home.graphicsOff")
    : t("home.graphicsOn", { preset: preset ? t(`preset.${preset}` as "preset.ultra") : t("graphics.custom") });

  return (
    <div className="relative h-full overflow-hidden">
      {realm && <RealmBackground realm={realm} />}
      <div className="absolute inset-0 bg-gradient-to-r from-wow-darker via-wow-darker/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-wow-darker via-transparent to-wow-darker/40" />

      <div className="relative flex h-full flex-col px-10 pb-7 pt-10">
        <NoticeBanner />
        <div className="flex gap-8">
        <div className="min-w-0 flex-1">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/50">{t("home.realm")}</p>
          <h1
            className={`mt-1 font-heading text-6xl leading-none drop-shadow-lg ${
              ice ? "text-wow-blue-ice" : "text-gold-gradient"
            }`}
          >
            {realm?.name}
          </h1>
          <p className="mt-3 text-[15px] text-white/75">{realm?.tagline[language] ?? realm?.tagline.en}</p>
        </div>

        {realms.length > 1 && (
          <div className="mt-7 flex gap-3">
            {realms.map((r) => (
              <RealmCard
                key={r.id}
                active={r.id === realm?.id}
                disabled={busy || status.running}
                realm={r}
                onClick={() => setPrefs({ realm: r.id })}
              />
            ))}
          </div>
        )}
        </div>
        <LatestNews realm={status.prefs.realm} news={news} onNews={onNews} />
        </div>

        <div className="mt-auto">
          {!status.game?.ok ? (
            <div className="glass flex items-center gap-4 rounded-2xl p-5">
              <FolderOpen className="text-wow-gold" size={26} />
              <p className="flex-1 text-white/85">{t("home.noGame")}</p>
              <Button color="primary" onPress={() => onScreen("settings")}>
                {t("home.chooseFolder")}
              </Button>
            </div>
          ) : (
            <div className="glass flex items-center gap-5 rounded-2xl p-4 pl-6">
              <div className="min-w-0 flex-1">
                <StatusLine
                  busy={busy}
                  error={error}
                  online={status.online}
                  paused={paused}
                  pending={status.pending}
                  progress={progress}
                  running={status.running}
                  onPause={pause}
                  onResume={resume}
                  onRetry={() => (error ? play(false) : refresh(true))}
                />
              </div>
              {!busy && (
                <button
                  className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3.5 text-xs text-white/75 transition hover:border-wow-gold/40 hover:text-wow-gold-light"
                  title={status.prefs.signedInAs ? t("signin.autoHint") : t("signin.pitch")}
                  onClick={() => (status.prefs.signedInAs ? onScreen("settings") : signIn.onOpen())}
                >
                  <UserRound className={status.prefs.signedInAs ? "text-emerald-400" : "text-white/40"} size={14} />
                  {status.prefs.signedInAs ?? t("signin.submit")}
                </button>
              )}
              {!busy && (
                <button
                  className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3.5 text-xs text-white/75 transition hover:border-wow-gold/40 hover:text-wow-gold-light"
                  onClick={() => onScreen("graphics")}
                >
                  <Sparkles className={status.prefs.lumenveil ? "text-wow-gold" : "text-white/40"} size={14} />
                  {graphicsLabel}
                </button>
              )}
              <button
                className="play-button h-14 w-52 shrink-0 rounded-xl font-heading text-xl tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-50"
                disabled={busy || status.running}
                onClick={() => (paused ? resume() : play(true))}
              >
                {status.running ? (
                  <span className="flex items-center justify-center gap-2">
                    <Gamepad2 size={20} /> {t("home.inGame").toUpperCase()}
                  </span>
                ) : busy ? (
                  <span className="flex items-center justify-center gap-2.5 text-[17px] tracking-[0.12em]">
                    <Loader2 className="animate-spin" size={17} /> {t("home.updating").toUpperCase()}
                  </span>
                ) : paused ? (
                  t("home.resume").toUpperCase()
                ) : (
                  t("home.play").toUpperCase()
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
    </div>
  );
}

function RealmCard({ realm, active, disabled, onClick }: { realm: RealmDef; active: boolean; disabled: boolean; onClick: () => void }) {
  const ice = realm.accent === "ice";

  return (
    <button
      className={`group relative h-20 w-48 overflow-hidden rounded-xl border text-left transition disabled:cursor-not-allowed ${
        active
          ? ice
            ? "border-wow-blue-ice/70 shadow-[0_0_24px_rgba(125,211,252,0.25)]"
            : "border-wow-gold/80 shadow-[0_0_24px_rgba(199,156,62,0.3)]"
          : "border-white/10 opacity-70 hover:opacity-100"
      }`}
      disabled={disabled && !active}
      onClick={onClick}
    >
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        src={realm.image.startsWith("http") ? realm.image : `/${realm.image}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <span
        className={`absolute bottom-2.5 left-3 font-heading text-lg ${ice ? "text-wow-blue-ice" : "text-wow-gold-light"}`}
      >
        {realm.name}
      </span>
      {realm.badge && (
        <span className="absolute left-3 top-2.5 rounded bg-black/70 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-widest text-white/80">
          {realm.badge}
        </span>
      )}
      {active && <CheckCircle2 className={`absolute right-2.5 top-2.5 ${ice ? "text-wow-blue-ice" : "text-wow-gold"}`} size={18} />}
    </button>
  );
}

function stepText(t: ReturnType<typeof useI18n>["t"], p: Progress | PendingItem & { to?: string | null }) {
  const kind = "step" in p ? p.step : p.kind;
  const to = "to" in p ? p.to : undefined;

  return t(`step.${kind}` as "step.patch", { name: p.name, to: to ?? "" });
}

function duration(seconds: number, language: string) {
  const s = Math.max(1, Math.round(seconds));
  const unit = (value: number, u: "minute" | "second") =>
    new Intl.NumberFormat(language, { style: "unit", unit: u, unitDisplay: "narrow" }).format(value);

  return s >= 60 ? `${unit(Math.floor(s / 60), "minute")} ${unit(s % 60, "second")}` : unit(s, "second");
}

function StatusLine(props: {
  busy: boolean;
  error: string | null;
  online: boolean;
  paused: boolean;
  pending: PendingItem[];
  progress: Progress | null;
  running: boolean;
  onRetry: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t, bytes, language } = useI18n();
  const { busy, error, online, paused, pending, progress, running, onRetry, onPause, onResume } = props;
  const downloading = progress && (progress.step === "patch" || progress.step === "lumenveil");

  if (busy && progress && progress.step !== "done") {
    const ratio = progress.total > 0 ? progress.done / progress.total : 0;
    const counter = progress.count > 1 ? ` · ${t("home.step", { index: progress.index + 1, count: progress.count })}` : "";
    const left = progress.speed > 0 ? (progress.total - progress.done) / progress.speed : 0;

    return (
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-[13px]">
            <span className="truncate text-white/85">
              {stepText(t, progress)}
              <span className="text-white/40">{counter}</span>
            </span>
            {progress.total > 0 && (
              <span className="shrink-0 tabular-nums text-white/55">
                {progress.step === "setup" ? (
                  `${Math.round(ratio * 100)} %`
                ) : (
                  <>
                    <span className="text-wow-gold-light">{bytes(progress.done)}</span> / {bytes(progress.total)}
                    {progress.speed > 0 && (
                      <>
                        <span className="mx-2 text-white/20">|</span>
                        {bytes(progress.speed)}/s
                        <span className="mx-2 text-white/20">|</span>
                        {t("home.left", { time: duration(left, language) })}
                      </>
                    )}
                  </>
                )}
              </span>
            )}
          </div>
          <Bar
            aria-label={stepText(t, progress)}
            classNames={{ indicator: "bg-gradient-to-r from-wow-gold-dark via-wow-gold to-wow-gold-light", track: "bg-white/10" }}
            isIndeterminate={progress.total === 0}
            size="sm"
            value={ratio * 100}
          />
        </div>
        {downloading && (
          <Tooltip content={t("home.pause")}>
            <Button isIconOnly aria-label={t("home.pause")} radius="full" size="sm" variant="flat" onPress={onPause}>
              <Pause size={15} />
            </Button>
          </Tooltip>
        )}
      </div>
    );
  }
  if (busy) return <Line icon={<Spinner color="primary" size="sm" />} text={t("home.checking")} />;
  if (paused)
    return (
      <div className="flex items-center gap-4">
        <Line icon={<Pause className="text-wow-gold" size={20} />} sub={t("home.pausedHint")} text={t("home.paused")} />
        <Button className="ml-auto" color="primary" size="sm" startContent={<PlayIcon size={14} />} variant="flat" onPress={onResume}>
          {t("home.resumeDownload")}
        </Button>
      </div>
    );
  if (error)
    return (
      <div className="flex items-center gap-3">
        <AlertTriangle className="shrink-0 text-danger" size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-danger-400">{errorText(t, error).text}</p>
          {errorText(t, error).detail && (
            <p className="truncate text-xs text-white/45" title={errorText(t, error).detail}>
              {errorText(t, error).detail}
            </p>
          )}
        </div>
        <Button size="sm" startContent={<RefreshCw size={14} />} variant="flat" onPress={onRetry}>
          {t("home.retry")}
        </Button>
      </div>
    );
  if (running)
    return (
      <Line
        icon={<Gamepad2 className="text-success" size={20} />}
        sub={pending.length > 0 ? t("home.runningPending") : undefined}
        text={t("home.running")}
      />
    );
  if (!online) return <Line icon={<CloudOff className="text-warning" size={20} />} text={t("home.offline")} />;
  if (pending.length > 0) {
    const size = pending.reduce((n, p) => n + p.size, 0);

    return (
      <Popover disableAnimation placement="top-start">
        <PopoverTrigger>
          <button className="group flex items-center gap-3 rounded-lg text-left">
            <RefreshCw className="shrink-0 text-wow-gold" size={20} />
            <div className="min-w-0">
              <p className="text-[15px] text-white/90">
                {size > 0 ? t("home.pending", { count: pending.length, size: bytes(size) }) : t("home.pendingNoSize", { count: pending.length })}
              </p>
              <p className="flex items-center gap-1 text-xs text-white/45 group-hover:text-wow-gold-light">
                {t("home.details")} <ChevronUp size={12} />
              </p>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] border border-white/10 bg-wow-panel p-0">
          <div className="w-full p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-wow-gold/80">{t("home.toInstall")}</p>
            <ul className="space-y-2.5">
              {pending.map((p) => (
                <li key={`${p.kind}-${p.name}`} className="flex items-center gap-3 text-[13px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wow-gold" />
                  <span className="min-w-0 flex-1 text-white/80">{stepText(t, p)}</span>
                  {p.size > 0 && <span className="shrink-0 tabular-nums text-white/45">{bytes(p.size)}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11.5px] text-white/40">{t("home.toInstallHint")}</p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return <Line icon={<CheckCircle2 className="text-success" size={20} />} text={t("home.ready")} />;
}

function Line({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center">{icon}</span>
      <div className="min-w-0">
        <p className="text-[15px] text-white/90">{text}</p>
        {sub && <p className="truncate text-xs text-white/45">{sub}</p>}
      </div>
    </div>
  );
}

function LatestNews({ news, realm, onNews }: { news: ReturnType<typeof useLauncher>["news"]; realm: string; onNews: (t: NewsTarget) => void }) {
  const { t, language } = useI18n();

  if (!news) return null;
  const forRealm = (p: { realm: string | null }) => !p.realm || p.realm === realm;
  const announcement = news.announcements.find((p) => forRealm(p) && p.title);
  const changelog = news.changelog.find(forRealm);

  if (!announcement && !changelog) return null;

  return (
    <div className="hidden w-[330px] shrink-0 flex-col gap-3 lg:flex">
      {announcement && (
        <button
          className="glass group overflow-hidden rounded-2xl text-left transition hover:border-wow-gold/40"
          onClick={() => onNews({ tab: "announcements", id: announcement.id })}
        >
          {announcement.images[0] && (
            <div className="h-32 overflow-hidden">
              <img alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={announcement.images[0].url} />
            </div>
          )}
          <div className="p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-wow-gold/80">
              {t("home.latestAnnouncement")} <RealmBadge realm={announcement.realm} />
            </p>
            <p className="mt-1.5 line-clamp-2 font-heading text-[17px] leading-snug text-white/95">{announcement.title}</p>
            <p className="mt-1 text-[11px] text-white/40">{formatDate(announcement.date, language)}</p>
          </div>
        </button>
      )}
      {changelog && (
        <button
          className="glass rounded-2xl p-4 text-left transition hover:border-wow-gold/40"
          onClick={() => onNews({ tab: "changelog", id: changelog.id })}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-wow-gold/80">{t("home.latestChangelog")}</p>
          <p className="mt-1.5 line-clamp-2 text-[13.5px] text-white/90">{changelog.title || formatDate(changelog.date, language)}</p>
          <p className="mt-1 text-[11px] text-white/40">{formatDate(changelog.date, language)}</p>
        </button>
      )}
    </div>
  );
}

// the message lordaeron.eu puts in launcher.json (maintenance, an event): shown until the player hides it
function NoticeBanner() {
  const { t, language } = useI18n();
  const { status } = useLauncher();
  const notice = status?.feed?.notice;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("notice-hidden");
    } catch {
      return null;
    }
  });

  if (!notice || hidden === notice.id) return null;
  const text = notice.text[language] ?? notice.text.en;

  if (!text) return null;
  const warning = notice.level === "warning";

  return (
    <div
      className={`-mt-4 mb-6 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-[13px] backdrop-blur ${
        warning ? "border-amber-400/40 bg-amber-500/15 text-amber-100" : "border-wow-blue/40 bg-wow-blue/10 text-sky-100"
      }`}
    >
      {warning ? <AlertTriangle className="shrink-0" size={16} /> : <Info className="shrink-0" size={16} />}
      <span className="min-w-0 flex-1">{text}</span>
      {notice.url && (
        <button className="shrink-0 font-medium underline underline-offset-2" onClick={() => api.open("url", notice.url!)}>
          {t("home.noticeMore")}
        </button>
      )}
      <button
        aria-label={t("home.noticeClose")}
        className="shrink-0 rounded p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
        onClick={() => {
          setHidden(notice.id);
          try {
            localStorage.setItem("notice-hidden", notice.id);
          } catch {
            /* the message comes back next time */
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// one picture per realm for this start of the launcher (another one next time), from the realm's list on lordaeron.eu
const drawn: Record<string, string> = {};

function backgroundOf(realm: RealmDef): string {
  const local = realm.image.startsWith("http") ? realm.image : `/${realm.image}`;
  const list = (realm.backgrounds ?? []).filter((u) => u.startsWith("https://lordaeron.eu/"));

  if (!list.length) return local;
  if (!drawn[realm.id]) drawn[realm.id] = list[Math.floor(Math.random() * list.length)];

  return drawn[realm.id];
}

// the bundled picture at once, then the drawn one fading in over it once it has loaded (never an empty screen)
function RealmBackground({ realm }: { realm: RealmDef }) {
  const local = realm.image.startsWith("http") ? realm.image : `/${realm.image}`;
  const wanted = backgroundOf(realm);
  const [ready, setReady] = useState<string | null>(wanted === local ? wanted : null);

  useEffect(() => {
    if (wanted === local) return;
    const img = new Image();

    img.onload = () => setReady(wanted);
    img.src = wanted;

    return () => {
      img.onload = null;
    };
  }, [wanted, local]);

  return (
    <>
      <motion.img
        key={`${realm.id}-local`}
        alt=""
        animate={{ opacity: ready && ready !== local ? 0 : 1, scale: 1 }}
        className="absolute inset-0 h-full w-full object-cover"
        initial={{ opacity: 0, scale: 1.04 }}
        src={local}
        transition={{ duration: 0.6 }}
      />
      {ready && ready !== local && (
        <motion.img
          key={ready}
          alt=""
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.03 }}
          src={ready}
          transition={{ duration: 0.9 }}
        />
      )}
    </>
  );
}
