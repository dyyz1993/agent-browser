//! Check the Chrome install: binary path, version, cache dirs, user-data
//! dir, and the optional lightpanda engine.

use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::helpers::which_exists;
use super::{Check, Status};

pub(super) fn check(checks: &mut Vec<Check>) {
    let category = "Chrome";

    let chrome = crate::native::cdp::chrome::find_chrome();
    match chrome {
        Some(path) => {
            let label = path.display().to_string();
            match query_chrome_version(&path) {
                Some(version) => checks.push(Check::new(
                    "chrome.installed",
                    category,
                    Status::Pass,
                    format!("{} at {}", version, label),
                )),
                None => checks.push(Check::new(
                    "chrome.installed",
                    category,
                    Status::Pass,
                    format!("Chrome at {} (version unknown)", label),
                )),
            }
        }
        None => checks.push(
            Check::new(
                "chrome.installed",
                category,
                Status::Fail,
                "No Chrome binary found",
            )
            .with_fix("agent-browser install"),
        ),
    }

    let cache_dir = crate::install::get_browsers_dir();
    if cache_dir.exists() {
        checks.push(Check::new(
            "chrome.cache_dir",
            category,
            Status::Info,
            format!("Cache dir {}", cache_dir.display()),
        ));
    }

    if let Some(puppeteer_dir) = puppeteer_cache_dir() {
        if puppeteer_dir.exists() {
            checks.push(Check::new(
                "chrome.puppeteer_cache",
                category,
                Status::Info,
                format!(
                    "Puppeteer cache also present: {} (will be used as a fallback)",
                    puppeteer_dir.display()
                ),
            ));
        }
    }

    if let Some(user_data_dir) = crate::native::cdp::chrome::find_chrome_user_data_dir() {
        let profiles = crate::native::cdp::chrome::list_chrome_profiles(&user_data_dir);
        let count = profiles.len();
        let dir_label = user_data_dir.display().to_string();
        if count == 0 {
            checks.push(Check::new(
                "chrome.user_data_dir",
                category,
                Status::Info,
                format!(
                    "Chrome user data dir found ({}), no profiles parsed",
                    dir_label
                ),
            ));
        } else {
            checks.push(Check::new(
                "chrome.user_data_dir",
                category,
                Status::Info,
                format!("{} Chrome profile(s) at {}", count, dir_label),
            ));
        }
    }

    if let Ok(engine) = env::var("AGENT_BROWSER_ENGINE") {
        if engine == "lightpanda" {
            // Best-effort PATH lookup; absence is FAIL only when the user
            // explicitly opted into the lightpanda engine.
            if which_exists("lightpanda") {
                checks.push(Check::new(
                    "chrome.engine_lightpanda",
                    category,
                    Status::Pass,
                    "Lightpanda binary on PATH",
                ));
            } else {
                checks.push(
                    Check::new(
                        "chrome.engine_lightpanda",
                        category,
                        Status::Fail,
                        "AGENT_BROWSER_ENGINE=lightpanda but no lightpanda binary on PATH",
                    )
                    .with_fix("install lightpanda or unset AGENT_BROWSER_ENGINE"),
                );
            }
        }
    }
}

fn query_chrome_version(path: &Path) -> Option<String> {
    if let Some(version) = query_macos_app_version(path) {
        return Some(version);
    }

    let mut child = Command::new(path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let output = child.wait_with_output().ok()?;
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                return if s.is_empty() { None } else { Some(s) };
            }
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(25));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Err(_) => return None,
        }
    }
}

fn query_macos_app_version(path: &Path) -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let app_dir = path
        .ancestors()
        .find(|p| p.extension().is_some_and(|ext| ext == "app"))?;
    let plist_path = app_dir.join("Contents").join("Info.plist");
    let plist = std::fs::read_to_string(plist_path).ok()?;
    let version = plist_string_value(&plist, "CFBundleShortVersionString")?;
    let name = plist_string_value(&plist, "CFBundleName")
        .or_else(|| {
            app_dir
                .file_stem()
                .map(|stem| stem.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "Chrome".to_string());

    Some(format!("{} {}", name, version))
}

fn plist_string_value(plist: &str, key: &str) -> Option<String> {
    let key_tag = format!("<key>{}</key>", key);
    let key_pos = plist.find(&key_tag)?;
    let after_key = &plist[key_pos + key_tag.len()..];
    let string_start = after_key.find("<string>")? + "<string>".len();
    let after_start = &after_key[string_start..];
    let string_end = after_start.find("</string>")?;
    let value = after_start[..string_end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub(super) fn puppeteer_cache_dir() -> Option<PathBuf> {
    if let Ok(p) = env::var("PUPPETEER_CACHE_DIR") {
        return Some(PathBuf::from(p));
    }
    dirs::home_dir().map(|h| h.join(".cache").join("puppeteer"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_puppeteer_cache_dir_returns_sensible_default() {
        // When PUPPETEER_CACHE_DIR is unset, we fall back to
        // ~/.cache/puppeteer. Mutating env vars here would race with other
        // tests, so just verify the fallback path is shaped correctly.
        if env::var("PUPPETEER_CACHE_DIR").is_err() {
            let dir = puppeteer_cache_dir().expect("home dir should resolve in tests");
            let s = dir.to_string_lossy();
            assert!(s.contains(".cache"));
            assert!(s.ends_with("puppeteer"));
        }
    }

    #[test]
    fn test_plist_string_value() {
        let plist = r#"
        <plist>
          <dict>
            <key>CFBundleName</key>
            <string>Chrome</string>
            <key>CFBundleShortVersionString</key>
            <string>148.0.7778.216</string>
          </dict>
        </plist>
        "#;

        assert_eq!(
            plist_string_value(plist, "CFBundleName").as_deref(),
            Some("Chrome")
        );
        assert_eq!(
            plist_string_value(plist, "CFBundleShortVersionString").as_deref(),
            Some("148.0.7778.216")
        );
        assert!(plist_string_value(plist, "Missing").is_none());
    }
}
