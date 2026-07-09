use super::types::{DiarizationAssignment, DiarizationSample};

const MIC_LABEL: &str = "speaker_0";

pub fn cluster_embeddings(embeddings: &[Vec<f32>], threshold: f32) -> Vec<usize> {
    if embeddings.is_empty() {
        return Vec::new();
    }

    let normalized_embeddings: Vec<Vec<f32>> = embeddings
        .iter()
        .map(|embedding| normalize_embedding(embedding))
        .collect();

    let mut clusters: Vec<Vec<usize>> = (0..normalized_embeddings.len())
        .map(|index| vec![index])
        .collect();

    loop {
        let mut best_match: Option<(f32, usize, usize)> = None;

        for left in 0..clusters.len() {
            for right in (left + 1)..clusters.len() {
                let distance = cluster_distance(
                    &normalized_embeddings,
                    &clusters[left],
                    &clusters[right],
                );

                if distance <= threshold {
                    let should_replace = match best_match {
                        None => true,
                        Some((best_distance, best_left, best_right)) => {
                            distance < best_distance
                                || (approx_eq(distance, best_distance)
                                    && (clusters[left][0], clusters[right][0])
                                        < (clusters[best_left][0], clusters[best_right][0]))
                        }
                    };

                    if should_replace {
                        best_match = Some((distance, left, right));
                    }
                }
            }
        }

        let Some((_, left, right)) = best_match else {
            break;
        };

        let mut merged = clusters[left].clone();
        merged.extend_from_slice(&clusters[right]);
        merged.sort_unstable();
        clusters[left] = merged;
        clusters.remove(right);
    }

    let mut cluster_ordered: Vec<(usize, Vec<usize>)> = clusters
        .into_iter()
        .map(|members| {
            let first_index = members.iter().copied().min().unwrap_or(0);
            (first_index, members)
        })
        .collect();
    cluster_ordered.sort_by_key(|(first_index, _)| *first_index);

    let mut labels = vec![0usize; normalized_embeddings.len()];
    for (cluster_index, (_, members)) in cluster_ordered.iter().enumerate() {
        for member in members {
            labels[*member] = cluster_index;
        }
    }

    labels
}

pub fn assign_speaker_labels(
    samples: &[DiarizationSample],
    threshold: f32,
) -> Vec<DiarizationAssignment> {
    if samples.is_empty() {
        return Vec::new();
    }

    let mut assignments = vec![
        DiarizationAssignment {
            id: String::new(),
            speaker: None,
            cluster_index: None,
        };
        samples.len()
    ];

    let mut system_sample_indices = Vec::new();
    let mut system_embeddings = Vec::new();

    for (index, sample) in samples.iter().enumerate() {
        assignments[index].id = sample.id.clone();

        if is_mic_hint(sample.speaker_hint.as_deref()) {
            assignments[index].speaker = Some(MIC_LABEL.to_string());
        } else {
            system_sample_indices.push(index);
            system_embeddings.push(sample.embedding.clone());
        }
    }

    if system_embeddings.is_empty() {
        for assignment in &mut assignments {
            if assignment.speaker.is_none() {
                assignment.speaker = Some(MIC_LABEL.to_string());
            }
        }
        return assignments;
    }

    let cluster_labels = cluster_embeddings(&system_embeddings, threshold);
    for (system_index, cluster_index) in system_sample_indices.into_iter().zip(cluster_labels.into_iter()) {
        assignments[system_index].speaker = Some(format!("speaker_{}", cluster_index + 1));
        assignments[system_index].cluster_index = Some(cluster_index);
    }

    assignments
}

fn normalize_embedding(values: &[f32]) -> Vec<f32> {
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm <= f32::EPSILON {
        return values.to_vec();
    }

    values.iter().map(|value| value / norm).collect()
}

fn cluster_distance(embeddings: &[Vec<f32>], left: &[usize], right: &[usize]) -> f32 {
    let left_centroid = centroid(embeddings, left);
    let right_centroid = centroid(embeddings, right);
    cosine_distance(&left_centroid, &right_centroid)
}

fn centroid(embeddings: &[Vec<f32>], members: &[usize]) -> Vec<f32> {
    if members.is_empty() {
        return Vec::new();
    }

    let dimension = embeddings[members[0]].len();
    let mut centroid = vec![0.0f32; dimension];

    for member in members {
        for (index, value) in embeddings[*member].iter().enumerate() {
            centroid[index] += *value;
        }
    }

    let divisor = members.len() as f32;
    for value in &mut centroid {
        *value /= divisor;
    }

    normalize_embedding(&centroid)
}

fn cosine_distance(left: &[f32], right: &[f32]) -> f32 {
    if left.is_empty() || right.is_empty() || left.len() != right.len() {
        return 1.0;
    }

    let dot = left
        .iter()
        .zip(right.iter())
        .map(|(a, b)| a * b)
        .sum::<f32>();

    let left_norm = left.iter().map(|value| value * value).sum::<f32>().sqrt();
    let right_norm = right.iter().map(|value| value * value).sum::<f32>().sqrt();

    if left_norm <= f32::EPSILON || right_norm <= f32::EPSILON {
        return 1.0;
    }

    1.0 - (dot / (left_norm * right_norm)).clamp(-1.0, 1.0)
}

fn is_mic_hint(hint: Option<&str>) -> bool {
    match hint.map(|value| value.trim().to_lowercase()) {
        Some(value) if value == "mic" || value == "microphone" || value == MIC_LABEL => true,
        _ => false,
    }
}

fn approx_eq(left: f32, right: f32) -> bool {
    (left - right).abs() < 1e-6
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
