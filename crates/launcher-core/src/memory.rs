//! The game's memory (Ayoub, 19/11/2026: games stopped "out of memory" with many add-ons). Wow.exe is a 32-bit program:
//! Windows gives it 2 GB unless its header says it is "large address aware", then 4 GB on a 64-bit system (Wine as
//! well). The launcher sets that bit before the game starts, as the players' 4 GB patches do: one bit of the header,
//! nothing else (the header's checksum stays as it was, like theirs: Windows checks it only for drivers).

use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;

/// IMAGE_FILE_LARGE_ADDRESS_AWARE, in the file header's Characteristics
const LARGE_ADDRESS_AWARE: u16 = 0x0020;
const I386: u16 = 0x014c;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Done {
    /// it had it already
    Already,
    /// the launcher set it
    Set,
}

/// Where the Characteristics are in a 32-bit Windows program's first bytes, and their value.
fn characteristics(head: &[u8]) -> Option<(u64, u16)> {
    let u16_at = |at: usize| head.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]]));
    if head.get(..2)? != b"MZ" {
        return None;
    }
    let pe = u32::from_le_bytes(head.get(0x3c..0x40)?.try_into().ok()?) as usize;
    if head.get(pe..pe + 4)? != b"PE\0\0" || u16_at(pe + 4)? != I386 {
        return None;
    }
    Some(((pe + 22) as u64, u16_at(pe + 22)?))
}

fn head(file: &mut File) -> io::Result<Vec<u8>> {
    let mut head = Vec::with_capacity(4096);
    Read::take(&mut *file, 4096).read_to_end(&mut head)?;
    Ok(head)
}

/// Whether the program may use 4 GB (None: not a 32-bit Windows program, or not readable).
pub fn large_address_aware(exe: &Path) -> Option<bool> {
    let head = head(&mut File::open(exe).ok()?).ok()?;
    characteristics(&head).map(|(_, flags)| flags & LARGE_ADDRESS_AWARE != 0)
}

/// Makes the program large address aware when it is not yet. Fails when it cannot be written (a protected folder, the
/// game running): it then starts with 2 GB as before.
pub fn make_large_address_aware(exe: &Path) -> io::Result<Done> {
    let mut file = File::open(exe)?;
    let (at, flags) = characteristics(&head(&mut file)?)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "not a 32-bit Windows program"))?;
    if flags & LARGE_ADDRESS_AWARE != 0 {
        return Ok(Done::Already);
    }
    let mut file = File::options().write(true).open(exe)?;
    file.seek(SeekFrom::Start(at))?;
    file.write_all(&(flags | LARGE_ADDRESS_AWARE).to_le_bytes())?;
    file.sync_all()?;
    Ok(Done::Set)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 32-bit program's start as Wow.exe has it: "MZ", the PE header at 0x80, Characteristics 0x0103.
    fn program(flags: u16) -> Vec<u8> {
        let mut b = vec![0u8; 0x400];
        b[..2].copy_from_slice(b"MZ");
        b[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        b[0x80..0x84].copy_from_slice(b"PE\0\0");
        b[0x84..0x86].copy_from_slice(&I386.to_le_bytes());
        b[0x96..0x98].copy_from_slice(&flags.to_le_bytes());
        b[0x200..0x204].copy_from_slice(b"code");
        b
    }

    #[test]
    fn the_bit_is_set_once_and_nothing_else_changes() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("Wow.exe");
        std::fs::write(&exe, program(0x0103)).unwrap();
        assert_eq!(large_address_aware(&exe), Some(false));
        assert_eq!(make_large_address_aware(&exe).unwrap(), Done::Set);
        assert_eq!(std::fs::read(&exe).unwrap(), program(0x0123));
        assert_eq!(large_address_aware(&exe), Some(true));
        assert_eq!(make_large_address_aware(&exe).unwrap(), Done::Already);
        assert_eq!(std::fs::read(&exe).unwrap(), program(0x0123));
    }

    #[test]
    fn other_files_are_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("Wow.exe");
        // a 64-bit program
        let mut wide = program(0x0022);
        wide[0x84..0x86].copy_from_slice(&0x8664u16.to_le_bytes());
        for bytes in [b"MZ".to_vec(), b"not a program".to_vec(), wide] {
            std::fs::write(&exe, &bytes).unwrap();
            assert_eq!(large_address_aware(&exe), None);
            assert_eq!(make_large_address_aware(&exe).unwrap_err().kind(), io::ErrorKind::InvalidData);
            assert_eq!(std::fs::read(&exe).unwrap(), bytes);
        }
        assert!(make_large_address_aware(&dir.path().join("none.exe")).is_err());
    }
}
