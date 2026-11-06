import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { SITE, sitePage } from "../lib/site";
import { useLauncher } from "../lib/store";

// the site's tools (lordaeron-front config/site.ts "tools"), with their own icons; some only on one realm
const TOOLS = [
  { key: "armory", icon: "inv_chest_plate16" },
  { key: "guilds", icon: "inv_shirt_guildtabard_01" },
  { key: "pvp", icon: "achievement_arena_2v2_7" },
  { key: "hall-of-fame", icon: "achievement_general" },
  { key: "realm-firsts", icon: "inv_misc_trophy_argent" },
  { key: "progression", icon: "achievement_boss_lichking" },
  { key: "calendar", icon: "inv_misc_pocketwatch_01" },
  { key: "population", icon: "inv_misc_groupneedmore" },
  { key: "codex", icon: "inv_misc_book_11" },
  { key: "talents", icon: "ability_marksmanship" },
  { key: "black-market", icon: "inv_misc_coinbag_special", realms: ["rimeheart"] },
] as const;

export function ToolsScreen() {
  const { t, language } = useI18n();
  const { status } = useLauncher();
  const realms = status?.feed?.realms.filter((r) => !r.minSecurity) ?? [];
  const [realm, setRealm] = useState(
    realms.some((r) => r.id === status?.prefs.realm) ? status!.prefs.realm : (realms[0]?.id ?? "lordaeron"),
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        actions={
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {realms.map((r) => (
              <button
                key={r.id}
                className={`h-7 rounded-md px-3 text-[12px] font-medium transition ${
                  realm === r.id ? "bg-wow-gold text-black" : "text-white/60 hover:text-white"
                }`}
                onClick={() => setRealm(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
        }
        subtitle={t("tools.subtitle")}
        title={t("tools.title")}
      />
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {TOOLS.filter((tool) => !("realms" in tool) || (tool.realms as readonly string[]).includes(realm)).map((tool) => (
            <button
              key={tool.key}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left transition hover:border-wow-gold/40 hover:bg-white/[0.05]"
              onClick={() => api.open("url", sitePage(language, `/${realm}/${tool.key}`))}
            >
              <img alt="" className="h-11 w-11 shrink-0 rounded-lg border border-wow-gold/30" src={`${SITE}/img/nav/${tool.icon}.jpg`} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-white/90">{t(`tools.${tool.key}` as "tools.armory")}</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/45">{t(`tools.${tool.key}.hint` as "tools.armory.hint")}</p>
              </div>
              <ExternalLink className="shrink-0 text-white/25 transition group-hover:text-wow-gold-light" size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
