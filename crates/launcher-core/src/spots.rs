//! The places a player marked with Ctrl+F5 in the game (Lumenveil's CoAVolFog-spots.txt, engine/src/spots.cpp), to
//! report them from the launcher, with the look settings saved beside each and the screenshot taken there.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{Local, NaiveDateTime, TimeZone};
use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spot {
    pub number: u32,
    pub saved: String, // local time, "2026-11-06 18:05:00"
    pub map: i32,
    pub game_time: String,
    pub weather: String, // clear, rain, snow, sand, then its strength
    pub indoors: bool,
    pub settings_file: Option<String>,
    pub text: String,
}

fn value<'a>(block: &'a str, key: &str) -> Option<&'a str> {
    block.lines().find_map(|l| l.strip_prefix(key).and_then(|r| r.strip_prefix(" = ")).map(str::trim))
}

/// Every spot of the file, the newest first.
pub fn read(root: &Path) -> Vec<Spot> {
    let Ok(text) = fs::read_to_string(root.join("CoAVolFog-spots.txt")) else { return Vec::new() };
    let mut spots: Vec<Spot> = text
        .split("[spot ")
        .skip(1)
        .filter_map(|chunk| {
            let block = format!("[spot {}", chunk.trim_end());
            let number = chunk.split(']').next()?.trim().parse().ok()?;
            Some(Spot {
                number,
                saved: value(&block, "saved")?.to_string(),
                map: value(&block, "map").and_then(|m| m.parse().ok()).unwrap_or(-1),
                game_time: value(&block, "game time").map(|t| t.split(' ').next().unwrap_or(t).to_string()).unwrap_or_default(),
                weather: value(&block, "weather").unwrap_or("clear").to_string(),
                indoors: value(&block, "indoors").and_then(|v| v.parse::<f32>().ok()).is_some_and(|v| v >= 0.5),
                settings_file: value(&block, "settings").filter(|s| *s != "not saved").map(|s| s.replace('\\', "/")),
                text: block.replace("\r\n", "\n").replace('\n', "\r\n") + "\r\n",
            })
        })
        .collect();
    spots.sort_by(|a, b| b.saved.cmp(&a.saved).then(b.number.cmp(&a.number)));
    spots
}

pub fn settings(root: &Path, spot: &Spot) -> Option<String> {
    let file = spot.settings_file.as_ref()?;
    if file.contains("..") {
        return None;
    }
    fs::read_to_string(root.join(file)).ok()
}

/// The game's screenshot (Screenshots\*.jpg or .png) taken closest to the spot, within ten minutes of it.
pub fn screenshot_near(root: &Path, saved: &str) -> Option<PathBuf> {
    let at = NaiveDateTime::parse_from_str(saved, "%Y-%m-%d %H:%M:%S").ok()?;
    let at = Local.from_local_datetime(&at).single()?.timestamp();
    fs::read_dir(root.join("Screenshots"))
        .ok()?
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            name.ends_with(".jpg") || name.ends_with(".png")
        })
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            let secs = modified.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64;
            let gap = (secs - at).abs();
            (gap <= 600).then_some((gap, e.path()))
        })
        .min_by_key(|(gap, _)| *gap)
        .map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_spots_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("CoAVolFog-spots.txt"),
            "[spot 1]\r\nsaved = 2026-11-06 18:05:00\r\nmap = 571\r\ngame time = 21:14 (day 0.8847)\r\nweather = rain 0.65\r\nindoors = 0.00\r\nsettings = CoAVolFog-spots\\spot-001.ini\r\n\r\n[spot 2]\r\nsaved = 2026-11-06 18:09:30\r\nmap = 0\r\ngame time = 06:02 (day 0.2514)\r\nweather = clear 0.00\r\nindoors = 1.00\r\nsettings = not saved\r\n\r\n",
        )
        .unwrap();
        fs::create_dir_all(dir.path().join("CoAVolFog-spots")).unwrap();
        fs::write(dir.path().join("CoAVolFog-spots/spot-001.ini"), "[CoAVolFog]\r\nDensity=0.5\r\n").unwrap();
        let spots = read(dir.path());
        assert_eq!(spots.len(), 2);
        assert_eq!(spots[0].number, 2);
        assert!(spots[0].indoors);
        assert_eq!(spots[1].map, 571);
        assert_eq!(spots[1].game_time, "21:14");
        assert!(spots[1].text.starts_with("[spot 1]"));
        assert!(settings(dir.path(), &spots[1]).unwrap().contains("Density"));
        assert!(settings(dir.path(), &spots[0]).is_none());
    }
}
