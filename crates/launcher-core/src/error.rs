//! Errors the window tells the player in their own language: a code (and a detail: a file, a version) that the UI
//! translates (src/lib/errors.ts), never an English sentence.

use std::fmt;

#[derive(Debug)]
pub struct Coded {
    pub code: &'static str,
    pub detail: String,
}

impl fmt::Display for Coded {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)
    }
}

impl std::error::Error for Coded {}

pub fn coded(code: &'static str, detail: impl Into<String>) -> anyhow::Error {
    anyhow::Error::new(Coded { code, detail: detail.into() })
}

/// The text the window receives: "code|detail". An error without a code of its own becomes "locked" (a file another
/// program holds), or "other" with the system's own message as detail.
pub fn for_ui(e: &anyhow::Error) -> String {
    for cause in e.chain() {
        if let Some(c) = cause.downcast_ref::<Coded>() {
            return format!("{}|{}", c.code, c.detail);
        }
    }
    for cause in e.chain() {
        if let Some(io) = cause.downcast_ref::<std::io::Error>() {
            if io.kind() == std::io::ErrorKind::PermissionDenied || io.raw_os_error() == Some(32) {
                return "locked|".into();
            }
        }
    }
    format!("other|{e:#}")
}
