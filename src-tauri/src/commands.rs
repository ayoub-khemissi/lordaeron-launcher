//! The commands the window calls (src/lib/api.ts). Errors come back as one readable sentence.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use launcher_core::feeds::{LauncherFeed, LumenveilFeed, Manifest, RealmDef};
use launcher_core::game::{self, GameInfo};
use launcher_core::error::coded;
use launcher_core::lumenveil;
use launcher_core::plan::{self, PendingItem, PlanInput};
use launcher_core::prefs::Prefs;
use launcher_core::spots::{self, Spot};
use launcher_core::version::Version;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

use crate::net;
use crate::state::AppState;

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    format!("other|{e}")
}

fn ui(e: anyhow::Error) -> String {
    launcher_core::error::for_ui(&e)
}

fn code(code: &str) -> String {
    format!("{code}|")
}

// the settings description and presets of the Lumenveil this launcher was built with, for a release without its own
const BUILTIN_SCHEMA: &str = include_str!("../../src/assets/schema.json");
const BUILTIN_PRESETS: &str = include_str!("../../src/assets/presets.json");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LumenveilStatus {
    installed: Option<String>,
    available: Option<LumenveilFeed>,
    enabled: bool,
    held: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    prefs: Prefs,
    game: Option<GameInfo>,
    online: bool,
    feed: LauncherFeed,
    lumenveil: LumenveilStatus,
    pending: Vec<PendingItem>,
    patches: Vec<plan::PatchState>,
    running: bool,
    launcher_version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    step: String,
    name: String,
    done: u64,
    total: u64,
    speed: u64,
    index: usize,
    count: usize,
}

fn realm_of(feed: &LauncherFeed, id: &str) -> RealmDef {
    feed.realms.iter().find(|r| r.id == id).or(feed.realms.first()).cloned().expect("at least one realm")
}

async fn refresh_feeds(state: &AppState) {
    let channel = state.prefs().channel;
    let launcher = net::json::<LauncherFeed>(net::LAUNCHER_FEED).await;
    let online = launcher.is_ok();
    let launcher = launcher.unwrap_or_else(|_| state.feeds.lock().unwrap().launcher.clone());
    let manifest = net::json::<Manifest>(&format!("{}manifest.json", launcher.patches_url)).await.ok();
    let lumenveil = match launcher.lumenveil.get(&channel).or(launcher.lumenveil.get("stable")) {
        Some(url) => net::json::<LumenveilFeed>(url).await.ok(),
        None => None,
    };
    let mut feeds = state.feeds.lock().unwrap();
    feeds.online = online;
    feeds.launcher = launcher;
    if manifest.is_some() || !online {
        feeds.manifest = manifest.or(feeds.manifest.take());
    }
    feeds.lumenveil = lumenveil.or(if online { None } else { feeds.lumenveil.take() });
}

fn compute_status(app: &AppHandle, state: &AppState) -> Status {
    let prefs = state.prefs();
    let feeds = state.feeds.lock().unwrap();
    let root = prefs.game_dir.as_ref().map(PathBuf::from);
    let game = root.as_deref().map(game::check);
    let realm = realm_of(&feeds.launcher, &prefs.realm);
    let pending = match (&root, &game) {
        (Some(root), Some(g)) if g.ok => plan::plan(&PlanInput {
            root,
            feed: &feeds.launcher,
            realm: &realm,
            manifest: feeds.manifest.as_ref(),
            lumenveil: feeds.lumenveil.as_ref(),
            want_lumenveil: prefs.lumenveil,
            repair: state.repair_next.load(Ordering::SeqCst),
        }),
        _ => Vec::new(),
    };
    let installed = root.as_deref().and_then(lumenveil::installed);
    let enabled = root
        .as_deref()
        .and_then(|r| lumenveil::read_settings(r).ok())
        .map(|v| v.get("PlainGame").map_or(true, |e| e.trim() != "1"))
        .unwrap_or(false);
    let patches = match (&root, &game) {
        (Some(root), Some(g)) if g.ok => plan::patch_states(root, &feeds.launcher, feeds.manifest.as_ref()),
        _ => Vec::new(),
    };
    Status {
        game,
        online: feeds.online,
        feed: feeds.launcher.clone(),
        lumenveil: LumenveilStatus {
            installed: installed.map(|v| v.to_string()),
            available: feeds.lumenveil.clone(),
            enabled,
            held: root.as_deref().and_then(lumenveil::held).is_some(),
        },
        pending,
        patches,
        running: state.is_running(),
        launcher_version: app.package_info().version.to_string(),
        prefs,
    }
}

#[tauri::command]
pub async fn status(app: AppHandle, state: State<'_, AppState>, refresh: bool) -> Res<Status> {
    if refresh {
        refresh_feeds(&state).await;
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app2.state::<AppState>();
        compute_status(&app2, &state)
    })
    .await
    .map_err(err)
}

#[tauri::command]
pub async fn find_games(app: AppHandle, state: State<'_, AppState>) -> Res<Vec<GameInfo>> {
    let extra: Vec<PathBuf> = state.game_dir().into_iter().collect();
    let path = app.path();
    let mut roots: Vec<PathBuf> = [path.desktop_dir(), path.download_dir(), path.document_dir(), path.home_dir()]
        .into_iter()
        .flatten()
        .collect();
    for letter in b'C'..=b'Z' {
        let drive = PathBuf::from(format!("{}:\\", letter as char));
        if drive.exists() {
            roots.push(drive);
        }
    }
    tauri::async_runtime::spawn_blocking(move || game::find(&roots, &extra)).await.map_err(err)
}

#[tauri::command]
pub fn check_game(path: String) -> GameInfo {
    // a folder inside the game's (Data, Interface, ...) means the game folder above it
    let mut dir = PathBuf::from(&path);
    if !dir.join("Wow.exe").is_file() {
        if let Some(parent) = dir.parent().filter(|p| p.join("Wow.exe").is_file()) {
            dir = parent.to_path_buf();
        }
    }
    game::check(&dir)
}

#[tauri::command]
pub async fn set_prefs(app: AppHandle, state: State<'_, AppState>, prefs: serde_json::Value) -> Res<Status> {
    let mut current = state.prefs();
    let channel = current.channel.clone();
    current.merge(&prefs).map_err(err)?;
    let channel_changed = current.channel != channel;
    state.save_prefs(current).map_err(err)?;
    if channel_changed {
        refresh_feeds(&state).await;
    }
    Ok(compute_status(&app, &state))
}

fn emit(app: &AppHandle, step: &str, name: &str, done: u64, total: u64, index: usize, count: usize) {
    emit_speed(app, step, name, done, total, 0, index, count);
}

#[allow(clippy::too_many_arguments)]
fn emit_speed(app: &AppHandle, step: &str, name: &str, done: u64, total: u64, speed: u64, index: usize, count: usize) {
    let _ = app.emit("progress", Progress { step: step.into(), name: name.into(), done, total, speed, index, count });
}

struct Busy<'a>(&'a AppState);

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn play(app: AppHandle, state: State<'_, AppState>, launch: bool) -> Res<()> {
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err(code("busy"));
    }
    let _busy = Busy(state.inner());
    state.paused.store(false, Ordering::SeqCst);
    let result = run_updates(&app, &state, launch).await;
    if let Err(e) = &result {
        if e.to_string() != net::PAUSED {
            state.log(&format!("play failed: {e:#}"));
        }
    }
    result.map_err(ui)
}

async fn run_updates(app: &AppHandle, state: &AppState, launch: bool) -> anyhow::Result<()> {
    refresh_feeds(state).await;
    let Some(root) = state.game_dir() else { return Err(coded("noGame", "")) };
    let info = game::check(&root);
    if !info.ok {
        return Err(coded("notGame", root.to_string_lossy()));
    }
    let status = compute_status(app, state);
    let steps = status.pending.clone();
    if !steps.is_empty() && state.is_running() {
        // an update asked for while the game runs waits for the next start; Play itself is off while it runs
        if !launch {
            return Ok(());
        }
        return Err(coded("gameRunning", ""));
    }
    let prefs = state.prefs();
    let (feed, manifest, lv) = {
        let f = state.feeds.lock().unwrap();
        (f.launcher.clone(), f.manifest.clone().unwrap_or_default(), f.lumenveil.clone())
    };
    let count = steps.len();
    let mut patches_changed = false;
    let mut first_install = false;
    for (index, step) in steps.iter().enumerate() {
        state.log(&format!("step {} {}", step.kind, step.name));
        emit(app, step.kind, &step.name, 0, step.size, index, count);
        match step.kind {
            "patch" => {
                let entry = manifest.get(&step.name).ok_or_else(|| coded("notPublished", step.name.clone()))?;
                let url = format!("{}{}", feed.patches_url, step.name);
                let download = lumenveil::own(&root).join("download").join(&step.name);
                let (app2, name) = (app.clone(), step.name.clone());
                let control = net::Control { paused: &state.paused, limit: prefs.download_limit };
                net::download(&url, &download, entry.size, &entry.sha256, &control, |s| {
                    emit_speed(&app2, "patch", &name, s.done, s.total, s.speed, index, count)
                })
                .await?;
                let target = root.join("Data").join(&step.name);
                let _ = std::fs::remove_file(&target);
                std::fs::rename(&download, &target)
                    .or_else(|_| std::fs::copy(&download, &target).map(|_| ()))
                    .map_err(|_| coded("cannotWrite", step.name.clone()))?;
                let _ = std::fs::remove_file(&download);
                let _ = std::fs::remove_file(plan::aside_dir(&root).join(&step.name));
                patches_changed = true;
            }
            "patchAside" => {
                let aside = plan::aside_dir(&root);
                std::fs::create_dir_all(&aside)?;
                let target = aside.join(&step.name);
                let _ = std::fs::remove_file(&target);
                std::fs::rename(root.join("Data").join(&step.name), &target)?;
                patches_changed = true;
            }
            "patchBack" => {
                std::fs::rename(plan::aside_dir(&root).join(&step.name), root.join("Data").join(&step.name))?;
                patches_changed = true;
            }
            "file" => {
                let file = feed
                    .files
                    .iter()
                    .find(|f| f.path == step.name && f.safe())
                    .ok_or_else(|| coded("notPublished", step.name.clone()))?;
                let download = lumenveil::own(&root).join("download").join(file.sha256.to_lowercase());
                let (app2, name) = (app.clone(), step.name.clone());
                let control = net::Control { paused: &state.paused, limit: prefs.download_limit };
                net::download(&file.url, &download, file.size, &file.sha256, &control, |s| {
                    emit_speed(&app2, "file", &name, s.done, s.total, s.speed, index, count)
                })
                .await?;
                let target = root.join(&file.path);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let _ = std::fs::remove_file(&target);
                std::fs::rename(&download, &target)
                    .or_else(|_| std::fs::copy(&download, &target).map(|_| ()))
                    .map_err(|_| coded("cannotWrite", step.name.clone()))?;
                let _ = std::fs::remove_file(&download);
                let _ = std::fs::remove_file(plan::aside_dir(&root).join("files").join(&file.path));
            }
            "fileAside" | "fileBack" => {
                let here = root.join(&step.name);
                let kept = plan::aside_dir(&root).join("files").join(&step.name);
                let (from, to) = if step.kind == "fileAside" { (here, kept) } else { (kept, here) };
                if let Some(parent) = to.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let _ = std::fs::remove_file(&to);
                std::fs::rename(&from, &to).map_err(|_| coded("cannotWrite", step.name.clone()))?;
            }
            "realmlist" => {
                let realm = realm_of(&feed, &prefs.realm);
                game::set_realm(&root, info.locale.as_deref().unwrap_or("enUS"), &feed.realmlist, &realm.name)?;
            }
            "lumenveil" => {
                let lv = lv.clone().ok_or_else(|| coded("notPublished", "Lumenveil"))?;
                let zip = lumenveil::own(&root).join("download").join(format!("Lumenveil-{}.zip", lv.version));
                let app2 = app.clone();
                let control = net::Control { paused: &state.paused, limit: prefs.download_limit };
                net::download(&lv.url, &zip, lv.size, &lv.sha256, &control, |s| {
                    emit_speed(&app2, "lumenveil", "Lumenveil", s.done, s.total, s.speed, index, count)
                })
                .await?;
                let bytes = std::fs::read(&zip)?;
                let files = lumenveil::read_zip(&bytes)?;
                let version = Version::parse(&lv.version).unwrap_or(Version::ZERO);
                first_install = lumenveil::install(&root, &files, version)?;
                let _ = std::fs::remove_file(&zip);
                lumenveil::clear_hold(&root);
                state.repair_next.store(false, Ordering::SeqCst);
            }
            "setup" => {
                run_setup(app, &root, info.locale.as_deref().unwrap_or("enUS"), index, count).await?;
            }
            _ => {}
        }
    }
    if patches_changed {
        game::clear_cache(&root);
    }
    if !manifest.is_empty() {
        plan::clean(&root, &manifest);
    }
    if lumenveil::installed(&root).is_some() {
        // the switch is PlainGame (read live, as Ctrl+F12); Enable, read at start only, stays on so the switch can act
        let mut values: Vec<(String, String)> = vec![
            ("Enable".into(), "1".into()),
            ("PlainGame".into(), if prefs.lumenveil { "0" } else { "1" }.into()),
        ];
        if first_install {
            if let Some(preset) = prefs.pending_preset.as_deref() {
                values.extend(preset_values(&root, preset));
            }
            let mut p = state.prefs();
            p.pending_preset = None;
            state.save_prefs(p)?;
        }
        lumenveil::write_settings(&root, &values)?;
    }
    emit(app, "done", "", 1, 1, count, count);
    if launch {
        emit(app, "launch", "", 0, 0, count, count);
        // a fresh cache at every start (Ayoub, 06/11/2026): items, quests and creatures always as the server has them
        game::clear_cache(&root);
        // signed in: a one-time ticket the launcher types on the login screen (crate::login); else the name alone
        let mut ticket = None;
        if prefs.auto_login && prefs.signed_in_as.is_some() {
            match crate::login::ticket().await {
                Ok((name, t)) => {
                    game::set_account_name(&root, Some(&name))?;
                    ticket = Some(t);
                }
                Err(e) => {
                    state.log(&format!("no launcher ticket: {e}"));
                    if e.to_string() == "signedOut" {
                        let mut p = state.prefs();
                        p.signed_in_as = None;
                        state.save_prefs(p)?;
                    }
                    game::set_account_name(&root, prefs.account_name.as_deref())?;
                }
            }
        } else {
            game::set_account_name(&root, prefs.account_name.as_deref())?;
        }
        let child = std::process::Command::new(root.join("Wow.exe"))
            .current_dir(&root)
            .spawn()
            .map_err(|_| coded("cannotStart", ""))?;
        if let Some(ticket) = ticket {
            std::thread::spawn(move || crate::login::type_ticket(&child, &ticket, Duration::from_millis(2500)));
        }
        state.log("game started");
        state.running.store(true, Ordering::SeqCst);
        let _ = app.emit("game", true);
    }
    Ok(())
}

/// A preset's values (settings/presets.json of the installed release, else the launcher's own), as ini text.
fn preset_values(root: &Path, preset: &str) -> Vec<(String, String)> {
    let text = lumenveil::schema_file(root, "presets.json").unwrap_or_else(|| BUILTIN_PRESETS.to_string());
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return Vec::new() };
    let Some(presets) = json["presets"].as_array() else { return Vec::new() };
    // every key any preset sets takes this preset's value or, when it does not set it, the shipped one
    let schema: serde_json::Value = serde_json::from_str(
        &lumenveil::schema_file(root, "schema.json").unwrap_or_else(|| BUILTIN_SCHEMA.to_string()),
    )
    .unwrap_or_default();
    let chosen = presets.iter().find(|p| p["id"] == preset);
    let mut keys: Vec<String> = presets
        .iter()
        .filter_map(|p| p["values"].as_object())
        .flat_map(|v| v.keys().cloned())
        .collect();
    keys.sort();
    keys.dedup();
    keys.into_iter()
        .filter_map(|k| {
            let value = chosen.and_then(|p| p["values"].get(&k)).cloned().unwrap_or_else(|| schema["settings"][&k]["default"].clone());
            let text = match value {
                serde_json::Value::Bool(b) => if b { "1".to_string() } else { "0".to_string() },
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::String(s) => s,
                _ => return None,
            };
            Some((k, text))
        })
        .collect()
}

/// lamp_extract, hidden, with an estimated progress (a first run takes about half a minute).
async fn run_setup(app: &AppHandle, root: &Path, locale: &str, index: usize, count: usize) -> anyhow::Result<()> {
    let (exe, args) = lumenveil::setup_args(root, locale);
    if !exe.is_file() {
        return Ok(()); // a release that ships its world data instead
    }
    let log = std::fs::File::create(root.join("Lumenveil").join("setup.log"))?;
    let mut command = std::process::Command::new(&exe);
    command.args(&args).current_dir(root).stdout(log.try_clone()?).stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|_| coded("setupFailed", ""))?;
    let start = Instant::now();
    const EXPECTED: f64 = 30.0;
    loop {
        if let Some(exit) = child.try_wait()? {
            if !exit.success() {
                return Err(coded("setupFailed", ""));
            }
            break;
        }
        let elapsed = start.elapsed().as_secs_f64();
        // fills to 95 % over the expected time, then creeps
        let ratio = (elapsed / EXPECTED).min(1.0) * 0.95;
        emit(app, "setup", "Lumenveil", (ratio * 1000.0) as u64, 1000, index, count);
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    emit(app, "setup", "Lumenveil", 1000, 1000, index, count);
    Ok(())
}

#[derive(Serialize)]
pub struct SettingsFile {
    schema: serde_json::Value,
    presets: serde_json::Value,
    values: HashMap<String, String>,
    path: String,
}

#[tauri::command]
pub fn read_settings(state: State<'_, AppState>) -> Res<SettingsFile> {
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    if lumenveil::installed(&root).is_none() {
        return Err(code("notInstalled"));
    }
    let values = lumenveil::read_settings(&root).map_err(ui)?;
    let parse = |name: &str, builtin: &str| -> serde_json::Value {
        lumenveil::schema_file(&root, name)
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_else(|| serde_json::from_str(builtin).unwrap_or_default())
    };
    Ok(SettingsFile {
        schema: parse("schema.json", BUILTIN_SCHEMA),
        presets: parse("presets.json", BUILTIN_PRESETS),
        values,
        path: root.join("CoAVolFog.ini").to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn write_settings(state: State<'_, AppState>, values: HashMap<String, String>) -> Res<SettingsFile> {
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    let mut changes: Vec<(String, String)> = values.into_iter().collect();
    changes.sort();
    lumenveil::write_settings(&root, &changes).map_err(ui)?;
    read_settings(state)
}

/// Pauses the running download; Play (or Resume) goes on from where it stopped.
#[tauri::command]
pub fn pause(state: State<'_, AppState>) {
    state.paused.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn repair(state: State<'_, AppState>) {
    state.repair_next.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn rollback_lumenveil(state: State<'_, AppState>) -> Res<Option<String>> {
    if state.is_running() {
        return Err(code("gameRunning"));
    }
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    let version = lumenveil::rollback(&root).map_err(ui)?;
    state.log(&format!("rolled back to {version}"));
    Ok(Some(version.to_string()))
}

#[tauri::command]
pub fn uninstall_lumenveil(state: State<'_, AppState>) -> Res<()> {
    if state.is_running() {
        return Err(code("gameRunning"));
    }
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    lumenveil::uninstall(&root).map_err(ui)?;
    let mut prefs = state.prefs();
    prefs.lumenveil = false;
    state.save_prefs(prefs).map_err(err)?;
    state.log("Lumenveil uninstalled");
    Ok(())
}

/// Turns the enhanced graphics on and installs them now (rather than at the next Play).
#[tauri::command]
pub async fn install_lumenveil(app: AppHandle, state: State<'_, AppState>) -> Res<()> {
    let mut prefs = state.prefs();
    prefs.lumenveil = true;
    state.save_prefs(prefs).map_err(err)?;
    play(app, state, false).await
}

/// The launcher's own update, from lordaeron.eu (update.json, or update-test.json on the preview channel), signed
/// with the key in ~/.tauri on the server. With `install`, it is downloaded (progress as the step "launcher"),
/// installed and the launcher starts again; otherwise only the version is told.
#[tauri::command]
pub async fn launcher_update(app: AppHandle, state: State<'_, AppState>, install: bool) -> Res<Option<String>> {
    let feed = if state.prefs().channel == "test" { net::UPDATE_TEST } else { net::UPDATE_STABLE };
    let url = tauri::Url::parse(feed).map_err(err)?;
    let updater = app.updater_builder().endpoints(vec![url]).map_err(err)?.build().map_err(err)?;
    let Some(update) = updater.check().await.map_err(err)? else { return Ok(None) };
    let version = update.version.clone();
    if !install {
        return Ok(Some(version));
    }
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err(code("busy"));
    }
    state.log(&format!("launcher update to {version}"));
    let app2 = app.clone();
    let mut done = 0u64;
    let result = update
        .download_and_install(
            |chunk, total| {
                done += chunk as u64;
                emit(&app2, "launcher", &version, done, total.unwrap_or(0), 0, 1);
            },
            || {},
        )
        .await;
    state.busy.store(false, Ordering::SeqCst);
    result.map_err(err)?;
    app.restart();
}

#[tauri::command]
pub async fn news() -> Res<serde_json::Value> {
    net::json::<serde_json::Value>(net::NEWS_FEED).await.map_err(err)
}

/// An older page of news (patches/launcher/<kind>-<page>.json), when the player scrolls past the first ten.
#[tauri::command]
pub async fn news_page(kind: String, page: u32) -> Res<serde_json::Value> {
    if kind != "announcements" && kind != "changelog" {
        return Err(code("other"));
    }
    net::json::<serde_json::Value>(&format!("{}{kind}-{page}.json", net::NEWS_PAGES)).await.map_err(err)
}

#[tauri::command]
pub fn open(app: AppHandle, state: State<'_, AppState>, what: String, url: Option<String>) -> Res<()> {
    let opener = app.opener();
    match what.as_str() {
        "url" => {
            let url = url.ok_or_else(|| code("other"))?;
            if !url.starts_with("https://") {
                return Err(code("other"));
            }
            opener.open_url(url, None::<&str>).map_err(err)
        }
        "game" => opener.open_path(state.game_dir().ok_or_else(|| code("noGame"))?.to_string_lossy(), None::<&str>).map_err(err),
        "logs" => {
            let log = state.game_dir().map(|r| r.join("CoAVolFog.log")).filter(|p| p.is_file());
            match log {
                Some(file) => opener.reveal_item_in_dir(file).map_err(err),
                None => opener
                    .open_path(state.log_file.parent().unwrap_or(Path::new(".")).to_string_lossy(), None::<&str>)
                    .map_err(err),
            }
        }
        _ => Err(code("other")),
    }
}

// ── Lumenveil reports: the spots marked with Ctrl+F5, sent to the team (the site's app/api/launcher/reports) ──

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentReport {
    id: u64,
    sent_at: u64, // seconds since 1970
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotView {
    #[serde(flatten)]
    spot: Spot,
    screenshot: Option<String>, // its file name, when one was taken there
    sent: Option<SentReport>,
}

fn report_key(number: u32, saved: &str) -> String {
    format!("{number}|{saved}")
}

fn sent_reports(state: &AppState) -> HashMap<String, SentReport> {
    std::fs::read_to_string(state.prefs_file.with_file_name("reports.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn spots(state: State<'_, AppState>) -> Res<Vec<SpotView>> {
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    let sent = sent_reports(&state);
    Ok(spots::read(&root)
        .into_iter()
        .map(|spot| SpotView {
            screenshot: spots::screenshot_near(&root, &spot.saved)
                .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned())),
            sent: sent.get(&report_key(spot.number, &spot.saved)).cloned(),
            spot,
        })
        .collect())
}

/// The screenshot taken at a spot, as an image the window can show (data URL).
#[tauri::command]
pub fn spot_screenshot(state: State<'_, AppState>, saved: String) -> Res<Option<String>> {
    use base64::Engine;
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    let Some(path) = spots::screenshot_near(&root, &saved) else { return Ok(None) };
    let bytes = std::fs::read(&path).map_err(err)?;
    let kind = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("png")) { "png" } else { "jpeg" };
    Ok(Some(format!("data:image/{kind};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
}

#[tauri::command]
pub async fn send_report(
    app: AppHandle,
    state: State<'_, AppState>,
    number: u32,
    saved: String,
    message: String,
    screenshot: bool,
) -> Res<u64> {
    use base64::Engine;
    let root = state.game_dir().ok_or_else(|| code("noGame"))?;
    let spot = spots::read(&root)
        .into_iter()
        .find(|s| s.number == number && s.saved == saved)
        .ok_or_else(|| code("other"))?;
    let prefs = state.prefs();
    let image = if screenshot {
        spots::screenshot_near(&root, &saved)
            .and_then(|p| std::fs::read(p).ok())
            .filter(|b| b.len() <= 3_000_000)
            .map(|b| base64::engine::general_purpose::STANDARD.encode(b))
    } else {
        None
    };
    let realm = realm_of(&state.feeds.lock().unwrap().launcher, &prefs.realm).name;
    let body = serde_json::json!({
        "installId": prefs.install_id,
        "accountName": prefs.account_name,
        "realm": realm,
        "language": prefs.language.clone().unwrap_or_default(),
        "launcherVersion": app.package_info().version.to_string(),
        "lumenveilVersion": lumenveil::installed(&root).map(|v| v.to_string()),
        "spot": { "number": spot.number, "saved": spot.saved, "text": spot.text },
        "settings": spots::settings(&root, &spot),
        "message": message.trim(),
        "screenshot": image,
    });
    let id = net::post_report(&body).await.map_err(ui)?;
    let mut sent = sent_reports(&state);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    sent.insert(report_key(number, &saved), SentReport { id, sent_at: now });
    let _ = std::fs::write(state.prefs_file.with_file_name("reports.json"), serde_json::to_string(&sent).unwrap_or_default());
    state.log(&format!("report {id} sent (spot {number})"));
    Ok(id)
}

// ── the launcher's sign-in (crate::login) ──

#[tauri::command]
pub async fn account_login(
    app: AppHandle,
    state: State<'_, AppState>,
    username: String,
    password: String,
    code: Option<String>,
) -> Res<Status> {
    let device = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows".into());
    let name = crate::login::sign_in(username.trim(), &password, code.as_deref().filter(|c| !c.trim().is_empty()), &device)
        .await
        .map_err(ui)?;
    let mut prefs = state.prefs();
    prefs.signed_in_as = Some(name.clone());
    prefs.account_name = Some(name);
    state.save_prefs(prefs).map_err(err)?;
    state.log("signed in");
    Ok(compute_status(&app, &state))
}

#[tauri::command]
pub async fn account_logout(app: AppHandle, state: State<'_, AppState>) -> Res<Status> {
    crate::login::sign_out().await;
    let mut prefs = state.prefs();
    prefs.signed_in_as = None;
    state.save_prefs(prefs).map_err(err)?;
    state.log("signed out");
    Ok(compute_status(&app, &state))
}
