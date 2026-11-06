import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { KeyRound, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { errorText } from "../lib/errors";
import { useLauncher } from "../lib/store";

// The launcher's sign-in: the website's account and, when it has one, its authenticator code. The launcher keeps a
// revocable token, never the password; each Play then logs into the game with a one-time ticket.
export function SignInModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { setStatus } = useLauncher();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.accountLogin(username, password, needsCode ? code : undefined));
      setPassword("");
      setCode("");
      setNeedsCode(false);
      onClose();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);

      if (raw.startsWith("totpRequired|")) setNeedsCode(true);
      else setError(errorText(t, e).text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal backdrop="blur" isOpen={isOpen} placement="center" size="md" onOpenChange={(o) => !o && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="font-heading text-xl text-wow-gold-light">{t("signin.title")}</span>
          <span className="text-[12.5px] font-normal text-white/50">{t("signin.subtitle")}</span>
        </ModalHeader>
        <ModalBody>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Input
              autoFocus
              autoComplete="username"
              classNames={{ inputWrapper: "bg-white/5" }}
              isDisabled={needsCode}
              label={t("signin.username")}
              labelPlacement="outside"
              placeholder={t("settings.accountPlaceholder")}
              startContent={<UserRound className="text-white/40" size={16} />}
              value={username}
              onValueChange={setUsername}
            />
            <Input
              autoComplete="current-password"
              classNames={{ inputWrapper: "bg-white/5" }}
              isDisabled={needsCode}
              label={t("signin.password")}
              labelPlacement="outside"
              placeholder="••••••••"
              startContent={<LockKeyhole className="text-white/40" size={16} />}
              type="password"
              value={password}
              onValueChange={setPassword}
            />
            {needsCode && (
              <Input
                autoFocus
                autoComplete="one-time-code"
                classNames={{ inputWrapper: "bg-white/5", input: "tracking-[0.4em] text-center" }}
                description={t("signin.codeHint")}
                inputMode="numeric"
                label={t("signin.code")}
                labelPlacement="outside"
                maxLength={6}
                placeholder="000000"
                startContent={<KeyRound className="text-white/40" size={16} />}
                value={code}
                onValueChange={(v) => setCode(v.replace(/\D/g, ""))}
              />
            )}
            {error && <p className="text-[12.5px] text-danger-400">{error}</p>}
            <button className="hidden" type="submit" />
          </form>
          <p className="flex gap-2 text-[11.5px] leading-snug text-white/40">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-400/70" size={14} />
            {t("signin.safety")}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            color="primary"
            isDisabled={!username.trim() || !password || (needsCode && code.length !== 6)}
            isLoading={busy}
            onPress={submit}
          >
            {t("signin.submit")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
