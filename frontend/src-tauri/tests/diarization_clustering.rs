use app_lib::diarization::{assign_speaker_labels, cluster_embeddings, DiarizationSample};

#[test]
fn clusters_similar_embeddings_into_stable_speakers() {
    let embeddings = vec![
        vec![1.0, 0.0, 0.0],
        vec![0.98, 0.05, 0.0],
        vec![0.0, 1.0, 0.0],
        vec![0.0, 0.96, 0.04],
    ];

    let labels = cluster_embeddings(&embeddings, 0.20);

    assert_eq!(labels, vec![0, 0, 1, 1]);
}

#[test]
fn preserves_mic_segments_and_clusters_only_non_mic_speakers() {
    let segments = vec![
        DiarizationSample {
            id: "seg-1".to_string(),
            speaker_hint: Some("mic".to_string()),
            embedding: vec![1.0, 0.0, 0.0],
        },
        DiarizationSample {
            id: "seg-2".to_string(),
            speaker_hint: Some("system".to_string()),
            embedding: vec![0.0, 1.0, 0.0],
        },
        DiarizationSample {
            id: "seg-3".to_string(),
            speaker_hint: Some("system".to_string()),
            embedding: vec![0.0, 0.98, 0.02],
        },
        DiarizationSample {
            id: "seg-4".to_string(),
            speaker_hint: Some("system".to_string()),
            embedding: vec![0.9, 0.1, 0.0],
        },
    ];

    let labels = assign_speaker_labels(&segments, 0.20);

    assert_eq!(labels[0].speaker, Some("speaker_0".to_string()));
    assert_eq!(labels[1].speaker, Some("speaker_1".to_string()));
    assert_eq!(labels[2].speaker, Some("speaker_1".to_string()));
    assert_eq!(labels[3].speaker, Some("speaker_2".to_string()));
}
