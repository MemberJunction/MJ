import { MJBrandKitEntity_IBrandColor } from '@memberjunction/core-entities';

const DEFAULT_SWATCH_ROLES: ReadonlyArray<string> = [
  'Primary',
  'Secondary',
  'Accent',
  'Surface',
  'Text',
];

interface ColorBucket {
  SumR: number;
  SumG: number;
  SumB: number;
  Count: number;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => clampChannel(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

function rgbDistance(
  a: { R: number; G: number; B: number },
  b: { R: number; G: number; B: number },
): number {
  const dr = a.R - b.R;
  const dg = a.G - b.G;
  const db = a.B - b.B;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Pure function that samples flat RGBA pixel bytes (`[r, g, b, a, ...]`) and returns up to
 * `maxColors` (at most 5) distinct hex colors suitable for a Brand Kit palette.
 *
 * Transparent pixels (`a < 128`) are ignored. Opaque pixels are quantized into RGB buckets,
 * ranked by frequency, and filtered by minimum perceptual distance so the returned swatches
 * are visually distinct.
 */
export function SuggestColorsFromRgbaPixels(
  pixels: ArrayLike<number>,
  maxColors = 5,
): MJBrandKitEntity_IBrandColor[] {
  const limit = Math.max(1, Math.min(5, Math.floor(maxColors)));
  if (!pixels || pixels.length < 4) {
    return [];
  }

  const buckets = new Map<string, ColorBucket>();
  const quantStep = 16;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) {
      continue;
    }

    const qR = Math.min(255, Math.round(r / quantStep) * quantStep);
    const qG = Math.min(255, Math.round(g / quantStep) * quantStep);
    const qB = Math.min(255, Math.round(b / quantStep) * quantStep);
    const key = `${qR},${qG},${qB}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.SumR += r;
      existing.SumG += g;
      existing.SumB += b;
      existing.Count += 1;
    } else {
      buckets.set(key, {
        SumR: r,
        SumG: g,
        SumB: b,
        Count: 1,
      });
    }
  }

  if (buckets.size === 0) {
    return [];
  }

  const candidates = Array.from(buckets.values())
    .map((b) => {
      const avgR = clampChannel(b.SumR / b.Count);
      const avgG = clampChannel(b.SumG / b.Count);
      const avgB = clampChannel(b.SumB / b.Count);
      return {
        R: avgR,
        G: avgG,
        B: avgB,
        Hex: rgbToHex(avgR, avgG, avgB),
        Count: b.Count,
      };
    })
    .sort((a, b) => b.Count - a.Count || a.Hex.localeCompare(b.Hex));

  const chosen: Array<{ R: number; G: number; B: number; Hex: string }> = [];
  const usedHexes = new Set<string>();

  const pickWithThreshold = (minDistance: number): void => {
    for (const candidate of candidates) {
      if (chosen.length >= limit) {
        return;
      }
      if (usedHexes.has(candidate.Hex)) {
        continue;
      }
      const tooClose = chosen.some(
        (existing) => rgbDistance(existing, candidate) < minDistance,
      );
      if (!tooClose) {
        chosen.push(candidate);
        usedHexes.add(candidate.Hex);
      }
    }
  };

  // First pass: require strong visual separation (>= 48 in RGB space)
  pickWithThreshold(48);
  // Second pass: if fewer than `limit` colors were found, allow closer distinct colors
  if (chosen.length < limit) {
    pickWithThreshold(16);
  }
  // Final pass: any remaining strictly distinct hex values
  if (chosen.length < limit) {
    pickWithThreshold(0);
  }

  return chosen.slice(0, limit).map((item, idx) => ({
    Name: DEFAULT_SWATCH_ROLES[idx] ?? `Color ${idx + 1}`,
    Value: item.Hex,
  }));
}

/**
 * Loads an image URL onto a 64x64 offscreen `<canvas>` and extracts up to `maxColors`
 * (≤ 5) distinct palette swatches via {@link SuggestColorsFromRgbaPixels}.
 */
export async function SampleLogoColorsFromImageUrl(
  imageUrl: string,
  maxColors = 5,
): Promise<MJBrandKitEntity_IBrandColor[]> {
  if (!imageUrl || typeof document === 'undefined') {
    return [];
  }

  return new Promise<MJBrandKitEntity_IBrandColor[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        resolve(SuggestColorsFromRgbaPixels(imageData.data, maxColors));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}
