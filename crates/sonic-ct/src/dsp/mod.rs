//! Digital Signal Processing (DSP) module for Sonic Chamber USCT.
//!
//! Provides the full signal-conditioning pipeline for ultrasound RF data:
//!
//! ```text
//! Raw RF signal
//!   → Bandpass filter  (remove out-of-band noise)
//!   → TGC              (compensate depth attenuation)
//!   → Matched filter   (pulse compression, maximise SNR)
//!   → Hilbert envelope (B-mode display, amplitude extraction)
//!   → Reconstruction   (SART / FWI)
//! ```
//!
//! All implementations are zero-external-dep (ADR-0001) and compile to WASM.

pub mod envelope;
pub mod fft;
pub mod filter;
pub mod matched;
pub mod tgc;

pub use envelope::{hilbert_envelope, instantaneous_phase};
pub use filter::{lowpass_fir, ButterworthBandpass};
pub use matched::{matched_filter, pulse_width_6db, ricker_wavelet, snr_db};
pub use tgc::{apply_tgc, estimate_attenuation_slope, remove_tgc};

/// Full USCT signal-conditioning pipeline.
///
/// Applies bandpass filtering, TGC, and matched filtering in sequence.
/// Suitable for pre-processing raw ADC traces before TOF picking or FWI.
///
/// # Parameters
/// - `rf`                — raw RF trace (ADC samples)
/// - `fs_hz`             — ADC sample rate (Hz)
/// - `f_low_hz`          — bandpass lower edge (Hz); typically 0.5 × f_centre
/// - `f_high_hz`         — bandpass upper edge (Hz); typically 1.5 × f_centre
/// - `f_centre_mhz`      — transducer centre frequency (MHz) for TGC
/// - `alpha_db_mhz_cm`   — attenuation coefficient (dB/(MHz·cm)); tissue ~0.5
/// - `pulse`             — transmitted pulse waveform for matched filtering
///                         (pass empty slice to skip matched filtering)
pub fn condition_rf(
    rf: &[f32],
    fs_hz: f32,
    f_low_hz: f32,
    f_high_hz: f32,
    f_centre_mhz: f32,
    alpha_db_mhz_cm: f32,
    pulse: &[f32],
) -> ConditionedRf {
    // Step 1: bandpass filter
    let mut bp = ButterworthBandpass::new(fs_hz, f_low_hz, f_high_hz);
    let filtered = bp.filtfilt(rf);

    // Step 2: time-gain compensation
    let tgc_out = apply_tgc(
        &filtered,
        fs_hz,
        alpha_db_mhz_cm,
        f_centre_mhz,
        1480.0,
        60.0,
    );

    // Step 3: matched filtering (optional)
    let mf_out = if pulse.is_empty() {
        tgc_out.clone()
    } else {
        matched_filter(&tgc_out, pulse)
    };

    // Step 4: Hilbert envelope
    let envelope = hilbert_envelope(&mf_out);

    let snr = snr_db(&mf_out, 64.min(mf_out.len() / 8));

    ConditionedRf {
        filtered,
        tgc: tgc_out,
        matched: mf_out,
        envelope,
        snr_db: snr,
    }
}

/// Output of the full USCT conditioning pipeline.
pub struct ConditionedRf {
    /// After bandpass filter
    pub filtered: Vec<f32>,
    /// After time-gain compensation
    pub tgc: Vec<f32>,
    /// After matched filtering (or TGC if no pulse given)
    pub matched: Vec<f32>,
    /// Hilbert amplitude envelope
    pub envelope: Vec<f32>,
    /// Estimated signal-to-noise ratio (dB)
    pub snr_db: f32,
}
