// What the backend (src-tauri) and the UI exchange. Field names match the Rust structs (serde camelCase).

export type Channel = "stable" | "test";

export interface Prefs {
  gameDir: string | null;
  realm: string;
  channel: Channel;
  language: string | null; // null: the system's
  afterPlay: "minimize" | "close" | "stay";
  lumenveil: boolean; // the player wants the enhanced graphics
  pendingPreset: string | null; // chosen before Lumenveil was installed: applied by the install
  downloadLimit: number; // bytes per second, 0 = no limit
  autoUpdate: boolean; // update as soon as the launcher opens, not only at Play
}

export interface GameInfo {
  path: string;
  ok: boolean;
  locale: string | null; // the client's language folder: frFR, enUS, ...
  problem: "missing" | "noWow" | "notWotlk" | "noLocale" | null;
}

export interface RealmDef {
  id: string;
  name: string; // as in the game's realm list
  tagline: Record<string, string>;
  patches: string[]; // the MPQs this realm needs in Data; every other managed patch is put aside
  image: string; // a file of the launcher's own (realms/<id>.webp) or a URL
  accent: "gold" | "ice";
  hidden?: boolean;
}

export interface LauncherFeed {
  realmlist: string;
  realms: RealmDef[];
  patchesUrl: string;
  lumenveil: Record<Channel, string>;
  news?: { title: Record<string, string>; url: string; date: string }[];
}

export interface PatchFeed {
  version: string;
  size: number;
  sha256: string;
}

export interface LumenveilFeed {
  version: string;
  date: string;
  url: string;
  size: number;
  sha256: string;
  notes: string;
  source: string;
  credits: string;
}

export interface Status {
  prefs: Prefs;
  game: GameInfo | null;
  online: boolean; // the feeds could be read
  feed: LauncherFeed | null;
  lumenveil: { installed: string | null; available: LumenveilFeed | null; enabled: boolean; held: boolean };
  pending: PendingItem[]; // what Play would download or redo first
  running: boolean; // Wow.exe from this folder is running
  launcherVersion: string;
}

export interface PendingItem {
  kind: "patch" | "patchAside" | "patchBack" | "lumenveil" | "setup" | "realmlist";
  name: string;
  size: number; // bytes to download, 0 when nothing is
  from?: string | null;
  to?: string | null;
}

export interface Progress {
  step: PendingItem["kind"] | "done" | "launch";
  name: string;
  done: number; // bytes (the setup: thousandths)
  total: number;
  speed: number; // bytes per second, over the last seconds
  index: number; // which of `count` steps
  count: number;
}

// settings/schema.json of the installed Lumenveil (scripts/settings_schema.py)
export type SettingType =
  | "float"
  | "int"
  | "bool"
  | "choice"
  | "viewDistance"
  | "hotkey"
  | "zoneList"
  | "zoneFactors"
  | "text";

export interface Condition {
  key: string;
  is?: boolean;
  not?: number;
}

export interface SettingDef {
  section: string;
  group?: string;
  label: string;
  help: string;
  type: SettingType;
  min?: number;
  max?: number;
  step?: number;
  engineMin?: number;
  engineMax?: number;
  decimals?: number;
  unit?: string;
  scale?: "log";
  off?: number;
  options?: { value: number; label: string }[];
  enabledWhen?: Condition[];
  default: number | boolean | string;
  globalOnly?: boolean;
  level: "essential" | "advanced" | "expert";
}

export interface SectionDef {
  id: string;
  title: string;
  level: "advanced" | "expert";
  settings: string[];
}

export interface Schema {
  schemaVersion: number;
  lumenveil: string;
  essentials: string[];
  sections: SectionDef[];
  settings: Record<string, SettingDef>;
}

export interface PresetDef {
  id: string;
  label: string;
  help: string;
  values: Record<string, number | boolean>;
}

export interface Presets {
  default: string;
  presets: PresetDef[];
}

export interface SettingsFile {
  schema: Schema;
  presets: Presets;
  values: Record<string, string>; // the ini's raw values, by key
  path: string;
}

// patches/launcher/news.json, written from Discord's #changelog and #announcements by scripts/launcher-news.py
export interface NewsPost {
  id: string;
  date: string; // ISO
  edited: string | null;
  title: string | null;
  realm: string | null; // "lordaeron", "rimeheart", or null for both
  markdown: string;
  images: { url: string; width: number; height: number }[];
  url: string; // the message on Discord
}

export interface News {
  updated: string;
  pages?: { announcements: number; changelog: number }; // pages of 10, the first being here
  announcements: NewsPost[];
  changelog: NewsPost[];
}
