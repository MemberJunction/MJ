import { describe, it, expect } from 'vitest';
import {
  ParseSurfacePlacementPref,
  RecordSurfaceMove,
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
