import { useDisclosure } from "@heroui/react";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "../components/PageHeader";
import { SignInModal } from "../components/SignIn";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { SHARD_ICON, sitePage } from "../lib/site";
import { useLauncher } from "../lib/store";

// The shop is on the site: here, the account's soul shards and the way to each realm's shop
export function ShopScreen() {
  const { t, language } = useI18n();
  const { status, account } = useLauncher();
  const signIn = useDisclosure();
  const realms = status?.feed?.realms.filter((r) => !r.minSecurity) ?? [];
  const open = (path: string) => api.open("url", sitePage(language, path));

  return (
    <div className="flex h-full flex-col">
      <PageHeader subtitle={t("shop.subtitle")} title={t("shop.title")} />
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-8 pb-10">
        <section className="relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/15 via-black/30 to-black/40 p-6">
          <div className="flex items-center gap-5">
            <img alt="" className="h-16 w-16 drop-shadow-[0_0_18px_rgba(160,55,116,0.55)]" src={SHARD_ICON} />
            {status?.prefs.signedInAs ? (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-widest text-violet-200/70">{t("shop.balance")}</p>
                <p className="font-heading text-4xl text-white">
                  {account ? new Intl.NumberFormat(language).format(account.shards) : "…"}
                  <span className="ml-2 text-lg text-violet-200/80">{t("shop.shards")}</span>
                </p>
              </div>
            ) : (
              <div className="flex-1">
                <p className="text-[15px] font-medium text-white/90">{t("shop.signInTitle")}</p>
                <p className="mt-1 text-[13px] text-white/55">{t("shop.signInText")}</p>
                <button
                  className="mt-3 rounded-lg border border-wow-gold/50 bg-wow-gold/10 px-4 py-1.5 text-[13px] font-semibold text-wow-gold-light hover:bg-wow-gold/20"
                  onClick={signIn.onOpen}
                >
                  {t("signin.submit")}
                </button>
              </div>
            )}
          </div>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-white/55">{t("shop.how")}</p>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {realms.map((r) => (
            <button
              key={r.id}
              className="group relative h-40 overflow-hidden rounded-2xl border border-white/10 text-left transition hover:border-wow-gold/50"
              onClick={() => open(`/${r.id}/shop`)}
            >
              <img alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" src={`/${r.image}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{t("shop.realmShop")}</p>
                  <p className={`font-heading text-2xl ${r.accent === "ice" ? "text-wow-blue-ice" : "text-wow-gold-light"}`}>{r.name}</p>
                </div>
                <ExternalLink className="text-white/60 group-hover:text-white" size={18} />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] text-white/80 hover:border-wow-gold/40" onClick={() => open("/rimeheart/black-market")}>
            {t("shop.blackMarket")}
          </button>
          <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[13px] text-white/80 hover:border-wow-gold/40" onClick={() => open("/account")}>
            {t("account.site")}
          </button>
        </div>
      </div>
      <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
    </div>
  );
}
