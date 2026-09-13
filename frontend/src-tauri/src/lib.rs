use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex as StdMutex;
// Removed unused import

// Performance optimization: Conditional logging macros for hot paths
#[cfg(debug_assertions)]
macro_rules! perf_debug {
    ($($arg:tt)*) => {
        log::debug!($($arg)*)
    };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_debug {
    ($($arg:tt)*) => {};
}

#[cfg(debug_assertions)]
macro_rules! perf_trace {
    ($($arg:tt)*) => {
        log::trace!($($arg)*)
    };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_trace {
    ($($arg:tt)*) => {};
}

// perf_debug!/perf_trace! are macro_rules macros defined above, so they are
// textually in scope for every module declared below — no re-export needed.

// Re-export async logging macros for external use (removed due to macro conflicts)

// Declare audio module
pub mod analytics;
pub mod api;
pub mod audio;
pub mod config;
pub mod console_utils;
pub mod diarization;
pub mod database;
pub mod notifications;
pub mod ollama;
pub mod onboarding;
pub mod openai;
pub mod anthropic;
pub mod groq;
pub mod openrouter;
pub mod parakeet_engine;
pub mod state;
pub mod summary;
pub mod chat;
pub mod system_info;
pub mod tray;
pub mod utils;
pub mod whisper_engine;

use audio::{list_audio_devices, AudioDevice, trigger_audio_permission};
use log::{error as log_error, info as log_info};
use notifications::commands::NotificationManagerState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::RwLock;

/// Canonicalise a root directory for containment checks.  If the directory
/// doesn't exist yet (fresh install), canonicalise its parent and re-append
/// the final component so the comparison still works.
fn canonicalize_root(root: &Path) -> Option<PathBuf> {
    if let Ok(canon) = root.canonicalize() {
        return Some(canon);
    }
    let parent = root.parent()?;
    let canon_parent = parent.canonicalize().ok()?;
    Some(canon_parent.join(root.file_name()?))
}

/// Resolve `path` and ensure it lives inside one of `roots`.  Roots must
/// already be canonical.  Kept free of `AppHandle` so it can be unit-tested.
fn resolve_within_roots(roots: &[PathBuf], path: &str) -> Result<PathBuf, String> {
    let input = Path::new(path);

    // Canonicalise the input path.  For read operations the file must
    // already exist; for write operations the parent must exist.  We try
    // canonicalising the input directly, and if that fails (file doesn't
    // exist yet) we canonicalise the parent and re-append the file name.
    let canonical = match input.canonicalize() {
        Ok(c) => c,
        Err(_) => {
            // File doesn't exist yet (write path).  Canonicalise parent.
            let parent = input.parent().ok_or_else(|| {
                "Invalid path: no parent directory".to_string()
            })?;
            let canon_parent = parent.canonicalize().map_err(|e| {
                format!("Parent directory does not exist or is inaccessible: {}", e)
            })?;
            canon_parent.join(input.file_name().ok_or_else(|| {
                "Invalid path: no file component".to_string()
            })?)
        }
    };

    for root in roots {
        if canonical.starts_with(root) {
            return Ok(canonical);
        }
    }

    Err(format!(
        "Access denied: path '{}' is outside the allowed application directories",
        canonical.display()
    ))
}

/// Canonicalise `path` and ensure it lives inside one of the allowed root
/// directories: the app data dir, the user's download dir, or the recordings
/// folder (both the configured one and the platform default — recordings live
/// outside app data, e.g. `Music\MinutIA-recordings`, and the folder is
/// user-configurable, so playback via `read_audio_file` must allow it).
///
/// This prevents a compromised webview from using `read_audio_file` or
/// `save_transcript` to read or write arbitrary files on disk (e.g.
/// `~/.ssh/id_rsa` or the Windows Startup folder).
async fn resolve_within_allowed<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(app_data) = app.path().app_data_dir() {
        candidates.push(app_data);
    }
    if let Ok(download) = app.path().download_dir() {
        candidates.push(download);
    }
    if let Ok(prefs) = audio::recording_preferences::load_recording_preferences(app).await {
        candidates.push(prefs.save_folder);
    }
    candidates.push(audio::recording_preferences::get_default_recordings_folder());

    // Canonicalise each root so symlinks are resolved before the
    // starts_with check.
    let allowed_roots: Vec<PathBuf> = candidates
        .iter()
        .filter_map(|root| canonicalize_root(root))
        .collect();

    resolve_within_roots(&allowed_roots, path)
}

static RECORDING_FLAG: AtomicBool = AtomicBool::new(false);

/// App handle for emitting events from places with no `AppHandle` plumbed
/// through (the panic hook, deep audio tasks). `None` in unit tests and
/// before setup runs.
static GLOBAL_APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

pub(crate) fn global_app_handle() -> Option<&'static tauri::AppHandle> {
    GLOBAL_APP_HANDLE.get()
}

// Global language preference storage (default to "auto-translate" for automatic translation to English)
static LANGUAGE_PREFERENCE: std::sync::LazyLock<StdMutex<String>> =
    std::sync::LazyLock::new(|| StdMutex::new("auto-translate".to_string()));

#[derive(Debug, Deserialize)]
struct RecordingArgs {
    save_path: String,
}

#[derive(Debug, Serialize, Clone)]
struct TranscriptionStatus {
    chunks_in_queue: usize,
    is_processing: bool,
    last_activity_ms: u64,
}

#[tauri::command]
async fn start_recording<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
    meeting_name: Option<String>,
    enable_diarization: Option<bool>,
) -> Result<(), String> {
    log_info!("🔥 CALLED start_recording with meeting: {:?}", meeting_name);
    log_info!(
        "📋 Backend received parameters - mic: {:?}, system: {:?}, meeting: {:?}, enable_diarization: {:?}",
        mic_device_name,
        system_device_name,
        meeting_name,
        enable_diarization
    );

    if is_recording().await {
        return Err("Recording already in progress".to_string());
    }

    audio::recording_commands::set_enable_diarization(enable_diarization.unwrap_or(false));

    // Call the actual audio recording system with meeting name
    match audio::recording_commands::start_recording_with_devices_and_meeting(
        app.clone(),
        mic_device_name,
        system_device_name,
        meeting_name.clone(),
    )
    .await
    {
        Ok(_) => {
            RECORDING_FLAG.store(true, Ordering::SeqCst);
            tray::update_tray_menu(&app);

            log_info!("Recording started successfully");

            // Show recording started notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_started_notification(
                &app,
                &notification_manager_state,
                meeting_name.clone(),
            )
            .await
            {
                log_error!(
                    "Failed to show recording started notification: {}",
                    e
                );
            } else {
                log_info!("Successfully showed recording started notification");
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to start audio recording: {}", e);
            Err(format!("Failed to start recording: {}", e))
        }
    }
}

#[tauri::command]
async fn stop_recording<R: Runtime>(app: AppHandle<R>, args: RecordingArgs) -> Result<(), String> {
    log_info!("Attempting to stop recording...");

    // Check the actual audio recording system state instead of the flag
    if !audio::recording_commands::is_recording().await {
        log_info!("Recording is already stopped");
        return Ok(());
    }

    // Call the actual audio recording system to stop
    match audio::recording_commands::stop_recording(
        app.clone(),
        audio::recording_commands::RecordingArgs {
            save_path: args.save_path.clone(),
        },
    )
    .await
    {
        Ok(_) => {
            RECORDING_FLAG.store(false, Ordering::SeqCst);
            tray::update_tray_menu(&app);

            // Create the save directory if it doesn't exist
            if let Some(parent) = std::path::Path::new(&args.save_path).parent() {
                if !parent.exists() {
                    log_info!("Creating directory: {:?}", parent);
                    if let Err(e) = std::fs::create_dir_all(parent) {
                        let err_msg = format!("Failed to create save directory: {}", e);
                        log_error!("{}", err_msg);
                        return Err(err_msg);
                    }
                }
            }

            // Show recording stopped notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_stopped_notification(
                &app,
                &notification_manager_state,
            )
            .await
            {
                log_error!(
                    "Failed to show recording stopped notification: {}",
                    e
                );
            } else {
                log_info!("Successfully showed recording stopped notification");
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to stop audio recording: {}", e);
            // Still update the flag even if stopping failed
            RECORDING_FLAG.store(false, Ordering::SeqCst);
            tray::update_tray_menu(&app);
            Err(format!("Failed to stop recording: {}", e))
        }
    }
}

#[tauri::command]
async fn is_recording() -> bool {
    audio::recording_commands::is_recording().await
}

#[tauri::command]
fn get_transcription_status() -> TranscriptionStatus {
    TranscriptionStatus {
        chunks_in_queue: 0,
        is_processing: false,
        last_activity_ms: 0,
    }
}

#[tauri::command]
async fn read_audio_file<R: Runtime>(
    app: AppHandle<R>,
    file_path: String,
) -> Result<Vec<u8>, String> {
    let resolved = resolve_within_allowed(&app, &file_path).await?;
    match std::fs::read(&resolved) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Failed to read audio file: {}", e)),
    }
}

#[tauri::command]
async fn save_transcript<R: Runtime>(
    app: AppHandle<R>,
    file_path: String,
    content: String,
) -> Result<(), String> {
    log_info!("Saving transcript to: {}", file_path);

    let resolved = resolve_within_allowed(&app, &file_path).await?;

    // Ensure parent directory exists
    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Write content to file
    std::fs::write(&resolved, content)
        .map_err(|e| format!("Failed to write transcript: {}", e))?;

    log_info!("Transcript saved successfully");
    Ok(())
}

// Audio level monitoring commands
#[tauri::command]
async fn start_audio_level_monitoring<R: Runtime>(
    app: AppHandle<R>,
    device_names: Vec<String>,
) -> Result<(), String> {
    log_info!(
        "Starting audio level monitoring for devices: {:?}",
        device_names
    );

    audio::simple_level_monitor::start_monitoring(app, device_names)
        .await
        .map_err(|e| format!("Failed to start audio level monitoring: {}", e))
}

#[tauri::command]
async fn stop_audio_level_monitoring() -> Result<(), String> {
    log_info!("Stopping audio level monitoring");

    audio::simple_level_monitor::stop_monitoring()
        .await
        .map_err(|e| format!("Failed to stop audio level monitoring: {}", e))
}

#[tauri::command]
async fn is_audio_level_monitoring() -> bool {
    audio::simple_level_monitor::is_monitoring()
}

// Analytics commands are now handled by analytics::commands module

// Whisper commands are now handled by whisper_engine::commands module

#[tauri::command]
async fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_audio_devices()
        .await
        .map_err(|e| format!("Failed to list audio devices: {}", e))
}

#[tauri::command]
async fn trigger_microphone_permission() -> Result<bool, String> {
    trigger_audio_permission()
        .map_err(|e| format!("Failed to trigger microphone permission: {}", e))
}

#[tauri::command]
async fn start_recording_with_devices<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
) -> Result<(), String> {
    start_recording_with_devices_and_meeting(app, mic_device_name, system_device_name, None, None).await
}

#[tauri::command]
async fn start_recording_with_devices_and_meeting<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
    meeting_name: Option<String>,
    enable_diarization: Option<bool>,
) -> Result<(), String> {
    log_info!("🚀 CALLED start_recording_with_devices_and_meeting - Mic: {:?}, System: {:?}, Meeting: {:?}, enable_diarization: {:?}",
             mic_device_name, system_device_name, meeting_name, enable_diarization);

    audio::recording_commands::set_enable_diarization(enable_diarization.unwrap_or(false));

    // Clone meeting_name for notification use later
    let meeting_name_for_notification = meeting_name.clone();

    // Call the recording module functions that support meeting names
    let recording_result = match (mic_device_name.clone(), system_device_name.clone()) {
        (None, None) => {
            log_info!(
                "No devices specified, starting with defaults and meeting: {:?}",
                meeting_name
            );
            audio::recording_commands::start_recording_with_meeting_name(app.clone(), meeting_name)
                .await
        }
        _ => {
            log_info!(
                "Starting with specified devices: mic={:?}, system={:?}, meeting={:?}",
                mic_device_name,
                system_device_name,
                meeting_name
            );
            audio::recording_commands::start_recording_with_devices_and_meeting(
                app.clone(),
                mic_device_name,
                system_device_name,
                meeting_name,
            )
            .await
        }
    };

    match recording_result {
        Ok(_) => {
            log_info!("Recording started successfully via tauri command");

            // Show recording started notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_started_notification(
                &app,
                &notification_manager_state,
                meeting_name_for_notification.clone(),
            )
            .await
            {
                log_error!(
                    "Failed to show recording started notification: {}",
                    e
                );
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to start recording via tauri command: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn set_language_preference(language: String) -> Result<(), String> {
    let mut lang_pref = LANGUAGE_PREFERENCE
        .lock()
        .map_err(|e| format!("Failed to set language preference: {}", e))?;
    log_info!("Setting language preference to: {}", language);
    *lang_pref = language;
    Ok(())
}

// Internal helper function to get language preference (for use within Rust code)
pub fn get_language_preference_internal() -> Option<String> {
    LANGUAGE_PREFERENCE.lock().ok().map(|lang| lang.clone())
}

pub fn run() {
    log::set_max_level(log::LevelFilter::Info);

    // A panic anywhere — including audio tasks, where tokio swallows it as a
    // JoinError nobody joins — gets logged with its location and surfaced to
    // the frontend before unwinding continues. Without this, a panicked
    // checkpoint task kills recording persistence with zero diagnostics.
    let default_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("PANIC: {}", info);
        if let Some(app) = global_app_handle() {
            use tauri::Emitter;
            let _ = app.emit(
                "fatal-panic",
                serde_json::json!({ "message": info.to_string() }),
            );
        }
        default_panic_hook(info);
    }));

    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log_info!(
                "Second app instance requested with args: {:?}, cwd: {:?}",
                args,
                cwd
            );

            tray::focus_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Arc::new(RwLock::new(
            None::<notifications::manager::NotificationManager<tauri::Wry>>,
        )) as NotificationManagerState<tauri::Wry>)
        .manage(audio::init_system_audio_state())
        .manage(summary::summary_engine::ModelManagerState(Arc::new(tokio::sync::Mutex::new(None))))
        .setup(|_app| {
            log::info!("Application setup complete");

            // Register the global handle used by the panic hook and deep
            // audio tasks to emit events to the frontend.
            let _ = GLOBAL_APP_HANDLE.set(_app.handle().clone());

            // ort links onnxruntime dynamically: point it at the bundled
            // official Microsoft library (runtime ISA dispatch) before any
            // ONNX session is created (parakeet engine init below). The dylib
            // ships as a bundled resource, so its location differs per
            // platform/install layout — probe the known ones.
            if std::env::var_os("ORT_DYLIB_PATH").is_none() {
                let mut found = None;
                if let Ok(exe) = std::env::current_exe() {
                    if let Some(exe_dir) = exe.parent() {
                        let mut candidates: Vec<std::path::PathBuf> = vec![
                            exe_dir.to_path_buf(),
                            exe_dir.join("binaries"),
                            // macOS .app: exe in Contents/MacOS, resources in
                            // Contents/Resources/binaries
                            exe_dir.join("../Resources/binaries"),
                            // `tauri dev` / `cargo run`: target/{debug,release}
                            // -> frontend/src-tauri/binaries
                            exe_dir.join("../../src-tauri/binaries"),
                        ];
                        // Linux deb/rpm: resources live under ../lib/<name>/
                        // whose directory name varies — scan it.
                        if let Ok(lib_dirs) = std::fs::read_dir(exe_dir.join("../lib")) {
                            for d in lib_dirs.flatten() {
                                candidates.push(d.path().join("binaries"));
                            }
                        }
                        candidates.dedup();
                        'outer: for dir in candidates {
                            let Ok(entries) = std::fs::read_dir(&dir) else {
                                continue;
                            };
                            for entry in entries.flatten() {
                                let name = entry.file_name();
                                let name = name.to_string_lossy();
                                if name.starts_with("onnxruntime")
                                    && name.ends_with(std::env::consts::DLL_SUFFIX)
                                    && entry.path().is_file()
                                {
                                    found = Some(entry.path());
                                    break 'outer;
                                }
                            }
                        }
                    }
                }
                match found {
                    Some(path) => {
                        // Setup runs on the main thread before any worker
                        // thread or ONNX session exists.
                        std::env::set_var("ORT_DYLIB_PATH", &path);
                        log::info!("ORT_DYLIB_PATH set to {}", path.display());
                    }
                    None => {
                        log::warn!(
                            "Bundled onnxruntime library not found; Parakeet \
                             transcription will fail to start"
                        );
                    }
                }
            }

            // whisper.cpp is compiled with AVX2 baked in (ggml has no runtime
            // CPU dispatch at the vendored version), so on a CPU without AVX2
            // the process dies with ILLEGAL_INSTRUCTION on first inference.
            // Fail with a clear message instead.
            #[cfg(target_arch = "x86_64")]
            {
                if !std::arch::is_x86_feature_detected!("avx2") {
                    log::error!("CPU does not support AVX2; cannot run MinutIA");
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    _app.handle()
                        .dialog()
                        .message(
                            "MinutIA requires a CPU with AVX2 support (roughly any \
                             Intel Core or AMD Ryzen from 2015 onwards) and will close.\n\n\
                             Your processor does not report AVX2 support.",
                        )
                        .kind(MessageDialogKind::Error)
                        .title("MinutIA — unsupported CPU")
                        .blocking_show();
                    std::process::exit(1);
                }
            }

            // Initialize system tray
            if let Err(e) = tray::create_tray(_app.handle()) {
                log::error!("Failed to create system tray: {}", e);
            }

            // Initialize notification system with proper defaults
            log::info!("Initializing notification system...");
            let app_for_notif = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let notif_state = app_for_notif.state::<NotificationManagerState<tauri::Wry>>();
                match notifications::commands::initialize_notification_manager(app_for_notif.clone()).await {
                    Ok(manager) => {
                        // Set default consent and permissions on first launch
                        if let Err(e) = manager.set_consent(true).await {
                            log::error!("Failed to set initial consent: {}", e);
                        }
                        if let Err(e) = manager.request_permission().await {
                            log::error!("Failed to request initial permission: {}", e);
                        }

                        // Store the initialized manager
                        let mut state_lock = notif_state.write().await;
                        *state_lock = Some(manager);
                        log::info!("Notification system initialized with default permissions");
                    }
                    Err(e) => {
                        log::error!("Failed to initialize notification manager: {}", e);
                    }
                }
            });

            // Set models directory to use app_data_dir (unified storage location)
            whisper_engine::commands::set_models_directory(&_app.handle());

            // Initialize Whisper engine on startup
            tauri::async_runtime::spawn(async {
                if let Err(e) = whisper_engine::commands::whisper_init().await {
                    log::error!("Failed to initialize Whisper engine on startup: {}", e);
                }
            });

            // Set Parakeet models directory
            parakeet_engine::commands::set_models_directory(&_app.handle());

            // Initialize Parakeet engine on startup
            tauri::async_runtime::spawn(async {
                if let Err(e) = parakeet_engine::commands::parakeet_init().await {
                    log::error!("Failed to initialize Parakeet engine on startup: {}", e);
                }
            });

            // Initialize ModelManager for summary engine (async, non-blocking)
            let app_handle_for_model_manager = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match summary::summary_engine::commands::init_model_manager_at_startup(&app_handle_for_model_manager).await {
                    Ok(_) => log::info!("ModelManager initialized successfully at startup"),
                    Err(e) => {
                        log::warn!("Failed to initialize ModelManager at startup: {}", e);
                        log::warn!("ModelManager will be lazy-initialized on first use");
                    }
                }
            });

            // Trigger system audio permission request on startup (similar to microphone permission)
            // #[cfg(target_os = "macos")]
            // {
            //     tauri::async_runtime::spawn(async {
            //         if let Err(e) = audio::permissions::trigger_system_audio_permission() {
            //             log::warn!("Failed to trigger system audio permission: {}", e);
            //         }
            //     });
            // }

            // Initialize database (handles first launch detection and conditional setup)
            //
            // A failed migration must NOT panic: sqlx records applied
            // migrations, so a panic here turns into a permanent boot loop
            // for every auto-updated user. Show a diagnostic dialog instead
            // and exit cleanly — a pre-migration backup exists (see
            // DatabaseManager::backup_before_migrations).
            let db_init = tauri::async_runtime::block_on(async {
                database::setup::initialize_database_on_startup(&_app.handle()).await
            });
            if let Err(e) = db_init {
                log_error!("Database initialization failed: {}", e);
                let data_dir = _app
                    .handle()
                    .path()
                    .app_data_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "the application data folder".to_string());
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                _app.handle()
                    .dialog()
                    .message(format!(
                        "MinutIA could not open or update its database and will close.\n\n\
                         Error: {}\n\n\
                         Your data folder:\n{}\n\n\
                         A backup (meeting_minutes.sqlite.pre-v*.bak) is created \
                         automatically before every update. Restoring it or \
                         reinstalling the previous version recovers your data.",
                        e, data_dir
                    ))
                    .kind(MessageDialogKind::Error)
                    .title("MinutIA — database error")
                    .blocking_show();
                std::process::exit(1);
            }

            // Initialize bundled templates directory for dynamic template discovery
            log::info!("Initializing bundled templates directory...");
            if let Ok(resource_path) = _app.handle().path().resource_dir() {
                let templates_dir = resource_path.join("templates");
                log::info!("Setting bundled templates directory to: {:?}", templates_dir);
                summary::templates::set_bundled_templates_dir(templates_dir);
            } else {
                log::warn!("Failed to resolve resource directory for templates");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        log::error!("Failed to hide main window on close request: {}", e);
                    } else {
                        log::info!("Main window hidden to tray on close request");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            is_recording,
            get_transcription_status,
            read_audio_file,
            save_transcript,
            analytics::commands::init_analytics,
            analytics::commands::disable_analytics,
            analytics::commands::track_event,
            analytics::commands::identify_user,
            analytics::commands::track_meeting_started,
            analytics::commands::track_recording_started,
            analytics::commands::track_recording_stopped,
            analytics::commands::track_meeting_deleted,
            analytics::commands::track_settings_changed,
            analytics::commands::track_feature_used,
            analytics::commands::is_analytics_enabled,
            analytics::commands::start_analytics_session,
            analytics::commands::end_analytics_session,
            analytics::commands::track_daily_active_user,
            analytics::commands::track_user_first_launch,
            analytics::commands::is_analytics_session_active,
            analytics::commands::track_summary_generation_started,
            analytics::commands::track_summary_generation_completed,
            analytics::commands::track_summary_regenerated,
            analytics::commands::track_model_changed,
            analytics::commands::track_custom_prompt_used,
            analytics::commands::track_meeting_ended,
            analytics::commands::track_analytics_enabled,
            analytics::commands::track_analytics_disabled,
            analytics::commands::track_analytics_transparency_viewed,
            whisper_engine::commands::whisper_init,
            whisper_engine::commands::whisper_get_available_models,
            whisper_engine::commands::whisper_load_model,
            whisper_engine::commands::whisper_get_current_model,
            whisper_engine::commands::whisper_is_model_loaded,
            whisper_engine::commands::whisper_has_available_models,
            whisper_engine::commands::whisper_validate_model_ready,
            whisper_engine::commands::whisper_transcribe_audio,
            whisper_engine::commands::whisper_get_models_directory,
            whisper_engine::commands::whisper_download_model,
            whisper_engine::commands::whisper_cancel_download,
            whisper_engine::commands::whisper_delete_corrupted_model,
            // Parakeet engine commands
            parakeet_engine::commands::parakeet_init,
            parakeet_engine::commands::parakeet_get_available_models,
            parakeet_engine::commands::parakeet_load_model,
            parakeet_engine::commands::parakeet_get_current_model,
            parakeet_engine::commands::parakeet_is_model_loaded,
            parakeet_engine::commands::parakeet_has_available_models,
            parakeet_engine::commands::parakeet_validate_model_ready,
            parakeet_engine::commands::parakeet_transcribe_audio,
            parakeet_engine::commands::parakeet_get_models_directory,
            parakeet_engine::commands::parakeet_download_model,
            parakeet_engine::commands::parakeet_retry_download,
            parakeet_engine::commands::parakeet_cancel_download,
            parakeet_engine::commands::parakeet_delete_corrupted_model,
            parakeet_engine::commands::open_parakeet_models_folder,
            get_audio_devices,
            trigger_microphone_permission,
            start_recording_with_devices,
            start_recording_with_devices_and_meeting,
            start_audio_level_monitoring,
            stop_audio_level_monitoring,
            is_audio_level_monitoring,
            // Recording pause/resume commands
            audio::recording_commands::pause_recording,
            audio::recording_commands::resume_recording,
            audio::recording_commands::is_recording_paused,
            audio::recording_commands::get_recording_state,
            audio::recording_commands::get_meeting_folder_path,
            // Reload sync commands (retrieve transcript history and meeting name)
            audio::recording_commands::get_transcript_history,
            audio::recording_commands::get_recording_meeting_name,
            // Device monitoring commands (AirPods/Bluetooth disconnect/reconnect)
            audio::recording_commands::poll_audio_device_events,
            audio::recording_commands::get_reconnection_status,
            audio::recording_commands::attempt_device_reconnect,
            // Playback device detection (Bluetooth warning)
            audio::recording_commands::get_active_audio_output,
            // Audio recovery commands (for transcript recovery feature)
            audio::incremental_saver::recover_audio_from_checkpoints,
            audio::incremental_saver::cleanup_checkpoints,
            audio::incremental_saver::has_audio_checkpoints,
            console_utils::show_console,
            console_utils::hide_console,
            console_utils::toggle_console,
            ollama::get_ollama_models,
            ollama::pull_ollama_model,
            ollama::delete_ollama_model,
            ollama::get_ollama_model_context,
            openai::openai::get_openai_models,
            anthropic::anthropic::get_anthropic_models,
            groq::groq::get_groq_models,
            api::api_get_meetings,
            api::api_get_dashboard_stats,
            api::api_smart_search,
            api::api_get_commitments,
            api::api_get_meeting_commitments,
            api::api_update_commitment_status,
            api::api_search_transcripts,
            api::api_get_model_config,
            api::api_save_model_config,
            api::summary_list_models,
            api::api_save_api_key,
            api::api_get_api_key_status,
            api::api_get_transcript_config,
            api::api_save_transcript_config,
            api::api_delete_meeting,
            api::api_get_meeting,
            api::api_get_meeting_metadata,
            api::api_get_meeting_transcripts,
            api::api_save_meeting_title,
            api::api_save_transcript,
            api::open_meeting_folder,
            api::open_external_url,
            // Custom OpenAI commands
            api::api_save_custom_openai_config,
            api::api_get_custom_openai_config,
            api::api_test_custom_openai_connection,
            // Summary commands
            summary::commands::api_process_transcript,
            summary::commands::api_get_summary,
            summary::commands::api_save_meeting_summary,
            summary::commands::api_get_meeting_summary_language,
            summary::commands::api_get_meeting_summary_context,
            summary::commands::api_save_meeting_summary_language,
            summary::commands::api_save_meeting_summary_context,
            summary::commands::api_get_meeting_detected_summary_language,
            summary::commands::api_save_meeting_detected_summary_language,
            summary::commands::api_detect_transcript_summary_language,
            summary::commands::api_cancel_summary,
            // Template commands
            summary::template_commands::api_list_templates,
            summary::template_commands::api_get_template_details,
            summary::template_commands::api_validate_template,
            summary::template_commands::api_save_custom_template,
            summary::template_commands::api_delete_custom_template,
            // Built-in AI commands
            summary::summary_engine::commands::builtin_ai_list_models,
            summary::summary_engine::commands::builtin_ai_get_model_info,
            summary::summary_engine::commands::builtin_ai_download_model,
            summary::summary_engine::commands::builtin_ai_cancel_download,
            summary::summary_engine::commands::builtin_ai_delete_model,
            summary::summary_engine::commands::builtin_ai_is_model_ready,
            summary::summary_engine::commands::builtin_ai_get_available_summary_model,
            summary::summary_engine::commands::builtin_ai_get_recommended_model,
            openrouter::get_openrouter_models,
            audio::recording_preferences::get_recording_preferences,
            audio::recording_preferences::set_recording_preferences,
            audio::recording_preferences::get_default_recordings_folder_path,
            audio::recording_preferences::open_recordings_folder,
            audio::recording_preferences::select_recording_folder,
            audio::recording_preferences::get_available_audio_backends,
            audio::recording_preferences::get_current_audio_backend,
            audio::recording_preferences::set_audio_backend,
            audio::recording_preferences::get_audio_backend_info,
            // System info commands
            system_info::get_system_memory_info,
            // Chat commands
            chat::api_ask_transcript,
            // Language preference commands
            set_language_preference,
            // Notification system commands
            notifications::commands::get_notification_settings,
            notifications::commands::set_notification_settings,
            notifications::commands::request_notification_permission,
            notifications::commands::show_notification,
            notifications::commands::show_test_notification,
            notifications::commands::is_dnd_active,
            notifications::commands::get_system_dnd_status,
            notifications::commands::set_manual_dnd,
            notifications::commands::set_notification_consent,
            notifications::commands::clear_notifications,
            notifications::commands::is_notification_system_ready,
            notifications::commands::initialize_notification_manager_manual,
            notifications::commands::test_notification_with_auto_consent,
            notifications::commands::get_notification_stats,
            // System audio capture commands
            audio::system_audio_commands::start_system_audio_capture_command,
            audio::system_audio_commands::list_system_audio_devices_command,
            audio::system_audio_commands::check_system_audio_permissions_command,
            audio::system_audio_commands::start_system_audio_monitoring,
            audio::system_audio_commands::stop_system_audio_monitoring,
            audio::system_audio_commands::get_system_audio_monitoring_status,
            // Screen Recording permission commands
            audio::permissions::check_screen_recording_permission_command,
            audio::permissions::request_screen_recording_permission_command,
            audio::permissions::trigger_system_audio_permission_command,
            // Database import commands
            database::commands::check_first_launch,
            database::commands::select_legacy_database_path,
            database::commands::detect_legacy_database,
            database::commands::check_default_legacy_database,
            database::commands::check_homebrew_database,
            database::commands::import_and_initialize_database,
            database::commands::initialize_fresh_database,
            // Database and Models path commands
            database::commands::get_database_directory,
            database::commands::open_database_folder,
            whisper_engine::commands::open_models_folder,
            // Onboarding commands
            onboarding::get_onboarding_status,
            onboarding::save_onboarding_status_cmd,
            onboarding::reset_onboarding_status_cmd,
            onboarding::complete_onboarding,
            // System settings commands
            #[cfg(target_os = "macos")]
            utils::open_system_settings,
            // Retranscription commands
            audio::retranscription::start_retranscription_command,
            audio::retranscription::cancel_retranscription_command,
            audio::retranscription::is_retranscription_in_progress_command,
            // Speaker diarization commands
            diarization::diarize_meeting,
            diarization::rename_speaker,
            diarization::list_speaker_names,
            // Import audio commands
            audio::import::select_and_validate_audio_command,
            audio::import::validate_audio_file_command,
            audio::import::start_import_audio_command,
            audio::import::cancel_import_command,
            audio::import::is_import_in_progress_command,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    tray::focus_main_window(_app_handle);
                }
                tauri::RunEvent::Exit => {
                    log::info!("Application exiting, cleaning up resources...");
                    tauri::async_runtime::block_on(async {
                        // Clean up database connection and checkpoint WAL
                        if let Some(app_state) = _app_handle.try_state::<state::AppState>() {
                            log::info!("Starting database cleanup...");
                            if let Err(e) = app_state.db_manager.cleanup().await {
                                log::error!("Failed to cleanup database: {}", e);
                            } else {
                                log::info!("Database cleanup completed successfully");
                            }
                        } else {
                            log::warn!("AppState not available for database cleanup (likely first launch)");
                        }

                        // Clean up sidecar
                        log::info!("Cleaning up sidecar...");
                        if let Err(e) = summary::summary_engine::force_shutdown_sidecar().await {
                            log::error!("Failed to force shutdown sidecar: {}", e);
                        }
                    });
                    log::info!("Application cleanup complete");
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod path_confinement_tests {
    use super::{canonicalize_root, resolve_within_roots};
    use std::fs;
    use std::path::PathBuf;

    fn test_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir()
            .join(format!("minutia-path-tests-{}", std::process::id()))
            .join(name);
        fs::create_dir_all(&root).expect("create test root");
        root
    }

    #[test]
    fn accepts_existing_file_inside_root() {
        let root = test_root("inside");
        let file = root.join("meeting.wav");
        fs::write(&file, b"x").unwrap();
        let roots = vec![canonicalize_root(&root).unwrap()];
        assert!(resolve_within_roots(&roots, file.to_str().unwrap()).is_ok());
    }

    #[test]
    fn accepts_new_file_inside_root_when_parent_exists() {
        let root = test_root("write");
        let file = root.join("new-transcript.txt");
        let roots = vec![canonicalize_root(&root).unwrap()];
        assert!(resolve_within_roots(&roots, file.to_str().unwrap()).is_ok());
    }

    #[test]
    fn rejects_path_outside_roots() {
        let root = test_root("outside-a");
        let other = test_root("outside-b");
        let file = other.join("secret.txt");
        fs::write(&file, b"x").unwrap();
        let roots = vec![canonicalize_root(&root).unwrap()];
        assert!(resolve_within_roots(&roots, file.to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_parent_traversal_escaping_root() {
        let root = test_root("traversal");
        let escape = root.join("..").join("traversal-evil").join("f.txt");
        let evil_dir = root.parent().unwrap().join("traversal-evil");
        fs::create_dir_all(&evil_dir).unwrap();
        fs::write(evil_dir.join("f.txt"), b"x").unwrap();
        let roots = vec![canonicalize_root(&root).unwrap()];
        assert!(resolve_within_roots(&roots, escape.to_str().unwrap()).is_err());
    }

    #[test]
    fn rejects_sibling_directory_sharing_prefix() {
        // starts_with must compare whole components: "recordings-evil" is not
        // inside "recordings" even though the string is a prefix.
        let root = test_root("recordings");
        let evil = test_root("recordings-evil");
        let file = evil.join("f.txt");
        fs::write(&file, b"x").unwrap();
        let roots = vec![canonicalize_root(&root).unwrap()];
        assert!(resolve_within_roots(&roots, file.to_str().unwrap()).is_err());
    }

    #[test]
    fn canonicalize_root_handles_missing_leaf_dir() {
        let base = test_root("missing-leaf");
        let not_created = base.join("does-not-exist-yet");
        let canon = canonicalize_root(&not_created).expect("parent exists");
        assert!(canon.ends_with("does-not-exist-yet"));
    }
}
