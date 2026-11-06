import {
  addToast,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  useDisclosure,
} from "@heroui/react";
import { CheckCircle2, FileText, FolderOpen, Globe, History, MessageCircle, Trash2, Wrench, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { LANGUAGES, useI18n } from "../i18n";
import { api } from "../lib/api";
import { useLauncher } from "../lib/store";
import type { GameInfo } from "../lib/types";

export function gameProblemText(t: ReturnType<typeof useI18n>["t"], game: GameInfo) {
  return game.ok
    ? t("game.ok", { locale: game.locale ?? "" })
    : t(`game.${game.problem ?? "noWow"}` as "game.noWow");
}

export function SettingsScreen({ onGameFolder }: { onGameFolder: () => void }) {
  const { t } = useI18n();
  const { status, setPrefs, play, refresh, loadSettings, busy } = useLauncher();
  const uninstall = useDisclosure();
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
      addToast({ title: e instanceof Error ? e.message : String(e), color: "danger" });
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto px-8 pb-10 pt-7">
      <h1 className="font-heading text-3xl text-gold-gradient">{t("settings.title")}</h1>

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
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card icon={<Globe size={18} />} title={t("settings.language")}>
          <Select
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
        <Card title={t("settings.afterPlay")}>
          <Select
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

      <Card title={t("settings.channel")}>
        <RadioGroup
          color="warning"
          orientation="horizontal"
          value={prefs.channel}
          onValueChange={(v) => setPrefs({ channel: v as typeof prefs.channel })}
        >
          <Radio className="mr-6" description={t("settings.channel.stableHint")} value="stable">
            {t("settings.channel.stable")}
          </Radio>
          <Radio description={t("settings.channel.testHint")} value="test">
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

      <Card title={t("settings.about")}>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-white/55">
          <span>{t("settings.launcherVersion", { version: status.launcherVersion })}</span>
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

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-5">
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
