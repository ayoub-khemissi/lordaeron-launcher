//! The game folder: is it a World of Warcraft 3.3.5a client, which language is it, where can one be found, and the
//! client files the launcher sets (the realm list, the realm to log into, the cache).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::version::{pe_version, Version};

pub const WOTLK: Version = Version([3, 3, 5, 12340]);

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    pub path: String,
    pub ok: bool,
    pub locale: Option<String>,
    pub problem: Option<&'static str>,
}

/// The client's language folder (Data\frFR, with its locale-frFR.MPQ).
pub fn locale(root: &Path) -> Option<String> {
    let mut found: Vec<String> = fs::read_dir(root.join("Data"))
        .ok()?
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|name| name.len() == 4 && root.join("Data").join(name).join(format!("locale-{name}.MPQ")).is_file())
        .collect();
    found.sort();
    found.into_iter().next()
}

pub fn check(root: &Path) -> GameInfo {
    let path = root.to_string_lossy().into_owned();
    let fail = |problem| GameInfo { path: path.clone(), ok: false, locale: None, problem: Some(problem) };
    if !root.is_dir() {
        return fail("missing");
    }
    let exe = root.join("Wow.exe");
    if !exe.is_file() {
        return fail("noWow");
    }
    // a client without a version in Wow.exe (some are rebuilt) passes on its Wrath archive alone
    match pe_version(&exe, false) {
        Some(v) if v != WOTLK => return fail("notWotlk"),
        _ if !root.join("Data").join("lichking.MPQ").is_file() => return fail("notWotlk"),
        _ => {}
    }
    match locale(root) {
        Some(locale) => GameInfo { path, ok: true, locale: Some(locale), problem: None },
        None => fail("noLocale"),
    }
}

/// Folders with a Wow.exe, from the places people keep games: each drive's top two levels (not Windows' own),
/// Program Files, and the user's desktop, downloads and documents. `extra` comes first (the last folder used).
pub fn find(roots: &[PathBuf], extra: &[PathBuf]) -> Vec<GameInfo> {
    const SKIP: &[&str] = &[
        "windows", "$recycle.bin", "system volume information", "programdata", "recovery", "perflogs", "msocache",
        "appdata", "node_modules", ".git",
    ];
    let mut found: Vec<PathBuf> = extra.iter().filter(|p| p.join("Wow.exe").is_file()).cloned().collect();
    fn walk(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
        if dir.join("Wow.exe").is_file() {
            found.push(dir.to_path_buf());
            return;
        }
        if depth == 0 {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten().take(400) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if SKIP.contains(&name.as_str()) || name.starts_with('.') || !path.is_dir() {
                continue;
            }
            walk(&path, depth - 1, found);
        }
    }
    for root in roots {
        walk(root, 2, &mut found);
    }
    let mut seen = std::collections::HashSet::new();
    found
        .into_iter()
        .filter(|p| seen.insert(p.to_string_lossy().to_lowercase()))
        .map(|p| check(&p))
        .collect()
}

pub fn realmlist_file(root: &Path, locale: &str) -> PathBuf {
    root.join("Data").join(locale).join("realmlist.wtf")
}

/// Whether the client already points at `realmlist` and logs into `realm`.
pub fn realm_set(root: &Path, locale: &str, realmlist: &str, realm: &str) -> bool {
    let list = fs::read_to_string(realmlist_file(root, locale)).unwrap_or_default();
    let list_ok = list.lines().any(|l| {
        let l = l.trim().to_lowercase();
        l.starts_with("set realmlist") && l.trim_start_matches("set realmlist").trim().trim_matches('"') == realmlist.to_lowercase()
    });
    let config = fs::read_to_string(root.join("WTF").join("Config.wtf")).unwrap_or_default();
    list_ok && cvar(&config, "realmName").as_deref() == Some(realm)
}

fn cvar(config: &str, name: &str) -> Option<String> {
    config.lines().find_map(|l| {
        let rest = l.trim().strip_prefix("SET ")?;
        let (key, value) = rest.split_once(' ')?;
        key.eq_ignore_ascii_case(name).then(|| value.trim().trim_matches('"').to_string())
    })
}

fn set_cvar(config: &str, name: &str, value: &str) -> String {
    let line = format!("SET {name} \"{value}\"");
    let mut done = false;
    let mut lines: Vec<String> = config
        .lines()
        .map(|l| {
            let is = l.trim().strip_prefix("SET ").and_then(|r| r.split_once(' ')).is_some_and(|(k, _)| k.eq_ignore_ascii_case(name));
            if is {
                done = true;
                line.clone()
            } else {
                l.to_string()
            }
        })
        .collect();
    if !done {
        lines.push(line);
    }
    lines.join("\r\n") + "\r\n"
}

/// Points the client at the server and at the chosen realm: realmlist.wtf, and in WTF\Config.wtf the realm the
/// login goes straight to (realmName) and the realm list the client may keep there (realmList).
pub fn set_realm(root: &Path, locale: &str, realmlist: &str, realm: &str) -> anyhow::Result<()> {
    fs::write(realmlist_file(root, locale), format!("set realmlist {realmlist}\r\n"))?;
    let wtf = root.join("WTF");
    fs::create_dir_all(&wtf)?;
    let file = wtf.join("Config.wtf");
    let config = fs::read_to_string(&file).unwrap_or_default();
    let mut updated = set_cvar(&config, "realmName", realm);
    if cvar(&config, "realmList").is_some() {
        updated = set_cvar(&updated, "realmList", realmlist);
    }
    if updated != config {
        fs::write(&file, updated)?;
    }
    Ok(())
}

/// The client's caches of items, creatures and quests: stale after a patch or a realm change.
pub fn clear_cache(root: &Path) {
    let _ = fs::remove_dir_all(root.join("Cache"));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(dir: &Path) {
        fs::create_dir_all(dir.join("Data/frFR")).unwrap();
        fs::write(dir.join("Wow.exe"), b"MZ").unwrap();
        fs::write(dir.join("Data/lichking.MPQ"), b"").unwrap();
        fs::write(dir.join("Data/frFR/locale-frFR.MPQ"), b"").unwrap();
    }

    #[test]
    fn checks_a_client() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(check(dir.path()).problem, Some("noWow"));
        client(dir.path());
        let info = check(dir.path());
        assert!(info.ok, "{info:?}");
        assert_eq!(info.locale.as_deref(), Some("frFR"));
    }

    #[test]
    fn sets_the_realm() {
        let dir = tempfile::tempdir().unwrap();
        client(dir.path());
        fs::create_dir_all(dir.path().join("WTF")).unwrap();
        fs::write(dir.path().join("WTF/Config.wtf"), "SET gxResolution \"1920x1080\"\nSET realmName \"Other\"\n").unwrap();
        assert!(!realm_set(dir.path(), "frFR", "logon.lordaeron.eu", "Rimeheart"));
        set_realm(dir.path(), "frFR", "logon.lordaeron.eu", "Rimeheart").unwrap();
        assert!(realm_set(dir.path(), "frFR", "logon.lordaeron.eu", "Rimeheart"));
        let config = fs::read_to_string(dir.path().join("WTF/Config.wtf")).unwrap();
        assert!(config.contains("gxResolution"));
        assert_eq!(config.matches("realmName").count(), 1);
    }

    #[test]
    fn finds_clients() {
        let dir = tempfile::tempdir().unwrap();
        client(&dir.path().join("Games/WoW 3.3.5"));
        let found = find(&[dir.path().to_path_buf()], &[]);
        assert_eq!(found.len(), 1);
        assert!(found[0].ok);
    }
}
