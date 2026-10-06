/**
 * Framework-free helpers for the call overlay's SURFACE PLACEMENT preference: where the user moved each channel's
 * surface (the stage, its tab, hidden), persisted per user via `UserInfoEngine` under
 * {@link SURFACE_PLACEMENT_PREF_KEY}. The value is the list of moves `ResolveSurfacePlacements` reads: oldest first,
 * one per surface, so the most recent move to the stage wins it in every later session too.
 *
 * Kept free of Angular imports so the parse / serialize / record rules are unit-testable in plain node.
 */
import { MEDIA_PLACEMENTS, type MediaPlacement, type MediaPlacementMove } from '@memberjunction/ai-realtime-client/media';

/** `MJ: User Settings` key for the surface placement preference (versioned shape). */
export const SURFACE_PLACEMENT_PREF_KEY = 'mj.realtime.placement.v1';

/** Reads the saved moves. Tolerant: a value that is not a list reads as no moves, and a malformed entry is skipped. */
export function ParseSurfacePlacementPref(raw: string | null | undefined): MediaPlacementMove[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMove).map((move) => ({ SurfaceKey: move.SurfaceKey, Placement: move.Placement }));
  } catch {
    return [];
  }
}

/** The saved form of a list of moves. */
export function SerializeSurfacePlacementPref(moves: readonly MediaPlacementMove[]): string {
  return JSON.stringify(moves.map((move) => ({ SurfaceKey: move.SurfaceKey, Placement: move.Placement })));
}

/** Adds a move at the end, dropping the surface's earlier move, so the list keeps one move per surface in order. */
export function RecordSurfaceMove(moves: readonly MediaPlacementMove[], move: MediaPlacementMove): MediaPlacementMove[] {
  return [...moves.filter((existing) => existing.SurfaceKey !== move.SurfaceKey), move];
}

function isMove(value: unknown): value is MediaPlacementMove {
  return (
    typeof value === 'object' &&
    value !== null &&
    'SurfaceKey' in value &&
    typeof value.SurfaceKey === 'string' &&
    'Placement' in value &&
    isPlacement(value.Placement)
  );
}

function isPlacement(value: unknown): value is MediaPlacement {
  return typeof value === 'string' && (MEDIA_PLACEMENTS as readonly string[]).includes(value);
}
