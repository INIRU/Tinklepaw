mod commands;
mod minecraft;

use std::sync::Mutex;

pub struct AppState {
    pub minecraft_running: Mutex<bool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            minecraft_running: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::microsoft_auth_start,
            commands::auth::exchange_auth_code,
            commands::auth::get_minecraft_profile,
            commands::auth::refresh_token,
            commands::server::ping_server,
            commands::minecraft::check_installation,
            commands::minecraft::install_minecraft,
            commands::minecraft::launch_minecraft,
            commands::minecraft::detect_java,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
