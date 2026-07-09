use std::sync::Mutex;

use app_lib::audio::recording_commands::{
    clear_active_speaker_timeline_for_tests,
    get_active_speaker_at,
    record_active_speaker_window,
    set_enable_diarization,
};

static TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn selects_microphone_for_windows_where_mic_is_dominant() {
    let _guard = TEST_LOCK.lock().unwrap();
    set_enable_diarization(true);
    clear_active_speaker_timeline_for_tests();

    record_active_speaker_window(0.0, 0.5, 0.82, 0.20);

    assert_eq!(get_active_speaker_at(0.25), Some("mic".to_string()));
}

#[test]
fn selects_system_for_windows_where_system_is_dominant() {
    let _guard = TEST_LOCK.lock().unwrap();
    set_enable_diarization(true);
    clear_active_speaker_timeline_for_tests();

    record_active_speaker_window(0.0, 0.5, 0.18, 0.76);

    assert_eq!(get_active_speaker_at(0.25), Some("system".to_string()));
}

#[test]
fn prefers_the_most_recent_matching_window() {
    let _guard = TEST_LOCK.lock().unwrap();
    set_enable_diarization(true);
    clear_active_speaker_timeline_for_tests();

    record_active_speaker_window(0.0, 0.5, 0.82, 0.20);
    record_active_speaker_window(0.5, 1.0, 0.20, 0.80);

    assert_eq!(get_active_speaker_at(0.75), Some("system".to_string()));
}
