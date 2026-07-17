use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemMemoryInfo {
    /// Total physical RAM in megabytes.
    pub total_memory_mb: u64,
}

#[command]
pub fn get_system_memory_info() -> Result<SystemMemoryInfo, String> {
    let mut system = System::new();
    system.refresh_memory();
    let total_bytes = system.total_memory();
    // sysinfo returns bytes on all platforms.
    let total_memory_mb = total_bytes / 1024 / 1024;
    Ok(SystemMemoryInfo { total_memory_mb })
}
