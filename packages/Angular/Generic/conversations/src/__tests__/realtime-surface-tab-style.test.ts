import { describe, it, expect } from 'vitest';
import {
  IsWhiteboardChannel, ShouldRegisterChannelTabUpFront, ShouldShowActivityTab,
  ChannelTabColor, ChannelTabHue,
  ClampActivitySplitPercent, ParseActivitySplitPercent, SerializeActivitySplitPercent,
  ACTIVITY_SPLIT_DEFAULT_PERCENT, ACTIVITY_SPLIT_MIN_PERCENT, ACTIVITY_SPLIT_MAX_PERCENT
} from '../lib/components/realtime/realtime-surface-tab-style';

describe('IsWhiteboardChannel', () => {
  it('matches case-insensitively and trims', () => {
    expect(IsWhiteboardChannel('Whiteboard')).toBe(true);
    expect(IsWhiteboardChannel('whiteboard')).toBe(true);
    expect(IsWhiteboardChannel('  WHITEBOARD  ')).toBe(true);
  });
  it('rejects other channels and nullish input', () => {
    expect(IsWhiteboardChannel('Notes')).toBe(false);
    expect(IsWhiteboardChannel('')).toBe(false);
    expect(IsWhiteboardChannel(null)).toBe(false);
    expect(IsWhiteboardChannel(undefined)).toBe(false);
  });
});

describe('ShouldRegisterChannelTabUpFront', () => {
  it('always registers the whiteboard up front, even when unused', () => {
    expect(ShouldRegisterChannelTabUpFront('Whiteboard', false)).toBe(true);
    expect(ShouldRegisterChannelTabUpFront('whiteboard', false)).toBe(true);
  });
  it('registers a non-whiteboard channel only once used', () => {
    expect(ShouldRegisterChannelTabUpFront('Notes', false)).toBe(false);
    expect(ShouldRegisterChannelTabUpFront('Notes', true)).toBe(true);
  });
});

describe('ShouldShowActivityTab', () => {
  it('hides until ≥1 agent run when live', () => {
    expect(ShouldShowActivityTab(0, false)).toBe(false);
    expect(ShouldShowActivityTab(1, false)).toBe(true);
    expect(ShouldShowActivityTab(5, false)).toBe(true);
  });
  it('always shows in review mode regardless of count', () => {
    expect(ShouldShowActivityTab(0, true)).toBe(true);
  });
});

describe('ChannelTabHue / ChannelTabColor', () => {
  it('is deterministic for a given name', () => {
    expect(ChannelTabHue('Whiteboard')).toBe(ChannelTabHue('Whiteboard'));
    expect(ChannelTabColor('Notes')).toBe(ChannelTabColor('Notes'));
  });
  it('normalizes case/whitespace (same color for variants of the same name)', () => {
    expect(ChannelTabHue('Whiteboard')).toBe(ChannelTabHue('  whiteboard '));
    expect(ChannelTabColor('Whiteboard')).toBe(ChannelTabColor('whiteboard'));
  });
  it('produces a valid hue in [0, 360) and an hsl() string', () => {
    for (const name of ['Whiteboard', 'Notes', 'Map', 'Remote Browser', 'Media', '']) {
      const hue = ChannelTabHue(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(ChannelTabColor(name)).toBe(`hsl(${hue}, 62%, 52%)`);
    }
  });
  it('gives different channels different hues (no trivial collisions across common names)', () => {
    const hues = new Set(['Whiteboard', 'Notes', 'Map', 'Remote Browser', 'Media'].map(ChannelTabHue));
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe('ClampActivitySplitPercent', () => {
  it('clamps to [min, max]', () => {
    expect(ClampActivitySplitPercent(10)).toBe(ACTIVITY_SPLIT_MIN_PERCENT);
    expect(ClampActivitySplitPercent(90)).toBe(ACTIVITY_SPLIT_MAX_PERCENT);
    expect(ClampActivitySplitPercent(45)).toBe(45);
  });
  it('falls back to the default for non-finite input', () => {
    expect(ClampActivitySplitPercent(Number.NaN)).toBe(ACTIVITY_SPLIT_DEFAULT_PERCENT);
    expect(ClampActivitySplitPercent(Number.POSITIVE_INFINITY)).toBe(ACTIVITY_SPLIT_DEFAULT_PERCENT);
  });
});

describe('ParseActivitySplitPercent', () => {
  it('parses a valid persisted percent (clamped)', () => {
    expect(ParseActivitySplitPercent('{"percent":50}')).toBe(50);
    expect(ParseActivitySplitPercent('{"percent":90}')).toBe(ACTIVITY_SPLIT_MAX_PERCENT);
  });
  it('returns null for missing / blank / malformed / non-object / non-positive', () => {
    expect(ParseActivitySplitPercent(null)).toBeNull();
    expect(ParseActivitySplitPercent('')).toBeNull();
    expect(ParseActivitySplitPercent('not json')).toBeNull();
    expect(ParseActivitySplitPercent('42')).toBeNull();
    expect(ParseActivitySplitPercent('null')).toBeNull();
    expect(ParseActivitySplitPercent('{"percent":"x"}')).toBeNull();
    expect(ParseActivitySplitPercent('{"percent":0}')).toBeNull();
    expect(ParseActivitySplitPercent('{"percent":-5}')).toBeNull();
  });
});

describe('SerializeActivitySplitPercent', () => {
  it('round-trips through Parse (clamped both ways)', () => {
    const serialized = SerializeActivitySplitPercent(55);
    expect(serialized).toBe('{"percent":55}');
    expect(ParseActivitySplitPercent(serialized)).toBe(55);
  });
  it('clamps an out-of-range value on serialize', () => {
    expect(SerializeActivitySplitPercent(999)).toBe(`{"percent":${ACTIVITY_SPLIT_MAX_PERCENT}}`);
  });
});
