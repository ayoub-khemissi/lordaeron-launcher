//! Reading lordaeron.eu: the feeds, and downloads checked against their size and SHA-256.

use std::path::Path;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

pub const LAUNCHER_FEED: &str = "https://lordaeron.eu/patches/launcher/launcher.json";
pub const NEWS_FEED: &str = "https://lordaeron.eu/patches/launcher/news.json";

fn client(timeout: Duration) -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(concat!("LordaeronLauncher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(8))
        .timeout(timeout)
        .build()?)
}

pub async fn json<T: DeserializeOwned>(url: &str) -> Result<T> {
    // the feeds change at any time: ask past any cache
    let url = format!("{url}?t={}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs());
    let response = client(Duration::from_secs(12))?.get(&url).send().await?.error_for_status()?;
    Ok(response.json::<T>().await?)
}

/// Downloads `url` to `target` (through a .part file), calling `progress(done, total)` as it goes; the file is kept
/// only when its size and SHA-256 are the expected ones.
pub async fn download(
    url: &str,
    target: &Path,
    size: u64,
    sha256: &str,
    mut progress: impl FnMut(u64, u64),
) -> Result<()> {
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let part = target.with_extension("part");
    let mut response = client(Duration::from_secs(60 * 30))?
        .get(url)
        .send()
        .await
        .with_context(|| format!("cannot reach {url}"))?
        .error_for_status()?;
    let total = response.content_length().unwrap_or(size).max(1);
    let mut file = tokio::fs::File::create(&part).await?;
    let mut hasher = Sha256::new();
    let mut done = 0u64;
    let mut last = std::time::Instant::now();
    while let Some(chunk) = response.chunk().await? {
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        done += chunk.len() as u64;
        if last.elapsed() > Duration::from_millis(120) {
            progress(done, total);
            last = std::time::Instant::now();
        }
    }
    file.flush().await?;
    drop(file);
    progress(done, total);
    let hash = hex::encode(hasher.finalize());
    if (size > 0 && done != size) || !hash.eq_ignore_ascii_case(sha256) {
        let _ = tokio::fs::remove_file(&part).await;
        bail!("the download of {} was damaged, please try again", target.file_name().unwrap_or_default().to_string_lossy());
    }
    let _ = tokio::fs::remove_file(target).await;
    tokio::fs::rename(&part, target).await.with_context(|| format!("cannot write {}", target.display()))?;
    Ok(())
}
