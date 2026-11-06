//! Reading lordaeron.eu: the feeds, and downloads checked against their size and SHA-256.

use std::path::Path;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

pub const LAUNCHER_FEED: &str = "https://lordaeron.eu/patches/launcher/launcher.json";
pub const NEWS_FEED: &str = "https://lordaeron.eu/patches/launcher/news.json";
pub const NEWS_PAGES: &str = "https://lordaeron.eu/patches/launcher/";

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

/// What the player can do to a running download: pause it (the part already downloaded stays, and the next Play
/// goes on from there) and cap its speed.
pub struct Control<'a> {
    pub paused: &'a std::sync::atomic::AtomicBool,
    pub limit: u64, // bytes per second, 0 = no limit
}

pub const PAUSED: &str = "paused";

/// How far a download is: bytes, and the speed of the last seconds.
pub struct Sample {
    pub done: u64,
    pub total: u64,
    pub speed: u64,
}

/// Downloads `url` to `target` through a .part file, going on from a .part left by an earlier pause or a cut
/// connection (an HTTP range); `progress` is told the bytes and the speed as it goes. The file is kept only when its
/// size and SHA-256 are the expected ones. A pause returns the error PAUSED and keeps the .part.
pub async fn download(
    url: &str,
    target: &Path,
    size: u64,
    sha256: &str,
    control: &Control<'_>,
    mut progress: impl FnMut(Sample),
) -> Result<()> {
    use std::sync::atomic::Ordering;

    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let part = target.with_extension("part");
    let mut hasher = Sha256::new();
    let mut have = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
    if size > 0 && have >= size {
        have = 0; // a stale or damaged part: start again
    }
    if have > 0 {
        let mut file = std::fs::File::open(&part)?;
        std::io::copy(&mut file, &mut hasher)?;
    }
    let mut request = client(Duration::from_secs(60 * 60))?.get(url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let mut response = request.send().await.with_context(|| format!("cannot reach {url}"))?.error_for_status()?;
    if have > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        // the server sends the whole file: start over
        have = 0;
        hasher = Sha256::new();
    }
    let total = if size > 0 { size } else { have + response.content_length().unwrap_or(0) }.max(1);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(have > 0)
        .truncate(have == 0)
        .open(&part)
        .await?;
    let mut done = have;
    let start = std::time::Instant::now();
    let mut since_start = 0u64;
    let mut last = std::time::Instant::now();
    let mut window: std::collections::VecDeque<(std::time::Instant, u64)> = std::collections::VecDeque::new();
    while let Some(chunk) = response.chunk().await? {
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        done += chunk.len() as u64;
        since_start += chunk.len() as u64;
        if control.paused.load(Ordering::SeqCst) {
            file.flush().await?;
            bail!(PAUSED);
        }
        if control.limit > 0 {
            let due = Duration::from_secs_f64(since_start as f64 / control.limit as f64);
            let spent = start.elapsed();
            if due > spent {
                tokio::time::sleep(due - spent).await;
            }
        }
        if last.elapsed() > Duration::from_millis(200) {
            let now = std::time::Instant::now();
            window.push_back((now, done));
            while window.len() > 2 && now.duration_since(window[0].0) > Duration::from_secs(4) {
                window.pop_front();
            }
            let speed = match (window.front(), window.back()) {
                (Some(a), Some(b)) if b.0 > a.0 => ((b.1 - a.1) as f64 / b.0.duration_since(a.0).as_secs_f64()) as u64,
                _ => 0,
            };
            progress(Sample { done, total, speed });
            last = now;
        }
    }
    file.flush().await?;
    drop(file);
    progress(Sample { done, total, speed: 0 });
    let hash = hex::encode(hasher.finalize());
    if (size > 0 && done != size) || !hash.eq_ignore_ascii_case(sha256) {
        let _ = tokio::fs::remove_file(&part).await;
        bail!("the download of {} was damaged, please try again", target.file_name().unwrap_or_default().to_string_lossy());
    }
    let _ = tokio::fs::remove_file(target).await;
    tokio::fs::rename(&part, target).await.with_context(|| format!("cannot write {}", target.display()))?;
    Ok(())
}
