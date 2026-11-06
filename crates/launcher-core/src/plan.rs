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

/// A managed patch as the player's folder has it, for the Settings card.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PatchState {
    pub name: String,
    pub realms: Vec<String>, // the realms that use it
    pub state: &'static str, // active, aside, outdated (here or aside, not the manifest's), missing
    pub version: Option<String>, // the manifest's
    pub size: u64,
}

pub fn patch_states(root: &Path, feed: &LauncherFeed, manifest: Option<&Manifest>) -> Vec<PatchState> {
    let empty = Manifest::new();
    let m = manifest.unwrap_or(&empty);
    feed.managed_patches()
        .into_iter()
        .map(|name| {
            let here = root.join("Data").join(&name);
            let aside = aside_dir(root).join(&name);
            let state = if here.is_file() {
                if manifest.is_none() || current(&here, m, &name) { "active" } else { "outdated" }
            } else if aside.is_file() {
                if manifest.is_none() || current(&aside, m, &name) { "aside" } else { "outdated" }
            } else {
                "missing"
            };
            PatchState {
                realms: feed.realms.iter().filter(|r| r.patches.contains(&name)).map(|r| r.name.clone()).collect(),
                version: m.get(&name).map(|e| e.version.clone()),
                size: m.get(&name).map_or(0, |e| e.size),
                state,
                name,
            }
        })
        .collect()
}

/// Keeps the player's disk clean: a patch set aside that is no longer the published one is of no use (the next
/// switch downloads the new one), nor is a download left unfinished for a week.
pub fn clean(root: &Path, manifest: &Manifest) {
    if let Ok(entries) = fs::read_dir(aside_dir(root)) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if manifest.contains_key(&name) && !current(&entry.path(), manifest, &name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    let week = std::time::Duration::from_secs(7 * 24 * 3600);
    if let Ok(entries) = fs::read_dir(lumenveil::own(root).join("download")) {
        for entry in entries.flatten() {
            let old = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age > week);
            if old {
                let _ = fs::remove_file(entry.path());
            }
        }
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

    let patches = if input.realm.manage_patches { input.feed.managed_patches() } else { Vec::new() };
    for name in patches {
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

    for file in input.feed.files.iter().filter(|f| f.safe()) {
        let here = root.join(&file.path);
        let kept = aside_dir(root).join("files").join(&file.path);
        let lumenveil_ok = !file.requires_lumenveil
            || (input.want_lumenveil && (lumenveil::installed(root).is_some() || input.lumenveil.is_some()));
        let wanted = (file.realms.is_empty() || file.realms.contains(&input.realm.id)) && lumenveil_ok;
        let good = |p: &Path| sha256_file(p).is_some_and(|h| h.eq_ignore_ascii_case(&file.sha256));
        if !wanted {
            if here.is_file() && file.realms.len() > 0 {
                out.push(PendingItem::new("fileAside", &file.path));
            }
            continue;
        }
        if here.is_file() && good(&here) {
            continue;
        }
        if kept.is_file() && good(&kept) {
            out.push(PendingItem::new("fileBack", &file.path));
            continue;
        }
        let mut item = PendingItem::new("file", &file.path);
        item.size = file.size;
        item.to = Some(file.version.clone());
        out.push(item);
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

    #[test]
    fn keeps_declared_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let mut f = feed();
        f.files = serde_json::from_str(&format!(
            r#"[{{"path":"Interface/AddOns/Rime/Rime.toc","url":"https://x/Rime.toc","sha256":"{}","size":3,"realms":["rimeheart"]}},
                {{"path":"../evil","url":"https://x","sha256":"00","size":1}}]"#,
            hex::encode(Sha256::digest(b"abc"))
        ))
        .unwrap();
        let rime = f.realms.iter().find(|r| r.id == "rimeheart").unwrap().clone();
        let lord = f.realms.iter().find(|r| r.id == "lordaeron").unwrap().clone();
        let plan_for = |realm: &RealmDef| {
            plan(&PlanInput { root, feed: &f, realm, manifest: None, lumenveil: None, want_lumenveil: false, repair: false })
                .into_iter()
                .map(|p| (p.kind, p.name))
                .collect::<Vec<_>>()
        };
        assert!(plan_for(&rime).contains(&("file", "Interface/AddOns/Rime/Rime.toc".into())));
        assert!(!plan_for(&rime).iter().any(|(_, n)| n.contains("evil")), "a path out of the folder is ignored");
        fs::create_dir_all(root.join("Interface/AddOns/Rime")).unwrap();
        fs::write(root.join("Interface/AddOns/Rime/Rime.toc"), b"abc").unwrap();
        assert!(!plan_for(&rime).iter().any(|(k, _)| *k == "file"));
        assert!(plan_for(&lord).contains(&("fileAside", "Interface/AddOns/Rime/Rime.toc".into())));
    }

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
        let states = patch_states(root, &f, Some(&m));
        assert_eq!(states.iter().find(|p| p.name == "patch-W.MPQ").unwrap().state, "aside");
        assert_eq!(states.iter().find(|p| p.name == "patch-Z.MPQ").unwrap().state, "active");

        // a newer patch-W is published: the copy aside is stale, and goes
        let newer = manifest(&hex::encode(Sha256::digest(b"w2")));
        clean(root, &newer);
        assert!(!aside_dir(root).join("patch-W.MPQ").exists());
    }
}
