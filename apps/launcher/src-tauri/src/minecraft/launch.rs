use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::download;

const TARGET_VERSION: &str = "1.21.11";

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
    args.push("-Dminecraft.launcher.version=0.1.1".to_string());

    // macOS specific
    if cfg!(target_os = "macos") {
        args.push("-XstartOnFirstThread".to_string());
    }

    // Fabric support: check for fabric-version.txt and build combined classpath + main class
    let fabric_version_path = config.game_dir.join("fabric-version.txt");
    let (final_classpath, main_class) = if fabric_version_path.exists() {
        match std::fs::read_to_string(&fabric_version_path) {
            Ok(fabric_id) => {
                let fabric_id = fabric_id.trim().to_string();
                let profile_path = config.game_dir
                    .join("versions")
                    .join(&fabric_id)
                    .join(format!("{}.json", fabric_id));
                match std::fs::read_to_string(&profile_path) {
                    Ok(profile_json) => {
                        match serde_json::from_str::<serde_json::Value>(&profile_json) {
                            Ok(profile) => {
                                let mc = profile["mainClass"]
                                    .as_str()
                                    .unwrap_or("net.minecraft.client.main.Main")
                                    .to_string();
                                let sep = if cfg!(windows) { ";" } else { ":" };
                                let lib_dir = config.game_dir.join("libraries");
                                let mut fabric_paths: Vec<String> = Vec::new();
                                if let Some(libs) = profile["libraries"].as_array() {
                                    for lib in libs {
                                        if let Some(name) = lib["name"].as_str() {
                                            let rel = download::maven_name_to_path(name);
                                            fabric_paths.push(
                                                lib_dir.join(&rel).to_string_lossy().to_string()
                                            );
                                        }
                                    }
                                }
                                let combined = if fabric_paths.is_empty() {
                                    classpath
                                } else {
                                    format!("{}{}{}", fabric_paths.join(sep), sep, classpath)
                                };
                                (combined, mc)
                            }
                            Err(_) => (classpath, "net.minecraft.client.main.Main".to_string()),
                        }
                    }
                    Err(_) => (classpath, "net.minecraft.client.main.Main".to_string()),
                }
            }
            Err(_) => (classpath, "net.minecraft.client.main.Main".to_string()),
        }
    } else {
        (classpath, "net.minecraft.client.main.Main".to_string())
    };

    args.push("-cp".to_string());
    args.push(final_classpath);

    // Main class
    args.push(main_class);

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

    // Write servers.dat so server appears in multiplayer list
    if let Some(ref host) = config.server_host {
        let port = config.server_port.unwrap_or(25565);
        let _ = write_servers_dat(&config.game_dir, "방울냥 서버", &format!("{}:{}", host, port));
        // quickPlayMultiplayer (MC 1.20+)
        args.push("--quickPlayMultiplayer".to_string());
        args.push(format!("{}:{}", host, port));
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
        // Reset running flag so user can relaunch
        if let Ok(mut running) = app_clone.state::<crate::AppState>().minecraft_running.lock() {
            *running = false;
        }
    });

    Ok(())
}

fn write_servers_dat(game_dir: &PathBuf, server_name: &str, server_addr: &str) -> Result<(), String> {
    let servers_dat = game_dir.join("servers.dat");
    let mut nbt: Vec<u8> = Vec::new();

    // Root TAG_Compound (id=10), empty name
    nbt.push(10u8);
    nbt.extend_from_slice(&0u16.to_be_bytes());

    // TAG_List (id=9), name="servers", element type=TAG_Compound(10), count=1
    nbt.push(9u8);
    let key = b"servers";
    nbt.extend_from_slice(&(key.len() as u16).to_be_bytes());
    nbt.extend_from_slice(key);
    nbt.push(10u8); // element type: compound
    nbt.extend_from_slice(&1i32.to_be_bytes()); // count

    // Server entry: TAG_String "name"
    nbt.push(8u8);
    let k = b"name";
    nbt.extend_from_slice(&(k.len() as u16).to_be_bytes());
    nbt.extend_from_slice(k);
    let v = server_name.as_bytes();
    nbt.extend_from_slice(&(v.len() as u16).to_be_bytes());
    nbt.extend_from_slice(v);

    // TAG_String "ip"
    nbt.push(8u8);
    let k = b"ip";
    nbt.extend_from_slice(&(k.len() as u16).to_be_bytes());
    nbt.extend_from_slice(k);
    let v = server_addr.as_bytes();
    nbt.extend_from_slice(&(v.len() as u16).to_be_bytes());
    nbt.extend_from_slice(v);

    // TAG_Byte "acceptTextures" = 1
    nbt.push(1u8);
    let k = b"acceptTextures";
    nbt.extend_from_slice(&(k.len() as u16).to_be_bytes());
    nbt.extend_from_slice(k);
    nbt.push(1u8);

    nbt.push(0u8); // End of server compound
    nbt.push(0u8); // End of root compound

    std::fs::write(&servers_dat, &nbt).map_err(|e| format!("servers.dat write failed: {}", e))
}
