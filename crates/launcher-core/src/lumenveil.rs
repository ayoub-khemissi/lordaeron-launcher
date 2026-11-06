//! Lumenveil in the game folder: which version is there, installing a release zip over it with the player's settings
//! kept (and a backup to go back to), going back, and removing it. The same rules as the updater it replaces
//! (package/Lordaeron/update.ps1), and the same state folder, so a folder the updater kept goes on as it was:
//!   Lordaeron\lumenveil.txt   the installed version
//!   Lordaeron\hold.txt        a version the player went back from: not offered again until a newer one
//!   Lordaeron\backup\Lumenveil-<version>\   the files an update replaced, and added.txt, the files it added

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::error::coded;
use crate::ini;
use crate::version::{pe_version, Version};

pub const SETTINGS: [&str; 2] = ["CoAVolFog.ini", "CoAVolFog-regions.ini"];
pub const SECTION: &str = "CoAVolFog";

pub fn own(root: &Path) -> PathBuf {
    root.join("Lordaeron")
}

fn backups(root: &Path) -> PathBuf {
    own(root).join("backup")
}

/// The installed version: the DLL's own, else what the last install wrote; 0.0.0 for a copy of unknown age.
pub fn installed(root: &Path) -> Option<Version> {
    let dll = root.join("CoAVolFog.dll");
    if !dll.is_file() || !root.join("version.dll").is_file() {
        return None;
    }
    if let Some(v) = pe_version(&dll, true).filter(|v| *v != Version::ZERO) {
        return Some(v);
    }
    fs::read_to_string(own(root).join("lumenveil.txt"))
        .ok()
        .and_then(|t| Version::parse(&t))
        .or(Some(Version::ZERO))
}

/// The version the player went back from, while no newer one is out.
pub fn held(root: &Path) -> Option<Version> {
    fs::read_to_string(own(root).join("hold.txt")).ok().and_then(|t| Version::parse(&t))
}

pub fn clear_hold(root: &Path) {
    let _ = fs::remove_file(own(root).join("hold.txt"));
}

/// Files of the release that belong to the old updater (Lordaeron-Play.cmd, Lordaeron\update.ps1): the launcher
/// replaces them, so an install leaves them out.
fn updater_file(relative: &str) -> bool {
    relative.to_ascii_lowercase().starts_with("lordaeron")
}

fn norm(name: &str) -> String {
    name.replace('\\', "/").trim_start_matches('/').to_string()
}

fn safe(relative: &str) -> bool {
    !relative.is_empty() && !relative.split('/').any(|p| p == ".." || p.contains(':'))
}

/// A file Windows would run (a program, a library, a script): never one the server declares as a plain file, and in a
/// Lumenveil release only the ones it is made of.
pub fn runnable(path: &str) -> bool {
    const KINDS: &[&str] = &[
        "exe", "dll", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "scr", "com", "msi", "msp",
        "lnk", "reg", "hta", "cpl", "sys", "pif", "jar",
    ];
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path).to_ascii_lowercase();
    name.rsplit_once('.').is_some_and(|(_, ext)| KINDS.contains(&ext))
}

const RELEASE_PROGRAMS: &[&str] =
    &["version.dll", "CoAVolFog.dll", "Lumenveil/lamp_extract.exe", "Lumenveil-Setup.cmd", "Lumenveil-Uninstall.cmd"];

/// A release zip's files, by relative path with forward slashes (the zips made by Compress-Archive use backslashes).
pub fn read_zip(bytes: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|_| coded("badPackage", ""))?;
    let mut files = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = norm(entry.name());
        if entry.is_dir() || name.ends_with('/') {
            continue;
        }
        if !safe(&name) {
            return Err(coded("badPackage", name));
        }
        // a program in the release that Lumenveil is not made of (the old updater's .cmd files are left out later)
        if runnable(&name) && !RELEASE_PROGRAMS.contains(&name.as_str()) && !updater_file(&name) {
            return Err(coded("badPackage", name));
        }
        let mut data = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut data)?;
        files.push((name, data));
    }
    if !files.iter().any(|(n, _)| n == "CoAVolFog.dll") {
        return Err(coded("badPackage", "CoAVolFog.dll"));
    }
    Ok(files)
}

fn write(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, data).with_context(|| format!("cannot write {}", path.display()))
}

fn copy_tree(from: &Path, to: &Path, files: &[String]) -> Result<()> {
    for relative in files {
        let target = to.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(from.join(relative), &target).with_context(|| format!("cannot copy {relative}"))?;
    }
    Ok(())
}

fn tree(folder: &Path) -> Vec<String> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<String>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(base, &path, out);
            } else if let Ok(rel) = path.strip_prefix(base) {
                out.push(norm(&rel.to_string_lossy()));
            }
        }
    }
    let mut out = Vec::new();
    walk(folder, folder, &mut out);
    out
}

/// Installs a release over the game folder (the updater's Install-Package): a backup of what it replaces, the new
/// files, and each settings file merged with the player's (the old shipped one being Lumenveil\defaults).
/// Returns whether this was a first install.
pub fn install(root: &Path, files: &[(String, Vec<u8>)], version: Version) -> Result<bool> {
    let before = installed(root);
    let files: Vec<&(String, Vec<u8>)> = files.iter().filter(|(n, _)| !updater_file(n)).collect();
    let names: Vec<String> = files.iter().map(|(n, _)| n.clone()).collect();
    if let Some(before) = before {
        let backup = backups(root).join(format!("Lumenveil-{before}"));
        let _ = fs::remove_dir_all(&backup);
        fs::create_dir_all(&backup)?;
        let mut existing: Vec<String> = names
            .iter()
            .cloned()
            .chain(SETTINGS.iter().map(|s| s.to_string()))
            .filter(|n| root.join(n).is_file())
            .collect();
        existing.sort();
        existing.dedup();
        copy_tree(root, &backup, &existing)?;
        let added: Vec<String> = names.iter().filter(|n| !existing.contains(n)).cloned().collect();
        fs::write(backup.join("added.txt"), added.join("\r\n") + "\r\n")?;
    }
    let old_defaults: Vec<Option<String>> = SETTINGS
        .iter()
        .map(|s| fs::read_to_string(root.join("Lumenveil").join("defaults").join(s)).ok())
        .collect();
    for (name, data) in &files {
        if SETTINGS.contains(&name.as_str()) {
            continue;
        }
        let target = root.join(name);
        if fs::read(&target).ok().as_deref() == Some(data.as_slice()) {
            continue;
        }
        write(&target, data).map_err(|_| coded("cannotWrite", name.clone()))?;
    }
    for (i, setting) in SETTINGS.iter().enumerate() {
        let Some((_, shipped)) = files.iter().find(|(n, _)| n == setting) else { continue };
        let shipped = String::from_utf8_lossy(shipped).into_owned();
        let mine = root.join(setting);
        match fs::read_to_string(&mine) {
            Ok(current) => {
                fs::write(&mine, ini::merge(old_defaults[i].as_deref(), &shipped, Some(&current)))?;
            }
            Err(_) => {
                if before.is_none() || *setting == "CoAVolFog.ini" {
                    fs::write(&mine, &shipped)?;
                }
            }
        }
    }
    fs::create_dir_all(own(root))?;
    fs::write(own(root).join("lumenveil.txt"), version.to_string())?;
    // the last two backups are kept
    let mut kept: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(backups(root))
        .map(|d| {
            d.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path()))
                .collect()
        })
        .unwrap_or_default();
    kept.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, old) in kept.into_iter().skip(2) {
        let _ = fs::remove_dir_all(old);
    }
    Ok(before.is_none())
}

/// Back to the version before the last update (the updater's Restore-Lumenveil); that version is then held.
/// Returns the version gone back to.
pub fn rollback(root: &Path) -> Result<Version> {
    let Some(current) = installed(root) else { return Err(coded("notInstalled", "")) };
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(backups(root))
        .map(|d| {
            d.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path()))
                .collect()
        })
        .unwrap_or_default();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    let Some((_, backup)) = found.into_iter().next() else { return Err(coded("noBackup", "")) };
    let name = backup.file_name().unwrap().to_string_lossy().into_owned();
    let previous = Version::parse(name.trim_start_matches("Lumenveil-")).unwrap_or(Version::ZERO);
    let added = backup.join("added.txt");
    if let Ok(list) = fs::read_to_string(&added) {
        for relative in list.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let _ = fs::remove_file(root.join(norm(relative)));
        }
        fs::remove_file(&added)?;
    }
    copy_tree(&backup, root, &tree(&backup))?;
    fs::write(own(root).join("lumenveil.txt"), previous.to_string())?;
    fs::write(own(root).join("hold.txt"), current.to_string())?;
    fs::remove_dir_all(&backup)?;
    Ok(previous)
}

/// Removes Lumenveil from the game folder (the files Lumenveil-Uninstall.cmd removes, and the launcher's record).
pub fn uninstall(root: &Path) -> Result<()> {
    for file in [
        "version.dll",
        "CoAVolFog.dll",
        "CoAVolFog.ini",
        "CoAVolFog-regions.ini",
        "lampdata.bin",
        "liquiddata.bin",
        "CoAVolFog.log",
        "CoAVolFog-spots.txt",
        "Lumenveil-Setup.cmd",
        "Lumenveil-Uninstall.cmd",
    ] {
        let path = root.join(file);
        if path.exists() {
            fs::remove_file(&path).map_err(|_| coded("cannotWrite", file))?;
        }
    }
    for dir in ["CoAVolFog-spots", "Lumenveil"] {
        let _ = fs::remove_dir_all(root.join(dir));
    }
    for file in ["lumenveil.txt", "hold.txt"] {
        let _ = fs::remove_file(own(root).join(file));
    }
    let _ = fs::remove_dir_all(backups(root));
    Ok(())
}

/// The world data Lumenveil-Setup.cmd makes from the client's archives.
pub fn setup_missing(root: &Path) -> bool {
    !root.join("lampdata.bin").is_file() || !root.join("liquiddata.bin").is_file()
}

/// lamp_extract's arguments, as Lumenveil-Setup.cmd passes them.
pub fn setup_args(root: &Path, locale: &str) -> (PathBuf, Vec<String>) {
    let s = |p: PathBuf| p.to_string_lossy().into_owned();
    (
        root.join("Lumenveil").join("lamp_extract.exe"),
        vec![
            "--data".into(),
            s(root.join("Data")),
            "--out".into(),
            s(root.join("lampdata.bin")),
            "--liquids".into(),
            s(root.join("liquiddata.bin")),
            "--liquid-maps".into(),
            "0,1,530,571".into(),
            "--water-textures".into(),
            s(root.join("Lumenveil")),
            "--stamp".into(),
            s(root.join("Lumenveil").join("setup.stamp")),
            "--locale".into(),
            locale.into(),
            "--background".into(),
        ],
    )
}

/// The installed release's settings description (settings/schema.json), when it ships one.
pub fn schema_file(root: &Path, name: &str) -> Option<String> {
    fs::read_to_string(root.join("Lumenveil").join("settings").join(name)).ok()
}

/// CoAVolFog.ini's [CoAVolFog] values.
pub fn read_settings(root: &Path) -> Result<std::collections::HashMap<String, String>> {
    let text = fs::read_to_string(root.join("CoAVolFog.ini")).context("CoAVolFog.ini")?;
    Ok(ini::section(&text, SECTION))
}

/// Writes values into CoAVolFog.ini, comments kept; the game picks them up within a second.
pub fn write_settings(root: &Path, values: &[(String, String)]) -> Result<()> {
    let file = root.join("CoAVolFog.ini");
    let text = fs::read_to_string(&file).context("CoAVolFog.ini")?;
    let updated = ini::set(&text, SECTION, values);
    if updated != text {
        fs::write(&file, updated).context("cannot write CoAVolFog.ini")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(density: &str, extra: Option<&str>) -> Vec<(String, Vec<u8>)> {
        let mut files = vec![
            ("CoAVolFog.dll".to_string(), b"dll".to_vec()),
            ("version.dll".to_string(), b"proxy".to_vec()),
            ("CoAVolFog.ini".to_string(), format!("[CoAVolFog]\nDensity={density}\nHaze=1\n").into_bytes()),
            ("Lumenveil/defaults/CoAVolFog.ini".to_string(), format!("[CoAVolFog]\nDensity={density}\nHaze=1\n").into_bytes()),
            ("Lordaeron-Play.cmd".to_string(), b"old".to_vec()),
        ];
        if let Some(extra) = extra {
            files.push((extra.to_string(), b"new".to_vec()));
        }
        files
    }

    #[test]
    fn install_update_rollback_uninstall() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(install(root, &release("1", None), Version::parse("0.6.0").unwrap()).unwrap(), "first install");
        assert!(!root.join("Lordaeron-Play.cmd").exists(), "the old updater's files stay out");
        assert_eq!(installed(root), Some(Version::parse("0.6.0").unwrap()));
        write_settings(root, &[("Haze".into(), "2".into())]).unwrap();

        assert!(!install(root, &release("0.8", Some("Lumenveil/new.txt")), Version::parse("0.7.0").unwrap()).unwrap());
        let v = read_settings(root).unwrap();
        assert_eq!(v["Haze"], "2", "the player's value");
        assert_eq!(v["Density"], "0.8", "the new default");
        assert!(root.join("Lumenveil/new.txt").exists());

        assert_eq!(rollback(root).unwrap(), Version::parse("0.6.0").unwrap());
        assert!(!root.join("Lumenveil/new.txt").exists(), "the file the update added is gone");
        assert_eq!(read_settings(root).unwrap()["Density"], "1");
        assert_eq!(held(root), Some(Version::parse("0.7.0").unwrap()));

        uninstall(root).unwrap();
        assert!(installed(root).is_none());
        assert!(!root.join("CoAVolFog.ini").exists());
    }

    #[test]
    fn knows_what_runs() {
        assert!(runnable("Lumenveil/evil.EXE"));
        assert!(runnable("x.ps1"));
        assert!(!runnable("Data/patch-W.MPQ"));
        assert!(!runnable("Interface/AddOns/A/A.lua"));
    }

    #[test]
    fn reads_backslash_zips() {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
            zip.start_file("CoAVolFog.dll", options).unwrap();
            std::io::Write::write_all(&mut zip, b"x").unwrap();
            zip.start_file("Lumenveil\\defaults\\CoAVolFog.ini", options).unwrap();
            std::io::Write::write_all(&mut zip, b"[CoAVolFog]").unwrap();
            zip.finish().unwrap();
        }
        let files = read_zip(buf.get_ref()).unwrap();
        assert!(files.iter().any(|(n, _)| n == "Lumenveil/defaults/CoAVolFog.ini"));
    }
}
