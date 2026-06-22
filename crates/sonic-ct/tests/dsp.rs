//! Integration tests for the DSP module.
//!
//! Validates the full signal-conditioning pipeline on synthetic ultrasound
//! signals: a Ricker wavelet delayed in white noise, conditioned end-to-end.

use sonic_ct::dsp::{
    apply_tgc, condition_rf, hilbert_envelope, matched_filter, ricker_wavelet, snr_db,
    ButterworthBandpass,
};

const FS: f32 = 40_000_000.0; // 40 MHz ADC
const F_CENTRE_MHZ: f32 = 3.0; // 3 MHz transducer
const F_LOW: f32 = 1_500_000.0;
const F_HIGH: f32 = 5_500_000.0;

fn noisy_ricker(delay_samples: usize, snr_target_db: f32) -> Vec<f32> {
    use core::f32::consts::PI;
    let pulse = ricker_wavelet(64, F_CENTRE_MHZ * 1e6, FS);
    let n = delay_samples + pulse.len() + 512;
    let noise_amp = 10.0_f32.powf(-snr_target_db / 20.0);
    // Deterministic LCG noise (no std, no external crate)
    let mut rng = 0x1234_5678u64;
    let mut signal = vec![0.0f32; n];
    for (i, &p) in pulse.iter().enumerate() {
        signal[delay_samples + i] = p;
    }
    for s in &mut signal {
        rng = rng.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
        let noise = (rng as f32 / u64::MAX as f32 - 0.5) * 2.0 * noise_amp;
        *s += noise;
    }
    signal
}

#[test]
fn bandpass_improves_snr() {
    let raw = noisy_ricker(200, 10.0); // 10 dB input SNR
    let raw_snr = snr_db(&raw, 64);

    let mut bp = ButterworthBandpass::new(FS, F_LOW, F_HIGH);
    let filtered = bp.filtfilt(&raw);
    let filtered_snr = snr_db(&filtered, 64);

    assert!(
        filtered_snr >= raw_snr,
        "Bandpass should not degrade SNR: raw={raw_snr:.1} dB, filtered={filtered_snr:.1} dB"
    );
}

#[test]
fn matched_filter_localises_pulse() {
    let pulse = ricker_wavelet(64, F_CENTRE_MHZ * 1e6, FS);
    let delay = 300usize;
    let raw = noisy_ricker(delay, 20.0);
    let mf = matched_filter(&raw, &pulse);

    let peak_idx = mf
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap())
        .map(|(i, _)| i)
        .unwrap_or(0);

    // Cross-correlation peak appears at the lag = delay (not delay + half-pulse).
    assert!(
        peak_idx.abs_diff(delay) < 10,
        "MF peak at sample {peak_idx}, expected near delay={delay}"
    );
}

#[test]
fn tgc_amplitude_monotone_increasing() {
    let dc = vec![1.0f32; 512];
    let out = apply_tgc(&dc, FS, 0.5, F_CENTRE_MHZ, 1480.0, 60.0);
    // Each sample should be ≥ the previous
    for w in out.windows(2) {
        assert!(
            w[1] >= w[0],
            "TGC gain not monotone: w[0]={}, w[1]={}",
            w[0],
            w[1]
        );
    }
}

#[test]
fn hilbert_envelope_captures_pulse_location() {
    let pulse = ricker_wavelet(64, F_CENTRE_MHZ * 1e6, FS);
    let delay = 128usize;
    let mut sig = vec![0.0f32; delay + pulse.len() + 128];
    for (i, &p) in pulse.iter().enumerate() {
        sig[delay + i] = p;
    }
    let env = hilbert_envelope(&sig);
    let peak_idx = env
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .map(|(i, _)| i)
        .unwrap_or(0);
    assert!(
        peak_idx.abs_diff(delay + pulse.len() / 2) < 8,
        "Envelope peak at {peak_idx}, expected near {}",
        delay + pulse.len() / 2
    );
}

#[test]
fn full_pipeline_runs_and_snr_positive() {
    let pulse = ricker_wavelet(64, F_CENTRE_MHZ * 1e6, FS);
    let raw = noisy_ricker(200, 15.0);
    let result = condition_rf(&raw, FS, F_LOW, F_HIGH, F_CENTRE_MHZ, 0.5, &pulse);
    assert!(
        result.snr_db > 0.0,
        "Conditioned SNR should be positive: {:.1} dB",
        result.snr_db
    );
    assert_eq!(result.envelope.len(), raw.len());
}
