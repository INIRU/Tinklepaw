use std::path::PathBuf;
use std::process::Command;

/// Detect Java installation. Returns the path to the java binary.
pub fn detect_java() -> Option<PathBuf> {
    // Check JAVA_HOME first
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let java_bin = PathBuf::from(&java_home).join("bin").join("java");
        if java_bin.exists() {
            return Some(java_bin);
        }
    }

    // Check if java is in PATH
    if let Ok(output) = Command::new("which").arg("java").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    // macOS-specific locations
    if cfg!(target_os = "macos") {
        let macos_paths = [
            "/usr/bin/java",
            "/usr/local/bin/java",
            "/opt/homebrew/bin/java",
            "/Library/Java/JavaVirtualMachines",
        ];

        for base in &macos_paths {
            let path = PathBuf::from(base);
            if path.is_file() {
                return Some(path);
            }
            // Check JVM directories
            if path.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&path) {
                    for entry in entries.flatten() {
                        let java_bin = entry
                            .path()
                            .join("Contents")
                            .join("Home")
                            .join("bin")
                            .join("java");
                        if java_bin.exists() {
                            return Some(java_bin);
                        }
                    }
                }
            }
        }
    }

    // Windows-specific locations
    if cfg!(target_os = "windows") {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

        let win_dirs = [
            format!("{}\\Java", program_files),
            format!("{}\\Eclipse Adoptium", program_files),
            format!("{}\\Microsoft\\jdk", program_files),
            format!("{}\\Zulu", program_files),
            format!("{}\\Java", program_files_x86),
        ];

        for dir in &win_dirs {
            let path = PathBuf::from(dir);
            if path.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&path) {
                    for entry in entries.flatten() {
                        let java_bin = entry.path().join("bin").join("java.exe");
                        if java_bin.exists() {
                            return Some(java_bin);
                        }
                    }
                }
            }
        }
    }

    None
}

/// Get Java version string from a java binary path.
pub fn get_java_version(java_path: &PathBuf) -> Option<String> {
    let output = Command::new(java_path).arg("-version").output().ok()?;

    // Java prints version to stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let first_line = stderr.lines().next()?;
    Some(first_line.to_string())
}

pub async fn install_java_auto(app: &tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;

    // Determine platform and arch
    let (os_str, arch_str, ext, inner_dir_suffix) = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            ("mac", "aarch64", "tar.gz", "Contents/Home")
        } else {
            ("mac", "x64", "tar.gz", "Contents/Home")
        }
    } else if cfg!(target_os = "windows") {
        ("windows", "x64", "zip", "")
    } else {
        ("linux", "x64", "tar.gz", "")
    };

    // Adoptium API to get latest JDK 21
    let api_url = format!(
        "https://api.adoptium.net/v3/assets/latest/21/hotspot?os={}&architecture={}&image_type=jdk",
        os_str, arch_str
    );

    // Download destination
    let base = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let java_dir = base.join("bangul-launcher").join("java");
    std::fs::create_dir_all(&java_dir).map_err(|e| e.to_string())?;

    let java_bin_name = if cfg!(target_os = "windows") { "java.exe" } else { "java" };

    // Check if already installed
    if let Ok(entries) = std::fs::read_dir(&java_dir) {
        for entry in entries.flatten() {
            let candidate = if inner_dir_suffix.is_empty() {
                entry.path().join("bin").join(java_bin_name)
            } else {
                entry.path().join(inner_dir_suffix).join("bin").join(java_bin_name)
            };
            if candidate.exists() {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    // Emit progress
    let _ = app.emit("java_install_progress", serde_json::json!({"stage": "Java 21 다운로드 중...", "percent": 0.0}));

    // Fetch metadata
    let client = reqwest::Client::new();
    let meta: serde_json::Value = client.get(&api_url)
        .send().await.map_err(|e| format!("API request failed: {}", e))?
        .json().await.map_err(|e| format!("API parse failed: {}", e))?;

    let binary = meta.as_array()
        .and_then(|a| a.first())
        .and_then(|e| e.get("binary"))
        .ok_or("No binary info in response")?;

    let download_url = binary.get("package")
        .and_then(|p| p.get("link"))
        .and_then(|l| l.as_str())
        .ok_or("No download URL")?
        .to_string();

    let file_name = binary.get("package")
        .and_then(|p| p.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("jdk21.tar.gz")
        .to_string();

    let archive_path = java_dir.join(&file_name);

    // Download the archive
    let mut response = client.get(&download_url)
        .send().await.map_err(|e| format!("Download failed: {}", e))?;

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file_data = Vec::new();

    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Chunk error: {}", e))? {
        file_data.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;
        if total > 0 {
            let percent = (downloaded as f64 / total as f64) * 100.0;
            let _ = app.emit("java_install_progress", serde_json::json!({"stage": "Java 21 다운로드 중...", "percent": percent}));
        }
    }

    std::fs::write(&archive_path, &file_data).map_err(|e| format!("Write failed: {}", e))?;

    // Extract
    let _ = app.emit("java_install_progress", serde_json::json!({"stage": "Java 21 설치 중...", "percent": 95.0}));

    if ext == "tar.gz" {
        let output = std::process::Command::new("tar")
            .args(["-xzf", archive_path.to_str().unwrap(), "-C", java_dir.to_str().unwrap()])
            .output()
            .map_err(|e| format!("Extract failed: {}", e))?;
        if !output.status.success() {
            return Err(format!("tar failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }

    // Clean up archive
    let _ = std::fs::remove_file(&archive_path);

    // Find the java binary
    let entries: Vec<_> = std::fs::read_dir(&java_dir).map_err(|e| e.to_string())?.flatten().collect();
    for entry in entries {
        let candidate = if inner_dir_suffix.is_empty() {
            entry.path().join("bin").join(java_bin_name)
        } else {
            entry.path().join(inner_dir_suffix).join("bin").join(java_bin_name)
        };
        if candidate.exists() {
            // Make executable on unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o755));
            }
            let _ = app.emit("java_install_progress", serde_json::json!({"stage": "완료", "percent": 100.0}));
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err("Java binary not found after extraction".to_string())
}
