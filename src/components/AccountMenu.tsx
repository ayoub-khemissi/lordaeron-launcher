import { Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, useDisclosure } from "@heroui/react";
import { ExternalLink, LogOut, ShoppingBag, UserRound } from "lucide-react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { SHARD_ICON, sitePage } from "../lib/site";
import { useLauncher } from "../lib/store";

import { SignInModal } from "./SignIn";

// The account, always in sight at the top right: a sign-in button, or the account's avatar, name and soul shards with its menu
export function AccountMenu() {
  const { t, language } = useI18n();
  const { status, account, setStatus } = useLauncher();
  const signIn = useDisclosure();
  const name = status?.prefs.signedInAs;
  const realm = status?.prefs.realm ?? "lordaeron";

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

  return (
    <Dropdown disableAnimation placement="bottom-end">
      <DropdownTrigger>
        <button className="mr-2 flex h-7 items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-1 pr-3 text-[12px] text-white/85 transition hover:border-wow-gold/40">
          {account?.avatar ? (
            <img alt="" className="h-5 w-5 rounded-full border border-wow-gold/50" src={account.avatar} />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wow-gold/20 text-[10px] font-bold text-wow-gold-light">
              {name[0]}
            </span>
          )}
          <span className="font-semibold">{name}</span>
          {account && (
            <span className="flex items-center gap-1 border-l border-white/10 pl-2 tabular-nums text-violet-200">
              <img alt="" className="h-3.5 w-3.5 rounded-sm" src={SHARD_ICON} />
              {new Intl.NumberFormat(language).format(account.shards)}
            </span>
          )}
        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label={name}>
        <DropdownSection showDivider title={t("account.signedInAs", { name })}>
          <DropdownItem
            key="shop"
            description={t("account.shards", { count: account?.shards ?? 0 })}
            startContent={<ShoppingBag size={15} />}
            onPress={() => api.open("url", sitePage(language, `/${realm}/shop`))}
          >
            {t("account.shop")}
          </DropdownItem>
          <DropdownItem
            key="site"
            startContent={<ExternalLink size={15} />}
            onPress={() => api.open("url", sitePage(language, "/account"))}
          >
            {t("account.site")}
          </DropdownItem>
        </DropdownSection>
        <DropdownSection>
          <DropdownItem
            key="out"
            className="text-danger"
            color="danger"
            startContent={<LogOut size={15} />}
            onPress={async () => setStatus(await api.accountLogout())}
          >
            {t("signin.signOut")}
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
