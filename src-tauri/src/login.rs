//! Signing in to the launcher and the game's automatic login (website app/api/launcher/*, authserver launcher tickets).
//!
//! The launcher never keeps the password: the sign-in (password, and the authenticator code when the account has one) gives
//! a device token, kept in the system's credential store (Windows' credential manager, the Mac's keychain) and revocable. At each Play the token buys a one-time ticket, valid
//! one minute; the launcher puts the account name in Config.wtf and types the ticket in the game's password field, only
//! while the game's window is in front, so it is never typed anywhere else.

use std::time::{Duration, Instant};

use anyhow::Result;
use launcher_core::error::coded;
use serde::Deserialize;

const LOGIN: &str = "https://lordaeron.eu/api/launcher/login";
const TICKET: &str = "https://lordaeron.eu/api/launcher/ticket";
const LOGOUT: &str = "https://lordaeron.eu/api/launcher/logout";
const ME: &str = "https://lordaeron.eu/api/launcher/me";
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
        .https_only(true)
        .build()?)
}

#[derive(Deserialize)]
struct Answer {
    token: Option<String>,
    username: Option<String>,
    ticket: Option<String>,
    security: Option<u8>,
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

/// Signs in; returns the account name and its security level. The token goes to the credential manager.
pub async fn sign_in(username: &str, password: &str, code: Option<&str>, device: &str) -> Result<(String, Option<u8>)> {
    let answer = post(
        LOGIN,
        serde_json::json!({ "username": username, "password": password, "code": code, "device": device }),
    )
    .await?;
    let token = answer.token.ok_or_else(|| coded("other", "no token"))?;
    entry()?.set_password(&token).map_err(|_| coded("other", "credential manager"))?;
    Ok((answer.username.unwrap_or_else(|| username.to_uppercase()), answer.security))
}

/// As the launcher opens: the signed-in account and its level, or the error signedOut (then the token is forgotten).
pub async fn me() -> Result<(String, Option<u8>)> {
    let token = token().ok_or_else(|| coded("signedOut", ""))?;
    match post(ME, serde_json::json!({ "token": token })).await {
        Ok(answer) => Ok((answer.username.unwrap_or_default(), answer.security)),
        Err(e) => {
            if e.to_string() == "signedOut" {
                forget();
            }
            Err(e)
        }
    }
}

/// The signed-in account as the Play tab shows it: soul shards, avatar, each realm's character played last (website
/// app/api/launcher/me), zone names in `locale`.
pub async fn details(locale: &str) -> Result<serde_json::Value> {
    let token = token().ok_or_else(|| coded("signedOut", ""))?;
    let response = client()?
        .post(ME)
        .json(&serde_json::json!({ "token": token, "locale": locale }))
        .send()
        .await
        .map_err(|_| coded("offline", ""))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        forget();
        return Err(coded("signedOut", ""));
    }
    response.json().await.map_err(|_| coded("other", "lordaeron.eu"))
}

pub async fn sign_out() {
    if let Some(token) = token() {
        let _ = post(LOGOUT, serde_json::json!({ "token": token })).await;
    }
    forget();
}

/// A one-time ticket for this Play: (account name, ticket, security level). A token the website no longer knows is
/// forgotten.
pub async fn ticket() -> Result<(String, String, Option<u8>)> {
    let token = token().ok_or_else(|| coded("signedOut", ""))?;
    match post(TICKET, serde_json::json!({ "token": token })).await {
        Ok(answer) => Ok((
            answer.username.ok_or_else(|| coded("other", "no account"))?,
            answer.ticket.ok_or_else(|| coded("other", "no ticket"))?,
            answer.security,
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
        GetKeyboardLayout, MapVirtualKeyExW, SendInput, VkKeyScanExW, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
        KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC, VK_RETURN, VK_SHIFT,
    };
    use windows_sys::Win32::System::Threading::WaitForInputIdle;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
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
    // real key presses (the game's edit boxes take them as typed), in the layout of the game's keyboard: a letter's key
    // differs between QWERTY and AZERTY, and the ticket has letters only, typed lowercase (the game uppercases it)
    let layout = unsafe { GetKeyboardLayout(GetWindowThreadProcessId(hwnd, std::ptr::null_mut())) };
    let press = |vk: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: unsafe { MapVirtualKeyExW(vk as u32, MAPVK_VK_TO_VSC, layout) } as u16,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let send = |inputs: &[INPUT]| unsafe {
        SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    };
    // the whole ticket and Enter in one batch: the field fills at once, nothing from the player can come in between
    let mut keys: Vec<INPUT> = Vec::new();
    for ch in ticket.to_lowercase().chars() {
        let scan = unsafe { VkKeyScanExW(ch as u16, layout) };
        if scan == -1 {
            return;
        }
        let vk = (scan & 0xFF) as u16;
        // a character behind Shift in this layout (a digit on AZERTY) is typed with it
        if (scan >> 8) & 1 != 0 {
            keys.extend([press(VK_SHIFT, false), press(vk, false), press(vk, true), press(VK_SHIFT, true)]);
        } else {
            keys.extend([press(vk, false), press(vk, true)]);
        }
    }
    keys.extend([press(VK_RETURN, false), press(VK_RETURN, true)]);
    if started.elapsed() > deadline || unsafe { GetForegroundWindow() } != hwnd {
        return; // the player went to another window: nothing is typed there
    }
    send(&keys);
}

#[cfg(not(windows))]
pub fn type_ticket(_child: &std::process::Child, _ticket: &str, _settle: Duration) {}
