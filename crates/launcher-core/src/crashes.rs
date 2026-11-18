//! The game's crash reports. When the game stops on an error it leaves in its Errors folder a report
//! ("2026-11-19 00.37.28 Error.txt", or "… Crash.txt") and a dump beside it (.dmp). The launcher sends the new ones made
//! on a Lordaeron realm to the team (the site's app/api/launcher/crashes, posted to the team's Discord), the PC's names
//! masked in the text; the player can turn it off in Settings.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Older reports are left alone: a first start does not send a folder's whole history.
pub const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);
/// A report is a few hundred kB; past this only its start is sent.
pub const MAX_REPORT: usize = 1_400_000;
/// A dump is about half a MB; a bigger one stays on the PC (its size is told).
pub const MAX_DUMP: u64 = 5_000_000;

#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    /// the report's name without .txt: "2026-11-19 00.37.28 Error"
    pub name: String,
    pub report: PathBuf,
    pub dump: Option<PathBuf>,
}

/// The reports of the game's Errors folder made in the last days, oldest first.
pub fn find(root: &Path, now: SystemTime) -> Vec<Found> {
    let Ok(entries) = std::fs::read_dir(root.join("Errors")) else { return vec![] };
    let mut found: Vec<(SystemTime, Found)> = entries
        .flatten()
        .filter_map(|entry| {
            let file = entry.file_name().to_string_lossy().into_owned();
            let lower = file.to_ascii_lowercase();
            if !(lower.ends_with("error.txt") || lower.ends_with("crash.txt")) {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            if now.duration_since(modified).is_ok_and(|age| age > MAX_AGE) {
                return None;
            }
            let report = entry.path();
            let dump = Some(report.with_extension("dmp")).filter(|p| p.is_file());
            Some((modified, Found { name: file[..file.len() - 4].to_string(), report, dump }))
        })
        .collect();
    found.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name)));
    found.into_iter().map(|(_, f)| f).collect()
}

/// Whether the report was made on Lordaeron (the same game folder may serve other servers): its realmlist is
/// lordaeron.eu's, or the realm it names is one of ours.
pub fn on_lordaeron(text: &str, realms: &[String]) -> bool {
    text.lines().map(str::trim).any(|line| {
        if line.len() > 14 && line[..14].eq_ignore_ascii_case("SET realmList ") {
            return line[14..].to_ascii_lowercase().contains("lordaeron.eu");
        }
        match line.strip_prefix("Realm:") {
            Some(rest) => {
                let name = rest.split(" [").next().unwrap_or("").trim();
                !name.is_empty() && realms.iter().any(|r| r.eq_ignore_ascii_case(name))
            }
            None => false,
        }
    })
}

/// The report with the PC's names masked: the Windows account and the computer, and the user's folder in paths
/// (C:\Users\<name>\…). What the team needs stays: the error, the stacks, the character, the add-ons.
pub fn clean(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.split_inclusive('\n') {
        match masked_field(line, "User:").or_else(|| masked_field(line, "Computer:")) {
            Some(masked) => out.push_str(&masked),
            None => out.push_str(&mask_user_folders(line)),
        }
    }
    out
}

fn masked_field(line: &str, key: &str) -> Option<String> {
    let rest = line.strip_prefix(key)?;
    let pad: String = rest.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
    let ending = if line.ends_with("\r\n") {
        "\r\n"
    } else if line.ends_with('\n') {
        "\n"
    } else {
        ""
    };
    Some(format!("{key}{pad}***{ending}"))
}

fn mask_user_folders(line: &str) -> String {
    // ASCII lowercase keeps every byte where it was: the positions found in it hold in the line
    let lower = line.to_ascii_lowercase();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while let Some(at) = [lower[i..].find("\\users\\"), lower[i..].find("/users/")].into_iter().flatten().min() {
        let start = i + at + "\\users\\".len();
        out.push_str(&line[i..start]);
        let end = line[start..]
            .find(|c: char| matches!(c, '\\' | '/' | '"' | '\r' | '\n'))
            .map_or(line.len(), |e| start + e);
        if end > start {
            out.push_str("***");
        }
        i = end;
    }
    out.push_str(&line[i..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPORT: &str = "World of WarCraft (build 12340)\r\n\r\nExe:      C:\\Users\\Jean Dupont\\Games\\WoW\\Wow.exe\r\n\
        Time:     Nov 19, 2026 12:37:28.891 AM\r\nUser:     Jean Dupont\r\nComputer: DESKTOP-JEAN\r\n\
        Realm: Lordaeron Lab [217.182.198.21:8089]\r\nLocal Player: Kargh, 00000000000003B3, (3399.27,-3804.34,294.685)\r\n\
        SET realmList \"logon.lordaeron.eu\"\r\n\
        00772AB5 05F9FAEC 0001:00371AB5 C:\\USERS\\jean dupont\\Games\\WoW\\Wow.exe\r\n\
        Z:/Users/jean/Library/x.dll\r\nC:\\Users\\";

    #[test]
    fn the_pc_names_are_masked_and_the_rest_kept() {
        let clean = clean(REPORT);
        assert!(!clean.to_lowercase().contains("jean"), "{clean}");
        assert!(clean.contains("Exe:      C:\\Users\\***\\Games\\WoW\\Wow.exe\r\n"));
        assert!(clean.contains("User:     ***\r\nComputer: ***\r\n"));
        assert!(clean.contains("0001:00371AB5 C:\\USERS\\***\\Games"));
        assert!(clean.contains("Z:/Users/***/Library/x.dll"));
        assert!(clean.contains("Local Player: Kargh, 00000000000003B3"));
        assert!(clean.ends_with("C:\\Users\\"));
        assert_eq!(clean.len(), REPORT.len() - "Jean Dupont".len() * 3 - "DESKTOP-JEAN".len() - "jean".len() + 3 * 5);
    }

    #[test]
    fn only_lordaeron_reports_are_ours() {
        let realms = vec!["Lordaeron".to_string(), "Rimeheart".to_string(), "Lordaeron Lab".to_string()];
        assert!(on_lordaeron(REPORT, &realms));
        // at the login screen: no realm yet, the realmlist tells
        assert!(on_lordaeron("ERROR #132\nSET realmList \"logon.lordaeron.eu\"\n", &[]));
        assert!(on_lordaeron("Realm: Rimeheart [217.182.198.21:8086]\n", &realms));
        let elsewhere = "Realm: Icecrown [1.2.3.4:8085]\nSET realmList \"logon.example.com\"\n";
        assert!(!on_lordaeron(elsewhere, &realms));
        assert!(!on_lordaeron("ERROR #134 (0x85100086) Fatal Condition\n", &realms));
    }

    #[test]
    fn the_folder_s_recent_reports_oldest_first_with_their_dumps() {
        let dir = tempfile::tempdir().unwrap();
        let errors = dir.path().join("Errors");
        std::fs::create_dir(&errors).unwrap();
        let now = SystemTime::now();
        let write = |name: &str, age: u64| {
            let path = errors.join(name);
            std::fs::write(&path, "x").unwrap();
            std::fs::File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(now - Duration::from_secs(age))
                .unwrap();
        };
        write("2026-11-19 00.37.28 Error.txt", 60);
        write("2026-11-19 00.37.28 Error.dmp", 60);
        write("2026-11-18 21.02.10 Crash.txt", 3600);
        write("2026-10-01 10.00.00 Error.txt", 40 * 24 * 3600);
        write("notes.txt", 10);
        let found = find(dir.path(), now);
        let names: Vec<_> = found.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["2026-11-18 21.02.10 Crash", "2026-11-19 00.37.28 Error"]);
        assert_eq!(found[0].dump, None);
        assert_eq!(found[1].dump.as_deref(), Some(errors.join("2026-11-19 00.37.28 Error.dmp").as_path()));
        assert!(find(&dir.path().join("none"), now).is_empty());
    }
}
