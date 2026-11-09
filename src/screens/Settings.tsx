import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Switch,
  useDisclosure,
} from "@heroui/react";
import { CheckCircle2, Download, FileText, FolderOpen, Globe, History, Info, Layers, MessageCircle, Package, RefreshCw, Rocket, Trash2, UserRound, Wrench, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { PageHeader, Pill } from "../components/PageHeader";
import { SignInModal } from "../components/SignIn";
import { LANGUAGES, useI18n } from "../i18n";
import { api, launcherUpdate, pickApp } from "../lib/api";
import { errorText } from "../lib/errors";
import { isMac } from "../lib/platform";
import { useLauncher } from "../lib/store";
import type { GameInfo } from "../lib/types";

// download caps offered, in bytes per second (0: none)
const LIMITS = [0, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000];

// a choice shown as a tile, the chosen one in gold (as the game folders of the first start)
const TILE = {
  base:
    "m-0 max-w-none items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition " +
    "hover:border-white/25 data-[selected=true]:border-wow-gold/70 data-[selected=true]:bg-wow-gold/10",
  wrapper: "mt-0.5",
  labelWrapper: "ms-0",
  label: "text-[14px] font-medium text-white/90",
  description: "mt-0.5 text-[12px] leading-snug text-white/45",
};

export function gameProblemText(t: ReturnType<typeof useI18n>["t"], game: GameInfo) {
  return game.ok
    ? t("game.ok", { locale: game.locale ?? "" })
    : t(`game.${game.problem ?? "noWow"}` as "game.noWow");
}

export function SettingsScreen({ onGameFolder }: { onGameFolder: () => void }) {
  const { t, bytes } = useI18n();
  const { status, setPrefs, play, refresh, loadSettings, busy, setStatus } = useLauncher();
  const uninstall = useDisclosure();
  const signIn = useDisclosure();
  const [working, setWorking] = useState<string | null>(null);

  if (!status) return null;
  const { prefs, game } = status;

  const run = async (name: string, action: () => Promise<unknown>, done?: string) => {
    setWorking(name);
    try {
      await action();
      await refresh(false);
      await loadSettings();
      if (done) addToast({ title: done, color: "success" });
    } catch (e) {
      addToast({ title: errorText(t, e).text, color: "danger" });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("settings.title")} />
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-10">

      <Card icon={<FolderOpen size={18} />} title={t("settings.game")}>
        <p className="text-[13px] text-white/45">{t("settings.gameHint")}</p>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/8 bg-black/30 px-4 py-3">
          {game?.ok ? (
            <CheckCircle2 className="shrink-0 text-success" size={18} />
          ) : (
            <XCircle className="shrink-0 text-danger" size={18} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px] text-white/85" title={prefs.gameDir ?? ""}>
              {prefs.gameDir ?? "—"}
            </p>
            {game && <p className={`text-xs ${game.ok ? "text-white/45" : "text-danger-400"}`}>{gameProblemText(t, game)}</p>}
          </div>
          <Button size="sm" variant="flat" onPress={() => api.open("game")}>
            {t("settings.open")}
          </Button>
          <Button color="primary" isDisabled={busy || status.running} size="sm" variant="flat" onPress={onGameFolder}>
            {t("settings.change")}
          </Button>
        </div>
        {isMac && (
          <div className="mt-3 divide-y divide-white/[0.06]">
            <Row hint={t("settings.startWithHint")} label={t("settings.startWith")}>
              <div className="flex items-center gap-2">
                <span className="max-w-[220px] truncate text-[13px] text-white/60" title={prefs.startWith ?? ""}>
                  {prefs.startWith ? prefs.startWith.split("/").pop()?.replace(/\.app$/i, "") : t("settings.startWithAuto")}
                </span>
                {prefs.startWith && (
                  <Button size="sm" variant="light" onPress={() => setPrefs({ startWith: null })}>
                    {t("settings.startWithReset")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="flat"
                  onPress={async () => {
                    const app = await pickApp();

                    if (app) await setPrefs({ startWith: app });
                  }}
                >
                  {t("settings.startWithChoose")}
                </Button>
              </div>
            </Row>
          </div>
        )}
      </Card>

      <Card icon={<UserRound size={18} />} title={t("settings.account")}>
        {prefs.signedInAs ? (
          <div className="divide-y divide-white/[0.06]">
            <Row hint={t("signin.signedInHint")} label={t("signin.signedInAs", { name: prefs.signedInAs })}>
              <Button
                size="sm"
                variant="flat"
                onPress={async () => {
                  setStatus(await api.accountLogout());
                }}
              >
                {t("signin.signOut")}
              </Button>
            </Row>
            {!isMac && (
              <Row hint={t("signin.autoHint")} label={t("signin.auto")}>
                <Switch
                  aria-label={t("signin.auto")}
                  color="primary"
                  isSelected={prefs.autoLogin}
                  onValueChange={(v) => setPrefs({ autoLogin: v })}
                />
              </Row>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            <Row hint={t("signin.pitch")} label={t("signin.signInLabel")}>
              <Button color="primary" size="sm" onPress={signIn.onOpen}>
                {t("signin.submit")}
              </Button>
            </Row>
            <Row hint={t("settings.accountHint")} label={t("settings.accountName")}>
              <AccountName value={prefs.accountName ?? ""} onCommit={(v) => setPrefs({ accountName: v.trim() || null })} />
            </Row>
          </div>
        )}
        <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
      </Card>

      <div className="grid grid-cols-2 gap-5 [&>section]:mb-5">
        <Card icon={<Globe size={18} />} title={t("settings.language")}>
          <Select
          disableAnimation
            aria-label={t("settings.language")}
            classNames={{ trigger: "bg-white/5" }}
            disallowEmptySelection
            selectedKeys={[prefs.language ?? "system"]}
            onSelectionChange={(keys) => {
              const k = String([...keys][0]);

              setPrefs({ language: k === "system" ? null : k });
            }}
          >
            {[{ id: "system", name: t("settings.systemLanguage") }, ...LANGUAGES].map((l) => (
              <SelectItem key={l.id}>{l.name}</SelectItem>
            ))}
          </Select>
        </Card>
        <Card icon={<Rocket size={18} />} title={t("settings.afterPlay")}>
          <Select
          disableAnimation
            aria-label={t("settings.afterPlay")}
            classNames={{ trigger: "bg-white/5" }}
            disallowEmptySelection
            selectedKeys={[prefs.afterPlay]}
            onSelectionChange={(keys) => setPrefs({ afterPlay: String([...keys][0]) as typeof prefs.afterPlay })}
          >
            {(["minimize", "close", "stay"] as const).map((k) => (
              <SelectItem key={k}>{t(`settings.afterPlay.${k}`)}</SelectItem>
            ))}
          </Select>
        </Card>
      </div>

      <Card icon={<Package size={18} />} title={t("settings.patches")}>
        <p className="mb-3 text-[12.5px] text-white/45">{t("settings.patchesHint")}</p>
        <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-black/20">
          {status.patches.map((p) => (
            <div key={p.name} className="flex items-center gap-4 px-4 py-3">
              <span className="w-28 shrink-0 font-mono text-[13px] text-white/90">{p.name}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/50">
                {p.realms.join(", ")}
                {p.version && <span className="text-white/30"> · {p.version}</span>}
              </span>
              <Pill tone={p.state === "active" ? "success" : p.state === "aside" ? "neutral" : "warning"}>
                {t(`settings.patch.${p.state}` as "settings.patch.active")}
              </Pill>
            </div>
          ))}
        </div>
      </Card>

      <Card icon={<Download size={18} />} title={t("settings.downloads")}>
        <div className="divide-y divide-white/[0.06]">
          <Row hint={t("settings.autoUpdateHint")} label={t("settings.autoUpdate")}>
            <Switch
              aria-label={t("settings.autoUpdate")}
              color="primary"
              isSelected={prefs.autoUpdate}
              onValueChange={(v) => setPrefs({ autoUpdate: v })}
            />
          </Row>
          <Row hint={t("settings.limitHint")} label={t("settings.limit")}>
            <Select
          disableAnimation
              aria-label={t("settings.limit")}
              className="w-48"
              classNames={{ trigger: "bg-white/5" }}
              disallowEmptySelection
              selectedKeys={[String(prefs.downloadLimit)]}
              size="sm"
              onSelectionChange={(keys) => setPrefs({ downloadLimit: Number([...keys][0]) })}
            >
              {LIMITS.map((l) => (
                <SelectItem key={String(l)}>{l === 0 ? t("settings.limitNone") : `${bytes(l)}/s`}</SelectItem>
              ))}
            </Select>
          </Row>
          <Row hint={t("settings.checkHint")} label={t("settings.check")}>
            <Button
              isLoading={working === "check"}
              size="sm"
              startContent={working === "check" ? undefined : <RefreshCw size={14} />}
              variant="flat"
              onPress={async () => {
                setWorking("check");
                const s = await refresh(true);

                setWorking(null);
                if (s)
                  addToast({
                    title: t("settings.checked", {
                      result: s.pending.length
                        ? t("home.pending", { count: s.pending.length, size: bytes(s.pending.reduce((n, p) => n + p.size, 0)) })
                        : t("settings.upToDate"),
                    }),
                    color: "success",
                  });
              }}
            >
              {t("settings.checkNow")}
            </Button>
          </Row>
        </div>
      </Card>

      <Card icon={<Layers size={18} />} title={t("settings.channel")}>
        <RadioGroup
          aria-label={t("settings.channel")}
          classNames={{ wrapper: "grid grid-cols-2 gap-3" }}
          color="primary"
          value={prefs.channel}
          onValueChange={(v) => setPrefs({ channel: v as typeof prefs.channel })}
        >
          <Radio classNames={TILE} description={t("settings.channel.stableHint")} value="stable">
            {t("settings.channel.stable")}
          </Radio>
          <Radio classNames={TILE} description={t("settings.channel.testHint")} value="test">
            {t("settings.channel.test")}
          </Radio>
        </RadioGroup>
      </Card>

      <Card icon={<Wrench size={18} />} title={t("settings.maintenance")}>
        <div className="space-y-3">
          <Action
            busy={working === "repair"}
            disabled={busy || status.running || !game?.ok}
            hint={t("settings.repairHint")}
            icon={<Wrench size={15} />}
            label={t("settings.repair")}
            onPress={() => run("repair", async () => {
              await api.repair();
              await play(false);
            }, t("step.done"))}
          />
          {status.lumenveil.installed && (
            <>
              <Action
                busy={working === "rollback"}
                disabled={busy || status.running}
                hint={t("settings.rollbackHint")}
                icon={<History size={15} />}
                label={t("settings.rollback")}
                onPress={() =>
                  run("rollback", async () => {
                    const v = await api.rollbackLumenveil();

                    if (v) addToast({ title: t("settings.rolledBack", { version: v }), color: "success" });
                  })
                }
              />
              <Action
                danger
                busy={working === "uninstall"}
                disabled={busy || status.running}
                hint={t("settings.uninstallHint")}
                icon={<Trash2 size={15} />}
                label={t("settings.uninstall")}
                onPress={uninstall.onOpen}
              />
            </>
          )}
          <Action hint="" icon={<FileText size={15} />} label={t("settings.logs")} onPress={() => api.open("logs")} />
        </div>
      </Card>

      <Card icon={<Info size={18} />} title={t("settings.about")}>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-white/55">
          <span>{t("settings.launcherVersion", { version: status.launcherVersion })}</span>
          <Button
            isLoading={working === "self"}
            size="sm"
            startContent={working === "self" ? undefined : <RefreshCw size={14} />}
            variant="light"
            onPress={async () => {
              setWorking("self");
              try {
                const version = await launcherUpdate(false);

                if (version) {
                  addToast({ title: t("home.launcherUpdate", { version }), color: "primary" });
                  await launcherUpdate(true);
                } else addToast({ title: t("settings.launcherCurrent"), color: "success" });
              } catch (e) {
                addToast({ title: errorText(t, e).text, color: "danger" });
              } finally {
                setWorking(null);
              }
            }}
          >
            {t("settings.launcherCheck")}
          </Button>
          {status.lumenveil.installed && <span>· {t("graphics.version", { version: status.lumenveil.installed })}</span>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" startContent={<Globe size={14} />} variant="flat" onPress={() => api.open("url", "https://lordaeron.eu")}>
              {t("settings.website")}
            </Button>
            <Button
              size="sm"
              startContent={<MessageCircle size={14} />}
              variant="flat"
              onPress={() => api.open("url", "https://discord.gg/MqTzu6Qhn3")}
            >
              {t("settings.discord")}
            </Button>
          </div>
        </div>
      </Card>

      </div>
      <Modal backdrop="blur" isOpen={uninstall.isOpen} onOpenChange={uninstall.onOpenChange}>
        <ModalContent>
          <ModalHeader>{t("settings.uninstall")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-white/70">{t("settings.uninstallConfirm")}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={uninstall.onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              color="danger"
              onPress={() => {
                uninstall.onClose();
                run("uninstall", async () => {
                  await api.uninstallLumenveil();
                  await setPrefs({ lumenveil: false });
                }, t("step.done"));
              }}
            >
              {t("settings.uninstall")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function AccountName({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  return (
    <Input
      aria-label={t("settings.accountName")}
      autoComplete="off"
      className="w-56"
      classNames={{ inputWrapper: "bg-white/5" }}
      placeholder={t("settings.accountPlaceholder")}
      size="sm"
      spellCheck="false"
      value={text}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onValueChange={setText}
    />
  );
}

// one setting: its name and what it does on the left, its control on the right
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-white/90">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-white/45">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-medium text-white/90">
        {icon && <span className="text-wow-gold">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Action(props: {
  label: string;
  hint: string;
  icon: ReactNode;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <Button
        className="w-56 justify-start"
        color={props.danger ? "danger" : "default"}
        isDisabled={props.disabled}
        isLoading={props.busy}
        size="sm"
        startContent={props.busy ? undefined : props.icon}
        variant="flat"
        onPress={props.onPress}
      >
        {props.label}
      </Button>
      <p className="text-xs text-white/40">{props.hint}</p>
    </div>
  );
}
