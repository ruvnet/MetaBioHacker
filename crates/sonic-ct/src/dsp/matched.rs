//! Matched filtering and pulse compression for USCT signals.
//!
//! Matched filtering maximises SNR for a known transmitted pulse shape by
//! correlating the received signal with the time-reversed conjugate of the
//! transmitted pulse. In USCT this compresses the pulse from ~μs to ~10 ns,
//! improving range resolution by the time-bandwidth product.

use super::fft::{fft_inplace, ifft_inplace};

/// Compute the matched filter output of `received` for transmitted pulse `pulse`.
///
/// Equivalent to cross-correlation: `out[k] = Σ_n pulse[n] × received[n+k]`
///
/// Returns a vector of the same length as `received`.
pub fn matched_filter(received: &[f32], pulse: &[f32]) -> Vec<f32> {
    let n = (received.len() + pulse.len()).next_power_of_two();

    // FFT of received signal
    let mut rx_buf = vec![0.0f32; 2 * n];
    for (i, &x) in received.iter().enumerate() {
        rx_buf[2 * i] = x;
    }
    fft_inplace(&mut rx_buf);

    // FFT of time-reversed pulse (= complex conjugate in frequency domain)
    let mut pulse_buf = vec![0.0f32; 2 * n];
    for (i, &p) in pulse.iter().enumerate() {
        pulse_buf[2 * i] = p; // pulse is real, so conjugate = same
    }
    fft_inplace(&mut pulse_buf);

    // Multiply: Y[k] = RX[k] × conj(PULSE[k])
    let mut out_buf = vec![0.0f32; 2 * n];
    for k in 0..n {
        let rx_re = rx_buf[2 * k];
        let rx_im = rx_buf[2 * k + 1];
        let p_re = pulse_buf[2 * k];
        let p_im = -pulse_buf[2 * k + 1]; // conjugate
        out_buf[2 * k] = rx_re * p_re - rx_im * p_im;
        out_buf[2 * k + 1] = rx_re * p_im + rx_im * p_re;
    }

    ifft_inplace(&mut out_buf);
    let nf = n as f32;
    // Return first `received.len()` samples, normalised
    out_buf[..received.len()]
        .iter()
        .step_by(2)
        .chain(std::iter::repeat(&0.0))
        .take(received.len())
        .zip(0..)
        .map(|_| 0.0) // placeholder — real impl below
        .collect::<Vec<_>>();

    // Correct implementation: extract every 2nd element (real part)
    (0..received.len()).map(|i| out_buf[2 * i] / nf).collect()
}

/// Generate a Ricker wavelet (Mexican hat) — the standard USCT transmitted pulse.
///
/// - `n_samples` — number of samples to generate
/// - `f_centre`  — centre frequency (Hz)
/// - `fs`        — sample rate (Hz)
pub fn ricker_wavelet(n_samples: usize, f_centre: f32, fs: f32) -> Vec<f32> {
    use core::f32::consts::PI;
    let half = n_samples as f32 / 2.0;
    (0..n_samples)
        .map(|i| {
            let t = (i as f32 - half) / fs;
            let u = (PI * f_centre * t).powi(2);
            (1.0 - 2.0 * u) * (-u).exp()
        })
        .collect()
}

/// Signal-to-noise ratio (SNR) estimate in dB.
///
/// - `signal`  — input waveform
/// - `noise_window` — number of tail samples assumed to be noise-only
pub fn snr_db(signal: &[f32], noise_window: usize) -> f32 {
    let n = signal.len();
    if n <= noise_window {
        return 0.0;
    }
    let noise_rms_sq = signal[n - noise_window..]
        .iter()
        .map(|&x| x * x)
        .sum::<f32>()
        / noise_window as f32;
    let peak_sq = signal.iter().map(|&x| x * x).fold(0.0f32, f32::max);

    if noise_rms_sq < 1e-20 {
        return 60.0; // clip at 60 dB
    }
    10.0 * (peak_sq / noise_rms_sq).log10()
}

/// Measure the −6 dB pulse width (range resolution) of a matched-filter output.
/// Returns width in samples.
pub fn pulse_width_6db(mf_output: &[f32]) -> usize {
    let peak = mf_output.iter().map(|&x| x.abs()).fold(0.0f32, f32::max);
    let threshold = peak * 0.5; // −6 dB = ×0.5 amplitude
    let peak_idx = mf_output
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap())
        .map(|(i, _)| i)
        .unwrap_or(0);

    let mut left = peak_idx;
    while left > 0 && mf_output[left].abs() > threshold {
        left -= 1;
    }
    let mut right = peak_idx;
    while right < mf_output.len() - 1 && mf_output[right].abs() > threshold {
        right += 1;
    }
    right - left
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ricker_is_zero_mean() {
        let w = ricker_wavelet(256, 3e6, 40e6);
        let mean: f32 = w.iter().sum::<f32>() / w.len() as f32;
        assert!(mean.abs() < 1e-4, "Ricker wavelet not zero-mean: {mean}");
    }

    #[test]
    fn matched_filter_peak_at_delay() {
        let fs = 40e6_f32;
        let pulse = ricker_wavelet(32, 3e6, fs);
        let delay = 100usize;
        let mut rx = vec![0.0f32; delay + pulse.len() + 64];
        for (i, &p) in pulse.iter().enumerate() {
            rx[delay + i] = p;
        }
        let mf = matched_filter(&rx, &pulse);
        let peak_idx = mf
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap())
            .map(|(i, _)| i)
            .unwrap_or(0);
        // Cross-correlation peak is at the lag equal to the signal delay.
        // The Ricker wavelet is symmetric, so the peak lag ≈ delay.
        assert!(
            peak_idx.abs_diff(delay) < 8,
            "MF peak at {peak_idx}, expected near delay={delay}"
        );
    }

    #[test]
    fn snr_db_silent_noise() {
        let mut sig = vec![0.0f32; 256];
        sig[100] = 1.0; // impulse
        let snr = snr_db(&sig, 32);
        assert!(
            snr > 30.0,
            "SNR should be high for impulse in silence: {snr}"
        );
    }
}
