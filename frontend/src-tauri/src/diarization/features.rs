use anyhow::{anyhow, Result};
use realfft::RealFftPlanner;

#[derive(Debug, Clone)]
pub struct FeatureExtractionConfig {
    pub sample_rate: u32,
    pub feature_dim: usize,
    pub low_freq: f32,
    pub high_freq: f32,
    pub frame_length_ms: f32,
    pub frame_shift_ms: f32,
    pub preemphasis: f32,
    pub window_exponent: f32,
    pub dither: f32,
    pub normalize_samples: bool,
    pub snip_edges: bool,
}

impl Default for FeatureExtractionConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            feature_dim: 80,
            low_freq: 20.0,
            high_freq: -400.0,
            frame_length_ms: 25.0,
            frame_shift_ms: 10.0,
            preemphasis: 0.97,
            window_exponent: 0.85,
            dither: 0.0,
            normalize_samples: true,
            snip_edges: false,
        }
    }
}

pub fn extract_fbank_features(samples: &[f32], config: &FeatureExtractionConfig) -> Result<Vec<Vec<f32>>> {
    if samples.is_empty() {
        return Err(anyhow!("Audio slice is empty"));
    }

    if config.sample_rate != 16_000 {
        return Err(anyhow!(
            "This diarization feature extractor currently expects 16 kHz audio, got {} Hz",
            config.sample_rate
        ));
    }

    let mut samples = samples.to_vec();
    if config.normalize_samples {
        normalize_in_place(&mut samples);
    }

    if config.dither > 0.0 {
        apply_dither(&mut samples, config.dither);
    }

    let samples = preemphasize(&samples, config.preemphasis);
    let frame_length = ((config.frame_length_ms * config.sample_rate as f32) / 1000.0).round() as usize;
    let frame_shift = ((config.frame_shift_ms * config.sample_rate as f32) / 1000.0).round() as usize;

    if frame_length == 0 || frame_shift == 0 {
        return Err(anyhow!("Invalid fbank configuration"));
    }

    let fft_size = frame_length.next_power_of_two();
    let mel_filters = build_mel_filter_bank(
        config.sample_rate,
        fft_size,
        config.feature_dim,
        config.low_freq,
        config.high_freq,
    )?;

    let num_frames = compute_num_frames(samples.len(), frame_length, frame_shift, config.snip_edges);
    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(fft_size);
    let window = povey_window(frame_length, config.window_exponent);

    let mut features = Vec::with_capacity(num_frames);
    for frame_index in 0..num_frames {
        let mut frame = extract_frame(&samples, frame_index, frame_length, frame_shift, config.snip_edges);
        for (sample, weight) in frame.iter_mut().zip(window.iter()) {
            *sample *= *weight;
        }
        frame.resize(fft_size, 0.0);

        let mut spectrum = r2c.make_output_vec();
        r2c.process(&mut frame, &mut spectrum)
            .map_err(|e| anyhow!("FFT failed: {}", e))?;

        let mut feature = Vec::with_capacity(config.feature_dim);
        for mel_filter in &mel_filters {
            let mut energy = 0.0f32;
            for (bin, weight) in spectrum.iter().zip(mel_filter.iter()) {
                energy += bin.norm_sqr() * weight;
            }
            feature.push(energy.max(1e-10).ln() + 20.0);
        }

        features.push(feature);
    }

    Ok(features)
}

fn normalize_in_place(samples: &mut [f32]) {
    let max_abs = samples
        .iter()
        .filter(|sample| sample.is_finite())
        .map(|sample| sample.abs())
        .fold(0.0f32, f32::max);

    if max_abs > 1.0 {
        let scale = 1.0 / max_abs;
        for sample in &mut *samples {
            *sample *= scale;
        }
    }

    for sample in &mut *samples {
        if !sample.is_finite() {
            *sample = 0.0;
        } else {
            *sample = sample.clamp(-1.0, 1.0);
        }
    }
}

fn apply_dither(samples: &mut [f32], dither: f32) {
    if dither <= 0.0 {
        return;
    }

    let mut state: u64 = 0x9E3779B97F4A7C15;
    for sample in samples {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
        let noise = ((state >> 32) as u32 as f32 / u32::MAX as f32) - 0.5;
        *sample += noise * dither;
    }
}

fn preemphasize(samples: &[f32], coeff: f32) -> Vec<f32> {
    if coeff <= 0.0 || samples.len() < 2 {
        return samples.to_vec();
    }

    let mut output = Vec::with_capacity(samples.len());
    output.push(samples[0]);
    for index in 1..samples.len() {
        output.push(samples[index] - coeff * samples[index - 1]);
    }
    output
}

fn compute_num_frames(sample_count: usize, frame_length: usize, frame_shift: usize, snip_edges: bool) -> usize {
    if sample_count == 0 {
        return 0;
    }

    if snip_edges {
        if sample_count < frame_length {
            return 0;
        }
        1 + (sample_count - frame_length) / frame_shift
    } else {
        ((sample_count + frame_shift / 2) / frame_shift).max(1)
    }
}

fn extract_frame(
    samples: &[f32],
    frame_index: usize,
    frame_length: usize,
    frame_shift: usize,
    snip_edges: bool,
) -> Vec<f32> {
    let mut frame = vec![0.0f32; frame_length];
    let start = if snip_edges {
        frame_index as isize * frame_shift as isize
    } else {
        frame_index as isize * frame_shift as isize - frame_length as isize / 2
    };

    for (offset, sample) in frame.iter_mut().enumerate() {
        let index = start + offset as isize;
        *sample = if snip_edges {
            samples.get(index as usize).copied().unwrap_or(0.0)
        } else {
            samples[reflect_index(index, samples.len())]
        };
    }

    frame
}

fn reflect_index(mut index: isize, len: usize) -> usize {
    if len <= 1 {
        return 0;
    }

    let len = len as isize;
    while index < 0 || index >= len {
        if index < 0 {
            index = -index - 1;
        } else {
            index = 2 * len - index - 1;
        }
    }

    index as usize
}

fn povey_window(length: usize, exponent: f32) -> Vec<f32> {
    if length == 0 {
        return Vec::new();
    }

    let denom = (length - 1).max(1) as f32;
    (0..length)
        .map(|index| {
            let ratio = index as f32 / denom;
            let hamming = 0.5 - 0.5 * (2.0 * std::f32::consts::PI * ratio).cos();
            hamming.powf(exponent)
        })
        .collect()
}

fn build_mel_filter_bank(
    sample_rate: u32,
    fft_size: usize,
    mel_bins: usize,
    low_freq: f32,
    high_freq: f32,
) -> Result<Vec<Vec<f32>>> {
    let nyquist = sample_rate as f32 / 2.0;
    let high_freq = if high_freq < 0.0 {
        nyquist + high_freq
    } else {
        high_freq
    };

    if high_freq <= low_freq {
        return Err(anyhow!("Invalid mel filter bounds"));
    }

    let mel_min = hz_to_mel(low_freq.max(0.0));
    let mel_max = hz_to_mel(high_freq.min(nyquist));
    let mel_points: Vec<f32> = (0..(mel_bins + 2))
        .map(|index| {
            let ratio = index as f32 / (mel_bins + 1) as f32;
            mel_to_hz(mel_min + (mel_max - mel_min) * ratio)
        })
        .collect();

    let bin_count = fft_size / 2 + 1;
    let frequencies: Vec<f32> = (0..bin_count)
        .map(|bin| bin as f32 * sample_rate as f32 / fft_size as f32)
        .collect();

    let mut filters = vec![vec![0.0f32; bin_count]; mel_bins];
    for mel_index in 0..mel_bins {
        let left = mel_points[mel_index];
        let center = mel_points[mel_index + 1];
        let right = mel_points[mel_index + 2];

        for (bin_index, frequency) in frequencies.iter().enumerate() {
            let weight = if *frequency <= left || *frequency >= right {
                0.0
            } else if *frequency <= center {
                ((*frequency - left) / (center - left)).max(0.0)
            } else {
                ((right - *frequency) / (right - center)).max(0.0)
            };

            filters[mel_index][bin_index] = weight;
        }
    }

    Ok(filters)
}

fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10f32.powf(mel / 2595.0) - 1.0)
}
