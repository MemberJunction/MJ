import { describe, it, expect } from 'vitest';
import { deriveSidecarPath, parsePeaksSidecar, MAX_PEAKS } from '../resolvers/peaksSidecar.js';

/**
 * Tests for the pure `peaks.json` sidecar helpers that back FileResolver.CreateMediaAccessToken's
 * peaks pass-through. These cover the load-bearing behavior the mutation depends on:
 *  - deriving the sidecar path that sits in the SAME folder as the recording, and
 *  - parsing + sanitizing the sidecar so valid peaks come back and garbage / wrong-shape / missing
 *    payloads gracefully yield `undefined` (the resolver treats that as "omit Peaks, never fail").
 *
 * The resolver wires these to a storage driver behind a try/catch; the helpers themselves never
 * throw, which is what guarantees a sidecar problem can't block token minting.
 */

describe('deriveSidecarPath', () => {
  it('replaces the final path segment with peaks.json (recording in a session folder)', () => {
    expect(deriveSidecarPath('realtime-recordings/sess-1/recording.wav')).toBe('realtime-recordings/sess-1/peaks.json');
  });

  it('uses a bare peaks.json when the key has no folder', () => {
    expect(deriveSidecarPath('recording.wav')).toBe('peaks.json');
  });

  it('returns null when there is no ProviderKey (cannot derive a folder)', () => {
    expect(deriveSidecarPath(null)).toBeNull();
    expect(deriveSidecarPath(undefined)).toBeNull();
    expect(deriveSidecarPath('')).toBeNull();
  });
});

describe('parsePeaksSidecar', () => {
  it('returns sanitized peaks from a valid JSON array (clamped to 0..1)', () => {
    const bytes = Buffer.from(JSON.stringify([0, 0.5, 1, 1.7, -0.3]), 'utf8');
    expect(parsePeaksSidecar(bytes)).toEqual([0, 0.5, 1, 1, 0]);
  });

  it('returns undefined for non-JSON garbage (never throws)', () => {
    expect(parsePeaksSidecar(Buffer.from('this is not json', 'utf8'))).toBeUndefined();
  });

  it('returns undefined when the JSON is not an array', () => {
    expect(parsePeaksSidecar(Buffer.from(JSON.stringify({ not: 'an array' }), 'utf8'))).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    expect(parsePeaksSidecar(Buffer.from('[]', 'utf8'))).toBeUndefined();
  });

  it('drops non-finite / non-number entries, keeping the finite numbers', () => {
    const bytes = Buffer.from(JSON.stringify([0.2, 'x', null, NaN, 0.8]), 'utf8');
    // NaN serializes to null in JSON; both 'x' and the nulls are dropped, leaving the two numbers.
    expect(parsePeaksSidecar(bytes)).toEqual([0.2, 0.8]);
  });

  it('returns undefined when nothing finite survives sanitization', () => {
    expect(parsePeaksSidecar(Buffer.from(JSON.stringify(['a', 'b', null]), 'utf8'))).toBeUndefined();
  });

  it('caps the array length at MAX_PEAKS', () => {
    const huge = new Array(MAX_PEAKS + 500).fill(0.5);
    const result = parsePeaksSidecar(Buffer.from(JSON.stringify(huge), 'utf8'));
    expect(result).toHaveLength(MAX_PEAKS);
  });
});
