import { Button, Progress as Bar, Spinner } from "@heroui/react";
import { AlertTriangle, CheckCircle2, CloudOff, FolderOpen, Gamepad2, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import type { Screen } from "../components/Sidebar";
import { useI18n } from "../i18n";
import { currentPreset, valuesOf } from "../lib/settings";
import { useLauncher } from "../lib/store";
import type { PendingItem, Progress, RealmDef } from "../lib/types";

export function HomeScreen({ onScreen }: { onScreen: (s: Screen) => void }) {
  const { t, language } = useI18n();
  const { status, busy, progress, error, play, setPrefs, settings, refresh } = useLauncher();

  if (!status) return null;
  const realms = (status.feed?.realms ?? []).filter((r) => !r.hidden || r.id === status.prefs.realm);
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
      {realm && (
        <motion.img
          key={realm.id}
          alt=""
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          src={realm.image.startsWith("http") ? realm.image : `/${realm.image}`}
          transition={{ duration: 0.6 }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-wow-darker via-wow-darker/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-wow-darker via-transparent to-wow-darker/40" />

      <div className="relative flex h-full flex-col px-10 pb-7 pt-10">
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
                  pending={status.pending}
                  progress={progress}
                  running={status.running}
                  onRetry={() => (error ? play(false) : refresh(true))}
                />
              </div>
              <button
                className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-white/75 transition hover:border-wow-gold/40 hover:text-wow-gold-light"
                onClick={() => onScreen("graphics")}
              >
                <Sparkles className={status.prefs.lumenveil ? "text-wow-gold" : "text-white/40"} size={14} />
                {graphicsLabel}
              </button>
              <button
                className="play-button h-14 w-52 shrink-0 rounded-xl font-heading text-xl tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-60 disabled:saturate-50"
                disabled={busy || status.running}
                onClick={() => play(true)}
              >
                {status.running ? (
                  <span className="flex items-center justify-center gap-2">
                    <Gamepad2 size={20} /> {t("home.inGame").toUpperCase()}
                  </span>
                ) : busy ? (
                  <span className="flex items-center justify-center gap-3">
                    <Spinner color="current" size="sm" /> {t("home.updating").toUpperCase()}
                  </span>
                ) : (
                  t("home.play").toUpperCase()
                )}
              </button>
            </div>
          )}
        </div>
      </div>
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
      {active && <CheckCircle2 className={`absolute right-2.5 top-2.5 ${ice ? "text-wow-blue-ice" : "text-wow-gold"}`} size={18} />}
    </button>
  );
}

function stepText(t: ReturnType<typeof useI18n>["t"], p: Progress | PendingItem & { to?: string | null }) {
  const kind = "step" in p ? p.step : p.kind;
  const to = "to" in p ? p.to : undefined;

  return t(`step.${kind}` as "step.patch", { name: p.name, to: to ?? "" });
}

function StatusLine(props: {
  busy: boolean;
  error: string | null;
  online: boolean;
  pending: PendingItem[];
  progress: Progress | null;
  running: boolean;
  onRetry: () => void;
}) {
  const { t, bytes } = useI18n();
  const { busy, error, online, pending, progress, running, onRetry } = props;

  if (busy && progress && progress.step !== "done") {
    const ratio = progress.total > 0 ? progress.done / progress.total : 0;
    const counter = progress.count > 1 ? ` (${progress.index + 1}/${progress.count})` : "";

    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
          <span className="truncate text-white/85">
            {stepText(t, progress)}
            <span className="text-white/40">{counter}</span>
          </span>
          {progress.total > 0 && (
            <span className="shrink-0 tabular-nums text-wow-gold-light">
              {progress.step === "setup" ? `${Math.round(ratio * 100)} %` : `${bytes(progress.done)} / ${bytes(progress.total)}`}
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
    );
  }
  if (busy) return <Line icon={<Spinner color="warning" size="sm" />} text={t("home.checking")} />;
  if (error)
    return (
      <div className="flex items-center gap-3">
        <AlertTriangle className="shrink-0 text-danger" size={20} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-danger-400">{t("home.error")}</p>
          <p className="truncate text-xs text-white/55" title={error}>
            {error}
          </p>
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
      <Line
        icon={<RefreshCw className="text-wow-gold" size={20} />}
        sub={pending.map((p) => stepText(t, p)).join(" · ")}
        text={size > 0 ? t("home.pending", { count: pending.length, size: bytes(size) }) : t("home.pendingNoSize", { count: pending.length })}
      />
    );
  }

  return <Line icon={<CheckCircle2 className="text-success" size={20} />} text={t("home.ready")} />;
}

function Line({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[15px] text-white/90">{text}</p>
        {sub && <p className="truncate text-xs text-white/45">{sub}</p>}
      </div>
    </div>
  );
}
