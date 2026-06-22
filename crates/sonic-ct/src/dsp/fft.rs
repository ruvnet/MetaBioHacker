//! Pure-Rust Cooley-Tukey radix-2 FFT (zero external deps, ADR-0001).
//!
//! Operates on complex pairs stored as interleaved `[re0, im0, re1, im1, …]`.
//! Input length must be a power of two.

use core::f32::consts::PI;

/// In-place radix-2 DIT FFT on `buf` (interleaved complex f32, length 2*N).
/// `N` must be a power of two.
pub fn fft_inplace(buf: &mut [f32]) {
    let n = buf.len() / 2;
    debug_assert!(n.is_power_of_two(), "FFT length must be a power of two");
    bit_reverse_permute(buf);
    let mut step = 1usize;
    while step < n {
        let half = step;
        step *= 2;
        let angle = -PI / half as f32;
        for k in (0..n).step_by(step) {
            for j in 0..half {
                let theta = angle * j as f32;
                let wr = theta.cos();
                let wi = theta.sin();
                let u_re = buf[2 * (k + j)];
                let u_im = buf[2 * (k + j) + 1];
                let v_re = wr * buf[2 * (k + j + half)] - wi * buf[2 * (k + j + half) + 1];
                let v_im = wr * buf[2 * (k + j + half) + 1] + wi * buf[2 * (k + j + half)];
                buf[2 * (k + j)] = u_re + v_re;
                buf[2 * (k + j) + 1] = u_im + v_im;
                buf[2 * (k + j + half)] = u_re - v_re;
                buf[2 * (k + j + half) + 1] = u_im - v_im;
            }
        }
    }
}

/// In-place inverse FFT (IFFT). Output is not divided by N — caller normalises.
pub fn ifft_inplace(buf: &mut [f32]) {
    // Conjugate → FFT → conjugate = IFFT (unnormalised)
    for i in (1..buf.len()).step_by(2) {
        buf[i] = -buf[i];
    }
    fft_inplace(buf);
    for i in (1..buf.len()).step_by(2) {
        buf[i] = -buf[i];
    }
}

/// Compute the real FFT of a real-valued signal.
/// Returns a complex buffer (interleaved re/im) of length 2 × next_pow2(signal).
pub fn rfft(signal: &[f32]) -> Vec<f32> {
    let n = signal.len().next_power_of_two();
    let mut buf = vec![0.0f32; 2 * n];
    for (i, &x) in signal.iter().enumerate() {
        buf[2 * i] = x;
    }
    fft_inplace(&mut buf);
    buf
}

/// Compute the magnitude spectrum from an FFT buffer (interleaved re/im).
pub fn magnitude(fft_buf: &[f32]) -> Vec<f32> {
    fft_buf
        .chunks(2)
        .map(|c| (c[0] * c[0] + c[1] * c[1]).sqrt())
        .collect()
}

fn bit_reverse_permute(buf: &mut [f32]) {
    let n = buf.len() / 2;
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            buf.swap(2 * i, 2 * j);
            buf.swap(2 * i + 1, 2 * j + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_of_dc_is_delta() {
        let mut buf = vec![1.0f32, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
        fft_inplace(&mut buf);
        // DC bin should be N
        assert!((buf[0] - 4.0).abs() < 1e-4);
        // All other bins near zero
        for c in buf[2..].chunks(2) {
            assert!(c[0].abs() < 1e-4 && c[1].abs() < 1e-4);
        }
    }

    #[test]
    fn fft_ifft_roundtrip() {
        let signal: Vec<f32> = (0..16).map(|i| (i as f32 * 0.4).sin()).collect();
        let mut buf: Vec<f32> = signal.iter().flat_map(|&x| [x, 0.0]).collect();
        fft_inplace(&mut buf);
        ifft_inplace(&mut buf);
        let n = signal.len() as f32;
        for (orig, chunk) in signal.iter().zip(buf.chunks(2)) {
            assert!((orig - chunk[0] / n).abs() < 1e-4);
        }
    }
}
