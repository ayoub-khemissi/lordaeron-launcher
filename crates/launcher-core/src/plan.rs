//! What Play has to do first: the realm's patches in place (downloaded when missing or out of date, the other
//! realms' set aside), the realm list, Lumenveil installed or updated, and its world data made.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::feeds::{LauncherFeed, LumenveilFeed, Manifest, RealmDef};
use crate::game;
use crate::lumenveil;
use crate::version::Version;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingItem {
    pub kind: &'static str, // patch, patchAside, patchBack, lumenveil, setup, realmlist
    pub name: String,
    pub size: u64,
    pub from: Option<String>,
    pub to: Option<String>,
}

impl PendingItem {
    fn new(kind: &'static str, name: &str) -> PendingItem {
        PendingItem { kind, name: name.to_string(), size: 0, from: None, to: None }
    }
}

/// Where the launcher keeps a realm's patch while another realm is played.
pub fn aside_dir(root: &Path) -> PathBuf {
    lumenveil::own(root).join("patches")
}

pub fn sha256_file(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).ok()?;
    Some(hex::encode(hasher.finalize()))
}

/// A patch is current when its hash is the manifest's; a patch the manifest does not list is left as it is.
fn current(path: &Path, manifest: &Manifest, name: &str) -> bool {
    match manifest.get(name) {
        Some(entry) => sha256_file(path).is_some_and(|h| h.eq_ignore_ascii_case(&entry.sha256)),
        None => path.is_file(),
    }
}

pub struct PlanInput<'a> {
    pub root: &'a Path,
    pub feed: &'a LauncherFeed,
    pub realm: &'a RealmDef,
    pub manifest: Option<&'a Manifest>,
    pub lumenveil: Option<&'a LumenveilFeed>,
    pub want_lumenveil: bool,
    pub repair: bool,
}

pub fn plan(input: &PlanInput) -> Vec<PendingItem> {
    let root = input.root;
    let mut out = Vec::new();
    let data = root.join("Data");
    let aside = aside_dir(root);
    let empty = Manifest::new();
    let manifest = input.manifest.unwrap_or(&empty);

    for name in input.feed.managed_patches() {
        let here = data.join(&name);
        let wanted = input.realm.patches.contains(&name);
        if !wanted {
            if here.is_file() {
                out.push(PendingItem::new("patchAside", &name));
            }
            continue;
        }
        if here.is_file() && (input.manifest.is_none() || current(&here, manifest, &name)) {
            continue;
        }
        let kept = aside.join(&name);
        if kept.is_file() && current(&kept, manifest, &name) {
            out.push(PendingItem::new("patchBack", &name));
            continue;
        }
        if let Some(entry) = manifest.get(&name) {
            let mut item = PendingItem::new("patch", &name);
            item.size = entry.size;
            item.to = Some(entry.version.clone());
            out.push(item);
        }
    }

    if let Some(locale) = game::locale(root) {
        if !game::realm_set(root, &locale, &input.feed.realmlist, &input.realm.name) {
            out.push(PendingItem::new("realmlist", &input.realm.name));
        }
    }

    if input.want_lumenveil {
        let installed = lumenveil::installed(root);
        let mut installing = false;
        if let Some(feed) = input.lumenveil {
            let latest = Version::parse(&feed.version);
            let held = lumenveil::held(root);
            let newer = match (installed, latest) {
                (None, Some(_)) => true,
                (Some(have), Some(latest)) => latest > have && held.map_or(true, |h| latest > h),
                _ => false,
            };
            if newer || (input.repair && installed.is_some()) {
                let mut item = PendingItem::new("lumenveil", "Lumenveil");
                item.size = feed.size;
                item.from = installed.map(|v| v.to_string());
                item.to = Some(feed.version.clone());
                out.push(item);
                installing = true;
            }
        }
        if installing || (installed.is_some() && lumenveil::setup_missing(root)) {
            out.push(PendingItem::new("setup", "Lumenveil"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed() -> LauncherFeed {
        LauncherFeed::builtin()
    }

    fn manifest(sha_w: &str) -> Manifest {
        serde_json::from_str(&format!(
            r#"{{"patch-W.MPQ":{{"version":"w2","size":10,"sha256":"{sha_w}"}},"patch-Z.MPQ":{{"version":"z1","size":5,"sha256":"{}"}}}}"#,
            hex::encode(Sha256::digest(b"zzz"))
        ))
        .unwrap()
    }

    #[test]
    fn swaps_patches_between_realms() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("Data/frFR")).unwrap();
        fs::write(root.join("Data/frFR/locale-frFR.MPQ"), b"").unwrap();
        fs::write(root.join("Data/patch-Z.MPQ"), b"zzz").unwrap();
        let f = feed();
        let rime = f.realms.iter().find(|r| r.id == "rimeheart").unwrap();
        let m = manifest(&hex::encode(Sha256::digest(b"www")));
        let input = PlanInput { root, feed: &f, realm: rime, manifest: Some(&m), lumenveil: None, want_lumenveil: false, repair: false };
        let kinds: Vec<(&str, String)> = plan(&input).into_iter().map(|p| (p.kind, p.name)).collect();
        assert!(kinds.contains(&("patchAside", "patch-Z.MPQ".into())));
        assert!(kinds.contains(&("patch", "patch-W.MPQ".into())));
        assert!(kinds.contains(&("realmlist", "Rimeheart".into())));

        // patch-W kept aside and still current: it comes back without a download
        fs::create_dir_all(aside_dir(root)).unwrap();
        fs::write(aside_dir(root).join("patch-W.MPQ"), b"www").unwrap();
        let kinds: Vec<&str> = plan(&input).into_iter().map(|p| p.kind).collect();
        assert!(kinds.contains(&"patchBack"));
        assert!(!kinds.contains(&"patch"));
    }
}
