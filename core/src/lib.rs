//! Playlearn backend. Serves the UI and a small token-protected JSON API on 127.0.0.1
//! (YouTube embeds refuse custom-scheme origins, so the UI is loaded from http://127.0.0.1:<port>/).
mod courses;
mod dl;
mod dnd;
mod server;
mod store;
mod util;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use util::*;

/// Called by the server to open (`true`) or close (`false`) a hidden webview that renders `url`
/// and posts its HTML back to `/__article/<job>`.
/// File dialogs are provided by the host app: ("save" | "open", suggested file name) -> chosen path.
pub type DialogHook = Arc<dyn Fn(&str, &str) -> Option<PathBuf> + Send + Sync>;

pub type RenderHook = Arc<dyn Fn(String, String, bool) + Send + Sync>;

pub struct Core {
    pub store: store::Store,
    pub token: String,
    pub port: Mutex<u16>,
    events: Mutex<(u64, VecDeque<(u64, String, Value)>)>,
    events_cv: Condvar,
    dl: Mutex<dl::Dl>,
    articles: Mutex<HashMap<String, (String, String)>>,
    jobs: Mutex<Vec<String>>,
    render_hook: Mutex<Option<RenderHook>>,
    dialog_hook: Mutex<Option<DialogHook>>,
}

pub fn rand_hex(n: usize) -> String {
    use rand::RngCore;
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

impl Core {
    pub fn new(data_dir: PathBuf) -> Arc<Self> {
        Arc::new(Core {
            store: store::Store { dir: data_dir },
            token: rand_hex(24),
            port: Mutex::new(0),
            events: Mutex::new((0, VecDeque::new())),
            events_cv: Condvar::new(),
            dl: Mutex::new(Default::default()),
            articles: Mutex::new(HashMap::new()),
            jobs: Mutex::new(vec![]),
            render_hook: Mutex::new(None),
            dialog_hook: Mutex::new(None),
        })
    }
    /// Same folder the Electron build uses (…\Roaming\Playlearn on Windows, ~/.config/Playlearn on Linux).
    pub fn default_data_dir() -> PathBuf { dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("Playlearn") }
    pub fn user_agent() -> &'static str { util::UA }
    pub fn set_dialog_hook(&self, h: DialogHook) { *self.dialog_hook.lock().unwrap() = Some(h); }
    fn pick(&self, kind: &str, name: &str) -> Option<PathBuf> {
        if let Some(p) = std::env::var_os(if kind == "save" { "PL_EXPORT_PATH" } else { "PL_IMPORT_PATH" }) { return Some(PathBuf::from(p)); } // tests
        let h = self.dialog_hook.lock().unwrap().clone()?;
        h(kind, name)
    }
    pub fn set_render_hook(&self, h: RenderHook) { *self.render_hook.lock().unwrap() = Some(h); }
    pub fn port(&self) -> u16 { *self.port.lock().unwrap() }
    pub fn url(&self) -> String { format!("http://127.0.0.1:{}/", self.port()) }

    /// Start the local server; returns the port.
    pub fn serve(self: &Arc<Self>) -> std::io::Result<u16> { server::serve(self.clone()) }

    pub fn emit(&self, name: &str, data: Value) {
        let mut e = self.events.lock().unwrap();
        e.0 += 1;
        let seq = e.0;
        e.1.push_back((seq, name.to_string(), data));
        while e.1.len() > 500 { e.1.pop_front(); }
        self.events_cv.notify_all();
    }
    /// Long-poll: events newer than `since` (`None` = from now). Waits up to `wait` for something to arrive.
    pub fn poll(&self, since: Option<u64>, wait: std::time::Duration) -> Value {
        let mut e = self.events.lock().unwrap();
        let Some(since) = since else { return json!({"next": e.0, "events": []}) };
        if !e.1.iter().any(|x| x.0 > since) {
            e = self.events_cv.wait_timeout_while(e, wait, |g| !g.1.iter().any(|x| x.0 > since)).unwrap().0;
        }
        let evs: Vec<Value> = e.1.iter().filter(|x| x.0 > since).map(|x| json!({"n": x.1, "d": x.2})).collect();
        json!({"next": e.0, "events": evs})
    }
    pub fn status(&self, m: &str) { self.emit("import-status", json!(m)); }
    /// Push a link the app was launched with (second instance, protocol handler) to the UI.
    pub fn incoming_url(&self, u: &str) { self.emit("incoming-url", json!(u)); }

    pub fn call(self: &Arc<Self>, cmd: &str, a: &[Value]) -> R<Value> {
        let arg = |i: usize| a.get(i).cloned().unwrap_or(Value::Null);
        let s = |i: usize| a.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let wrap = |r: R<Value>| Ok(match r { Ok(v) => v, Err(e) => json!({"ok": false, "error": e}) });
        match cmd {
            "courses:list" => Ok(Value::Array(self.store.list())),
            "courses:get" => self.store.read(&s(0)),
            "courses:save" => { self.store.write(&arg(0))?; Ok(json!(true)) }
            "courses:delete" => {
                let id = s(0);
                if ok_id(&id) { self.dl_cancel(&id, None); let _ = std::fs::remove_dir_all(self.store.dl_dir(&id)); }
                self.store.remove(&id); Ok(json!(true))
            }
            "courses:refresh" => wrap(self.refresh_course(&s(0))),
            "courses:import" => wrap(self.import_playlist(&s(0)).map(|c| json!({"ok": true, "course": c}))),
            "videos:resolve" => wrap(self.resolve_videos(&s(0))),
            "data:export" => wrap(self.export_data(&arg(0))),
            "data:import" => wrap(self.import_data()),
            "data:folder" => { let _ = std::fs::create_dir_all(self.store.courses_dir()); let _ = open::that_detached(&self.store.dir); Ok(json!("")) }
            "dnd:set" => Ok(json!(self.set_dnd(arg(0).as_bool().unwrap_or(false)))),
            "open-external" => {
                let u = s(0);
                if u.starts_with("http://") || u.starts_with("https://") { let _ = open::that_detached(u); }
                Ok(Value::Null)
            }
            "dl:list" => Ok(self.dl_list(&s(0))),
            "dl:start" => Ok(json!(self.dl_start(&s(0), arg(1).as_array().map(|v| v.as_slice()).unwrap_or(&[])))),
            "dl:cancel" => { let (c, v) = (s(0), s(1)); if ok_id(&c) { self.dl_cancel(&c, if vid_ok(&v) { Some(&v) } else { None }); } Ok(json!(true)) }
            "dl:delete" => { let v = s(1); Ok(json!(self.dl_delete(&s(0), if v.is_empty() { None } else { Some(&v) }))) }
            "dl:open" => {
                let c = s(0);
                if !ok_id(&c) { return Ok(json!("")); }
                let d = self.store.dl_dir(&c); let _ = std::fs::create_dir_all(&d); let _ = open::that_detached(d); Ok(json!(""))
            }
            "chapters:get" => Ok(self.chapters(&s(0))),
            _ => Err(format!("unknown command {cmd}")),
        }
    }

    fn export_data(&self, prefs: &Value) -> R<Value> {
        let courses = self.store.list();
        let secs = now_ms() / 1000;
        let stamp = civil_date(secs);
        let Some(path) = self.pick("save", &format!("playlearn-backup-{stamp}.json")) else { return Ok(json!({"ok": false, "canceled": true})) };
        let mut clean = serde_json::Map::new();
        for k in store::PREF_KEYS { if let Some(v) = prefs.get(k) { if !v.is_null() { clean.insert(k.to_string(), v.clone()); } } }
        let body = json!({"format": store::BACKUP_FORMAT, "version": 1, "exportedAt": now_ms(), "prefs": clean, "courses": courses});
        std::fs::write(&path, serde_json::to_vec(&body).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        Ok(json!({"ok": true, "path": path.to_string_lossy(), "count": courses.len(), "size": size}))
    }

    fn import_data(&self) -> R<Value> {
        let Some(path) = self.pick("open", "") else { return Ok(json!({"ok": false, "canceled": true})) };
        self.import_backup_file(&path)
    }

    pub fn import_backup_file(&self, path: &std::path::Path) -> R<Value> {
        if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 300 * 1024 * 1024 { return Err("That file is too large to be a Playlearn backup".into()); }
        let j: Value = serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|_| "That file is not valid JSON".to_string())?;
        if j["format"] != store::BACKUP_FORMAT || !j["courses"].is_array() { return Err("That is not a Playlearn backup file".into()); }
        if j["version"].as_i64().unwrap_or(1) > 1 { return Err("This backup was made by a newer version of Playlearn – update the app first".into()); }
        let have: HashMap<String, Value> = self.store.list().into_iter().map(|c| (str_of(&c["id"]).to_string(), c)).collect();
        let (mut added, mut merged, mut skipped) = (0, 0, 0);
        for c in j["courses"].as_array().unwrap() {
            if !store::valid_course(c) { skipped += 1; continue; }
            match have.get(str_of(&c["id"])) {
                Some(old) => { self.store.write(&store::merge_course(old, c))?; merged += 1; }
                None => { self.store.write(c)?; added += 1; }
            }
        }
        let mut prefs = serde_json::Map::new();
        for k in store::PREF_KEYS { if let Some(v) = j["prefs"].get(k) { if !v.is_null() { prefs.insert(k.to_string(), v.clone()); } } }
        Ok(json!({"ok": true, "added": added, "merged": merged, "skipped": skipped, "prefs": prefs}))
    }
}

/// YYYY-MM-DD (UTC) from unix seconds.
fn civil_date(secs: i64) -> String {
    let z = secs.div_euclid(86400) + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02}", if m <= 2 { y + 1 } else { y }, m, d)
}

pub const EMBED_SCRIPT: &str = include_str!("embed.js");

