//! Time-Gain Compensation (TGC) for ultrasound RF signals.
//!
//! Compensates for the exponential attenuation of acoustic energy with depth
//! so that deep and shallow structures have comparable display amplitude.
//!
//! Attenuation model:  α_total = α_dB_per_MHz_per_cm × f_MHz × depth_cm
//! TGC gain:          g(t) = exp(α_Np × c × t / 2)
//!   where α_Np = α_dB × ln(10) / 20  and  c is speed of sound (m/s)

/// Apply time-gain compensation to an RF trace.
///
/// # Parameters
/// - `signal`   — RF samples in time order
/// - `fs_hz`    — ADC sample rate (Hz)
/// - `alpha_db_per_mhz_per_cm` — tissue attenuation coefficient (dB MHz⁻¹ cm⁻¹)
///                                Typical tissue: 0.5 dB/(MHz·cm)
/// - `f_mhz`    — transducer centre frequency (MHz)
/// - `c_mps`    — speed of sound in coupling medium (m/s), default 1480 (water)
/// - `max_gain_db` — gain ceiling to prevent noise blow-up at long ranges (dB)
pub fn apply_tgc(
    signal: &[f32],
    fs_hz: f32,
    alpha_db_per_mhz_per_cm: f32,
    f_mhz: f32,
    c_mps: f32,
    max_gain_db: f32,
) -> Vec<f32> {
    let alpha_db_per_m = alpha_db_per_mhz_per_cm * f_mhz * 100.0; // dB/m
    let alpha_np_per_m = alpha_db_per_m * 10.0_f32.ln() / 20.0; // Np/m
    let max_gain_linear = 10.0_f32.powf(max_gain_db / 20.0);

    signal
        .iter()
        .enumerate()
        .map(|(i, &x)| {
            // Two-way travel: depth = c × t / 2
            let t = i as f32 / fs_hz;
            let depth_m = c_mps * t / 2.0;
            let gain = (alpha_np_per_m * depth_m).exp().min(max_gain_linear);
            x * gain
        })
        .collect()
}

/// Remove TGC (inverse compensation) — used when converting from display data
/// back to raw RF for further processing.
pub fn remove_tgc(
    signal: &[f32],
    fs_hz: f32,
    alpha_db_per_mhz_per_cm: f32,
    f_mhz: f32,
    c_mps: f32,
) -> Vec<f32> {
    let alpha_db_per_m = alpha_db_per_mhz_per_cm * f_mhz * 100.0;
    let alpha_np_per_m = alpha_db_per_m * 10.0_f32.ln() / 20.0;

    signal
        .iter()
        .enumerate()
        .map(|(i, &x)| {
            let t = i as f32 / fs_hz;
            let depth_m = c_mps * t / 2.0;
            let gain = (alpha_np_per_m * depth_m).exp();
            if gain > 1e-6 {
                x / gain
            } else {
                0.0
            }
        })
        .collect()
}

/// Estimate the attenuation slope from a signal by fitting a linear model
/// to the log-envelope decay. Returns α_dB_per_sample.
pub fn estimate_attenuation_slope(signal: &[f32]) -> f32 {
    use super::envelope::hilbert_envelope;
    let env = hilbert_envelope(signal);
    let n = env.len();
    let log_env: Vec<f32> = env.iter().map(|&e| e.max(1e-10).log10() * 20.0).collect();

    // Least-squares linear fit to log-envelope vs. sample index
    let xi_mean = (n as f32 - 1.0) / 2.0;
    let yi_mean = log_env.iter().sum::<f32>() / n as f32;
    let num: f32 = log_env
        .iter()
        .enumerate()
        .map(|(i, &y)| (i as f32 - xi_mean) * (y - yi_mean))
        .sum();
    let den: f32 = (0..n).map(|i| (i as f32 - xi_mean).powi(2)).sum();
    if den.abs() < 1e-10 {
        0.0
    } else {
        num / den
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tgc_amplifies_late_samples() {
        let fs = 40e6;
        let signal = vec![1.0f32; 1000];
        let out = apply_tgc(&signal, fs, 0.5, 3.0, 1480.0, 60.0);
        assert!(out[999] > out[0], "TGC should amplify later samples");
        assert!(out[0] <= 1.01, "First sample gain should be ≤1");
    }

    #[test]
    fn tgc_roundtrip() {
        let fs = 10e6;
        let original: Vec<f32> = (0..64).map(|i| (i as f32 * 0.4).sin()).collect();
        let compensated = apply_tgc(&original, fs, 0.5, 2.0, 1480.0, 40.0);
        let recovered = remove_tgc(&compensated, fs, 0.5, 2.0, 1480.0);
        for (a, b) in original.iter().zip(recovered.iter()) {
            assert!((a - b).abs() < 1e-4, "TGC roundtrip error: {a} vs {b}");
        }
    }
}
