/**
 * Framework-free helpers for the call overlay's SURFACE PLACEMENT preferences, persisted per user via
 * `UserInfoEngine`:
 * - {@link SURFACE_PLACEMENT_PREF_KEY}: where the user moved each channel's surface (the stage, a picture-in-picture
 *   box, its tab, hidden), as the list of moves `ResolveSurfacePlacements` reads: oldest first, one per surface, so
 *   the most recent move to the stage wins it in every later session too.
 * - {@link SURFACE_PIP_PREF_KEY}: where the user put each picture-in-picture box, as fractions of the stage.
 *
 * Kept free of Angular imports so the parse / serialize / record rules are unit-testable in plain node.
 */
import { MEDIA_PLACEMENTS, type MediaPlacement, type MediaPlacementMove } from '@memberjunction/ai-realtime-client/media';
import type { MediaPipRect } from '@memberjunction/ng-realtime-media';

/** `MJ: User Settings` key for the surface placement preference (versioned shape). */
export const SURFACE_PLACEMENT_PREF_KEY = 'mj.realtime.placement.v1';

/** `MJ: User Settings` key for picture-in-picture boxes: `{ [channelKey]: { X, Y, W, H } }`, fractions of the stage. */
export const SURFACE_PIP_PREF_KEY = 'mj.realtime.pip.v1';

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

/**
 * Reads the saved picture-in-picture boxes. Tolerant: a value that is not an object reads as none, and a box that is
 * not four fractions with a size is skipped.
 */
export function ParseSurfacePipPref(raw: string | null | undefined): Map<string, MediaPipRect> {
  const rects = new Map<string, MediaPipRect>();
  if (!raw) {
    return rects;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return rects;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (isPipRect(value)) {
        rects.set(key, { X: value.X, Y: value.Y, W: value.W, H: value.H });
      }
    }
    return rects;
  } catch {
    return rects;
  }
}

/** The saved form of the picture-in-picture boxes. */
export function SerializeSurfacePipPref(rects: ReadonlyMap<string, MediaPipRect>): string {
  return JSON.stringify(Object.fromEntries([...rects].map(([key, rect]) => [key, { X: rect.X, Y: rect.Y, W: rect.W, H: rect.H }])));
}

function isPipRect(value: unknown): value is MediaPipRect {
  return (
    typeof value === 'object' &&
    value !== null &&
    'X' in value &&
    'Y' in value &&
    'W' in value &&
    'H' in value &&
    isFraction(value.X) &&
    isFraction(value.Y) &&
    isFraction(value.W) &&
    isFraction(value.H) &&
    value.W > 0 &&
    value.H > 0
  );
}

function isFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
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
