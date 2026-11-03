#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::TcpStream;
use std::thread;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;

            let database_path = data_dir.join("invoice.db");
            let database_path = database_path.to_string_lossy().into_owned();
            let templates_dir = app.path().resource_dir()?.join("templates");
            let sidecar = app
                .shell()
                .sidecar("inkvoice-backend")?
                .env("HOST", "127.0.0.1")
                .env("PORT", "3789")
                .env("DATABASE_PATH", database_path)
                .env("ALLOWED_ORIGINS", "http://tauri.localhost,http://localhost")
                .env("INKVOICE_TEMPLATES_DIR", templates_dir.to_string_lossy());
            let (_receiver, _child) = sidecar.spawn()?;

            let window = app.get_webview_window("main").expect("main window");
            for _ in 0..50 {
                if TcpStream::connect(("127.0.0.1", 3789)).is_ok() {
                    break;
                }
                thread::sleep(Duration::from_millis(200));
            }
            window.set_title("Inkvoice")?;
            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Inkvoice desktop application");
}
