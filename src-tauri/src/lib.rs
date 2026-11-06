//! The launcher's window and its commands. The decisions live in launcher-core; here are the network, the game's
//! process, the progress the window shows, and the files and folders of this PC.

mod commands;
mod login;
mod net;
mod state;
mod watch;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // a second start brings the open launcher to the front instead of opening another one
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let state = state::AppState::load(app.handle())?;
            app.manage(state);
            watch::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::status,
            commands::find_games,
            commands::check_game,
            commands::set_prefs,
            commands::play,
            commands::read_settings,
            commands::write_settings,
            commands::repair,
            commands::pause,
            commands::rollback_lumenveil,
            commands::uninstall_lumenveil,
            commands::install_lumenveil,
            commands::launcher_update,
            commands::account_login,
            commands::account_logout,
            commands::account_details,
            commands::spots,
            commands::spot_screenshot,
            commands::send_report,
            commands::news,
            commands::news_page,
            commands::open,
        ])
        .run(tauri::generate_context!())
        .expect("the launcher could not start");
}
