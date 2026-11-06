import {
  addToast,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Textarea,
} from "@heroui/react";
import { CheckCircle2, Clock, Cloud, Home as Indoors, Map, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { HotkeyParts } from "../components/HotkeyInput";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { errorText } from "../lib/errors";
import { useLauncher } from "../lib/store";
import type { SpotView } from "../lib/types";

const MAPS: Record<number, string> = { 0: "map.0", 1: "map.1", 530: "map.530", 571: "map.571" };

function savedDate(saved: string, language: string) {
  const d = new Date(saved.replace(" ", "T"));

  return Number.isNaN(d.getTime())
    ? saved
    : new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

// The spots marked with Ctrl+F5 in the game, to send to the team with a few words (and the screenshot taken there)
export function ReportsTab() {
  const { t, language } = useI18n();
  const { settings } = useLauncher();
  const [spots, setSpots] = useState<SpotView[] | null>(null);
  const [open, setOpen] = useState<SpotView | null>(null);
  const key = settings?.values.SpotKey || "Ctrl+F5";

  const load = useCallback(() => {
    api.spots().then(setSpots).catch(() => setSpots([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);

    return () => window.removeEventListener("focus", load);
  }, [load]);

  const weather = (w: string) => {
    const [kind, amount] = w.split(" ");
    const name = t(`weather.${kind}` as "weather.clear");

    return kind === "clear" || !amount ? name : `${name} ${Math.round(Number(amount) * 100)} %`;
  };

  return (
    <div className="thin-scroll h-full overflow-y-auto px-8 pb-8 pt-5">
      <div className="flex items-center gap-4 rounded-2xl border border-wow-gold/30 bg-wow-gold/[0.06] px-5 py-4">
        <HotkeyParts value={key} />
        <p className="text-[13px] leading-snug text-white/70">{t("reports.how")}</p>
      </div>

      {spots === null ? (
        <div className="flex justify-center py-16">
          <Spinner color="primary" />
        </div>
      ) : spots.length === 0 ? (
        <p className="py-16 text-center text-sm text-white/45">{t("reports.empty")}</p>
      ) : (
        <div className="mt-5 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          {spots.map((s) => (
            <div key={`${s.number}-${s.saved}`} className="flex items-center gap-5 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-white/90">
                  {t("reports.spot", { number: s.number })}
                  <span className="ml-2 text-[12px] font-normal text-white/40">{savedDate(s.saved, language)}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/50">
                  <span className="flex items-center gap-1.5">
                    <Map size={13} />
                    {MAPS[s.map] ? t(MAPS[s.map] as "map.0") : t("map.other", { id: s.map })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} />
                    {s.gameTime}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Cloud size={13} />
                    {weather(s.weather)}
                  </span>
                  {s.indoors && (
                    <span className="flex items-center gap-1.5">
                      <Indoors size={13} />
                      {t("reports.indoors")}
                    </span>
                  )}
                </p>
              </div>
              {s.sent ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-emerald-300">
                  <CheckCircle2 size={15} />
                  {t("reports.sent", {
                    id: s.sent.id,
                    date: new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(s.sent.sentAt * 1000)),
                  })}
                </span>
              ) : (
                <Button color="primary" size="sm" startContent={<Send size={14} />} variant="flat" onPress={() => setOpen(s)}>
                  {t("reports.send")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {open && (
        <SendModal
          spot={open}
          onClose={() => setOpen(null)}
          onSent={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SendModal({ spot, onClose, onSent }: { spot: SpotView; onClose: () => void; onSent: () => void }) {
  const { t } = useI18n();
  const { status } = useLauncher();
  const [message, setMessage] = useState("");
  const [withShot, setWithShot] = useState(Boolean(spot.screenshot));
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (spot.screenshot) api.spotScreenshot(spot.saved).then(setPreview).catch(() => setPreview(null));
  }, [spot]);

  const send = async () => {
    setSending(true);
    try {
      const id = await api.sendReport(spot.number, spot.saved, message, withShot && Boolean(spot.screenshot));

      addToast({ title: t("reports.thanks", { id }), color: "success" });
      onSent();
    } catch (e) {
      addToast({ title: errorText(t, e).text, color: "danger" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal backdrop="blur" isOpen size="lg" onOpenChange={(o) => !o && onClose()}>
      <ModalContent>
        <ModalHeader className="font-heading text-xl">{t("reports.title", { number: spot.number })}</ModalHeader>
        <ModalBody>
          <Textarea
            autoFocus
            classNames={{ inputWrapper: "bg-white/5" }}
            description={`${message.trim().length} / 2000`}
            label={t("reports.what")}
            labelPlacement="outside"
            maxLength={2000}
            minRows={4}
            placeholder={t("reports.placeholder")}
            value={message}
            onValueChange={setMessage}
          />
          {spot.screenshot && (
            <div className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
              {preview ? (
                <img alt="" className="h-16 w-28 shrink-0 rounded-md object-cover" src={preview} />
              ) : (
                <div className="h-16 w-28 shrink-0 rounded-md bg-white/5" />
              )}
              <Checkbox color="primary" isSelected={withShot} onValueChange={setWithShot}>
                <span className="text-[13px]">{t("reports.withScreenshot")}</span>
              </Checkbox>
            </div>
          )}
          <p className="text-[11.5px] leading-snug text-white/40">
            {t("reports.privacy")}
            {status?.prefs.accountName ? ` ${t("reports.account", { name: status.prefs.accountName })}` : ""}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            color="primary"
            isDisabled={message.trim().length < 5}
            isLoading={sending}
            startContent={sending ? undefined : <Send size={15} />}
            onPress={send}
          >
            {t("reports.sendNow")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
