//! Signing in to the launcher and the game's automatic login (website app/api/launcher/*, authserver launcher tickets).
//!
//! The launcher never keeps the password: the sign-in (password, and the authenticator code when the account has one) gives
//! a device token, kept in Windows' credential manager and revocable. At each Play the token buys a one-time ticket, valid
//! one minute; the launcher puts the account name in Config.wtf and types the ticket in the game's password field, only
//! while the game's window is in front, so it is never typed anywhere else.

use std::time::{Duration, Instant};

use anyhow::Result;
use launcher_core::error::coded;
use serde::Deserialize;

const LOGIN: &str = "https://lordaeron.eu/api/launcher/login";
const TICKET: &str = "https://lordaeron.eu/api/launcher/ticket";
const LOGOUT: &str = "https://lordaeron.eu/api/launcher/logout";
const SERVICE: &str = "Lordaeron Launcher";
const USER: &str = "device";

fn entry() -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, USER)?)
}

pub fn token() -> Option<String> {
    entry().ok()?.get_password().ok()
}

fn forget() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(concat!("LordaeronLauncher/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .build()?)
}

#[derive(Deserialize)]
struct Answer {
    token: Option<String>,
    username: Option<String>,
    ticket: Option<String>,
    error: Option<String>,
}

async fn post(url: &str, body: serde_json::Value) -> Result<Answer> {
    let response = client()?.post(url).json(&body).send().await.map_err(|_| coded("offline", ""))?;
    let answer: Answer = response.json().await.map_err(|_| coded("other", "lordaeron.eu"))?;
    if let Some(error) = answer.error.as_deref() {
        // the website's own words for it, which the window translates
        let code: &'static str = match error {
            "invalidCredentials" => "invalidCredentials",
            "totpRequired" => "totpRequired",
            "totpInvalid" => "totpInvalid",
            "tooManyAttempts" => "tooManyAttempts",
            "tooManyAttemptsIp" => "tooManyAttemptsIp",
            "signedOut" => "signedOut",
            "tooMany" => "tooMany",
            _ => "other",
        };
        return Err(coded(code, if code == "other" { error.to_string() } else { String::new() }));
    }
    Ok(answer)
}

/// Signs in; returns the account name. The token goes to the credential manager.
pub async fn sign_in(username: &str, password: &str, code: Option<&str>, device: &str) -> Result<String> {
    let answer = post(
        LOGIN,
        serde_json::json!({ "username": username, "password": password, "code": code, "device": device }),
    )
    .await?;
    let token = answer.token.ok_or_else(|| coded("other", "no token"))?;
    entry()?.set_password(&token).map_err(|_| coded("other", "credential manager"))?;
    Ok(answer.username.unwrap_or_else(|| username.to_uppercase()))
}

pub async fn sign_out() {
    if let Some(token) = token() {
        let _ = post(LOGOUT, serde_json::json!({ "token": token })).await;
    }
    forget();
}

/// A one-time ticket for this Play: (account name, ticket). A token the website no longer knows is forgotten.
pub async fn ticket() -> Result<(String, String)> {
    let token = token().ok_or_else(|| coded("signedOut", ""))?;
    match post(TICKET, serde_json::json!({ "token": token })).await {
        Ok(answer) => Ok((
            answer.username.ok_or_else(|| coded("other", "no account"))?,
            answer.ticket.ok_or_else(|| coded("other", "no ticket"))?,
        )),
        Err(e) => {
            if e.to_string() == "signedOut" {
                forget();
            }
            Err(e)
        }
    }
}

/// Waits for the game's window, gives its login screen time to show, then types the ticket and Enter, one key at a
/// time and only while that window is in front. Gives up quietly (the player types it) when the window does not come,
/// is not in front, or the ticket's minute is nearly over.
#[cfg(windows)]
pub fn type_ticket(child: &std::process::Child, ticket: &str, settle: Duration) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VK_RETURN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
        WaitForInputIdle,
    };

    struct Search {
        pid: u32,
        found: HWND,
    }
    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam as *mut Search);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == search.pid && IsWindowVisible(hwnd) != 0 {
            search.found = hwnd;
            return 0;
        }
        1
    }

    let started = Instant::now();
    let deadline = Duration::from_secs(50); // the ticket lives 60 seconds
    let mut search = Search { pid: child.id(), found: std::ptr::null_mut() };
    while search.found.is_null() {
        if started.elapsed() > deadline {
            return;
        }
        unsafe { EnumWindows(Some(each), &mut search as *mut Search as LPARAM) };
        std::thread::sleep(Duration::from_millis(250));
    }
    unsafe { WaitForInputIdle(child.as_raw_handle() as _, 15_000) };
    std::thread::sleep(settle);
    let hwnd = search.found;
    unsafe {
        if GetForegroundWindow() != hwnd {
            SetForegroundWindow(hwnd);
            std::thread::sleep(Duration::from_millis(300));
        }
    }
    let key = |scan: u16, vk: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: scan,
                dwFlags: (if vk == 0 { KEYEVENTF_UNICODE } else { 0 }) | (if up { KEYEVENTF_KEYUP } else { 0 }),
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let send = |inputs: &[INPUT]| unsafe {
        SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    };
    for ch in ticket.chars() {
        if started.elapsed() > deadline || unsafe { GetForegroundWindow() } != hwnd {
            return; // the player went to another window: nothing is typed there
        }
        send(&[key(ch as u16, 0, false), key(ch as u16, 0, true)]);
        std::thread::sleep(Duration::from_millis(15));
    }
    if unsafe { GetForegroundWindow() } == hwnd {
        send(&[key(0, VK_RETURN, false), key(0, VK_RETURN, true)]);
    }
}

#[cfg(not(windows))]
pub fn type_ticket(_child: &std::process::Child, _ticket: &str, _settle: Duration) {}
