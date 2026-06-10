/**
 * Unit tests for the surface-panel width preference helpers — the framework-free
 * clamp / parse / serialize rules behind the call overlay's drag-resizable panel
 * (persisted per-user via UserInfoEngine under `mj.realtimeVoice.surfacePanel.v1`).
 */
import { describe, it, expect } from 'vitest';
import {
  ClampSurfacePanelWidth,
  ParseSurfacePanelPref,
  SerializeSurfacePanelPref,
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
