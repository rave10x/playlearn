use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub type R<T> = Result<T, String>;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Keep only [A-Za-z0-9_-] (same as JS `\w` + `-`).
pub fn clean_id(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect()
}
pub fn ok_id(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}
pub fn vid_ok(s: &str) -> bool {
    (6..=20).contains(&s.len()) && ok_id(s)
}

pub fn str_of(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}

/// Run a child process without flashing a console window on Windows.
pub fn command(bin: &Path) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    c
}

pub fn exe(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").or_else(|| std::env::var_os("Path"))?;
    std::env::split_paths(&path)
        .map(|p| p.join(exe(name)))
        .find(|f| f.is_file())
}

/// Run to completion, capturing stdout; error text is the last non-empty stderr line.
pub fn run(bin: &Path, args: &[String], timeout: Duration) -> R<String> {
    let mut child = command(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut so = child.stdout.take().unwrap();
    let mut se = child.stderr.take().unwrap();
    let t_out = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = std::io::Read::read_to_end(&mut so, &mut b);
        b
    });
    let t_err = std::thread::spawn(move || {
        let mut b = Vec::new();
        let _ = std::io::Read::read_to_end(&mut se, &mut b);
        b
    });
    let t0 = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if t0.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("The command timed out".into());
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    let out = String::from_utf8_lossy(&t_out.join().unwrap_or_default()).to_string();
    let err = String::from_utf8_lossy(&t_err.join().unwrap_or_default()).to_string();
    if status.success() {
        Ok(out)
    } else {
        Err(err.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("Command failed").to_string())
    }
}

/// HTTP agent. Windows uses the system TLS stack (SChannel), so the build needs no C toolchain.
pub fn agent(timeout: Duration) -> ureq::Agent {
    let b = ureq::AgentBuilder::new().timeout(timeout).redirects(8);
    #[cfg(windows)]
    let b = match native_tls::TlsConnector::new() { Ok(c) => b.tls_connector(std::sync::Arc::new(c)), Err(_) => b };
    b.build()
}

pub fn http_get(url: &str, timeout: Duration) -> R<ureq::Response> {
    agent(timeout)
        .get(url)
        .set("User-Agent", UA)
        .set("Accept", "text/html,application/xhtml+xml")
        .set("Accept-Language", "en")
        .call()
        .map_err(|e| e.to_string())
}

pub const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
