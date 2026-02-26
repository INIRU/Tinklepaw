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
