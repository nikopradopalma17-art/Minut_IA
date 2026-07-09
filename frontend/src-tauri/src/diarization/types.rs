use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct DiarizationSample {
    pub id: String,
    pub speaker_hint: Option<String>,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiarizationAssignment {
    pub id: String,
    pub speaker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpeakerNameEntry {
    pub speaker_id: String,
    pub display_name: String,
}
