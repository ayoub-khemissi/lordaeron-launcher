import { useDisclosure } from "@heroui/react";
import { ExternalLink, MapPin, UserRound } from "lucide-react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { CLASS_COLORS } from "../lib/site";
import { useLauncher } from "../lib/store";
import type { RealmDef } from "../lib/types";

import { SignInModal } from "./SignIn";

function ago(seconds: number, language: string) {
  const diff = seconds - Date.now() / 1000;
  const f = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const abs = Math.abs(diff);

  if (abs < 3600) return f.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return f.format(Math.round(diff / 3600), "hour");
  if (abs < 30 * 86400) return f.format(Math.round(diff / 86400), "day");

  return f.format(Math.round(diff / (30 * 86400)), "month");
}

// The character played last on the chosen realm, or what to do to see it
export function CharacterCard({ realm }: { realm: RealmDef }) {
  const { t, language } = useI18n();
  const { status, account } = useLauncher();
  const signIn = useDisclosure();
  const signedIn = Boolean(status?.prefs.signedInAs);
  const here = account?.realms[realm.id];
  const c = here?.last;
  const box = "glass mt-5 flex max-w-[460px] items-center gap-4 rounded-2xl p-4";

  if (!signedIn)
    return (
      <>
        <button className={`${box} text-left transition hover:border-wow-gold/40`} onClick={signIn.onOpen}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-wow-gold/15 text-wow-gold">
            <UserRound size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-white/90">{t("character.signInTitle")}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-white/50">{t("character.signInText")}</span>
          </span>
        </button>
        <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
      </>
    );
  if (!account) return null;
  if (!c)
    return (
      <div className={box}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40">
          <UserRound size={22} />
        </span>
        <p className="text-[13px] text-white/60">{t("character.none", { realm: realm.name })}</p>
      </div>
    );

  return (
    <button className={`${box} group text-left transition hover:border-wow-gold/40`} onClick={() => api.open("url", c.armory)}>
      <span className="relative shrink-0">
        {c.raceIcon && <img alt="" className="h-14 w-14 rounded-xl border border-white/15" src={c.raceIcon} />}
        {c.classIcon && (
          <img alt="" className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-md border border-black/60" src={c.classIcon} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-heading text-[19px]" style={{ color: CLASS_COLORS[c.cls] ?? "#fff" }}>
            {c.name}
          </span>
          <span className="shrink-0 text-[12px] text-white/50">{t("character.level", { level: c.level })}</span>
        </span>
        <span className="block truncate text-[12.5px] text-white/65">
          {t(`race.${c.race}` as "race.1")} · {t(`class.${c.cls}` as "class.1")}
          {c.guild && <span className="text-emerald-300/80"> · &lt;{c.guild}&gt;</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-white/40">
          {c.online ? (
            <span className="text-emerald-400">● {t("character.online")}</span>
          ) : (
            <>
              <MapPin size={11} />
              {c.zone ?? "—"}
              {c.lastPlayed && ` · ${ago(c.lastPlayed, language)}`}
            </>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-white/40">
        <span className="flex items-center gap-1 text-wow-gold-light opacity-70 transition group-hover:opacity-100">
          {t("character.armory")} <ExternalLink size={11} />
        </span>
        {here && here.count > 1 && <span>{t("character.count", { count: here.count })}</span>}
      </span>
    </button>
  );
}
