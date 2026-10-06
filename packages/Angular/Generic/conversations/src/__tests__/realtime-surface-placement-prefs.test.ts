import { describe, it, expect } from 'vitest';
import {
  ParseSurfacePipPref,
  ParseSurfacePlacementPref,
  RecordSurfaceMove,
  SerializeSurfacePipPref,
  SerializeSurfacePlacementPref,
} from '../lib/components/realtime/realtime-surface-placement-prefs';

describe('surface placement preference', () => {
  it('reads back what it saves', () => {
    const moves = [
      { SurfaceKey: 'Whiteboard', Placement: 'stage' as const },
      { SurfaceKey: 'Browser', Placement: 'hidden' as const },
    ];
    expect(ParseSurfacePlacementPref(SerializeSurfacePlacementPref(moves))).toEqual(moves);
  });

  it('reads nothing saved, unparseable text or a non-list as no moves', () => {
    expect(ParseSurfacePlacementPref(undefined)).toEqual([]);
    expect(ParseSurfacePlacementPref('')).toEqual([]);
    expect(ParseSurfacePlacementPref('{not json')).toEqual([]);
    expect(ParseSurfacePlacementPref('{"Whiteboard":"stage"}')).toEqual([]);
  });

  it('skips malformed entries and keeps the rest, without extra fields', () => {
    const raw = JSON.stringify([
      { SurfaceKey: 'Whiteboard', Placement: 'stage', Extra: 1 },
      { SurfaceKey: 'Browser', Placement: 'sideways' },
      { Placement: 'tab' },
      null,
      'Media',
      { SurfaceKey: 'Media', Placement: 'pip' },
    ]);
    expect(ParseSurfacePlacementPref(raw)).toEqual([
      { SurfaceKey: 'Whiteboard', Placement: 'stage' },
      { SurfaceKey: 'Media', Placement: 'pip' },
    ]);
  });

  it("records a move at the end, replacing the surface's earlier move", () => {
    const moves = [
      { SurfaceKey: 'Whiteboard', Placement: 'stage' as const },
      { SurfaceKey: 'Browser', Placement: 'hidden' as const },
    ];
    expect(RecordSurfaceMove(moves, { SurfaceKey: 'Whiteboard', Placement: 'tab' })).toEqual([
      { SurfaceKey: 'Browser', Placement: 'hidden' },
      { SurfaceKey: 'Whiteboard', Placement: 'tab' },
    ]);
    expect(moves).toHaveLength(2);
  });
});

describe('picture-in-picture preference', () => {
  it('reads back what it saves', () => {
    const rects = new Map([
      ['Whiteboard', { X: 0.1, Y: 0.2, W: 0.3, H: 0.25 }],
      ['Media', { X: 0.6, Y: 0.6, W: 0.32, H: 0.25 }],
    ]);
    expect(ParseSurfacePipPref(SerializeSurfacePipPref(rects))).toEqual(rects);
  });

  it('reads nothing saved, unparseable text, a list or a non-object as no boxes', () => {
    expect(ParseSurfacePipPref(undefined).size).toBe(0);
    expect(ParseSurfacePipPref('{nope').size).toBe(0);
    expect(ParseSurfacePipPref('[]').size).toBe(0);
    expect(ParseSurfacePipPref('"Whiteboard"').size).toBe(0);
  });

  it('skips a box that is not four fractions with a size, and keeps the rest without extra fields', () => {
    const raw = JSON.stringify({
      Whiteboard: { X: 0.1, Y: 0.1, W: 0.3, H: 0.3, Z: 9 },
      Outside: { X: 1.2, Y: 0, W: 0.3, H: 0.3 },
      Flat: { X: 0.1, Y: 0.1, W: 0, H: 0.3 },
      Missing: { X: 0.1, Y: 0.1, W: 0.3 },
      Text: { X: '0.1', Y: 0.1, W: 0.3, H: 0.3 },
      Nothing: null,
    });
    expect([...ParseSurfacePipPref(raw)]).toEqual([['Whiteboard', { X: 0.1, Y: 0.1, W: 0.3, H: 0.3 }]]);
  });
});
