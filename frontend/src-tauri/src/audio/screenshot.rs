use std::process::Command;
use std::path::PathBuf;
use log::{info, error};

/// Captures a screenshot of the primary screen and saves it to the specified path.
pub fn capture_screenshot(save_path: &PathBuf) -> Result<PathBuf, String> {
    let path_str = save_path.to_string_lossy().replace("'", "''");
    
    // PowerShell script utilizing .NET Drawing library to capture primary screen
    let ps_script = format!(
        "[Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; \
         [Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; \
         $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \
         $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; \
         $graphics = [System.Drawing.Graphics]::FromImage($bmp); \
         $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); \
         $bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png); \
         $graphics.Dispose(); \
         $bmp.Dispose();",
        path_str
    );

    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &ps_script])
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                info!("Screenshot captured and saved to: {:?}", save_path);
                Ok(save_path.clone())
            } else {
                let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
                error!("PowerShell screenshot error: {}", err_msg);
                Err(format!("PowerShell execution failed: {}", err_msg))
            }
        }
        Err(e) => {
            error!("Failed to execute PowerShell screenshot command: {}", e);
            Err(format!("Failed to execute command: {}", e))
        }
    }
}
