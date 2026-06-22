/**
 * Unit tests for the surface-panel width preference helpers — the framework-free
 * clamp / parse / serialize rules behind the call overlay's drag-resizable panel
 * (persisted per-user via UserInfoEngine under `mj.realtimeVoice.surfacePanel.v1`).
 */
import { describe, it, expect } from 'vitest';
import {
  ClampSurfacePanelWidth,
  IsSurfacePanelDrag,
  ParseSurfacePanelPref,
  SerializeSurfacePanelPref,
  SurfacePanelDragWidth,
  SURFACE_PANEL_DRAG_CLICK_TOLERANCE,
  SURFACE_PANEL_MIN_WIDTH,
  SURFACE_PANEL_MAX_FRACTION,
  SURFACE_PANEL_PREF_KEY
} from '../lib/components/realtime/realtime-surface-panel-prefs';

describe('ClampSurfacePanelWidth', () => {
  it('passes through a width inside the [min, 70% of overlay] band', () => {
    expect(ClampSurfacePanelWidth(500, 2000)).toBe(500);
  });

  it('clamps below the minimum up to the minimum', () => {
    expect(ClampSurfacePanelWidth(100, 2000)).toBe(SURFACE_PANEL_MIN_WIDTH);
  });

  it('clamps above 70% of the overlay down to the cap', () => {
    expect(ClampSurfacePanelWidth(1900, 2000)).toBe(2000 * SURFACE_PANEL_MAX_FRACTION);
  });

  it('enforces only the minimum when the overlay width is unknown', () => {
    expect(ClampSurfacePanelWidth(5000, 0)).toBe(5000);
    expect(ClampSurfacePanelWidth(100, NaN)).toBe(SURFACE_PANEL_MIN_WIDTH);
  });

  it('resolves a tiny overlay (cap below min) to the minimum', () => {
    expect(ClampSurfacePanelWidth(400, 200)).toBe(SURFACE_PANEL_MIN_WIDTH);
  });

  it('returns the minimum for any non-finite candidate width (NaN, Infinity)', () => {
    expect(ClampSurfacePanelWidth(NaN, 2000)).toBe(SURFACE_PANEL_MIN_WIDTH);
    expect(ClampSurfacePanelWidth(Infinity, 2000)).toBe(SURFACE_PANEL_MIN_WIDTH);
  });
});

describe('SurfacePanelDragWidth', () => {
  it('grows the RIGHT-side panel when the pointer moves left', () => {
    expect(SurfacePanelDragWidth(500, 1000, 900, 2000)).toBe(600);
  });

  it('shrinks the panel when the pointer moves right', () => {
    expect(SurfacePanelDragWidth(500, 1000, 1100, 2000)).toBe(400);
  });

  it('returns the start width unchanged for a zero-delta gesture (bare click)', () => {
    expect(SurfacePanelDragWidth(500, 1000, 1000, 2000)).toBe(500);
  });

  it('clamps the live width to the minimum', () => {
    expect(SurfacePanelDragWidth(360, 1000, 1500, 2000)).toBe(SURFACE_PANEL_MIN_WIDTH);
  });

  it('clamps the live width to 70% of the overlay', () => {
    expect(SurfacePanelDragWidth(500, 1000, 0, 2000)).toBe(2000 * SURFACE_PANEL_MAX_FRACTION);
  });

  it('enforces only the minimum when the overlay width is unknown', () => {
    expect(SurfacePanelDragWidth(500, 1000, 0, 0)).toBe(1500);
  });
});

describe('IsSurfacePanelDrag (click-vs-drag guard)', () => {
  it('treats a zero-movement gesture as a CLICK (never adopt/persist)', () => {
    expect(IsSurfacePanelDrag(1000, 1000)).toBe(false);
  });

  it('treats sub-tolerance jitter as a CLICK', () => {
    expect(IsSurfacePanelDrag(1000, 1000 + SURFACE_PANEL_DRAG_CLICK_TOLERANCE - 1)).toBe(false);
    expect(IsSurfacePanelDrag(1000, 1000 - (SURFACE_PANEL_DRAG_CLICK_TOLERANCE - 1))).toBe(false);
  });

  it('treats movement at or beyond the tolerance as a DRAG, in either direction', () => {
    expect(IsSurfacePanelDrag(1000, 1000 + SURFACE_PANEL_DRAG_CLICK_TOLERANCE)).toBe(true);
    expect(IsSurfacePanelDrag(1000, 1000 - SURFACE_PANEL_DRAG_CLICK_TOLERANCE)).toBe(true);
    expect(IsSurfacePanelDrag(1000, 700)).toBe(true);
  });

  it('never reports a drag for degenerate (non-finite) coordinates', () => {
    expect(IsSurfacePanelDrag(NaN, 1000)).toBe(false);
    expect(IsSurfacePanelDrag(1000, NaN)).toBe(false);
    expect(IsSurfacePanelDrag(Infinity, 0)).toBe(false);
  });
});

describe('ParseSurfacePanelPref', () => {
  it('parses a valid persisted width', () => {
    expect(ParseSurfacePanelPref('{"width":512}')).toEqual({ Width: 512 });
  });

  it('round-trips through SerializeSurfacePanelPref', () => {
    expect(ParseSurfacePanelPref(SerializeSurfacePanelPref(420))).toEqual({ Width: 420 });
  });

  it('treats a serialized RESET ({"width":null}) as no preference', () => {
    expect(ParseSurfacePanelPref(SerializeSurfacePanelPref(null))).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['blank', ''],
    ['malformed JSON', '{width:'],
    ['non-object', '"512"'],
    ['JSON null', 'null'],
    ['missing width', '{}'],
    ['non-numeric width', '{"width":"big"}'],
    ['non-finite width', '{"width":null}'],
    ['zero width', '{"width":0}'],
    ['negative width', '{"width":-50}']
  ])('returns null (never throws) for %s', (_label, raw) => {
    expect(ParseSurfacePanelPref(raw as string | null | undefined)).toBeNull();
  });
});

describe('pref key', () => {
  it('uses the versioned mj.* naming convention', () => {
    expect(SURFACE_PANEL_PREF_KEY).toBe('mj.realtimeVoice.surfacePanel.v1');
  });
});
