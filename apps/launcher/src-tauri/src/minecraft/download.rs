use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const TARGET_VERSION: &str = "1.21.11";
const FABRIC_META_URL: &str = "https://meta.fabricmc.net";
const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const FABRIC_API_PROJECT: &str = "P7dR8mSH";



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

#[derive(Deserialize)]
struct FabricLoaderEntry {
    version: String,
    stable: bool,
}

#[derive(Deserialize)]
struct FabricProfileLib {
    name: String,
    url: String,
}

#[derive(Deserialize)]
struct ModrinthVersionFile {
    url: String,
    primary: bool,
    filename: String,
}

#[derive(Deserialize)]
struct ModrinthVersion {
    files: Vec<ModrinthVersionFile>,
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

    // Step 7: Install Fabric Loader
    if let Err(e) = install_fabric(app, &client, &game_dir).await {
        emit_progress(app, &format!("Fabric 경고: {}", e), "fabric", 0, 1, 0.0);
    } else {
        // Step 8: Install mods
        if let Err(e) = install_mods(app, &client, &game_dir).await {
            emit_progress(app, &format!("모드 경고: {}", e), "mods", 0, 3, 0.0);
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

pub fn maven_name_to_path(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version)
    } else {
        format!("{}.jar", name)
    }
}

async fn get_fabric_loader_version(client: &reqwest::Client) -> Result<String, String> {
    let versions: Vec<FabricLoaderEntry> = client
        .get(format!("{}/v2/versions/loader", FABRIC_META_URL))
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    versions.into_iter()
        .find(|v| v.stable)
        .map(|v| v.version)
        .ok_or("No stable Fabric Loader found".to_string())
}

async fn install_fabric(app: &AppHandle, client: &reqwest::Client, game_dir: &std::path::Path) -> Result<(), String> {
    emit_progress(app, "Fabric Loader 버전 확인 중...", "fabric", 0, 1, 0.0);
    let loader_version = get_fabric_loader_version(client).await?;

    let fabric_id = format!("fabric-loader-{}-{}", loader_version, TARGET_VERSION);
    let fabric_dir = game_dir.join("versions").join(&fabric_id);
    let profile_path = fabric_dir.join(format!("{}.json", fabric_id));

    if profile_path.exists() {
        let _ = std::fs::write(game_dir.join("fabric-version.txt"), &fabric_id);
        return Ok(());
    }

    let profile_url = format!(
        "{}/v2/versions/loader/{}/{}/profile/json",
        FABRIC_META_URL, TARGET_VERSION, loader_version
    );

    emit_progress(app, "Fabric Loader 다운로드 중...", "fabric", 0, 1, 30.0);
    let profile_bytes = client
        .get(&profile_url)
        .send().await.map_err(|e| format!("Fabric profile fetch: {}", e))?
        .bytes().await.map_err(|e| e.to_string())?;

    let profile_val: serde_json::Value = serde_json::from_slice(&profile_bytes)
        .map_err(|e| format!("Fabric profile parse: {}", e))?;

    std::fs::create_dir_all(&fabric_dir).map_err(|e| e.to_string())?;
    std::fs::write(&profile_path, &profile_bytes).map_err(|e| e.to_string())?;

    let lib_dir = game_dir.join("libraries");
    if let Some(libs) = profile_val["libraries"].as_array() {
        let total = libs.len() as u64;
        for (i, lib) in libs.iter().enumerate() {
            if let (Some(name), Some(url)) = (lib["name"].as_str(), lib["url"].as_str()) {
                let rel_path = maven_name_to_path(name);
                let lib_path = lib_dir.join(&rel_path);
                if !lib_path.exists() {
                    let download_url = format!("{}{}", url, rel_path);
                    emit_progress(app, &format!("Fabric: {}", short_name(name)), "fabric_libs",
                        i as u64, total, 40.0 + (50.0 * i as f64 / total as f64));
                    let _ = download_file(client, &download_url, &lib_path).await;
                }
            }
        }
    }

    std::fs::write(game_dir.join("fabric-version.txt"), &fabric_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn get_modrinth_download_url(client: &reqwest::Client, project_id: &str, mc_version: &str) -> Result<String, String> {
    let versions: Vec<ModrinthVersion> = client
        .get(format!("{}/project/{}/version", MODRINTH_API, project_id))
        .query(&[("loaders", "[\"fabric\"]"), ("game_versions", &format!("[\"{}\"]", mc_version))])
        .header("User-Agent", "nyaru-launcher/0.1.1 (github.com/INIRU/Tinklepaw)")
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let version = versions.into_iter().next()
        .ok_or_else(|| format!("No Fabric mod found for MC {}", mc_version))?;
    let file = version.files.iter().find(|f| f.primary).or_else(|| version.files.first())
        .ok_or("No files in mod version")?;
    Ok(file.url.clone())
}

fn remove_old_mod(mods_dir: &std::path::Path, prefix: &str) {
    if let Ok(entries) = std::fs::read_dir(mods_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(prefix) && name.ends_with(".jar") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

async fn install_mods(app: &AppHandle, client: &reqwest::Client, game_dir: &std::path::Path) -> Result<(), String> {
    let mods_dir = game_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    // Fabric API
    emit_progress(app, "Fabric API 설치 중...", "mods", 1, 3, 10.0);
    match get_modrinth_download_url(client, FABRIC_API_PROJECT, TARGET_VERSION).await {
        Ok(url) => {
            let filename = url.split('/').last().unwrap_or("fabric-api.jar").to_string();
            let mod_path = mods_dir.join(&filename);
            if !mod_path.exists() {
                remove_old_mod(&mods_dir, "fabric-api");
                let _ = download_file(client, &url, &mod_path).await;
            }
        }
        Err(e) => emit_progress(app, &format!("Fabric API 건너뜀: {}", e), "mods", 1, 3, 10.0),
    }

    Ok(())
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
