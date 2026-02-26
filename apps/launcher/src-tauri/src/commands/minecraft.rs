use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::minecraft::{download, java, launch};
use crate::AppState;
use serde::Serialize;

#[derive(Serialize)]
pub struct JavaInfo {
    pub path: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct InstallStatus {
    pub installed: bool,
    pub game_dir: String,
}

#[tauri::command]
pub async fn detect_java(custom_path: Option<String>) -> Result<Option<JavaInfo>, String> {
    let java_path = if let Some(ref custom) = custom_path {
        let p = PathBuf::from(custom);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    } else {
        java::detect_java()
    };

    match java_path {
        Some(path) => {
            let version =
                java::get_java_version(&path).unwrap_or_else(|| "알 수 없음".to_string());
            Ok(Some(JavaInfo {
                path: path.to_string_lossy().to_string(),
                version,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn check_installation() -> Result<InstallStatus, String> {
    Ok(InstallStatus {
        installed: download::is_installed(),
        game_dir: download::get_game_dir().to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn install_minecraft(app: AppHandle) -> Result<(), String> {
    download::install(&app).await
}

#[tauri::command]
pub async fn launch_minecraft(
    app: AppHandle,
    state: State<'_, AppState>,
    java_path: String,
    max_memory_mb: u32,
    player_name: String,
    player_uuid: String,
    access_token: String,
    server_host: String,
    server_port: u16,
    game_dir: Option<String>,
) -> Result<(), String> {
    // Check if already running
    {
        let running = state
            .minecraft_running
            .lock()
            .map_err(|e| e.to_string())?;
        if *running {
            return Err("마인크래프트가 이미 실행 중입니다.".to_string());
        }
    }

    // Mark as running
    {
        let mut running = state
            .minecraft_running
            .lock()
            .map_err(|e| e.to_string())?;
        *running = true;
    }

    let game_directory = game_dir
        .map(PathBuf::from)
        .unwrap_or_else(download::get_game_dir);

    let config = launch::LaunchConfig {
        java_path: PathBuf::from(java_path),
        max_memory_mb,
        game_dir: game_directory,
        server_host: Some(server_host),
        server_port: Some(server_port),
        player_name,
        player_uuid,
        access_token,
    };

    launch::launch(&app, config).await?;

    Ok(())
}

#[tauri::command]
pub async fn install_java(app: AppHandle) -> Result<String, String> {
    crate::minecraft::java::install_java_auto(&app).await
}
