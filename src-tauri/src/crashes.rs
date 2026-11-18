//! Sends the game's new crash reports to the team (launcher_core::crashes): a little after the game stops, and when the
//! launcher starts (a crash while it was closed). Each report goes once: crashes.json, beside prefs.json, keeps the
//! ones handled (sent, with their number, or not Lordaeron's). The window says when one was sent ("crash-sent").

use std::collections::BTreeMap;
use std::sync::atomic::Ordering;
use std::time::{Duration, SystemTime};

use base64::Engine;
use launcher_core::crashes;
use launcher_core::lumenveil;
use tauri::{AppHandle, Emitter, Manager};

use crate::net;
use crate::state::AppState;

/// Looks for new reports after `delay` (the game writes its dump as it ends) and sends them.
pub fn check_later(app: AppHandle, delay: Duration) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(delay).await;
        let state = app.state::<AppState>();
        if state.crash_check.swap(true, Ordering::SeqCst) {
            return;
        }
        send_new(&app, &state).await;
        state.crash_check.store(false, Ordering::SeqCst);
    });
}

async fn send_new(app: &AppHandle, state: &AppState) {
    let prefs = state.prefs();
    let Some(root) = state.game_dir() else { return };
    if !prefs.send_crashes {
        return;
    }
    let file = state.prefs_file.with_file_name("crashes.json");
    // report name -> its number on the site; 0: made on another server, not sent
    let mut handled: BTreeMap<String, u64> = std::fs::read_to_string(&file)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    let found = crashes::find(&root, SystemTime::now());
    // the names of reports too old to be sent again need not be kept
    handled.retain(|name, _| found.iter().any(|f| &f.name == name));
    let save = |handled: &BTreeMap<String, u64>| {
        let _ = std::fs::write(&file, serde_json::to_string(handled).unwrap_or_default());
    };
    save(&handled);

    let (realms, realm) = {
        let feeds = state.feeds.lock().unwrap();
        let realms: Vec<String> = feeds.launcher.realms.iter().map(|r| r.name.clone()).collect();
        let realm = feeds.launcher.realms.iter().find(|r| r.id == prefs.realm).map(|r| r.name.clone());
        (realms, realm)
    };
    let new: Vec<_> = found.into_iter().filter(|c| !handled.contains_key(&c.name)).collect();
    for crash in new {
        let Ok(mut bytes) = std::fs::read(&crash.report) else { continue };
        bytes.truncate(crashes::MAX_REPORT);
        let text = String::from_utf8_lossy(&bytes);
        if !crashes::on_lordaeron(&text, &realms) {
            handled.insert(crash.name, 0);
            save(&handled);
            continue;
        }
        let dump_size = crash.dump.as_ref().and_then(|p| std::fs::metadata(p).ok()).map(|m| m.len());
        let dump = match (&crash.dump, dump_size) {
            (Some(path), Some(size)) if size <= crashes::MAX_DUMP => {
                std::fs::read(path).ok().map(|b| base64::engine::general_purpose::STANDARD.encode(b))
            }
            _ => None,
        };
        let body = serde_json::json!({
            "installId": prefs.install_id,
            "accountName": prefs.signed_in_as.clone().or(prefs.account_name.clone()),
            "realm": realm,
            "language": prefs.language.clone().unwrap_or_default(),
            "launcherVersion": app.package_info().version.to_string(),
            "lumenveilVersion": lumenveil::installed(&root).map(|v| v.to_string()),
            "platform": if cfg!(windows) { "windows" } else { "macos" },
            "fileName": crash.name,
            "report": crashes::clean(&text),
            "dump": dump,
            "dumpSize": dump_size,
        });
        match net::post_crash(&body).await {
            Ok(id) => {
                state.log(&format!("crash report {id} sent ({})", crash.name));
                handled.insert(crash.name, id);
                save(&handled);
                let _ = app.emit("crash-sent", id);
            }
            // offline, or too many at once: the next look sends it
            Err(e) => {
                state.log(&format!("crash report {} not sent: {e}", crash.name));
                break;
            }
        }
    }
}
