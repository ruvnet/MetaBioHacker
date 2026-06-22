//! Butterworth IIR filters for ultrasound signal conditioning.
//!
//! Implements 2nd-order sections (biquad) using the bilinear transform
//! so the filter is efficient, stable, and zero-external-dep.

/// Second-order IIR filter section (biquad).
///
/// Coefficients in Direct Form II transposed:
///   y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2]
///          - a1*y[n-1] - a2*y[n-2]
#[derive(Debug, Clone)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b32: f32,
    a1: f32,
    a2: f32,
    s1: f32, // state
    s2: f32,
}

impl Biquad {
    pub fn new(b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0,
            b1,
            b32: b2,
            a1,
            a2,
            s1: 0.0,
            s2: 0.0,
        }
    }

    pub fn process_sample(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.s1;
        self.s1 = self.b1 * x - self.a1 * y + self.s2;
        self.s2 = self.b32 * x - self.a2 * y;
        y
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

/// 2nd-order Butterworth bandpass filter.
///
/// - `fs_hz`   — sample rate (Hz)
/// - `f_low`   — lower −3 dB frequency (Hz)
/// - `f_high`  — upper −3 dB frequency (Hz)
#[derive(Debug, Clone)]
pub struct ButterworthBandpass {
    sections: Vec<Biquad>,
}

impl ButterworthBandpass {
    /// Design a 2nd-order Butterworth bandpass using the bilinear transform.
    pub fn new(fs_hz: f32, f_low: f32, f_high: f32) -> Self {
        use core::f32::consts::PI;
        // Pre-warp critical frequencies
        let wl = 2.0 * (PI * f_low / fs_hz).tan();
        let wh = 2.0 * (PI * f_high / fs_hz).tan();
        let bw = wh - wl;
        let w0_sq = wl * wh;

        // Bandpass transformation of a 2nd-order Butterworth lowpass
        // Transfer function: H(s) = bw*s / (s^2 + bw*s + w0^2)
        // After bilinear transform (s = 2*(z-1)/(z+1)):
        // Bilinear transform of H(s) = bw·s / (s² + bw·s + w0²)
        // Numerator after BLT: 2·bw·(z² - 1), denominator: a0·z² + …
        // b0 = 2·bw/a0  (factor of 2 comes from 2·bw in the BLT numerator)
        let a0 = 4.0 + 2.0 * bw + w0_sq;
        let b0 = 2.0 * bw / a0;
        let b1 = 0.0;
        let b2 = -2.0 * bw / a0;
        let a1 = (2.0 * w0_sq - 8.0) / a0;
        let a2 = (4.0 - 2.0 * bw + w0_sq) / a0;

        Self {
            sections: vec![Biquad::new(b0, b1, b2, a1, a2)],
        }
    }

    /// Filter a signal in place (single forward pass).
    pub fn filter(&mut self, signal: &[f32]) -> Vec<f32> {
        for s in &mut self.sections {
            s.reset();
        }
        signal
            .iter()
            .map(|&x| {
                let mut y = x;
                for s in &mut self.sections {
                    y = s.process_sample(y);
                }
                y
            })
            .collect()
    }

    /// Zero-phase filter (forward + backward pass).
    pub fn filtfilt(&mut self, signal: &[f32]) -> Vec<f32> {
        let fwd = self.filter(signal);
        let rev: Vec<f32> = fwd.iter().rev().cloned().collect();
        let bwd = self.filter(&rev);
        bwd.iter().rev().cloned().collect()
    }
}

/// Simple FIR low-pass filter using a Hann-windowed sinc kernel.
pub fn lowpass_fir(signal: &[f32], fs_hz: f32, cutoff_hz: f32, taps: usize) -> Vec<f32> {
    use core::f32::consts::PI;
    let fc = cutoff_hz / fs_hz;
    let half = (taps / 2) as isize;
    let kernel: Vec<f32> = (-(half)..=half)
        .map(|i| {
            let i_f = i as f32;
            let sinc = if i == 0 {
                2.0 * PI * fc
            } else {
                (2.0 * PI * fc * i_f).sin() / i_f
            };
            // Hann window
            let w = 0.5 * (1.0 - (2.0 * PI * (i_f + half as f32) / (taps as f32 - 1.0)).cos());
            sinc * w
        })
        .collect();
    let norm: f32 = kernel.iter().sum::<f32>();
    let kernel: Vec<f32> = kernel.iter().map(|&k| k / norm).collect();

    // Linear convolution (trim to input length)
    let mut out = vec![0.0f32; signal.len()];
    for (i, o) in out.iter_mut().enumerate() {
        let mut acc = 0.0f32;
        for (j, &k) in kernel.iter().enumerate() {
            let si = i as isize + j as isize - half;
            if si >= 0 && si < signal.len() as isize {
                acc += signal[si as usize] * k;
            }
        }
        *o = acc;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f32::consts::PI;

    #[test]
    fn bandpass_attenuates_dc() {
        let fs = 40_000.0;
        let dc: Vec<f32> = vec![1.0; 256];
        let mut bp = ButterworthBandpass::new(fs, 1000.0, 10000.0);
        let out = bp.filtfilt(&dc);
        // DC should be strongly attenuated after settling
        let rms: f32 = (out[64..].iter().map(|&x| x * x).sum::<f32>() / 192.0).sqrt();
        assert!(rms < 0.1, "DC not attenuated: rms={rms}");
    }

    #[test]
    fn bandpass_passes_inband_tone() {
        let fs = 40_000_000.0; // 40 MHz — typical USCT ADC rate
        let f_in = 3_000_000.0; // 3 MHz — inside 2–5 MHz transducer band
        let n = 512;
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * f_in * i as f32 / fs).sin())
            .collect();
        let mut bp = ButterworthBandpass::new(fs, 2_000_000.0, 5_000_000.0);
        let out = bp.filtfilt(&signal);
        // In-band tone should have RMS close to 1/√2
        let rms: f32 = (out[64..].iter().map(|&x| x * x).sum::<f32>() / (n - 64) as f32).sqrt();
        assert!(rms > 0.5, "In-band tone attenuated too much: rms={rms}");
    }
}
