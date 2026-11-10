use crate::util::*;
use crate::Core;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct Dl {
    pub queue: VecDeque<(String, String)>,
    pub cur: Option<Cur>,
    pub active: HashMap<String, Value>,
}
pub struct Cur { pub cid: String, pub vid: String, pub child: Arc<Mutex<Option<Child>>>, pub canceled: bool }

impl Core {
    pub fn dl_scan(&self, cid: &str) -> HashMap<String, Value> {
        let dir = self.store.dl_dir(cid);
        let mut out = HashMap::new();
        let Ok(rd) = std::fs::read_dir(&dir) else { return out };
        let files: Vec<String> = rd.flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        let re = Regex::new(r"^([\w-]+)\.(mp4|mkv|webm)$").unwrap();
        for f in &files {
            let Some(m) = re.captures(f) else { continue };
            let id = m[1].to_string();
            let mut subs: Vec<&String> = files.iter().filter(|x| x.starts_with(&format!("{id}.")) && x.ends_with(".vtt")).collect();
            subs.sort_by_key(|x| if x.ends_with(".en.vtt") { 0 } else { 1 });
            let size = std::fs::metadata(dir.join(f)).map(|m| m.len()).unwrap_or(0);
            out.insert(id, json!({"ext": &m[2], "size": size, "sub": subs.first()}));
        }
        out
    }

    pub fn dl_list(&self, cid: &str) -> Value {
        if !ok_id(cid) { return json!({"files": {}, "active": {}, "ffmpeg": false}); }
        let prefix = format!("{cid}/");
        let active: Map<String, Value> = self.dl.lock().unwrap().active.iter()
            .filter_map(|(k, v)| k.strip_prefix(&prefix).map(|r| (r.to_string(), v.clone()))).collect();
        json!({"files": self.dl_scan(cid), "active": active, "ffmpeg": self.find_ffmpeg().is_some()})
    }

    fn dl_emit(&self, cid: &str, vid: &str, state: &str, pct: f64, extra: Value) {
        let k = format!("{cid}/{vid}");
        {
            let mut d = self.dl.lock().unwrap();
            if state == "queued" || state == "downloading" { d.active.insert(k, json!({"state": state, "pct": pct})); } else { d.active.remove(&k); }
        }
        let mut m = json!({"cid": cid, "vid": vid, "state": state, "pct": pct});
        if let (Some(mo), Some(eo)) = (m.as_object_mut(), extra.as_object()) { for (k, v) in eo { mo.insert(k.clone(), v.clone()); } }
        self.emit("dl:progress", m);
    }

    pub fn dl_wipe(&self, cid: &str, vid: &str) {
        let dir = self.store.dl_dir(cid);
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with(&format!("{vid}.")) { let _ = std::fs::remove_file(e.path()); }
        }
    }

    pub fn dl_start(self: &Arc<Self>, cid: &str, vids: &[Value]) -> bool {
        if !ok_id(cid) { return false; }
        let have = self.dl_scan(cid);
        for v in vids {
            let vid = str_of(v);
            if !vid_ok(vid) || have.contains_key(vid) || self.dl.lock().unwrap().active.contains_key(&format!("{cid}/{vid}")) { continue; }
            self.dl.lock().unwrap().queue.push_back((cid.to_string(), vid.to_string()));
            self.dl_emit(cid, vid, "queued", 0.0, json!({}));
        }
        self.dl_next();
        true
    }

    pub fn dl_cancel(&self, cid: &str, vid: Option<&str>) {
        let mut dropped = vec![];
        {
            let mut d = self.dl.lock().unwrap();
            d.queue.retain(|(c, v)| { let hit = c == cid && vid.map_or(true, |x| x == v); if hit { dropped.push((c.clone(), v.clone())); } !hit });
            if let Some(cur) = d.cur.as_mut() {
                if cur.cid == cid && vid.map_or(true, |x| x == cur.vid) {
                    cur.canceled = true;
                    if let Some(ch) = cur.child.lock().unwrap().as_mut() { let _ = ch.kill(); }
                }
            }
        }
        for (c, v) in dropped { self.dl_emit(&c, &v, "canceled", 0.0, json!({})); }
    }

    pub fn dl_delete(&self, cid: &str, vid: Option<&str>) -> bool {
        if !ok_id(cid) { return false; }
        match vid {
            Some(v) if vid_ok(v) => self.dl_wipe(cid, v),
            _ => { self.dl_cancel(cid, None); let _ = std::fs::remove_dir_all(self.store.dl_dir(cid)); }
        }
        true
    }

    pub fn dl_next(self: &Arc<Self>) {
        let (cid, vid, child_slot) = {
            let mut d = self.dl.lock().unwrap();
            if d.cur.is_some() { return; }
            let Some((cid, vid)) = d.queue.pop_front() else { return };
            let slot = Arc::new(Mutex::new(None));
            d.cur = Some(Cur { cid: cid.clone(), vid: vid.clone(), child: slot.clone(), canceled: false });
            (cid, vid, slot)
        };
        self.dl_emit(&cid, &vid, "downloading", 0.0, json!({}));
        let me = self.clone();
        std::thread::spawn(move || {
            let (err, canceled) = me.dl_run(&cid, &vid, &child_slot);
            let canceled = canceled || me.dl.lock().unwrap().cur.as_ref().map_or(false, |c| c.canceled);
            me.dl.lock().unwrap().cur = None;
            if canceled { me.dl_wipe(&cid, &vid); me.dl_emit(&cid, &vid, "canceled", 0.0, json!({})); }
            else if let Some(info) = me.dl_scan(&cid).get(&vid) { me.dl_emit(&cid, &vid, "done", 100.0, info.clone()); }
            else {
                me.dl_wipe(&cid, &vid);
                let e = err.trim_start_matches("ERROR:").trim().chars().take(200).collect::<String>();
                me.dl_emit(&cid, &vid, "error", 0.0, json!({"error": if e.is_empty() { "Download failed".to_string() } else { e }}));
            }
            me.dl_next();
        });
    }

    fn dl_run(self: &Arc<Self>, cid: &str, vid: &str, slot: &Arc<Mutex<Option<Child>>>) -> (String, bool) {
        let bin = match self.ensure_ytdlp() { Ok(b) => b, Err(e) => return (e, false) };
        let dir = self.store.dl_dir(cid);
        if let Err(e) = std::fs::create_dir_all(&dir) { return (e.to_string(), false); }
        let ff = self.find_ffmpeg();
        let fmt = if ff.is_some() { "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]" } else { "b[height<=720][ext=mp4]/b[ext=mp4]/b" };
        let mut args: Vec<String> = ["--no-playlist", "--newline", "--no-warnings", "-f", fmt, "-o"].iter().map(|s| s.to_string()).collect();
        args.push(dir.join(format!("{vid}.%(ext)s")).to_string_lossy().to_string());
        args.extend(["--write-subs", "--write-auto-subs", "--sub-langs", "en", "--sub-format", "vtt", "--retries", "5", "--concurrent-fragments", "4"].iter().map(|s| s.to_string()));
        if let Some(f) = &ff { args.extend(["--merge-output-format".into(), "mp4".into(), "--ffmpeg-location".into(), f.to_string_lossy().to_string()]); }
        args.push(format!("https://www.youtube.com/watch?v={vid}"));
        let mut child = match command(&bin).args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
            Ok(c) => c, Err(e) => return (e.to_string(), false),
        };
        let so = child.stdout.take().unwrap();
        let se = child.stderr.take().unwrap();
        *slot.lock().unwrap() = Some(child);
        let last = Arc::new(Mutex::new(String::new()));
        let pct_re = Regex::new(r"\[download\]\s+([\d.]+)%").unwrap();
        let mut hs = vec![];
        for r in [Box::new(so) as Box<dyn std::io::Read + Send>, Box::new(se)] {
            let (me, last, re, cid, vid) = (self.clone(), last.clone(), pct_re.clone(), cid.to_string(), vid.to_string());
            hs.push(std::thread::spawn(move || {
                let mut last_pct = -1i64;
                for line in BufReader::new(r).split(b'\n').flatten() {
                    let s = String::from_utf8_lossy(&line).replace('\r', "\n");
                    if let Some(l) = s.trim().lines().last() { if !l.is_empty() { *last.lock().unwrap() = l.to_string(); } }
                    if let Some(c) = re.captures_iter(&s).last() {
                        let p: f64 = c[1].parse().unwrap_or(0.0);
                        if p.floor() as i64 != last_pct { last_pct = p.floor() as i64; me.dl_emit(&cid, &vid, "downloading", p, json!({})); }
                    }
                }
            }));
        }
        for h in hs { let _ = h.join(); }
        let mut canceled = false;
        if let Some(mut ch) = slot.lock().unwrap().take() { let _ = ch.wait(); }
        if let Some(c) = self.dl.lock().unwrap().cur.as_ref() { canceled = c.canceled; }
        let l = last.lock().unwrap().clone();
        (l, canceled)
    }
}
