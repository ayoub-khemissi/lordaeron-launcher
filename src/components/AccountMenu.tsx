import { Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, useDisclosure } from "@heroui/react";
import { ArrowUpRight, LogOut, ShoppingBag, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { SHARD_ICON, sitePage } from "../lib/site";
import { useLauncher } from "../lib/store";

import { SignInModal } from "./SignIn";

// the realms with a shop on the website; the team's realms open Lordaeron's
const SHOP_REALMS = ["lordaeron", "rimeheart"];

const TONES = {
  violet: "border-violet-400/30 bg-violet-500/15 text-violet-200",
  gold: "border-wow-gold/35 bg-wow-gold/10 text-wow-gold-light",
  red: "border-rose-400/25 bg-rose-500/10 text-rose-300",
};

// an action's icon on its own coloured tile, so each line reads at a glance
function Tile({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${TONES[tone]}`}>{children}</span>
  );
}

function Avatar({ src, name, size }: { src?: string | null; name: string; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 text-base ring-2 ring-wow-gold/60" : "h-5 w-5 text-[10px] border border-wow-gold/50";

  return src ? (
    <img alt="" className={`${box} shrink-0 rounded-full object-cover`} src={src} />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-wow-gold/20 font-bold text-wow-gold-light`}
    >
      {name[0]}
    </span>
  );
}

// The account, always in sight at the top right: a sign-in button, or the account's avatar, name and soul shards with its menu
export function AccountMenu() {
  const { t, language } = useI18n();
  const { status, account, setStatus } = useLauncher();
  const signIn = useDisclosure();
  const name = status?.prefs.signedInAs;

  if (!status) return null;
  if (!name)
    return (
      <>
        <button
          className="mr-2 flex h-7 items-center gap-2 rounded-full border border-wow-gold/50 bg-wow-gold/10 px-3 text-[12px] font-semibold text-wow-gold-light transition hover:bg-wow-gold/20"
          onClick={signIn.onOpen}
        >
          <UserRound size={14} />
          {t("signin.submit")}
        </button>
        <SignInModal isOpen={signIn.isOpen} onClose={signIn.onClose} />
      </>
    );

  const realms = status.feed?.realms ?? [];
  const shopRealm = SHOP_REALMS.includes(status.prefs.realm ?? "") ? status.prefs.realm! : SHOP_REALMS[0];
  const shopName = realms.find((r) => r.id === shopRealm)?.name ?? shopRealm;
  const shards = account ? new Intl.NumberFormat(language).format(account.shards) : "…";

  return (
    <Dropdown
      disableAnimation
      classNames={{
        content:
          "w-[300px] p-0 rounded-xl border border-wow-gold/20 bg-[#0a101d]/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.65)]",
      }}
      placement="bottom-end"
    >
      <DropdownTrigger>
        <button className="mr-2 flex h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-1 pr-3 text-[12px] text-white/85 transition hover:border-wow-gold/40 data-[open=true]:border-wow-gold/50">
          <Avatar name={name} size="sm" src={account?.avatar} />
          <span className="font-semibold">{name}</span>
          {account && (
            <span className="flex items-center gap-1 border-l border-white/10 pl-2 tabular-nums text-violet-200">
              <img alt="" className="h-4 w-4" src={SHARD_ICON} />
              {shards}
            </span>
          )}
        </button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("account.signedInAs", { name })}
        classNames={{ base: "p-1.5" }}
        itemClasses={{
          base: "gap-3 rounded-lg px-2 py-2 outline-none data-[hover=true]:bg-white/[0.06] data-[focus-visible=true]:bg-white/[0.06] data-[focus-visible=true]:outline-none data-[focus-visible=true]:ring-0",
          title: "text-[13px] font-medium text-white/90",
          description: "text-[11px] text-white/45",
        }}
      >
        <DropdownSection aria-label={name} classNames={{ base: "mb-1" }}>
          <DropdownItem
            key="me"
            isReadOnly
            className="cursor-default p-0 data-[hover=true]:bg-transparent"
            textValue={name}
          >
            <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-gradient-to-br from-wow-gold/[0.14] via-white/[0.02] to-violet-500/[0.12] p-3">
              <div className="flex items-center gap-3">
                <Avatar name={name} size="lg" src={account?.avatar} />
                <div className="min-w-0">
                  <p className="truncate font-heading text-[16px] leading-tight text-wow-gold-light">{name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/90">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                    {t("account.connected")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-violet-400/25 bg-[#1a1030]/70 px-3 py-2">
                <img alt="" className="h-8 w-8 drop-shadow-[0_0_8px_rgba(168,85,247,0.55)]" src={SHARD_ICON} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/60">
                    {t("shop.balance")}
                  </p>
                  <p className="whitespace-nowrap leading-tight">
                    <span className="text-[18px] font-bold tabular-nums text-violet-50">{shards}</span>{" "}
                    <span className="text-[12px] text-violet-200/80">{t("shop.shards")}</span>
                  </p>
                </div>
              </div>
            </div>
          </DropdownItem>
        </DropdownSection>
        <DropdownSection aria-label={t("account.site")} classNames={{ base: "mb-0" }}>
          <DropdownItem
            key="shop"
            description={t("account.shopHint")}
            endContent={<ArrowUpRight className="text-white/30" size={14} />}
            startContent={
              <Tile tone="violet">
                <ShoppingBag size={15} />
              </Tile>
            }
            onPress={() => api.open("url", sitePage(language, `/${shopRealm}/shop`))}
          >
            {t("account.shopOf", { realm: shopName })}
          </DropdownItem>
          <DropdownItem
            key="site"
            description={t("account.siteHint")}
            endContent={<ArrowUpRight className="text-white/30" size={14} />}
            startContent={
              <Tile tone="gold">
                <UserRound size={15} />
              </Tile>
            }
            onPress={() => api.open("url", sitePage(language, "/account"))}
          >
            {t("account.site")}
          </DropdownItem>
        </DropdownSection>
        <DropdownSection aria-label={t("signin.signOut")} classNames={{ base: "mb-0 mt-1 border-t border-white/[0.06] pt-1" }}>
          <DropdownItem
            key="out"
            classNames={{ title: "text-[13px] font-medium text-rose-300" }}
            className="data-[hover=true]:bg-rose-500/10 data-[focus-visible=true]:bg-rose-500/10"
            startContent={
              <Tile tone="red">
                <LogOut size={15} />
              </Tile>
            }
            onPress={async () => setStatus(await api.accountLogout())}
          >
            {t("signin.signOut")}
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
