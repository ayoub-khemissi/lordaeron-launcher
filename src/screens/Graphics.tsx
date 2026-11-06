import {
  addToast,
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Progress as Bar,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Tab,
  Tabs,
  useDisclosure,
} from "@heroui/react";
import { CircleCheck, Download, History, Info, MoreHorizontal, Radio, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CompareSlider, SCENES } from "../components/CompareSlider";
import { PageHeader, Pill } from "../components/PageHeader";
import { PresetCard } from "../components/PresetCard";
import { SettingRow } from "../components/SettingRow";
import { useI18n } from "../i18n";
import { changedKeys, currentPreset, presetChanges, serialize, valuesOf } from "../lib/settings";
import { api } from "../lib/api";
import { useLauncher } from "../lib/store";
import type { SettingsFile } from "../lib/types";
import { useSettingWords } from "../lib/words";

export function GraphicsScreen() {
  const { t, bytes } = useI18n();
  const { status, settings, setPrefs, writeSettings, install, busy, progress, error, refresh, loadSettings } = useLauncher();
  const uninstall = useDisclosure();
  const [tab, setTab] = useState(new URLSearchParams(location.search).get("tab") ?? "presets");

  if (!status) return null;
  const lv = status.lumenveil;
  const on = status.prefs.lumenveil;
  const pendingInstall = status.pending.find((p) => p.kind === "lumenveil");

  const toggle = async (value: boolean) => {
    await setPrefs({ lumenveil: value });
    if (settings) writeSettings({ Enable: value ? "1" : "0" });
  };

  const rollback = async () => {
    try {
      const version = await api.rollbackLumenveil();

      await refresh(false);
      await loadSettings();
      if (version) addToast({ title: t("settings.rolledBack", { version }), color: "success" });
    } catch (e) {
      addToast({ title: String(e), color: "danger" });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        actions={
          lv.installed ? (
            <>
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button isIconOnly aria-label={t("graphics.more")} isDisabled={busy || status.running} size="sm" variant="light">
                    <MoreHorizontal size={18} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label={t("graphics.more")}>
                  <DropdownItem key="rollback" startContent={<History size={15} />} onPress={rollback}>
                    {t("settings.rollback")}
                  </DropdownItem>
                  <DropdownItem
                    key="uninstall"
                    className="text-danger"
                    color="danger"
                    startContent={<Trash2 size={15} />}
                    onPress={uninstall.onOpen}
                  >
                    {t("settings.uninstall")}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <Switch
                aria-label={t("graphics.title")}
                classNames={{ label: "text-[13px] font-medium text-white/80" }}
                color="primary"
                isSelected={on}
                onValueChange={toggle}
              >
                {on ? t("graphics.on") : t("graphics.off")}
              </Switch>
            </>
          ) : null
        }
        meta={
          <>
            {lv.installed && <Pill icon={<CircleCheck />}>{t("graphics.version", { version: lv.installed })}</Pill>}
            {on && lv.installed && settings && (
              <Pill icon={<Radio />} tone={status.running ? "success" : "neutral"}>
                {status.running ? t("graphics.liveRunning") : t("graphics.live")}
              </Pill>
            )}
            {on && lv.installed && pendingInstall && (
              <Pill icon={<Download />} tone="gold">
                {t("graphics.updateReady", { version: pendingInstall.to ?? "" })}
              </Pill>
            )}
          </>
        }
        subtitle={t("graphics.subtitle")}
        tabs={
          <Tabs
            aria-label={t("graphics.title")}
            classNames={{
              base: "-mb-px",
              tabList: "gap-6 p-0",
              tab: "h-10 px-0",
              cursor: "w-full bg-wow-gold",
              tabContent: "text-[14px] text-white/55 group-data-[selected=true]:text-wow-gold-light",
            }}
            selectedKey={tab}
            variant="underlined"
            onSelectionChange={(k) => setTab(String(k))}
          >
            <Tab key="presets" title={t("graphics.tab.presets")} />
            <Tab key="all" title={t("graphics.tab.all")} />
            <Tab key="compare" title={t("graphics.tab.compare")} />
          </Tabs>
        }
        title={t("graphics.title")}
      />

      {!lv.installed && (
        <div className="mx-8 mt-5 flex items-center gap-5 rounded-2xl border border-wow-gold/40 bg-wow-gold/[0.07] p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-wow-gold/15 text-wow-gold">
            <Sparkles size={24} />
          </span>
          <div className="min-w-0 flex-1">
            {busy && progress && progress.step !== "done" ? (
              <>
                <p className="mb-2 text-sm text-white/80">{t("graphics.installing")}</p>
                <Bar
                  aria-label={t("graphics.installing")}
                  classNames={{ indicator: "bg-gradient-to-r from-wow-gold-dark via-wow-gold to-wow-gold-light", track: "bg-white/10" }}
                  size="sm"
                  value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
                />
              </>
            ) : (
              <>
                <p className="text-[15px] font-medium text-white/90">{t("graphics.install")}</p>
                <p className="mt-0.5 text-[13px] text-white/55">
                  {error ? <span className="text-danger-400">{error}</span> : t("graphics.installHint", { size: bytes(lv.available?.size ?? 0) })}
                </p>
              </>
            )}
          </div>
          <button
            className="play-button h-11 shrink-0 rounded-xl px-6 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !status.game?.ok || status.running || !lv.available}
            onClick={async () => {
              if (await install()) addToast({ title: t("step.done"), color: "success" });
            }}
          >
            {t("graphics.installButton")}
          </button>
        </div>
      )}

      {!on && lv.installed && (
        <div className="mx-8 mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/60">
          <Info className="shrink-0 text-white/40" size={16} />
          {t("graphics.offHint")}
        </div>
      )}

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
              onPress={async () => {
                uninstall.onClose();
                try {
                  await api.uninstallLumenveil();
                  await refresh(false);
                  await loadSettings();
                  addToast({ title: t("step.done"), color: "success" });
                } catch (e) {
                  addToast({ title: String(e), color: "danger" });
                }
              }}
            >
              {t("settings.uninstall")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <div className={`relative min-h-0 flex-1 transition-opacity ${on ? "" : "opacity-60"}`}>
        {tab === "compare" ? (
          <Compare />
        ) : !settings ? (
          <NotInstalled />
        ) : tab === "presets" ? (
          <PresetsTab file={settings} onChange={writeSettings} />
        ) : (
          <AllSettings file={settings} onChange={writeSettings} />
        )}
      </div>
    </div>
  );
}

function NotInstalled() {
  const { t } = useI18n();
  const { status, setPrefs } = useLauncher();

  // before the install: the preset is remembered and applied by it
  return (
    <div className="thin-scroll h-full overflow-y-auto px-8 py-6">
      <p className="mb-5 text-sm text-white/60">{t("graphics.notInstalledYet")}</p>
      <div className="grid grid-cols-3 gap-4">
        {["performance", "balanced", "ultra"].map((id) => (
          <PresetCard
            key={id}
            active={(status?.prefs.pendingPreset ?? "ultra") === id}
            id={id}
            isDefault={id === "ultra"}
            onSelect={() => setPrefs({ pendingPreset: id })}
          />
        ))}
      </div>
    </div>
  );
}

function PresetsTab({ file, onChange }: { file: SettingsFile; onChange: (v: Record<string, string>) => void }) {
  const { t } = useI18n();
  const values = useMemo(() => valuesOf(file.schema, file.values), [file]);
  const active = currentPreset(file.schema, file.presets, values);
  const confirm = useDisclosure();

  const resetAll = () => {
    const keep = new Set(["Enable"]);

    onChange(
      Object.fromEntries(
        Object.entries(file.schema.settings)
          .filter(([k]) => !keep.has(k))
          .map(([k, def]) => [k, serialize(def, def.default)]),
      ),
    );
    confirm.onClose();
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto px-8 pb-8 pt-5">
      <div className="mb-3 flex items-center gap-3">
        {!active && (
          <Chip color="primary" size="sm" variant="dot">
            {t("graphics.custom")}
          </Chip>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {file.presets.presets.map((p) => (
          <PresetCard
            key={p.id}
            active={active === p.id}
            id={p.id}
            isDefault={p.id === file.presets.default}
            onSelect={() => onChange(presetChanges(file.schema, file.presets, p))}
          />
        ))}
      </div>

      <section className="mt-8">
        <h2 className="font-heading text-xl text-white/90">{t("graphics.essentials")}</h2>
        <p className="mb-3 mt-0.5 text-[13px] text-white/45">{t("graphics.essentialsHint")}</p>
        <div className="divide-y divide-white/5 rounded-2xl border border-white/8 bg-white/[0.02]">
          {file.schema.essentials
            .filter((k) => file.schema.settings[k])
            .map((k) => (
              <SettingRow key={k} compact id={k} schema={file.schema} values={values} onChange={onChange} />
            ))}
        </div>
      </section>

      <div className="mt-6 flex justify-end">
        <Button size="sm" startContent={<RotateCcw size={14} />} variant="light" onPress={confirm.onOpen}>
          {t("graphics.resetAll")}
        </Button>
      </div>
      <Modal backdrop="blur" isOpen={confirm.isOpen} onOpenChange={confirm.onOpenChange}>
        <ModalContent>
          <ModalHeader>{t("graphics.resetAll")}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-white/70">{t("graphics.resetAllConfirm")}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={confirm.onClose}>
              {t("common.cancel")}
            </Button>
            <Button color="primary" onPress={resetAll}>
              {t("common.confirm")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function AllSettings({ file, onChange }: { file: SettingsFile; onChange: (v: Record<string, string>) => void }) {
  const { t } = useI18n();
  const words = useSettingWords(file.schema);
  const values = useMemo(() => valuesOf(file.schema, file.values), [file]);
  const changed = useMemo(() => new Set(changedKeys(file.schema, values)), [file, values]);
  const [expert, setExpert] = useState(false);
  const [query, setQuery] = useState("");
  const sections = file.schema.sections.filter((s) => expert || s.level !== "expert");
  const [sectionId, setSectionId] = useState(sections[0]?.id);
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];

  const results = useMemo(() => {
    const q = fold(query.trim());

    if (!q) return null;

    return sections.flatMap((s) =>
      s.settings
        .filter((k) => fold(`${words.label(k)} ${words.help(k)} ${k} ${file.schema.settings[k].label}`).includes(q))
        .map((k) => ({ section: s.id, key: k })),
    );
  }, [query, sections, words, file]);

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 py-4 pl-6 pr-3">
        <Input
          aria-label={t("graphics.search")}
          classNames={{ inputWrapper: "bg-white/5" }}
          isClearable
          placeholder={t("graphics.searchShort")}
          size="sm"
          startContent={<Search className="text-white/40" size={15} />}
          value={query}
          onValueChange={setQuery}
        />
        <div className="thin-scroll mt-3 flex-1 overflow-y-auto pr-1">
          {sections.map((s) => {
            const count = s.settings.filter((k) => changed.has(k)).length;
            const active = !results && s.id === section?.id;

            return (
              <button
                key={s.id}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-snug transition ${
                  active ? "bg-wow-gold/12 text-wow-gold-light" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
                onClick={() => {
                  setQuery("");
                  setSectionId(s.id);
                }}
              >
                <span className="flex-1">{words.section(s.id)}</span>
                {count > 0 && (
                  <span className="rounded-full bg-wow-gold/20 px-1.5 text-[10px] tabular-nums text-wow-gold-light">{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 border-t border-white/5 pt-3">
          <Switch color="primary" isSelected={expert} size="sm" onValueChange={setExpert}>
            <span className="text-[13px]">{t("graphics.expert")}</span>
          </Switch>
          <p className="mt-1 pl-1 text-[11px] text-white/35">{t("graphics.expertHint")}</p>
        </div>
      </aside>

      <div className="thin-scroll min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
        {results ? (
          results.length === 0 ? (
            <p className="mt-10 text-center text-sm text-white/45">{t("graphics.noResults", { query })}</p>
          ) : (
            <>
              <p className="mb-2 px-4 text-xs text-white/40">{t("graphics.results", { count: results.length })}</p>
              {results.map(({ section: sid, key }, i) => (
                <div key={key}>
                  {(i === 0 || results[i - 1].section !== sid) && (
                    <h3 className="mb-1 mt-4 px-4 text-[11px] font-semibold uppercase tracking-widest text-wow-gold/80">
                      {words.section(sid)}
                    </h3>
                  )}
                  <SettingRow id={key} schema={file.schema} values={values} onChange={onChange} />
                </div>
              ))}
            </>
          )
        ) : (
          section && (
            <>
              <h2 className="mb-2 px-4 font-heading text-2xl text-white/90">{words.section(section.id)}</h2>
              {section.settings.map((key, i) => {
                const group = file.schema.settings[key].group;
                const previous = i > 0 ? file.schema.settings[section.settings[i - 1]].group : undefined;

                return (
                  <div key={key}>
                    {group && group !== previous && (
                      <h3 className="mb-1 mt-5 px-4 text-[11px] font-semibold uppercase tracking-widest text-wow-gold/80">
                        {words.group(group)}
                      </h3>
                    )}
                    <SettingRow id={key} schema={file.schema} values={values} onChange={onChange} />
                  </div>
                );
              })}
            </>
          )
        )}
      </div>
    </div>
  );
}

function Compare() {
  const { t } = useI18n();
  const [scene, setScene] = useState(SCENES[0]);

  return (
    <div className="thin-scroll h-full overflow-y-auto px-8 pb-8 pt-5">
      <CompareSlider height={400} scene={scene} />
      <div className="mt-4 flex items-center gap-3">
        {SCENES.map((s) => (
          <button
            key={s}
            className={`h-14 w-24 overflow-hidden rounded-lg border-2 transition ${
              s === scene ? "border-wow-gold" : "border-transparent opacity-60 hover:opacity-100"
            }`}
            onClick={() => setScene(s)}
          >
            <img alt="" className="h-full w-full object-cover" src={`/compare/${s}-after.webp`} />
          </button>
        ))}
        <p className="ml-auto max-w-xs text-right text-xs text-white/40">{t("graphics.compareHint")}</p>
      </div>
    </div>
  );
}
