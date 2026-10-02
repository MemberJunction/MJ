import { describe, it, expect } from 'vitest';
import { ComputeActiveCueIndex, ResolveCueEndMs } from '../lib/media-player/cue-utils';
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
    expect(ComputeActiveCueIndex(500, [])).toBe(-1);
    expect(ComputeActiveCueIndex(500, null)).toBe(-1);
    expect(ComputeActiveCueIndex(500, undefined)).toBe(-1);
  });

  it('returns -1 before the first cue starts', () => {
    const shifted: MediaTranscriptCue[] = [{ Id: 'x', StartMs: 1000, EndMs: 2000, Text: 'late' }];
    expect(ComputeActiveCueIndex(500, shifted)).toBe(-1);
  });

  it('matches a cue with an explicit EndMs (start inclusive, end exclusive)', () => {
    expect(ComputeActiveCueIndex(0, cues)).toBe(0);
    expect(ComputeActiveCueIndex(999, cues)).toBe(0);
    expect(ComputeActiveCueIndex(1000, cues)).toBe(1); // boundary belongs to the next cue
    expect(ComputeActiveCueIndex(1999, cues)).toBe(1);
  });

  it('returns -1 inside a gap between cues', () => {
    expect(ComputeActiveCueIndex(2500, cues)).toBe(-1);
  });

  it('uses the next cue start when EndMs is absent', () => {
    // cue c (index 2) has no EndMs → active from 3000 until cue d starts at 5000
    expect(ComputeActiveCueIndex(3000, cues)).toBe(2);
    expect(ComputeActiveCueIndex(4999, cues)).toBe(2);
    expect(ComputeActiveCueIndex(5000, cues)).toBe(3); // boundary → cue d
  });

  it('runs the final EndMs-absent cue to infinity', () => {
    expect(ComputeActiveCueIndex(5000, cues)).toBe(3);
    expect(ComputeActiveCueIndex(9_999_999, cues)).toBe(3);
  });
});

describe('resolveCueEndMs', () => {
  it('uses own EndMs when present', () => {
    expect(ResolveCueEndMs(cues, 0)).toBe(1000);
  });

  it('uses next cue start when EndMs absent', () => {
    expect(ResolveCueEndMs(cues, 2)).toBe(5000);
  });

  it('returns +Infinity for the last EndMs-absent cue', () => {
    expect(ResolveCueEndMs(cues, 3)).toBe(Number.POSITIVE_INFINITY);
  });
});
