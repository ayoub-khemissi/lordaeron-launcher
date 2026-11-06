// no console window behind the launcher in a release build
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lordaeron_launcher::run()
}
