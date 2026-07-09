use anyhow::{anyhow, Result};
use ndarray::{Array3, Ix2};
use ort::execution_providers::CPUExecutionProvider;
use ort::inputs;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::TensorRef;
use std::path::Path;

pub struct SpeakerEmbeddingModel {
    session: Session,
}

impl SpeakerEmbeddingModel {
    pub fn load<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let providers = vec![CPUExecutionProvider::default().build()];
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .with_execution_providers(providers)?
            .with_parallel_execution(true)?
            .commit_from_file(model_path)?;

        Ok(Self { session })
    }

    pub fn embed(&mut self, features: &[Vec<f32>]) -> Result<Vec<f32>> {
        if features.is_empty() {
            return Err(anyhow!("No features provided for embedding"));
        }

        let feature_dim = features[0].len();
        if feature_dim == 0 {
            return Err(anyhow!("Feature dimension is zero"));
        }

        if features.iter().any(|frame| frame.len() != feature_dim) {
            return Err(anyhow!("Inconsistent feature dimensions"));
        }

        let frames = features.len();
        let flattened: Vec<f32> = features.iter().flat_map(|frame| frame.iter().copied()).collect();
        let input = Array3::from_shape_vec((1, frames, feature_dim), flattened)
            .map_err(|e| anyhow!("Failed to build embedding input tensor: {}", e))?;

        let outputs = self.session.run(inputs![
            "feats" => TensorRef::from_array_view(input.view())?
        ])?;

        let output = outputs
            .get("embs")
            .ok_or_else(|| anyhow!("Speaker embedding model returned no outputs"))?;

        let embedding = output
            .try_extract_array::<f32>()?
            .into_dimensionality::<Ix2>()
            .map_err(|_| anyhow!("Unexpected embedding tensor shape"))?;

        if embedding.nrows() == 0 {
            return Err(anyhow!("Embedding tensor is empty"));
        }

        Ok(embedding.row(0).to_vec())
    }
}
