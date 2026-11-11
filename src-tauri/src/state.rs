//! What the launcher remembers while it runs: the player's choices (saved), the last feeds read from lordaeron.eu,
//! and whether an update is running.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use launcher_core::feeds::{LauncherFeed, LumenveilFeed, Manifest};
use launcher_core::prefs::Prefs;
use tauri::{AppHandle, Manager};

pub struct Feeds {
    pub launcher: LauncherFeed,
    pub manifest: Option<Manifest>,
    pub lumenveil: Option<LumenveilFeed>,
    pub online: bool,
}

pub struct AppState {
    pub prefs: Mutex<Prefs>,
    pub prefs_file: PathBuf,
    pub feeds: Mutex<Feeds>,
    pub busy: AtomicBool,
    pub running: AtomicBool,
    /// when Play last started the game (a Mac's Wine shows it only after a while)
    pub started: Mutex<Option<std::time::Instant>>,
    pub repair_next: AtomicBool,
    pub paused: AtomicBool,
    pub log_file: PathBuf,
}

impl AppState {
    pub fn load(app: &AppHandle) -> anyhow::Result<AppState> {
        let config = app.path().app_config_dir()?;
        let logs = app.path().app_log_dir().unwrap_or_else(|_| config.clone());
        let _ = std::fs::create_dir_all(&logs);
        let prefs_file = config.join("prefs.json");
        Ok(AppState {
            prefs: Mutex::new(Prefs::load(&prefs_file)),
            prefs_file,
            feeds: Mutex::new(Feeds {
                launcher: LauncherFeed::builtin(),
                manifest: None,
                lumenveil: None,
                online: false,
            }),
            busy: AtomicBool::new(false),
            running: AtomicBool::new(false),
            started: Mutex::new(None),
            repair_next: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            log_file: logs.join("launcher.log"),
        })
    }

    pub fn prefs(&self) -> Prefs {
        self.prefs.lock().unwrap().clone()
    }

    pub fn save_prefs(&self, prefs: Prefs) -> anyhow::Result<()> {
        prefs.save(&self.prefs_file)?;
        *self.prefs.lock().unwrap() = prefs;
        Ok(())
    }

    pub fn game_dir(&self) -> Option<PathBuf> {
        self.prefs.lock().unwrap().game_dir.clone().map(PathBuf::from)
    }

    /// One line in launcher.log, for when a player asks for help.
    pub fn log(&self, line: &str) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&self.log_file) {
            let _ = writeln!(file, "{stamp} {line}");
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}
