//! CoAVolFog.ini and its regions file: reading values, changing a few in place (comments kept, as the game's own
//! Save button does), and the three-way merge an update makes (the updater's Merge-Ini, package/Lordaeron/update.ps1).

use std::collections::{HashMap, HashSet};

/// "section\nkey" -> value, for every `key=value` line; the lines before any [section] have the section "".
pub fn values(text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let mut section = String::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(name) = section_name(trimmed) {
            section = name.to_string();
            continue;
        }
        if let Some((key, value)) = key_value(trimmed) {
            out.insert(id(&section, key), value.to_string());
        }
    }
    out
}

/// The values of one section, by key.
pub fn section(text: &str, wanted: &str) -> HashMap<String, String> {
    values(text)
        .into_iter()
        .filter_map(|(id, value)| {
            let (section, key) = id.split_once('\n')?;
            section.eq_ignore_ascii_case(wanted).then(|| (key.to_string(), value))
        })
        .collect()
}

fn id(section: &str, key: &str) -> String {
    format!("{section}\n{key}")
}

fn section_name(trimmed: &str) -> Option<&str> {
    trimmed.strip_prefix('[')?.strip_suffix(']').map(str::trim)
}

fn key_value(trimmed: &str) -> Option<(&str, &str)> {
    if trimmed.is_empty() || trimmed.starts_with(';') {
        return None;
    }
    let at = trimmed.find('=')?;
    if at < 1 {
        return None;
    }
    Some((trimmed[..at].trim(), trimmed[at + 1..].trim()))
}

/// The text with `changes` written into `wanted`: a key's line is replaced where it stands, a key the file lacks is
/// added at the end of the section (or of a new section). Every other line, comments included, is kept. CRLF.
pub fn set(text: &str, wanted: &str, changes: &[(String, String)]) -> String {
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let mut done: HashSet<&str> = HashSet::new();
    let mut section = String::new();
    let mut section_end: Option<usize> = None;
    for (i, line) in lines.iter_mut().enumerate() {
        let trimmed = line.trim().to_string();
        if let Some(name) = section_name(&trimmed) {
            section = name.to_string();
            continue;
        }
        if !section.eq_ignore_ascii_case(wanted) {
            continue;
        }
        if !trimmed.is_empty() {
            section_end = Some(i);
        }
        if let Some((key, _)) = key_value(&trimmed) {
            if let Some((k, v)) = changes.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)) {
                *line = format!("{key}={v}");
                done.insert(k.as_str());
            }
        }
    }
    let missing: Vec<String> = changes
        .iter()
        .filter(|(k, _)| !done.contains(k.as_str()))
        .map(|(k, v)| format!("{k}={v}"))
        .collect();
    if !missing.is_empty() {
        match section_end {
            Some(end) => {
                for (offset, line) in missing.into_iter().enumerate() {
                    lines.insert(end + 1 + offset, line);
                }
            }
            None => {
                lines.push(format!("[{wanted}]"));
                lines.extend(missing);
            }
        }
    }
    let mut out = lines.join("\r\n");
    out.push_str("\r\n");
    out
}

fn player_value(old: &HashMap<String, String>, mine: &HashMap<String, String>, id: &str) -> bool {
    match (mine.get(id), old.get(id)) {
        (Some(_), None) => true,
        (Some(m), Some(o)) => m != o,
        _ => false,
    }
}

/// The shipped file of the new version (`new`) with the player's own values kept: a value the player changed from
/// the old version's shipped one stays, an untouched one takes the new default, a key the new file dropped goes unless
/// the player had set it, and the player's own sections (zone looks) are kept at the end. `old` is the previous
/// version's shipped file (Lumenveil\defaults), `mine` the player's file. CRLF.
pub fn merge(old: Option<&str>, new: &str, mine: Option<&str>) -> String {
    let old_values = old.map(values).unwrap_or_default();
    let mine_values = mine.map(values).unwrap_or_default();
    let new_values = values(new);
    let mut mine_order: Vec<String> = Vec::new();
    if let Some(mine) = mine {
        let mut section = String::new();
        for line in mine.lines() {
            let trimmed = line.trim();
            if let Some(name) = section_name(trimmed) {
                section = name.to_string();
                continue;
            }
            if let Some((key, _)) = key_value(trimmed) {
                mine_order.push(id(&section, key));
            }
        }
    }
    let mut out: Vec<String> = Vec::new();
    let mut sections: Vec<String> = vec![String::new()];
    let extras = |out: &mut Vec<String>, name: &str| {
        for id in &mine_order {
            let (section, key) = id.split_once('\n').unwrap();
            if section != name || new_values.contains_key(id) {
                continue;
            }
            if player_value(&old_values, &mine_values, id) {
                out.push(format!("{key}={}", mine_values[id]));
            }
        }
    };
    let mut section = String::new();
    for line in new.lines() {
        let trimmed = line.trim();
        if let Some(name) = section_name(trimmed) {
            extras(&mut out, &section);
            section = name.to_string();
            sections.push(section.clone());
            out.push(line.to_string());
            continue;
        }
        let Some((key, _)) = key_value(trimmed) else {
            out.push(line.to_string());
            continue;
        };
        let id = id(&section, key);
        if mine_values.contains_key(&id) {
            if player_value(&old_values, &mine_values, &id) {
                out.push(format!("{key}={}", mine_values[&id]));
            } else {
                out.push(line.to_string());
            }
        } else if old_values.contains_key(&id) && mine.is_some() {
            continue; // the player removed it
        } else {
            out.push(line.to_string());
        }
    }
    extras(&mut out, &section);
    let mut added: HashSet<String> = HashSet::new();
    for id in &mine_order {
        let (name, key) = id.split_once('\n').unwrap();
        if sections.iter().any(|s| s == name) || !player_value(&old_values, &mine_values, id) {
            continue;
        }
        if added.insert(name.to_string()) {
            out.push(format!("[{name}]"));
        }
        out.push(format!("{key}={}", mine_values[id]));
    }
    let mut text = out.join("\r\n");
    text.push_str("\r\n");
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD: &str = "; head\n[CoAVolFog]\nDensity=1\nHaze=1\nGone=3\n";
    const NEW: &str = "; head v2\n[CoAVolFog]\n; density help\nDensity=0.8\nHaze=1.2\nFresh=5\n";

    #[test]
    fn merge_keeps_the_players_values_and_takes_new_defaults() {
        let mine = "[CoAVolFog]\nDensity=0.5\nHaze=1\nGone=3\n";
        let out = merge(Some(OLD), NEW, Some(mine));
        let v = section(&out, "CoAVolFog");
        assert_eq!(v["Density"], "0.5", "changed by the player");
        assert_eq!(v["Haze"], "1.2", "untouched: the new default");
        assert_eq!(v["Fresh"], "5", "new key");
        assert!(!v.contains_key("Gone"), "dropped and untouched");
        assert!(out.contains("; density help"), "the new comments");
    }

    #[test]
    fn merge_keeps_player_sections() {
        let mine = "[CoAVolFog]\nDensity=1\n[Zone 1519]\nDensity=0.3\n";
        let out = merge(Some(OLD), NEW, Some(mine));
        assert_eq!(section(&out, "Zone 1519")["Density"], "0.3");
    }

    #[test]
    fn set_replaces_in_place_and_appends() {
        let text = "; c\n[CoAVolFog]\nDensity=1\n; x\nHaze=1\n\n[Other]\nA=1\n";
        let out = set(text, "CoAVolFog", &[("haze".into(), "2".into()), ("New".into(), "3".into())]);
        assert!(out.contains("Haze=2"));
        assert!(out.contains("; x"));
        let lines: Vec<&str> = out.lines().collect();
        let new_at = lines.iter().position(|l| *l == "New=3").unwrap();
        let other_at = lines.iter().position(|l| *l == "[Other]").unwrap();
        assert!(new_at < other_at, "added inside its section");
    }
}
