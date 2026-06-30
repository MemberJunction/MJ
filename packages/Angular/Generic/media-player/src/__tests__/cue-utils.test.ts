import { describe, it, expect } from 'vitest';
import { computeActiveCueIndex, resolveCueEndMs } from '../lib/media-player/cue-utils';
import { MediaTranscriptCue } from '../lib/media-player.types';

const cues: MediaTranscriptCue[] = [
  { Id: 'a', StartMs: 0, EndMs: 1000, Text: 'first' },
  { Id: 'b', StartMs: 1000, EndMs: 2000, Text: 'second' },
  // gap: no cue from 2000..3000
  { Id: 'c', StartMs: 3000, Text: 'third (no EndMs)' }, // runs until next cue
  { Id: 'd', StartMs: 5000, Text: 'fourth (no EndMs, last)' }, // runs to +Infinity
];

describe('computeActiveCueIndex', () => {
  it('returns -1 for empty / null transcript', () => {
    expect(computeActiveCueIndex(500, [])).toBe(-1);
    expect(computeActiveCueIndex(500, null)).toBe(-1);
    expect(computeActiveCueIndex(500, undefined)).toBe(-1);
  });

  it('returns -1 before the first cue starts', () => {
    const shifted: MediaTranscriptCue[] = [{ Id: 'x', StartMs: 1000, EndMs: 2000, Text: 'late' }];
    expect(computeActiveCueIndex(500, shifted)).toBe(-1);
  });

  it('matches a cue with an explicit EndMs (start inclusive, end exclusive)', () => {
    expect(computeActiveCueIndex(0, cues)).toBe(0);
    expect(computeActiveCueIndex(999, cues)).toBe(0);
    expect(computeActiveCueIndex(1000, cues)).toBe(1); // boundary belongs to the next cue
    expect(computeActiveCueIndex(1999, cues)).toBe(1);
  });

  it('returns -1 inside a gap between cues', () => {
    expect(computeActiveCueIndex(2500, cues)).toBe(-1);
  });

  it('uses the next cue start when EndMs is absent', () => {
    // cue c (index 2) has no EndMs → active from 3000 until cue d starts at 5000
    expect(computeActiveCueIndex(3000, cues)).toBe(2);
    expect(computeActiveCueIndex(4999, cues)).toBe(2);
    expect(computeActiveCueIndex(5000, cues)).toBe(3); // boundary → cue d
  });

  it('runs the final EndMs-absent cue to infinity', () => {
    expect(computeActiveCueIndex(5000, cues)).toBe(3);
    expect(computeActiveCueIndex(9_999_999, cues)).toBe(3);
  });
});

describe('resolveCueEndMs', () => {
  it('uses own EndMs when present', () => {
    expect(resolveCueEndMs(cues, 0)).toBe(1000);
  });

  it('uses next cue start when EndMs absent', () => {
    expect(resolveCueEndMs(cues, 2)).toBe(5000);
  });

  it('returns +Infinity for the last EndMs-absent cue', () => {
    expect(resolveCueEndMs(cues, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});
