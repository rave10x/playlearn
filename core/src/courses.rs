use crate::util::*;
use crate::Core;
use regex::Regex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use url::Url;

impl Core {
    // ---------- yt-dlp ----------
    pub fn local_ytdlp(&self) -> PathBuf { self.store.bin_dir().join(exe("yt-dlp")) }
    pub fn find_ytdlp(&self) -> Option<PathBuf> {
        find_on_path("yt-dlp").or_else(|| Some(self.local_ytdlp()).filter(|p| p.is_file()))
    }
    pub fn find_ffmpeg(&self) -> Option<PathBuf> {
        find_on_path("ffmpeg").or_else(|| Some(self.store.bin_dir().join(exe("ffmpeg"))).filter(|p| p.is_file()))
    }
    pub fn ensure_ytdlp(&self) -> R<PathBuf> {
        if let Some(p) = self.find_ytdlp() { return Ok(p); }
        self.status("Downloading yt-dlp (one time)…");
        let asset = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp_linux" };
        let res = agent(Duration::from_secs(300))
            .get(&format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset}"))
            .call().map_err(|e| format!("Could not download yt-dlp ({e})"))?;
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut res.into_reader(), &mut buf).map_err(|e| e.to_string())?;
        let p = self.local_ytdlp();
        std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&p, buf).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)); }
        Ok(p)
    }
    pub fn ytdlp(&self, args: &[&str]) -> R<String> {
        let bin = self.ensure_ytdlp()?;
        run(&bin, &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(), Duration::from_secs(180))
    }

    // ---------- playlists ----------
    pub fn fetch_playlist(&self, pid: &str) -> R<Value> {
        self.ensure_ytdlp()?;
        self.status("Reading playlist…");
        let out = self.ytdlp(&["--flat-playlist", "-J", "--no-warnings", &format!("https://www.youtube.com/playlist?list={pid}")])?;
        let j: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
        let hidden = Regex::new(r"(?i)^\[(Private|Deleted) video\]$").unwrap();
        let mut lessons = vec![];
        for (i, e) in j["entries"].as_array().into_iter().flatten().enumerate() {
            if !e.is_object() || str_of(&e["id"]).is_empty() || hidden.is_match(str_of(&e["title"])) { continue; }
            let t = str_of(&e["title"]);
            lessons.push(json!({"id": e["id"], "title": if t.is_empty() { format!("Lesson {}", i + 1) } else { t.to_string() },
                "duration": e["duration"].as_f64().unwrap_or(0.0).round() as i64}));
        }
        if lessons.is_empty() { return Err("No playable videos found in this playlist".into()); }
        let ch = if !str_of(&j["channel"]).is_empty() { &j["channel"] } else { &j["uploader"] };
        Ok(json!({"title": str_of(&j["title"]), "channel": str_of(ch), "lessons": lessons}))
    }

    pub fn import_playlist(&self, input: &str) -> R<Value> {
        let pid = playlist_id(input).ok_or("That does not look like a YouTube playlist link (needs ?list=…). To build a course from single videos, use “Custom course”.")?;
        if let Some(c) = self.store.list().into_iter().find(|c| str_of(&c["playlistId"]) == pid) { return Ok(c); }
        let pl = self.fetch_playlist(&pid)?;
        let lessons: Vec<Value> = pl["lessons"].as_array().unwrap().iter().map(|l| {
            let mut l = l.clone();
            let o = l.as_object_mut().unwrap();
            o.insert("done".into(), json!(false)); o.insert("pos".into(), json!(0)); o.insert("notes".into(), json!(""));
            l
        }).collect();
        let now = now_ms();
        let t = str_of(&pl["title"]);
        let course = json!({"id": pid, "playlistId": pid, "title": if t.is_empty() { "Untitled course" } else { t },
            "channel": pl["channel"], "url": format!("https://www.youtube.com/playlist?list={pid}"),
            "thumbnail": format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", str_of(&lessons[0]["id"])),
            "createdAt": now, "lastOpened": now, "refreshedAt": now, "lastLesson": lessons[0]["id"], "lessons": lessons});
        self.store.write(&course)?;
        Ok(course)
    }

    /// Re-read the playlist and merge: keep all progress/notes/chapters, add new videos, follow the playlist order.
    pub fn refresh_course(&self, id: &str) -> R<Value> {
        if !ok_id(id) { return Err("Bad course id".into()); }
        let old = self.store.read(id)?;
        if truthy(&old["custom"]) { return Err("Custom courses have no playlist to refresh".into()); }
        let pl = self.fetch_playlist(str_of(&old["playlistId"]))?;
        let empty = vec![];
        let old_ls = old["lessons"].as_array().unwrap_or(&empty);
        let now = now_ms();
        let mut seen = std::collections::HashSet::new();
        let mut lessons: Vec<Value> = vec![];
        let mut added = 0;
        for n in pl["lessons"].as_array().unwrap() {
            let nid = str_of(&n["id"]).to_string();
            seen.insert(nid.clone());
            if let Some(o) = old_ls.iter().find(|l| str_of(&l["id"]) == nid) {
                let mut m = o.as_object().cloned().unwrap_or_default();
                m.remove("gone");
                m.insert("title".into(), n["title"].clone());
                let d = n["duration"].as_i64().unwrap_or(0);
                m.insert("duration".into(), if d != 0 { json!(d) } else { o["duration"].clone() });
                lessons.push(Value::Object(m));
            } else {
                let mut m = n.as_object().cloned().unwrap();
                m.insert("done".into(), json!(false)); m.insert("pos".into(), json!(0)); m.insert("notes".into(), json!("")); m.insert("addedAt".into(), json!(now));
                lessons.push(Value::Object(m));
                added += 1;
            }
        }
        let have = self.dl_scan(id);
        let (mut removed, mut kept) = (0, 0);
        for o in old_ls {
            let oid = str_of(&o["id"]);
            if seen.contains(oid) { continue; }
            let mine = truthy(&o["done"]) || truthy(&o["pos"]) || !str_of(&o["notes"]).trim().is_empty()
                || o["marks"].as_array().map_or(false, |m| !m.is_empty()) || have.get(oid).is_some();
            if mine {
                let mut m = o.as_object().cloned().unwrap_or_default();
                if !truthy(&o["gone"]) { kept += 1; }
                m.insert("gone".into(), json!(true));
                lessons.push(Value::Object(m));
            } else { removed += 1; }
        }
        let mut course = old.as_object().cloned().unwrap_or_default();
        if !str_of(&pl["title"]).is_empty() { course.insert("title".into(), pl["title"].clone()); }
        if !str_of(&pl["channel"]).is_empty() { course.insert("channel".into(), pl["channel"].clone()); }
        let last = str_of(&course.get("lastLesson").cloned().unwrap_or(Value::Null)).to_string();
        if !lessons.iter().any(|l| str_of(&l["id"]) == last) { course.insert("lastLesson".into(), lessons[0]["id"].clone()); }
        course.insert("lessons".into(), Value::Array(lessons));
        course.insert("refreshedAt".into(), json!(now));
        let course = Value::Object(course);
        self.store.write(&course)?;
        Ok(json!({"ok": true, "course": course, "added": added, "removed": removed, "kept": kept}))
    }

    // ---------- custom courses ----------
    pub fn fetch_video(&self, vid: &str) -> R<Value> {
        let out = self.ytdlp(&["--skip-download", "--no-playlist", "--no-warnings", "--print",
            "%(id)s\t%(title)s\t%(duration)s\t%(channel)s", &format!("https://www.youtube.com/watch?v={vid}")])?;
        let line = out.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("");
        let mut p = line.split('\t');
        let id = p.next().unwrap_or("");
        if id.is_empty() { return Err("video not found".into()); }
        let title = p.next().unwrap_or("");
        let dur = p.next().unwrap_or("").parse::<f64>().unwrap_or(0.0).round() as i64;
        let ch = p.next().unwrap_or("");
        Ok(json!({"id": id, "title": if title.is_empty() { "Untitled video" } else { title }, "duration": dur,
            "channel": if ch == "NA" { "" } else { ch }}))
    }

    pub fn fetch_article(&self, u: &Url) -> R<Value> {
        match http_get(u.as_str(), Duration::from_secs(25)) {
            Ok(res) => {
                let ty = res.header("content-type").unwrap_or("").to_string();
                if !ty.is_empty() && !Regex::new(r"(?i)html|xml").unwrap().is_match(&ty) {
                    return Err(format!("not a web page ({})", ty.split(';').next().unwrap_or("")));
                }
                let final_url = res.get_url().to_string();
                let mut buf = Vec::new();
                std::io::Read::read_to_end(&mut std::io::Read::take(res.into_reader(), 6 * 1024 * 1024 + 1), &mut buf).map_err(|e| e.to_string())?;
                if buf.len() > 6 * 1024 * 1024 { return Err("page is too large".into()); }
                let html = String::from_utf8_lossy(&buf).to_string();
                if !looks_empty(&html) { return Ok(json!({"type": "article", "url": final_url, "html": html})); }
            }
            Err(_) => {}
        }
        self.render_page(u.as_str())
    }

    /// Hidden-browser fallback (Cloudflare etc.): the host app opens a hidden webview that posts the page back.
    fn render_page(&self, url: &str) -> R<Value> {
        let hook = self.render_hook.lock().unwrap().clone().ok_or("the site blocked automatic access (bot check)")?;
        self.status("Opening the page in a hidden browser…");
        let job = crate::rand_hex(12);
        self.jobs.lock().unwrap().push(job.clone());
        hook(url.to_string(), job.clone(), true);
        let t0 = std::time::Instant::now();
        let mut best: Option<(String, String)> = None;
        while t0.elapsed() < Duration::from_secs(30) {
            std::thread::sleep(Duration::from_millis(600));
            if let Some(p) = self.articles.lock().unwrap().get(&job).cloned() {
                if !looks_empty(&p.1) { best = Some(p); break; }
                best = Some(p);
            }
        }
        hook(url.to_string(), job.clone(), false);
        self.articles.lock().unwrap().remove(&job);
        self.jobs.lock().unwrap().retain(|j| *j != job);
        match best {
            Some((u, html)) if !html.is_empty() && !Regex::new(r"(?i)<title>\s*Just a moment").unwrap().is_match(&html) =>
                Ok(json!({"type": "article", "url": if u.is_empty() { url.to_string() } else { u }, "html": html})),
            _ => Err("the site blocked automatic access (bot check)".into()),
        }
    }

    /// text = any mix of video links / playlist links separated by whitespace or commas
    pub fn resolve_videos(&self, text: &str) -> R<Value> {
        let mut items: Vec<String> = vec![];
        for s in text.split(|c: char| c.is_whitespace() || c == ',').filter(|s| !s.is_empty()) {
            if !items.iter().any(|x| x == s) { items.push(s.to_string()); }
        }
        if items.is_empty() { return Err("Paste at least one YouTube link".into()); }
        if items.len() > 100 { return Err("Add at most 100 links at a time".into()); }
        let results: Mutex<Vec<Option<Result<Vec<Value>, String>>>> = Mutex::new(vec![None; items.len()]);
        let next = AtomicUsize::new(0);
        let done = AtomicUsize::new(0);
        std::thread::scope(|sc| {
            for _ in 0..4.min(items.len()) {
                sc.spawn(|| loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    if k >= items.len() { break; }
                    let it = &items[k];
                    let r: Result<Vec<Value>, String> = (|| {
                        if let Some(v) = video_id(it) { return Ok(vec![self.fetch_video(&v)?]); }
                        if let Some(p) = playlist_id(it) { return Ok(self.fetch_playlist(&p)?["lessons"].as_array().cloned().unwrap_or_default()); }
                        match web_url(it) {
                            None => Err("Not a link I can open".into()),
                            Some(u) if is_youtube_host(&u) => Err("Not a YouTube video or playlist link (channel pages are not supported)".into()),
                            Some(u) => Ok(vec![self.fetch_article(&u)?]),
                        }
                    })();
                    results.lock().unwrap()[k] = Some(r);
                    self.status(&format!("Reading links… {}/{}", done.fetch_add(1, Ordering::SeqCst) + 1, items.len()));
                });
            }
        });
        let mut seen = std::collections::HashSet::new();
        let (mut lessons, mut errors) = (vec![], vec![]);
        for (k, r) in results.into_inner().unwrap().into_iter().enumerate() {
            match r.unwrap_or_else(|| Err("failed".into())) {
                Err(e) => errors.push(format!("{} – {}", items[k].chars().take(60).collect::<String>(), e)),
                Ok(ls) => for l in ls {
                    let key = if !str_of(&l["id"]).is_empty() { str_of(&l["id"]).to_string() } else { str_of(&l["url"]).to_string() };
                    if seen.insert(key) { lessons.push(l); }
                },
            }
        }
        Ok(json!({"ok": true, "lessons": lessons, "errors": errors}))
    }

    pub fn chapters(&self, vid: &str) -> Value {
        if !vid_ok(vid) { return Value::Null; }
        let Ok(out) = self.ytdlp(&["--skip-download", "--no-playlist", "--no-warnings", "--print", "%(chapters)j", &format!("https://www.youtube.com/watch?v={vid}")]) else { return Value::Null };
        let line = out.lines().filter(|l| !l.trim().is_empty()).last().unwrap_or("null");
        let Ok(j) = serde_json::from_str::<Value>(line) else { return Value::Null };
        let Some(a) = j.as_array() else { return json!([]) };
        Value::Array(a.iter().filter(|c| c["start_time"].is_number()).map(|c| json!({
            "t": c["start_time"].as_f64().unwrap_or(0.0).floor() as i64,
            "end": c["end_time"].as_f64().unwrap_or(0.0).floor() as i64,
            "title": str_of(&c["title"]).chars().take(120).collect::<String>()})).collect())
    }
}

fn truthy(v: &Value) -> bool {
    match v { Value::Null => false, Value::Bool(b) => *b, Value::Number(n) => n.as_f64().map_or(false, |f| f != 0.0), Value::String(s) => !s.is_empty(), _ => true }
}

pub fn playlist_id(input: &str) -> Option<String> {
    let s = input.trim();
    if let Ok(u) = Url::parse(s) {
        if let Some((_, l)) = u.query_pairs().find(|(k, v)| k == "list" && !v.is_empty()) { return Some(l.to_string()); }
    }
    Regex::new(r"^(PL|UU|OL|FL|LL)[\w-]{10,}$").unwrap().is_match(s).then(|| s.to_string())
}

pub fn video_id(input: &str) -> Option<String> {
    let mut s = input.trim().to_string();
    let id_re = Regex::new(r"^[\w-]{11}$").unwrap();
    if id_re.is_match(&s) { return Some(s); }
    if !Regex::new(r"(?i)^[a-z]+://").unwrap().is_match(&s) { s = format!("https://{s}"); }
    let u = Url::parse(&s).ok()?;
    let h = u.host_str()?.trim_start_matches("www.").trim_start_matches("m.").trim_start_matches("music.").to_string();
    if h == "youtu.be" {
        let id = u.path().trim_start_matches('/').split('/').next().unwrap_or("").to_string();
        return id_re.is_match(&id).then_some(id);
    }
    if h == "youtube.com" || h.ends_with(".youtube.com") || h == "youtube-nocookie.com" || h.ends_with(".youtube-nocookie.com") {
        if let Some((_, v)) = u.query_pairs().find(|(k, v)| k == "v" && id_re.is_match(v)) { return Some(v.to_string()); }
        if let Some(c) = Regex::new(r"^/(?:shorts|embed|live|v)/([\w-]{11})").unwrap().captures(u.path()) { return Some(c[1].to_string()); }
    }
    None
}

pub fn web_url(input: &str) -> Option<Url> {
    let mut s = input.trim().to_string();
    if !Regex::new(r"(?i)^[a-z][a-z0-9+.-]*://").unwrap().is_match(&s) { s = format!("https://{s}"); }
    let u = Url::parse(&s).ok()?;
    ((u.scheme() == "http" || u.scheme() == "https") && u.host_str().map_or(false, |h| h.contains('.'))).then_some(u)
}

fn is_youtube_host(u: &Url) -> bool {
    let h = u.host_str().unwrap_or("");
    ["youtube.com", "youtube-nocookie.com", "youtu.be"].iter().any(|d| h == *d || h.ends_with(&format!(".{d}")))
}

pub fn looks_empty(html: &str) -> bool {
    let a = Regex::new(r"(?is)<script.*?</script>").unwrap().replace_all(html, "");
    let b = Regex::new(r"(?is)<style.*?</style>").unwrap().replace_all(&a, "");
    let c = Regex::new(r"<[^>]+>").unwrap().replace_all(&b, "");
    let text = c.split_whitespace().collect::<Vec<_>>().join(" ");
    text.chars().count() < 1500 || Regex::new(r"(?i)<title>\s*Just a moment").unwrap().is_match(html)
}
