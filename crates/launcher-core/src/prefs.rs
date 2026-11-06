//! The launcher's own choices, in %APPDATA%\Lordaeron Launcher\prefs.json.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    pub game_dir: Option<String>,
    pub realm: String,
    pub channel: String,
    pub language: Option<String>,
    pub after_play: String,
    pub lumenveil: bool,
    pub pending_preset: Option<String>,
    pub download_limit: u64,
    pub auto_update: bool,
    pub account_name: Option<String>,
    // a random id of this installation: the reports' limits and history go by it (never the player's identity)
    pub install_id: String,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            game_dir: None,
            realm: "lordaeron".into(),
            channel: "stable".into(),
            language: None,
            after_play: "minimize".into(),
            lumenveil: true,
            pending_preset: None,
            download_limit: 0,
            auto_update: true,
            account_name: None,
            install_id: String::new(),
        }
    }
}

impl Prefs {
    pub fn load(file: &Path) -> Prefs {
        let mut prefs: Prefs = fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        if prefs.install_id.len() != 32 {
            use sha2::{Digest, Sha256};
            let seed = format!(
                "{:?}{}{:p}",
                std::time::SystemTime::now(),
                std::process::id(),
                &prefs as *const Prefs
            );
            prefs.install_id = hex::encode(&Sha256::digest(seed.as_bytes())[..16]);
            let _ = prefs.save(file);
        }
        prefs
    }

    pub fn save(&self, file: &Path) -> anyhow::Result<()> {
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(file, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    /// Applies the fields present in a partial JSON object (the UI sends only what changed).
    pub fn merge(&mut self, changes: &serde_json::Value) -> anyhow::Result<()> {
        let mut current = serde_json::to_value(&*self)?;
        if let (Some(target), Some(source)) = (current.as_object_mut(), changes.as_object()) {
            for (k, v) in source {
                target.insert(k.clone(), v.clone());
            }
        }
        *self = serde_json::from_value(current)?;
        Ok(())
    }
}
