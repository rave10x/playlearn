use crate::util::*;
use crate::Core;
use rust_embed::RustEmbed;
use serde_json::Value;
use std::io::Read;
use std::sync::Arc;
use tiny_http::{Header, Method, Request, Response, StatusCode};

#[derive(RustEmbed)]
#[folder = "../renderer/"]
struct Assets;

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8", "js" => "text/javascript; charset=utf-8", "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml", "png" => "image/png", "mp4" => "video/mp4", "webm" => "video/webm",
        "mkv" => "video/x-matroska", "vtt" => "text/vtt; charset=utf-8", _ => "application/octet-stream",
    }
}
fn hdr(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }
fn header<'a>(r: &'a Request, name: &str) -> Option<&'a str> {
    r.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str())
}
fn text(code: u16, s: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(s.to_string()).with_status_code(StatusCode(code)).with_header(hdr("Content-Type", "text/plain; charset=utf-8"))
}

pub fn serve(core: Arc<Core>) -> std::io::Result<u16> {
    let srv = tiny_http::Server::http("127.0.0.1:0").map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let port = srv.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    *core.port.lock().unwrap() = port;
    let srv = Arc::new(srv);
    std::thread::spawn(move || {
        for req in srv.incoming_requests() {
            let core = core.clone();
            std::thread::spawn(move || handle(core, req, port));
        }
    });
    Ok(port)
}

fn handle(core: Arc<Core>, mut req: Request, port: u16) {
    // Reject DNS-rebinding style requests: Host must be our loopback address.
    let host_ok = header(&req, "host").map_or(false, |h| h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"));
    if !host_ok { let _ = req.respond(text(403, "forbidden")); return; }
    let full = req.url().to_string();
    let (path, query) = full.split_once('?').unwrap_or((&full, ""));
    let path = percent_encoding::percent_decode_str(path).decode_utf8_lossy().to_string();
    let qget = |k: &str| query.split('&').find_map(|p| p.strip_prefix(&format!("{k}=")).map(|v| percent_encoding::percent_decode_str(v).decode_utf8_lossy().to_string()));
    let method = req.method().clone();

    if method == Method::Post && path.starts_with("/api/") {
        if header(&req, "x-pl-token") != Some(core.token.as_str()) { let _ = req.respond(text(403, "bad token")); return; }
        let cmd = path.trim_start_matches("/api/").to_string();
        let mut body = String::new();
        let _ = req.as_reader().take(64 * 1024 * 1024).read_to_string(&mut body);
        let args: Vec<Value> = serde_json::from_str(&body).unwrap_or_default();
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| core.call(&cmd, &args))).unwrap_or_else(|_| Err("internal error".into()));
        let _ = match res {
            Ok(v) => req.respond(Response::from_string(v.to_string()).with_header(hdr("Content-Type", "application/json"))),
            Err(e) => req.respond(text(500, &e)),
        };
        return;
    }
    if method == Method::Get && path == "/api/poll" {
        if qget("t").as_deref() != Some(core.token.as_str()) { let _ = req.respond(text(403, "bad token")); return; }
        let since = qget("since").and_then(|v| v.parse::<u64>().ok());
        core.log(&format!("poll since={since:?}"));
        let v = core.poll(since, std::time::Duration::from_secs(20));
        core.log(&format!("poll -> {} events", v["events"].as_array().map_or(0, |a| a.len())));
        let _ = req.respond(Response::from_string(v.to_string()).with_header(hdr("Content-Type", "application/json")).with_header(hdr("Cache-Control", "no-store")));
        return;
    }
    if method == Method::Post && path.starts_with("/__article/") {
        let job = path.trim_start_matches("/__article/").to_string();
        let mut body = String::new();
        let _ = req.as_reader().take(16 * 1024 * 1024).read_to_string(&mut body);
        if core.jobs.lock().unwrap().contains(&job) {
            let (u, html) = body.split_once('\n').unwrap_or(("", ""));
            core.articles.lock().unwrap().insert(job, (u.to_string(), html.to_string()));
        }
        let _ = req.respond(text(204, ""));
        return;
    }
    if method != Method::Get { let _ = req.respond(text(405, "")); return; }

    if let Some(rest) = path.strip_prefix("/media/") {
        let mut it = rest.splitn(2, '/');
        let (cid, name) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
        let valid = regex::Regex::new(r"^[\w.-]+\.(?:mp4|mkv|webm|vtt)$").unwrap().is_match(name) && ok_id(cid);
        let file = core.store.dl_dir(cid).join(name);
        if !valid || !file.is_file() { let _ = req.respond(text(404, "")); return; }
        serve_file(req, &file);
        return;
    }
    let rel = if path == "/" { "index.html".to_string() } else { path.trim_start_matches('/').to_string() };
    if rel == "index.html" {
        if let Some(f) = Assets::get("index.html") {
            let html = String::from_utf8_lossy(&f.data).replace("<head>",
                &format!("<head><script>window.__PL_TOKEN__=\"{}\"</script><script src=\"pl-shim.js\"></script>", core.token));
            let _ = req.respond(Response::from_string(html).with_header(hdr("Content-Type", "text/html; charset=utf-8")).with_header(hdr("Cache-Control", "no-store")));
            return;
        }
    }
    match Assets::get(&rel) {
        Some(f) => { let _ = req.respond(Response::from_data(f.data.into_owned()).with_header(hdr("Content-Type", mime(&rel)))); }
        None => { let _ = req.respond(text(404, "")); }
    }
}

fn serve_file(req: Request, file: &std::path::Path) {
    use std::io::{Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(file) else { let _ = req.respond(text(404, "")); return };
    let size = f.metadata().map(|m| m.len()).unwrap_or(0);
    let ty = mime(&file.to_string_lossy());
    let range = header(&req, "range").and_then(|h| regex::Regex::new(r"bytes=(\d*)-(\d*)").unwrap().captures(h).map(|c| (c[1].to_string(), c[2].to_string())));
    if let Some((a, b)) = range {
        let s: u64 = a.parse().unwrap_or(0);
        let e: u64 = b.parse().unwrap_or(size.saturating_sub(1)).min(size.saturating_sub(1));
        if s > e || s >= size {
            let _ = req.respond(Response::empty(StatusCode(416)).with_header(hdr("Content-Range", &format!("bytes */{size}")))); return;
        }
        let _ = f.seek(SeekFrom::Start(s));
        let r = Response::new(StatusCode(206), vec![hdr("Content-Type", ty), hdr("Accept-Ranges", "bytes"), hdr("Content-Range", &format!("bytes {s}-{e}/{size}"))],
            f.take(e - s + 1), Some((e - s + 1) as usize), None);
        let _ = req.respond(r);
    } else {
        let r = Response::new(StatusCode(200), vec![hdr("Content-Type", ty), hdr("Accept-Ranges", "bytes")], f, Some(size as usize), None);
        let _ = req.respond(r);
    }
}
