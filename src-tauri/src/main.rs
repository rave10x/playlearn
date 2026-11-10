#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use playlearn_core::{Core, EMBED_SCRIPT};
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn url_arg(argv: &[String]) -> Option<String> {
    argv.iter().skip(1).find(|a| a.starts_with("http://") || a.starts_with("https://") || a.starts_with("ytcourse:")).cloned()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let (Some(u), Some(core)) = (url_arg(&argv), app.try_state::<Arc<Core>>()) {
                core.incoming_url(&u);
            }
        }))
        .setup(|app| {
            let core = Core::new(Core::default_data_dir());
            core.serve()?;
            let handle = app.handle().clone();
            let port = core.port();

            // Hidden browser used to read pages that block plain downloads (Cloudflare bot checks, JS-only pages).
            core.set_render_hook(Arc::new(move |url, job, open| {
                let label = format!("article-{job}");
                if !open {
                    if let Some(w) = handle.get_webview_window(&label) { let _ = w.destroy(); }
                    return;
                }
                let script = format!(
                    "setInterval(function(){{try{{if(document.readyState!=='complete')return;\
                     fetch('http://127.0.0.1:{port}/__article/{job}',{{method:'POST',mode:'no-cors',body:location.href+'\\n'+document.documentElement.outerHTML}});}}catch(e){{}}}},1200);"
                );
                let Ok(parsed) = url.parse() else { return };
                let _ = WebviewWindowBuilder::new(&handle, label, WebviewUrl::External(parsed))
                    .visible(false)
                    .title("Playlearn reader")
                    .inner_size(1280.0, 900.0)
                    .user_agent(Core::user_agent())
                    .initialization_script(script)
                    .build();
            }));

            let start = url_arg(&std::env::args().collect::<Vec<_>>());
            let main_url = core.url();
            app.manage(core.clone());

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(main_url.parse()?))
                .title("Playlearn")
                .inner_size(1400.0, 880.0)
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(0x1c, 0x1d, 0x1f, 0xff))
                // runs in every frame; acts only inside the YouTube embed (ad skipper, captions/audio ops)
                .initialization_script_for_all_frames(EMBED_SCRIPT)
                .build()?;

            if let Some(u) = start {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    core.incoming_url(&u);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Playlearn");
}
