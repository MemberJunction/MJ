import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';

import {
    ComputePerceptualHash,
    HashDistance,
    HashesSimilar,
} from '../utils/perceptual-hash.js';

/**
 * Build a base64 PNG from a per-pixel colorizer, for deterministic dHash inputs.
 */
function makePng(width: number, height: number, color: (x: number, y: number) => [number, number, number]): string {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const [r, g, b] = color(x, y);
            png.data[idx] = r;
            png.data[idx + 1] = g;
            png.data[idx + 2] = b;
            png.data[idx + 3] = 255;
        }
    }
    return PNG.sync.write(png).toString('base64');
}

// A left-dark / right-bright gradient — a well-defined dHash.
const gradient = makePng(64, 48, (x) => {
    const v = Math.round((x / 63) * 255);
    return [v, v, v];
});

describe('perceptual-hash', () => {
    it('produces a 16-char hex (64-bit) hash for a valid PNG', () => {
        const h = ComputePerceptualHash(gradient);
        expect(h).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is stable — identical frames hash identically (distance 0, similar)', () => {
        const a = ComputePerceptualHash(gradient);
        const b = ComputePerceptualHash(gradient);
        expect(a).toBe(b);
        expect(HashDistance(a, b)).toBe(0);
        expect(HashesSimilar(a, b)).toBe(true);
    });

    it('treats a tiny 1-pixel change as unchanged (defeats byte-equality brittleness)', () => {
        const nudged = makePng(64, 48, (x, y) => {
            const v = Math.round((x / 63) * 255);
            if (x === 10 && y === 10) {
                return [v, v, Math.min(255, v + 5)];
            }
            return [v, v, v];
        });
        const a = ComputePerceptualHash(gradient);
        const b = ComputePerceptualHash(nudged);
        expect(HashesSimilar(a, b)).toBe(true);
    });

    it('flags a large content change as different', () => {
        const inverted = makePng(64, 48, (x) => {
            const v = Math.round(((63 - x) / 63) * 255);
            return [v, v, v];
        });
        const a = ComputePerceptualHash(gradient);
        const b = ComputePerceptualHash(inverted);
        expect(HashDistance(a, b)).toBeGreaterThan(3);
        expect(HashesSimilar(a, b)).toBe(false);
    });

    it('returns empty hash on undecodable input and never throws', () => {
        expect(ComputePerceptualHash('')).toBe('');
        expect(ComputePerceptualHash('not-base64-@@@')).toBe('');
        expect(ComputePerceptualHash('data:image/png;base64,zzzz')).toBe('');
    });

    it('empty/mismatched hashes are maximally distant and never "similar"', () => {
        const h = ComputePerceptualHash(gradient);
        expect(HashDistance('', h)).toBe(64);
        expect(HashDistance(h, '')).toBe(64);
        expect(HashesSimilar('', '')).toBe(false);
        expect(HashesSimilar('', h)).toBe(false);
    });

    it('accepts a data-URI prefixed base64', () => {
        const h1 = ComputePerceptualHash(gradient);
        const h2 = ComputePerceptualHash('data:image/png;base64,' + gradient);
        expect(h2).toBe(h1);
    });
});
