/**
 * Perceptual (difference) hashing for screenshots
 *
 * A 64-bit dHash of a downscaled grayscale frame. Perceptually-similar frames
 * produce hashes with a small Hamming distance; byte-identical frames produce
 * identical hashes. Unlike raw base64/byte equality (which any animated spinner
 * defeats — every spinner frame is byte-different), a dHash treats a spinning
 * loader as "unchanged", which is exactly what stuck/stall detection needs.
 *
 * This is shared infrastructure consumed by several engine concerns:
 *  - loop / stagnation detection (state signatures)
 *  - screenshot dedupe ("[screen unchanged]" prompt substitution)
 *  - judge-call gating (skip re-judging an unchanged state)
 *  - failure classification (progressing vs frozen trajectories)
 *
 * App-agnostic by construction: it operates on raw pixels only, with no
 * knowledge of any application.
 */

import { PNG } from 'pngjs';

/** dHash compares 8 adjacent pairs per row over 8 rows → needs a 9×8 grid. */
const GRID_W = 9;
const GRID_H = 8;

/**
 * Compute a 64-bit dHash of a base64-encoded PNG, returned as a 16-char hex
 * string. Returns '' when the input cannot be decoded (callers treat an empty
 * hash as "no comparison possible" and fall back to their prior behavior).
 * Never throws — this is telemetry-grade and must not disrupt a run.
 */
export function computePerceptualHash(base64Png: string): string {
    if (!base64Png) {
        return '';
    }
    try {
        const raw = base64Png.includes(',') ? base64Png.slice(base64Png.indexOf(',') + 1) : base64Png;
        const png = PNG.sync.read(Buffer.from(raw, 'base64'));
        const gray = downscaleToGrayscale(png.data, png.width, png.height);
        return packDifferenceHash(gray);
    } catch {
        return '';
    }
}

/**
 * Hamming distance (number of differing bits, 0–64) between two hex dHash
 * strings. Returns 64 (maximally different) if either hash is empty or the
 * lengths differ, so an unusable hash never registers as "similar".
 */
export function hashDistance(a: string, b: string): number {
    if (!a || !b || a.length !== b.length) {
        return 64;
    }
    let distance = 0;
    for (let i = 0; i < a.length; i++) {
        const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        distance += NIBBLE_BITS[xor];
    }
    return distance;
}

/**
 * True when two frames are visually unchanged within `threshold` bits.
 * Default 3 tolerates spinner animation / anti-aliasing jitter while still
 * catching any real content change. Two empty hashes are NOT similar (we
 * cannot prove sameness without data).
 */
export function hashesSimilar(a: string, b: string, threshold: number = 3): boolean {
    if (!a || !b) {
        return false;
    }
    return hashDistance(a, b) <= threshold;
}

// ─── internals ─────────────────────────────────────────────

/** Popcount for a single hex nibble (0–15). */
const NIBBLE_BITS: readonly number[] = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Box-average an RGBA buffer down to a GRID_W×GRID_H grid of grayscale
 * luminance values (0–255), using Rec. 601 luma weights.
 */
function downscaleToGrayscale(data: Buffer, width: number, height: number): number[] {
    const cells: number[] = new Array(GRID_W * GRID_H).fill(0);
    if (width <= 0 || height <= 0) {
        return cells;
    }
    for (let gy = 0; gy < GRID_H; gy++) {
        const sy0 = Math.floor((gy * height) / GRID_H);
        const sy1 = Math.max(sy0 + 1, Math.floor(((gy + 1) * height) / GRID_H));
        for (let gx = 0; gx < GRID_W; gx++) {
            const sx0 = Math.floor((gx * width) / GRID_W);
            const sx1 = Math.max(sx0 + 1, Math.floor(((gx + 1) * width) / GRID_W));
            let sum = 0;
            let count = 0;
            for (let y = sy0; y < sy1; y++) {
                for (let x = sx0; x < sx1; x++) {
                    const idx = (y * width + x) * 4;
                    sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    count++;
                }
            }
            cells[gy * GRID_W + gx] = count > 0 ? sum / count : 0;
        }
    }
    return cells;
}

/**
 * Difference hash: for each row, each of the 8 adjacent left→right pairs
 * contributes a bit (1 when the left cell is brighter). 64 bits → 16 hex chars.
 */
function packDifferenceHash(gray: number[]): string {
    let hex = '';
    let nibble = 0;
    let bitsInNibble = 0;
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W - 1; gx++) {
            const bit = gray[gy * GRID_W + gx] > gray[gy * GRID_W + gx + 1] ? 1 : 0;
            nibble = (nibble << 1) | bit;
            bitsInNibble++;
            if (bitsInNibble === 4) {
                hex += nibble.toString(16);
                nibble = 0;
                bitsInNibble = 0;
            }
        }
    }
    return hex;
}
