//! Whether the game of the chosen folder is running: checked every two seconds, told to the window when it changes.

use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::Duration;

use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

pub fn game_running(system: &mut System, root: Option<&Path>) -> bool {
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|p| {
        if cfg!(windows) {
            if !p.name().to_string_lossy().eq_ignore_ascii_case("wow.exe") {
                return false;
            }
            // another client from another folder does not lock this one's files
            return match (p.exe(), root) {
                (Some(exe), Some(root)) => exe
                    .parent()
                    .map(|dir| dir.to_string_lossy().eq_ignore_ascii_case(&root.to_string_lossy()))
                    .unwrap_or(true),
                _ => true,
            };
        }
        // on a Mac the game is a Wine process: its name or its command line ends with Wow.exe
        let wow = |s: &std::ffi::OsStr| s.to_string_lossy().to_lowercase().replace('\\', "/").ends_with("wow.exe");
        wow(p.name()) || p.cmd().iter().take(3).any(|a| wow(a.as_os_str()))
    })
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut system = System::new();
        loop {
            let state = app.state::<AppState>();
            let root = state.game_dir();
            // on a Mac, Wine takes a while to show the game: until then Play stays taken
            let starting = !cfg!(windows)
                && state.started.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_secs(40));
            let running = game_running(&mut system, root.as_deref()) || starting;
            if state.running.swap(running, Ordering::SeqCst) != running {
                let _ = app.emit("game", running);
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}
