//! Hilbert-transform envelope detector.
//!
//! Algorithm:
//!  1. FFT of the real signal
//!  2. Zero negative-frequency bins; double positive-frequency bins
//!  3. IFFT → analytic signal
//!  4. Magnitude of analytic signal = amplitude envelope

use super::fft::{fft_inplace, ifft_inplace};

/// Compute the amplitude envelope of a real signal via the Hilbert transform.
///
/// Returns a vector of the same length as `signal` containing instantaneous
/// amplitude (always non-negative). Useful for B-mode-like display and
/// matched-filter output visualisation.
pub fn hilbert_envelope(signal: &[f32]) -> Vec<f32> {
    let n = signal.len().next_power_of_two();
    let mut buf = vec![0.0f32; 2 * n];

    // Load signal (zero-pad to power of two)
    for (i, &x) in signal.iter().enumerate() {
        buf[2 * i] = x;
    }

    fft_inplace(&mut buf);

    // Apply the analytic signal mask in frequency domain:
    //   bin 0 and bin n/2 (Nyquist) → unchanged
    //   bins 1 .. n/2-1 → multiply by 2
    //   bins n/2+1 .. n-1 → set to 0
    let n_bins = n;
    for k in 1..n_bins {
        if k < n_bins / 2 {
            buf[2 * k] *= 2.0;
            buf[2 * k + 1] *= 2.0;
        } else if k > n_bins / 2 {
            buf[2 * k] = 0.0;
            buf[2 * k + 1] = 0.0;
        }
    }

    ifft_inplace(&mut buf);

    // Normalise and extract magnitude
    let nf = n as f32;
    (0..signal.len())
        .map(|i| {
            let re = buf[2 * i] / nf;
            let im = buf[2 * i + 1] / nf;
            (re * re + im * im).sqrt()
        })
        .collect()
}

/// Instantaneous phase of the analytic signal (radians).
pub fn instantaneous_phase(signal: &[f32]) -> Vec<f32> {
    let n = signal.len().next_power_of_two();
    let mut buf = vec![0.0f32; 2 * n];
    for (i, &x) in signal.iter().enumerate() {
        buf[2 * i] = x;
    }
    fft_inplace(&mut buf);
    let n_bins = n;
    for k in 1..n_bins {
        if k < n_bins / 2 {
            buf[2 * k] *= 2.0;
            buf[2 * k + 1] *= 2.0;
        } else if k > n_bins / 2 {
            buf[2 * k] = 0.0;
            buf[2 * k + 1] = 0.0;
        }
    }
    ifft_inplace(&mut buf);
    let nf = n as f32;
    (0..signal.len())
        .map(|i| (buf[2 * i + 1] / nf).atan2(buf[2 * i] / nf))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f32::consts::PI;

    #[test]
    fn envelope_of_sine_is_near_constant() {
        let n = 256;
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 8.0 * i as f32 / n as f32).sin())
            .collect();
        let env = hilbert_envelope(&signal);
        // Envelope of a pure sine should be close to 1.0 everywhere (excluding edges)
        for &e in &env[8..n - 8] {
            assert!(
                (e - 1.0).abs() < 0.05,
                "envelope value {e} not close to 1.0"
            );
        }
    }

    #[test]
    fn envelope_always_nonneg() {
        let signal: Vec<f32> = (0..64)
            .map(|i| (i as f32 * 0.7).sin() * (i as f32 * -0.05).exp())
            .collect();
        for e in hilbert_envelope(&signal) {
            assert!(e >= 0.0);
        }
    }
}
