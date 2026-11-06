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
        let mut all: Vec<String> = self.realms.iter().flat_map(|r| r.patches.clone()).collect();
        all.sort();
        all.dedup();
        all
    }
}
