//! How the game of a folder starts. On Windows, Wow.exe itself. On a Mac, the Windows client runs through a
//! compatibility layer, told by where the folder is: an app that wraps its own Windows (Sikarugir, Kegworks, Wineskin),
//! a CrossOver bottle, a Whisky bottle, or a Wine prefix. The app the player chose in the settings comes before them all.

use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, PartialEq)]
pub enum Runner {
    /// Wow.exe itself (Windows)
    Direct,
    /// an app the player chose, or the app that wraps the game folder: macOS opens it, and it starts the game
    App(PathBuf),
    /// a CrossOver bottle, by its name
    CrossOver(String),
    /// a Whisky bottle (Whisky's own Wine, the bottle as the prefix): Whisky's app id, the bottle's folder
    Whisky(String, PathBuf),
    /// a Wine prefix (the folder holding drive_c), with a Wine found on the system
    Wine(PathBuf),
}

/// The command that starts the game.
#[derive(Clone, Debug, PartialEq)]
pub struct Launch {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub env: Vec<(String, OsString)>,
}

fn names(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect()
}

/// The ancestor of `path` made of its first `count` components (with its root).
fn ancestor(path: &Path, count: usize) -> PathBuf {
    let mut out = PathBuf::new();
    let mut taken = 0;
    for c in path.components() {
        if let Component::Normal(_) = c {
            if taken == count {
                break;
            }
            taken += 1;
        }
        out.push(c.as_os_str());
    }
    out
}

/// How the game in `root` starts, or None when nothing on this Mac is known to start it (the player then chooses
/// the app in the settings). `windows`: the launcher runs on Windows. `chosen`: the app the player chose (Mac).
pub fn runner(root: &Path, chosen: Option<&Path>, windows: bool) -> Option<Runner> {
    if windows {
        return Some(Runner::Direct);
    }
    if let Some(app) = chosen.filter(|a| !a.as_os_str().is_empty()) {
        return Some(Runner::App(app.to_path_buf()));
    }
    let parts = names(root);
    // the outermost app bundle holding the folder starts it (a wrapper keeps its Windows inside itself)
    if let Some(i) = parts.iter().position(|n| n.to_lowercase().ends_with(".app")) {
        return Some(Runner::App(ancestor(root, i + 1)));
    }
    let drive = parts.iter().position(|n| n.eq_ignore_ascii_case("drive_c"))?;
    // .../CrossOver/Bottles/<bottle>/drive_c
    if drive >= 3 && parts[drive - 2] == "Bottles" && parts[drive - 3] == "CrossOver" {
        return Some(Runner::CrossOver(parts[drive - 1].clone()));
    }
    // ~/Library/Containers/<Whisky's id>/Bottles/<bottle>/drive_c
    if drive >= 4 && parts[drive - 2] == "Bottles" && parts[drive - 4] == "Containers" {
        return Some(Runner::Whisky(parts[drive - 3].clone(), ancestor(root, drive)));
    }
    if drive >= 1 {
        return Some(Runner::Wine(ancestor(root, drive)));
    }
    None
}

/// The Wines a Mac may have, the first one present is used: Homebrew's, then the WineHQ apps.
pub const WINES: &[&str] = &[
    "/opt/homebrew/bin/wine",
    "/usr/local/bin/wine",
    "/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine",
    "/Applications/Wine Staging.app/Contents/Resources/wine/bin/wine",
    "/Applications/Wine Devel.app/Contents/Resources/wine/bin/wine",
    "/usr/bin/wine",
];

/// The command for `runner`. `home`: the user's folder; `exists`: whether a file is there (the tests give their own).
pub fn launch(runner: &Runner, root: &Path, home: &Path, exists: impl Fn(&Path) -> bool) -> Option<Launch> {
    let wow = root.join("Wow.exe");
    let plain = |program: PathBuf, args: Vec<OsString>, env: Vec<(String, OsString)>| Some(Launch { program, args, env });
    match runner {
        Runner::Direct => plain(wow, Vec::new(), Vec::new()),
        Runner::App(app) => plain(PathBuf::from("/usr/bin/open"), vec!["-a".into(), app.clone().into()], Vec::new()),
        Runner::CrossOver(bottle) => {
            let tail = "Contents/SharedSupport/CrossOver/bin/wine";
            let program = [PathBuf::from("/Applications/CrossOver.app"), home.join("Applications/CrossOver.app")]
                .into_iter()
                .map(|app| app.join(tail))
                .find(|p| exists(p))?;
            plain(program, vec!["--bottle".into(), bottle.into(), wow.into()], Vec::new())
        }
        Runner::Whisky(id, prefix) => {
            let program = home.join("Library/Application Support").join(id).join("Libraries/Wine/bin/wine64");
            if !exists(&program) {
                return None;
            }
            plain(program, vec![wow.into()], vec![("WINEPREFIX".into(), prefix.clone().into())])
        }
        Runner::Wine(prefix) => {
            let program = WINES.iter().map(PathBuf::from).find(|p| exists(p))?;
            plain(program, vec![wow.into()], vec![("WINEPREFIX".into(), prefix.clone().into())])
        }
    }
}

fn list(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir).map(|e| e.flatten().map(|e| e.path()).collect()).unwrap_or_default()
}

/// A Windows drive C of a Mac and its users' desktop, downloads and documents: where its games are kept.
fn drive_places(drive: &Path) -> Vec<PathBuf> {
    let mut places = vec![drive.to_path_buf()];
    for user in list(&drive.join("users")) {
        for folder in ["Desktop", "Downloads", "Documents"] {
            places.push(user.join(folder));
        }
    }
    places.retain(|p| p.is_dir());
    places
}

/// The places inside an app that wraps its own Windows (Sikarugir and Kegworks keep it in SharedSupport/prefix,
/// Wineskin in Resources).
pub fn app_places(app: &Path) -> Vec<PathBuf> {
    ["Contents/SharedSupport/prefix/drive_c", "Contents/Resources/drive_c"]
        .iter()
        .flat_map(|d| drive_places(&app.join(d)))
        .collect()
}

/// Where a Mac keeps Windows games: the bottles of CrossOver and Whisky, and the apps that wrap their own Windows
/// (in Applications, or one folder below). The launcher looks for Wow.exe there.
pub fn mac_places(home: &Path) -> Vec<PathBuf> {
    let mut places = Vec::new();
    for bottles in [home.join("Library/Application Support/CrossOver/Bottles")]
        .into_iter()
        .chain(list(&home.join("Library/Containers")).into_iter().map(|c| c.join("Bottles")))
    {
        for bottle in list(&bottles) {
            places.extend(drive_places(&bottle.join("drive_c")));
        }
    }
    for apps in [PathBuf::from("/Applications"), home.join("Applications")] {
        for app in list(&apps).into_iter().chain(list(&apps).into_iter().flat_map(|d| list(&d))) {
            if app.extension().is_some_and(|e| e.eq_ignore_ascii_case("app")) {
                places.extend(app_places(&app));
            }
        }
    }
    places
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: &str = "/Users/ana";

    fn all(_: &Path) -> bool {
        true
    }

    #[test]
    fn windows_starts_wow_itself() {
        let root = Path::new("C:/Games/WoW");
        assert_eq!(runner(root, None, true), Some(Runner::Direct));
        let l = launch(&Runner::Direct, root, Path::new(HOME), all).unwrap();
        assert_eq!(l.program, root.join("Wow.exe"));
    }

    #[test]
    fn crossover_bottle() {
        let root = Path::new("/Users/ana/Library/Application Support/CrossOver/Bottles/WoW 335/drive_c/Games/WoW");
        let r = runner(root, None, false).unwrap();
        assert_eq!(r, Runner::CrossOver("WoW 335".into()));
        let l = launch(&r, root, Path::new(HOME), |p| p.starts_with("/Users/ana/Applications")).unwrap();
        assert_eq!(l.program, Path::new("/Users/ana/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine"));
        assert_eq!(l.args, vec![OsString::from("--bottle"), "WoW 335".into(), root.join("Wow.exe").into()]);
        assert!(launch(&r, root, Path::new(HOME), |_| false).is_none());
    }

    #[test]
    fn whisky_bottle() {
        let root = Path::new("/Users/ana/Library/Containers/com.isaacmarovitz.Whisky/Bottles/1F2E/drive_c/WoW");
        let r = runner(root, None, false).unwrap();
        let prefix = PathBuf::from("/Users/ana/Library/Containers/com.isaacmarovitz.Whisky/Bottles/1F2E");
        assert_eq!(r, Runner::Whisky("com.isaacmarovitz.Whisky".into(), prefix.clone()));
        let l = launch(&r, root, Path::new(HOME), all).unwrap();
        assert_eq!(
            l.program,
            Path::new("/Users/ana/Library/Application Support/com.isaacmarovitz.Whisky/Libraries/Wine/bin/wine64")
        );
        assert_eq!(l.env, vec![("WINEPREFIX".to_string(), OsString::from(prefix))]);
    }

    #[test]
    fn wrapper_app_opens_itself() {
        let root = Path::new("/Applications/Sikarugir/WoW.app/Contents/SharedSupport/prefix/drive_c/WoW");
        let r = runner(root, None, false).unwrap();
        assert_eq!(r, Runner::App(PathBuf::from("/Applications/Sikarugir/WoW.app")));
        let l = launch(&r, root, Path::new(HOME), all).unwrap();
        assert_eq!(l.program, Path::new("/usr/bin/open"));
        assert_eq!(l.args, vec![OsString::from("-a"), "/Applications/Sikarugir/WoW.app".into()]);
    }

    #[test]
    fn wine_prefix_needs_a_wine() {
        let root = Path::new("/Users/ana/.wine-wow/drive_c/Program Files/World of Warcraft");
        let r = runner(root, None, false).unwrap();
        assert_eq!(r, Runner::Wine(PathBuf::from("/Users/ana/.wine-wow")));
        let l = launch(&r, root, Path::new(HOME), |p| p == Path::new("/usr/local/bin/wine")).unwrap();
        assert_eq!(l.program, Path::new("/usr/local/bin/wine"));
        assert!(launch(&r, root, Path::new(HOME), |_| false).is_none());
    }

    #[test]
    fn finds_games_in_bottles_and_wrappers() {
        let home = tempfile::tempdir().unwrap();
        let h = home.path();
        let wow = |dir: PathBuf| {
            std::fs::create_dir_all(dir.join("Data")).unwrap();
            std::fs::write(dir.join("Wow.exe"), b"MZ").unwrap();
            dir
        };
        let bottle = wow(h.join("Library/Application Support/CrossOver/Bottles/WoW/drive_c/Program Files/World of Warcraft"));
        let whisky = wow(h.join("Library/Containers/com.isaacmarovitz.Whisky/Bottles/1F2E/drive_c/users/ana/Desktop/WoW"));
        let wrapped = wow(h.join("Applications/Sikarugir/WoW.app/Contents/SharedSupport/prefix/drive_c/WoW"));
        let found: Vec<String> = crate::game::find(&mac_places(h), &[]).into_iter().map(|g| g.path).collect();
        for dir in [&bottle, &whisky, &wrapped] {
            assert!(found.contains(&dir.to_string_lossy().into_owned()), "{dir:?} not in {found:?}");
        }
        let in_app = crate::game::find(&app_places(&h.join("Applications/Sikarugir/WoW.app")), &[]);
        assert_eq!(in_app.len(), 1);
    }

    #[test]
    fn chosen_app_comes_first_and_plain_folders_have_none() {
        let root = Path::new("/Users/ana/Games/WoW");
        assert_eq!(runner(root, None, false), None);
        let app = Path::new("/Applications/WoWSilicon.app");
        assert_eq!(runner(root, Some(app), false), Some(Runner::App(app.to_path_buf())));
        assert_eq!(runner(root, Some(Path::new("")), false), None);
    }
}
