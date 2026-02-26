use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const TARGET_VERSION: &str = "1.21.11";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub file_name: String,
    pub current: u64,
    pub total: u64,
    pub percent: f64,
    pub stage: String,
}

#[derive(Deserialize)]
struct VersionManifest {
    versions: Vec<VersionEntry>,
}

#[derive(Deserialize)]
struct VersionEntry {
    id: String,
    url: String,
}

#[derive(Deserialize)]
struct VersionMeta {
    downloads: Downloads,
    libraries: Vec<Library>,
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexInfo,
}

#[derive(Deserialize)]
struct Downloads {
    client: DownloadEntry,
}

#[derive(Deserialize)]
struct DownloadEntry {
    url: String,
    sha1: String,
    size: u64,
}

#[derive(Deserialize)]
struct Library {
    downloads: Option<LibraryDownloads>,
    name: String,
    rules: Option<Vec<Rule>>,
}

#[derive(Deserialize)]
struct LibraryDownloads {
    artifact: Option<LibraryArtifact>,
}

#[derive(Deserialize)]
struct LibraryArtifact {
    path: String,
    url: String,
    sha1: String,
    size: u64,
}

#[derive(Deserialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Deserialize)]
struct OsRule {
    name: Option<String>,
}

#[derive(Deserialize)]
struct AssetIndexInfo {
    id: String,
    url: String,
    sha1: String,
    #[serde(rename = "totalSize")]
    total_size: u64,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

pub fn get_game_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("nyaru-launcher").join("minecraft")
}

pub async fn install(app: &AppHandle) -> Result<(), String> {
    let game_dir = get_game_dir();
    std::fs::create_dir_all(&game_dir).map_err(|e| format!("Create game dir failed: {}", e))?;

    let client = reqwest::Client::new();

    // Step 1: Fetch version manifest
    emit_progress(app, "버전 정보 확인 중...", "manifest", 0, 1, 0.0);
    let manifest: VersionManifest = client
        .get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Manifest fetch failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Manifest parse failed: {}", e))?;

    let version_entry = manifest
        .versions
        .iter()
        .find(|v| v.id == TARGET_VERSION)
        .ok_or(format!("Version {} not found", TARGET_VERSION))?;

    // Step 2: Fetch version metadata
    emit_progress(app, "버전 메타데이터 다운로드 중...", "metadata", 0, 1, 5.0);
    let version_meta: VersionMeta = client
        .get(&version_entry.url)
        .send()
        .await
        .map_err(|e| format!("Version meta fetch failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Version meta parse failed: {}", e))?;

    // Save version meta JSON
    let meta_path = game_dir.join("versions").join(TARGET_VERSION);
    std::fs::create_dir_all(&meta_path)
        .map_err(|e| format!("Create version dir failed: {}", e))?;

    let meta_json = client
        .get(&version_entry.url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    std::fs::write(
        meta_path.join(format!("{}.json", TARGET_VERSION)),
        &meta_json,
    )
    .map_err(|e| e.to_string())?;

    // Step 3: Download client JAR
    let client_jar_path = meta_path.join(format!("{}.jar", TARGET_VERSION));
    if !file_valid(&client_jar_path, &version_meta.downloads.client.sha1) {
        emit_progress(
            app,
            "클라이언트 JAR 다운로드 중...",
            "client",
            0,
            version_meta.downloads.client.size,
            10.0,
        );
        download_file(&client, &version_meta.downloads.client.url, &client_jar_path).await?;
    }

    // Step 4: Download libraries
    let libs = filter_libraries(&version_meta.libraries);
    let lib_dir = game_dir.join("libraries");
    let total_libs = libs.len() as u64;

    for (i, lib) in libs.iter().enumerate() {
        if let Some(ref downloads) = lib.downloads {
            if let Some(ref artifact) = downloads.artifact {
                let lib_path = lib_dir.join(&artifact.path);
                if !file_valid(&lib_path, &artifact.sha1) {
                    let progress = 15.0 + (55.0 * i as f64 / total_libs as f64);
                    emit_progress(
                        app,
                        &format!("라이브러리: {}", short_name(&lib.name)),
                        "libraries",
                        i as u64,
                        total_libs,
                        progress,
                    );
                    download_file(&client, &artifact.url, &lib_path).await?;
                }
            }
        }
    }

    // Step 5: Download asset index
    let assets_dir = game_dir.join("assets");
    let indexes_dir = assets_dir.join("indexes");
    std::fs::create_dir_all(&indexes_dir).map_err(|e| e.to_string())?;

    let index_path = indexes_dir.join(format!("{}.json", version_meta.asset_index.id));
    if !file_valid(&index_path, &version_meta.asset_index.sha1) {
        emit_progress(app, "에셋 인덱스 다운로드 중...", "asset_index", 0, 1, 70.0);
        download_file(&client, &version_meta.asset_index.url, &index_path).await?;
    }

    // Step 6: Download assets
    let index_json =
        std::fs::read_to_string(&index_path).map_err(|e| format!("Read asset index: {}", e))?;
    let asset_index: AssetIndex =
        serde_json::from_str(&index_json).map_err(|e| format!("Parse asset index: {}", e))?;

    let objects_dir = assets_dir.join("objects");
    let total_assets = asset_index.objects.len() as u64;

    for (i, (_name, obj)) in asset_index.objects.iter().enumerate() {
        let prefix = &obj.hash[..2];
        let obj_path = objects_dir.join(prefix).join(&obj.hash);
        if !file_valid(&obj_path, &obj.hash) {
            let progress = 72.0 + (26.0 * i as f64 / total_assets as f64);
            if i % 50 == 0 {
                emit_progress(
                    app,
                    &format!("에셋 다운로드 중... ({}/{})", i, total_assets),
                    "assets",
                    i as u64,
                    total_assets,
                    progress,
                );
            }
            let url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, obj.hash
            );
            download_file(&client, &url, &obj_path).await?;
        }
    }

    emit_progress(app, "설치 완료!", "complete", 1, 1, 100.0);
    Ok(())
}

pub fn is_installed() -> bool {
    let game_dir = get_game_dir();
    let jar = game_dir
        .join("versions")
        .join(TARGET_VERSION)
        .join(format!("{}.jar", TARGET_VERSION));
    jar.exists()
}

pub fn get_version_meta_path() -> PathBuf {
    get_game_dir()
        .join("versions")
        .join(TARGET_VERSION)
        .join(format!("{}.json", TARGET_VERSION))
}

pub fn get_classpath() -> Result<String, String> {
    let game_dir = get_game_dir();
    let meta_path = get_version_meta_path();
    let meta_json =
        std::fs::read_to_string(&meta_path).map_err(|e| format!("Read version meta: {}", e))?;
    let meta: VersionMeta =
        serde_json::from_str(&meta_json).map_err(|e| format!("Parse version meta: {}", e))?;

    let lib_dir = game_dir.join("libraries");
    let sep = if cfg!(windows) { ";" } else { ":" };

    let mut paths: Vec<String> = Vec::new();

    for lib in filter_libraries(&meta.libraries) {
        if let Some(ref downloads) = lib.downloads {
            if let Some(ref artifact) = downloads.artifact {
                let path = lib_dir.join(&artifact.path);
                paths.push(path.to_string_lossy().to_string());
            }
        }
    }

    // Add client JAR
    let client_jar = game_dir
        .join("versions")
        .join(TARGET_VERSION)
        .join(format!("{}.jar", TARGET_VERSION));
    paths.push(client_jar.to_string_lossy().to_string());

    Ok(paths.join(sep))
}

pub fn get_asset_index_id() -> Result<String, String> {
    let meta_path = get_version_meta_path();
    let meta_json =
        std::fs::read_to_string(&meta_path).map_err(|e| format!("Read version meta: {}", e))?;
    let meta: VersionMeta =
        serde_json::from_str(&meta_json).map_err(|e| format!("Parse version meta: {}", e))?;
    Ok(meta.asset_index.id)
}

fn filter_libraries(libraries: &[Library]) -> Vec<&Library> {
    libraries
        .iter()
        .filter(|lib| {
            if let Some(ref rules) = lib.rules {
                let current_os = if cfg!(target_os = "macos") {
                    "osx"
                } else if cfg!(target_os = "windows") {
                    "windows"
                } else {
                    "linux"
                };

                let mut allowed = false;
                for rule in rules {
                    match rule.action.as_str() {
                        "allow" => {
                            if let Some(ref os) = rule.os {
                                if let Some(ref name) = os.name {
                                    if name == current_os {
                                        allowed = true;
                                    }
                                }
                            } else {
                                allowed = true;
                            }
                        }
                        "disallow" => {
                            if let Some(ref os) = rule.os {
                                if let Some(ref name) = os.name {
                                    if name == current_os {
                                        allowed = false;
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                allowed
            } else {
                true
            }
        })
        .collect()
}

fn file_valid(path: &Path, expected_sha1: &str) -> bool {
    if !path.exists() {
        return false;
    }
    if let Ok(data) = std::fs::read(path) {
        use sha1::Digest;
        let mut hasher = sha1::Sha1::new();
        hasher.update(&data);
        let result = hasher.finalize();
        let digest = hex::encode(result);
        digest == expected_sha1
    } else {
        false
    }
}

async fn download_file(client: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {} - {}", url, e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Read bytes failed: {}", e))?;

    std::fs::write(path, &bytes).map_err(|e| format!("Write file failed: {}", e))?;

    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    file_name: &str,
    stage: &str,
    current: u64,
    total: u64,
    percent: f64,
) {
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            file_name: file_name.to_string(),
            current,
            total,
            percent,
            stage: stage.to_string(),
        },
    );
}

fn short_name(name: &str) -> &str {
    name.split(':').nth(1).unwrap_or(name)
}
