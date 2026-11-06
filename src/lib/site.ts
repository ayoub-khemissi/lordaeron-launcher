// Pages of lordaeron.eu, in the launcher's language (the site has the same ones and more)
export const SITE = "https://lordaeron.eu";

export const sitePage = (language: string, path: string) => `${SITE}/${language}${path}`;

// the class colours of the game's own interface (RAID_CLASS_COLORS)
export const CLASS_COLORS: Record<number, string> = {
  1: "#C79C6E",
  2: "#F58CBA",
  3: "#ABD473",
  4: "#FFF569",
  5: "#FFFFFF",
  6: "#C41F3B",
  7: "#0070DE",
  8: "#69CCF0",
  9: "#9482C9",
  11: "#FF7D0A",
};

// the Soul Shard's own icon, the site's (lordaeron-front public/img/icons/soul-shard.svg), bundled
export const SHARD_ICON = "/soul-shard.svg";
