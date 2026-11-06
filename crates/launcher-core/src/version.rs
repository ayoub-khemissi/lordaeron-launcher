//! Dotted versions ("0.6.2", "3.3.5.12340") and the version a Windows executable carries in its resources.

use std::cmp::Ordering;
use std::fmt;
use std::path::Path;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Version(pub [u32; 4]);

impl Version {
    pub fn parse(text: &str) -> Option<Version> {
        let mut parts = [0u32; 4];
        let mut count = 0;
        for (i, part) in text.trim().split('.').enumerate() {
            if i >= 4 {
                return None;
            }
            parts[i] = part.trim().parse().ok()?;
            count += 1;
        }
        (count >= 2).then_some(Version(parts))
    }

    pub const ZERO: Version = Version([0; 4]);
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [a, b, c, d] = self.0;
        if d == 0 {
            write!(f, "{a}.{b}.{c}")
        } else {
            write!(f, "{a}.{b}.{c}.{d}")
        }
    }
}

/// The file or product version of a PE file, from its VS_FIXEDFILEINFO (signature 0xFEEF04BD): the same numbers
/// Windows shows in the file's properties. None when the file has no version resource.
pub fn pe_version(path: &Path, product: bool) -> Option<Version> {
    let bytes = std::fs::read(path).ok()?;
    let signature = [0xBD, 0x04, 0xEF, 0xFE];
    let at = bytes.windows(4).position(|w| w == signature)?;
    let word = |offset: usize| -> Option<u32> {
        let b = bytes.get(at + offset..at + offset + 4)?;
        Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let (ms, ls) = if product { (word(16)?, word(20)?) } else { (word(8)?, word(12)?) };
    Some(Version([ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_orders() {
        assert!(Version::parse("0.6.10").unwrap() > Version::parse("0.6.9").unwrap());
        assert_eq!(Version::parse("0.7.0").unwrap().to_string(), "0.7.0");
        assert_eq!(Version::parse("3.3.5.12340").unwrap().to_string(), "3.3.5.12340");
        assert!(Version::parse("x").is_none());
    }
}
