//! Headless backend for development/testing: `cargo run -p playlearn-core --bin playlearn-server [datadir]`
fn main() {
    let dir = std::env::args().nth(1).map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("playlearn-dev"));
    let core = playlearn_core::Core::new(dir);
    let port = core.serve().expect("bind");
    println!("http://127.0.0.1:{port}/  token={}", core.token);
    loop { std::thread::sleep(std::time::Duration::from_secs(3600)); }
}
