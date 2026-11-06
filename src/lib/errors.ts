import type { MessageKey } from "../i18n/en";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const KNOWN = new Set([
  "busy",
  "noGame",
  "notGame",
  "gameRunning",
  "notPublished",
  "cannotWrite",
  "locked",
  "cannotStart",
  "setupFailed",
  "notInstalled",
  "noBackup",
  "damaged",
  "badPackage",
  "offline",
]);

// The backend's errors come as "code|detail" (crates/launcher-core/src/error.rs): the sentence is the player's
// language's. An error without a code keeps the system's own words as its detail.
export function errorText(t: T, raw: unknown): { text: string; detail?: string } {
  const message = raw instanceof Error ? raw.message : String(raw);
  const at = message.indexOf("|");
  const code = at > 0 ? message.slice(0, at) : "other";
  const detail = at > 0 ? message.slice(at + 1) : message;

  if (KNOWN.has(code)) return { text: t(`error.${code}` as MessageKey, { detail }) };

  return { text: t("error.other"), detail: detail || undefined };
}

export const isPaused = (raw: string | null) => raw?.startsWith("paused|") ?? false;
