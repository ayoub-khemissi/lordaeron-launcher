//! The launcher's logic, without a window or a network: the Tauri app (src-tauri) calls it, and its tests run on any
//! system (cargo test -p launcher-core).

pub mod feeds;
pub mod game;
pub mod ini;
pub mod lumenveil;
pub mod plan;
pub mod prefs;
pub mod version;
