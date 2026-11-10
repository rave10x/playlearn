//! Do Not Disturb while studying (GNOME banners via gsettings). No-op elsewhere.
use crate::util::*;
use crate::Core;
use std::sync::Mutex;

const KEY: [&str; 2] = ["org.gnome.desktop.notifications", "show-banners"];
static PREV: Mutex<Option<String>> = Mutex::new(None);

fn gs(args: &[&str]) -> Option<String> {
    let bin = find_on_path("gsettings")?;
    let out = command(&bin).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

impl Core {
    fn dnd_file(&self) -> std::path::PathBuf { self.store.dir.join("dnd-prev") }

    pub fn set_dnd(&self, on: bool) -> bool {
        if !cfg!(target_os = "linux") { return false; }
        let mut prev = PREV.lock().unwrap();
        if on {
            let Some(cur) = gs(&["get", KEY[0], KEY[1]]) else { return false }; // not GNOME / gsettings missing
            if cur == "false" && prev.is_none() { return true; } // already muted by another app: don't touch or restore it
            if prev.is_none() { *prev = Some(cur.clone()); let _ = std::fs::write(self.dnd_file(), &cur); }
            gs(&["set", KEY[0], KEY[1], "false"]);
            return true;
        }
        if let Some(p) = prev.take() { gs(&["set", KEY[0], KEY[1], &p]); let _ = std::fs::remove_file(self.dnd_file()); }
        true
    }

    /// Restore the previous setting (also recovers after a crash via the saved file).
    pub fn restore_dnd(&self) {
        if !cfg!(target_os = "linux") { return; }
        let mut prev = PREV.lock().unwrap();
        let v = prev.take().or_else(|| std::fs::read_to_string(self.dnd_file()).ok().map(|s| s.trim().to_string()));
        if let Some(v) = v { if v == "true" || v == "false" { gs(&["set", KEY[0], KEY[1], &v]); } }
        let _ = std::fs::remove_file(self.dnd_file());
    }
}
