// ============================================================================
// ONNX Runtime Dynamic Library Bundling
// ============================================================================
// The ort crate links onnxruntime dynamically (`load-dynamic` feature), so the
// shared library must ship next to the app binary. We bundle the official
// Microsoft builds: their MLAS kernels are compiled per-ISA and selected at
// runtime, unlike pykeio's prebuilt static libraries which are compiled on
// AVX-512-capable CI runners and crash non-AVX-512 consumer CPUs with
// 0xC000001D (see scripts/check_avx512.py and issue #3).

// Must match the runtime version ort-sys 2.0.0-rc.10 was built against
// (it hard-checks GetVersionString == 1.22.x at session creation).
const ORT_VERSION: &str = "1.22.0";

/// Download and bundle the official onnxruntime shared library for the current
/// target platform. Cached: skips the download when the file already exists.
pub fn ensure_ort_dylib() {
    let target = std::env::var("TARGET")
        .or_else(|_| std::env::var("HOST"))
        .expect("Neither TARGET nor HOST environment variable set");

    let dylib_name = if target.contains("windows") {
        format!("onnxruntime-{}.dll", target)
    } else if target.contains("apple") {
        format!("onnxruntime-{}.dylib", target)
    } else {
        format!("onnxruntime-{}.so", target)
    };

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR environment variable not set");
    let binaries_dir = std::path::PathBuf::from(&manifest_dir).join("binaries");
    let dylib_path = binaries_dir.join(&dylib_name);

    if dylib_path.exists() {
        println!("cargo:warning=✅ Cached onnxruntime dylib: {}", dylib_name);
        return;
    }

    if !binaries_dir.exists() {
        std::fs::create_dir_all(&binaries_dir).expect("Failed to create binaries directory");
    }

    println!("cargo:warning=📥 Downloading official onnxruntime {} for {}", ORT_VERSION, target);

    match download_and_extract(&target, &dylib_path) {
        Ok(()) => {
            let size = std::fs::metadata(&dylib_path).map(|m| m.len()).unwrap_or(0);
            if size < 1024 * 1024 {
                panic!("Downloaded onnxruntime dylib is suspiciously small ({} bytes)", size);
            }
            println!("cargo:warning=✅ onnxruntime dylib bundled: {} ({:.1} MB)", dylib_name, size as f64 / 1_048_576.0);
        }
        Err(e) => panic!("⚠️  Failed to bundle onnxruntime: {}", e),
    }
}

fn download_and_extract(
    target: &str,
    output_path: &std::path::PathBuf,
) -> Result<(), String> {
    let (archive_url, inner_name) = archive_for_target(target)?;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&archive_url)
        .send()
        .map_err(|e| format!("Failed to download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error {} for {}", response.status(), archive_url));
    }

    let temp_dir = std::env::temp_dir();
    let archive_path = temp_dir.join(format!("onnxruntime-build-{}.tgz", target));
    std::fs::write(&archive_path, response.bytes().map_err(|e| format!("Failed to read response: {}", e))?)
        .map_err(|e| format!("Failed to write archive: {}", e))?;

    let extract_dir = temp_dir.join(format!("onnxruntime-extract-{}", target));
    let _ = std::fs::remove_dir_all(&extract_dir);
    std::fs::create_dir_all(&extract_dir).map_err(|e| format!("Failed to create extract dir: {}", e))?;

    if archive_url.ends_with(".zip") {
        extract_zip(&archive_path, &extract_dir)?;
    } else {
        extract_tar_gz(&archive_path, &extract_dir)?;
    }

    // Archives unpack to onnxruntime-<platform>-<ver>/lib/<inner_name>
    let mut dylib = None;
    for entry in std::fs::read_dir(&extract_dir).map_err(|e| format!("Failed to read extract dir: {}", e))? {
        let lib = entry
            .map_err(|e| format!("Failed to read entry: {}", e))?
            .path()
            .join("lib")
            .join(&inner_name);
        if lib.exists() {
            dylib = Some(lib);
            break;
        }
    }
    let dylib = dylib.ok_or_else(|| format!("{} not found in extracted archive", inner_name))?;

    std::fs::copy(&dylib, output_path)
        .map_err(|e| format!("Failed to copy dylib to binaries/: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(output_path)
            .map_err(|e| format!("Failed to get metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(output_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    let _ = std::fs::remove_dir_all(&extract_dir);
    let _ = std::fs::remove_file(&archive_path);
    Ok(())
}

/// (archive URL, name of the shared library inside the archive's lib/ dir)
fn archive_for_target(target: &str) -> Result<(String, String), String> {
    let base = format!("https://github.com/microsoft/onnxruntime/releases/download/v{}", ORT_VERSION);
    let (archive, inner) = if target.contains("windows") {
        if target.contains("aarch64") {
            (format!("{}/onnxruntime-win-aarch64-{}.zip", base, ORT_VERSION), "onnxruntime.dll")
        } else {
            (format!("{}/onnxruntime-win-x64-{}.zip", base, ORT_VERSION), "onnxruntime.dll")
        }
    } else if target.contains("apple") {
        let arch = if target.contains("aarch64") { "arm64" } else { "x86_64" };
        (format!("{}/onnxruntime-osx-{}-{}.tgz", base, arch, ORT_VERSION), "libonnxruntime.dylib")
    } else if target.contains("linux") {
        let arch = if target.contains("aarch64") { "aarch64" } else { "x64" };
        (format!("{}/onnxruntime-linux-{}-{}.tgz", base, arch, ORT_VERSION), "libonnxruntime.so")
    } else {
        return Err(format!("Unsupported target platform: {}", target));
    };
    Ok((archive, inner.to_string()))
}

fn extract_zip(archive_path: &std::path::Path, extract_dir: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open ZIP: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read ZIP archive: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Failed to read ZIP entry {}: {}", i, e))?;
        // enclosed_name() rejects path traversal (Zip Slip)
        if let Some(name) = entry.enclosed_name() {
            let outpath = extract_dir.join(name);
            if entry.is_dir() {
                std::fs::create_dir_all(&outpath).map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent: {}", e))?;
                }
                let mut outfile = std::fs::File::create(&outpath).map_err(|e| format!("Failed to create output file: {}", e))?;
                std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("Failed to extract file: {}", e))?;
            }
        }
    }
    Ok(())
}

fn extract_tar_gz(archive_path: &std::path::Path, extract_dir: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open TGZ: {}", e))?;
    let decompressor = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive.unpack(extract_dir).map_err(|e| format!("Failed to unpack TAR: {}", e))?;
    Ok(())
}
