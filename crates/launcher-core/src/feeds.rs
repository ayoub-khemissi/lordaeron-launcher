//! What lordaeron.eu publishes for the launcher (/var/www/lordaeron-patches, served at /patches/).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// patches/launcher.json: the realms and where everything else is.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherFeed {
    pub realmlist: String,
    pub realms: Vec<RealmDef>,
    pub patches_url: String,
    pub lumenveil: BTreeMap<String, String>,
    #[serde(default)]
    pub news: Vec<serde_json::Value>,
    /// Any other file of the game folder the launcher keeps (an add-on, data made on the server, ...): declared here,
    /// so new content reaches the players without a new launcher.
    #[serde(default)]
    pub files: Vec<ManagedFile>,
    /// A message for every player on the Play tab (maintenance, an event), by language.
    #[serde(default)]
    pub notice: Option<Notice>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedFile {
    /// relative to the game folder, with forward slashes: "Interface/AddOns/Foo/Foo.toc", "lampdata.bin"
    pub path: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub version: String,
    /// the realms (ids) it belongs to; empty: every realm
    #[serde(default)]
    pub realms: Vec<String>,
    /// only with the enhanced graphics installed
    #[serde(default)]
    pub requires_lumenveil: bool,
}

impl ManagedFile {
    /// A path the launcher may write: relative, inside the game folder.
    pub fn safe(&self) -> bool {
        let p = &self.path;
        let inside = !p.is_empty()
            && !p.starts_with('/')
            && !p.starts_with('\\')
            && !p.contains(':')
            && !p.split(['/', '\\']).any(|s| s == "..");
        inside && !crate::lumenveil::runnable(p) && self.url.starts_with("https://lordaeron.eu/")
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String,
    #[serde(default)]
    pub level: String, // info, warning
    pub text: BTreeMap<String, String>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealmDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tagline: BTreeMap<String, String>,
    pub patches: Vec<String>,
    pub image: String,
    #[serde(default)]
    pub accent: String,
    #[serde(default)]
    pub hidden: bool,
    /// shown only to a signed-in account of at least this security level (the team's realms: the Lab)
    #[serde(default)]
    pub min_security: u8,
    /// false: the launcher leaves the game's patches as they are for this realm (a test realm with its own)
    #[serde(default = "yes")]
    pub manage_patches: bool,
    /// a word on its card: "Lab"
    #[serde(default)]
    pub badge: Option<String>,
}

fn yes() -> bool {
    true
}

impl RealmDef {
    /// Whether a player sees this realm: every public one, and the team's to an account of their level.
    pub fn visible_to(&self, security: Option<u8>) -> bool {
        if self.min_security == 0 {
            return !self.hidden;
        }
        security.is_some_and(|s| s >= self.min_security)
    }
}

/// patches/manifest.json: each patch's version, size and SHA-256.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PatchFeed {
    pub version: String,
    pub size: u64,
    pub sha256: String,
}

pub type Manifest = BTreeMap<String, PatchFeed>;

/// patches/lumenveil/latest.json (stable) or test.json (preview), written by lumenveil-publish.sh.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LumenveilFeed {
    pub version: String,
    #[serde(default)]
    pub date: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub credits: String,
}

impl LauncherFeed {
    /// The realms as the launcher knows them when lordaeron.eu cannot be reached.
    pub fn builtin() -> LauncherFeed {
        serde_json::from_str(include_str!("../launcher.json")).expect("launcher.json")
    }

    /// Every patch some realm uses: the launcher puts these in place or aside, and leaves any other MPQ alone.
    pub fn managed_patches(&self) -> Vec<String> {
        let mut all: Vec<String> = self.realms.iter().filter(|r| r.manage_patches).flat_map(|r| r.patches.clone()).collect();
        all.sort();
        all.dedup();
        all
    }
}
