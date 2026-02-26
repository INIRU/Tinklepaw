use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::download;

const TARGET_VERSION: &str = "1.21.4";

pub struct LaunchConfig {
    pub java_path: PathBuf,
    pub max_memory_mb: u32,
    pub game_dir: PathBuf,
    pub server_host: Option<String>,
    pub server_port: Option<u16>,
    pub player_name: String,
    pub player_uuid: String,
    pub access_token: String,
}

pub async fn launch(app: &AppHandle, config: LaunchConfig) -> Result<(), String> {
    let classpath = download::get_classpath()?;
    let asset_index = download::get_asset_index_id()?;
    let assets_dir = config.game_dir.join("assets");
    let natives_dir = config.game_dir.join("natives").join(TARGET_VERSION);
    std::fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    let mut args: Vec<String> = Vec::new();

    // JVM args
    args.push(format!("-Xmx{}m", config.max_memory_mb));
    args.push(format!("-Xms{}m", config.max_memory_mb / 2));
    args.push(format!(
        "-Djava.library.path={}",
        natives_dir.to_string_lossy()
    ));
    args.push("-Dminecraft.launcher.brand=nyaru-launcher".to_string());
    args.push("-Dminecraft.launcher.version=0.1.0".to_string());

    // macOS specific
    if cfg!(target_os = "macos") {
        args.push("-XstartOnFirstThread".to_string());
    }

    args.push("-cp".to_string());
    args.push(classpath);

    // Main class
    args.push("net.minecraft.client.main.Main".to_string());

    // Game args
    args.push("--username".to_string());
    args.push(config.player_name.clone());
    args.push("--version".to_string());
    args.push(TARGET_VERSION.to_string());
    args.push("--gameDir".to_string());
    args.push(config.game_dir.to_string_lossy().to_string());
    args.push("--assetsDir".to_string());
    args.push(assets_dir.to_string_lossy().to_string());
    args.push("--assetIndex".to_string());
    args.push(asset_index);
    args.push("--uuid".to_string());
    args.push(config.player_uuid.clone());
    args.push("--accessToken".to_string());
    args.push(config.access_token.clone());
    args.push("--userType".to_string());
    args.push("msa".to_string());
    args.push("--versionType".to_string());
    args.push("release".to_string());

    // Auto-connect to server
    if let Some(ref host) = config.server_host {
        args.push("--server".to_string());
        args.push(host.clone());
    }
    if let Some(port) = config.server_port {
        args.push("--port".to_string());
        args.push(port.to_string());
    }

    let _ = app.emit("game-log", "[런처] 마인크래프트 시작 중...");
    let _ = app.emit(
        "game-log",
        format!("[런처] Java: {}", config.java_path.to_string_lossy()),
    );

    let mut child = Command::new(&config.java_path)
        .args(&args)
        .current_dir(&config.game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;

    let _ = app.emit("game-started", true);

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit("game-log", &line);
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit("game-log", format!("[WARN] {}", &line));
            }
        });
    }

    // Wait for process to exit
    let app_clone = app.clone();
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) => {
                let _ = app_clone.emit(
                    "game-log",
                    format!("[런처] 마인크래프트 종료 (코드: {:?})", status.code()),
                );
                let _ = app_clone.emit("game-exited", status.code().unwrap_or(-1));
            }
            Err(e) => {
                let _ = app_clone.emit("game-log", format!("[런처] 오류: {}", e));
                let _ = app_clone.emit("game-exited", -1);
            }
        }
    });

    Ok(())
}
