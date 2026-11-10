use crate::util::*;
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

pub struct Store {
    pub dir: PathBuf, // app data dir
}

pub const BACKUP_FORMAT: &str = "playlearn-backup";
pub const PREF_KEYS: [&str; 6] = ["theme", "vol", "rate", "cc", "audio", "timerPreset"];

impl Store {
    pub fn courses_dir(&self) -> PathBuf { self.dir.join("courses") }
    pub fn dl_dir(&self, cid: &str) -> PathBuf { self.dir.join("downloads").join(clean_id(cid)) }
    pub fn bin_dir(&self) -> PathBuf { self.dir.join("bin") }
    fn file(&self, id: &str) -> PathBuf { self.courses_dir().join(format!("{}.json", clean_id(id))) }

    pub fn read(&self, id: &str) -> R<Value> {
        let t = fs::read_to_string(self.file(id)).map_err(|_| "Course not found".to_string())?;
        serde_json::from_str(&t).map_err(|e| e.to_string())
    }
    pub fn write(&self, c: &Value) -> R<()> {
        let id = str_of(&c["id"]);
        if !ok_id(id) { return Err("Bad course id".into()); }
        fs::create_dir_all(self.courses_dir()).map_err(|e| e.to_string())?;
        let f = self.file(id);
        let tmp = f.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &f).map_err(|e| e.to_string())
    }
    pub fn remove(&self, id: &str) { let _ = fs::remove_file(self.file(id)); }
    pub fn list(&self) -> Vec<Value> {
        let _ = fs::create_dir_all(self.courses_dir());
        let mut v: Vec<Value> = fs::read_dir(self.courses_dir()).into_iter().flatten().flatten()
            .filter(|e| e.path().extension().map_or(false, |x| x == "json"))
            .filter_map(|e| serde_json::from_str(&fs::read_to_string(e.path()).ok()?).ok())
            .collect();
        let key = |c: &Value| c["lastOpened"].as_i64().filter(|n| *n != 0).or_else(|| c["createdAt"].as_i64()).unwrap_or(0);
        v.sort_by(|a, b| key(b).cmp(&key(a)));
        v
    }
}

pub fn valid_course(c: &Value) -> bool {
    let id = str_of(&c["id"]);
    ok_id(id) && c["lessons"].as_array().map_or(false, |l| {
        !l.is_empty() && l.iter().all(|x| x.is_object() && x["id"].is_string())
    })
}

fn truthy(v: &Value) -> bool {
    match v { Value::Null => false, Value::Bool(b) => *b, Value::Number(n) => n.as_f64().map_or(false, |f| f != 0.0), Value::String(s) => !s.is_empty(), _ => true }
}

fn merge_lesson(n: &Value, o: Option<&Value>) -> Value {
    let Some(o) = o else { return n.clone() };
    let mut seen = HashSet::new();
    let mut marks: Vec<Value> = vec![];
    for m in n["marks"].as_array().into_iter().flatten().chain(o["marks"].as_array().into_iter().flatten()) {
        let k = format!("{}|{}", m["t"], m["text"]);
        if seen.insert(k) { marks.push(m.clone()); }
    }
    marks.sort_by(|a, b| a["t"].as_f64().unwrap_or(0.0).partial_cmp(&b["t"].as_f64().unwrap_or(0.0)).unwrap_or(std::cmp::Ordering::Equal));
    let mut r: Map<String, Value> = n.as_object().cloned().unwrap_or_default();
    r.insert("done".into(), json!(truthy(&n["done"]) || truthy(&o["done"])));
    let nn = str_of(&n["notes"]);
    r.insert("notes".into(), if !nn.trim().is_empty() { json!(nn) } else { json!(str_of(&o["notes"])) });
    if !marks.is_empty() { r.insert("marks".into(), Value::Array(marks)); }
    if n.get("chapters").map_or(true, |c| !truthy(c)) && truthy(&o["chapters"]) { r.insert("chapters".into(), o["chapters"].clone()); }
    Value::Object(r)
}

/// Same course on both sides: the most recently opened copy decides order/position; progress and notes from both are kept.
pub fn merge_course(a: &Value, b: &Value) -> Value {
    let lo = |c: &Value| c["lastOpened"].as_i64().unwrap_or(0);
    let (newer, other) = if lo(b) > lo(a) { (b, a) } else { (a, b) };
    let empty = vec![];
    let nl = newer["lessons"].as_array().unwrap_or(&empty);
    let ol = other["lessons"].as_array().unwrap_or(&empty);
    let n_ids: HashSet<&str> = nl.iter().map(|l| str_of(&l["id"])).collect();
    let mut lessons: Vec<Value> = nl.iter()
        .map(|l| merge_lesson(l, ol.iter().find(|x| x["id"] == l["id"])))
        .collect();
    lessons.extend(ol.iter().filter(|l| !n_ids.contains(str_of(&l["id"]))).cloned());
    let mut c: Map<String, Value> = newer.as_object().cloned().unwrap_or_default();
    let created = [a, b].iter().filter_map(|x| x["createdAt"].as_i64()).min().unwrap_or_else(now_ms);
    c.insert("createdAt".into(), json!(created));
    c.insert("lastOpened".into(), json!(lo(a).max(lo(b))));
    let last = str_of(&c.get("lastLesson").cloned().unwrap_or(Value::Null)).to_string();
    if !lessons.iter().any(|l| str_of(&l["id"]) == last) { c.insert("lastLesson".into(), lessons[0]["id"].clone()); }
    c.insert("lessons".into(), Value::Array(lessons));
    Value::Object(c)
}
