/**
 * @fileoverview MEDIA LAYOUT: the user's layout of a media stage as a host keeps and saves it.
 * - **Moves.** One move per surface, oldest first: the list `LayoutMediaStage` and `ResolveSurfacePlacements` read.
 *   {@link RecordPlacementMove} keeps it that way, and {@link WithoutStageMoves} hands the stage back to its default.
 * - **Boxes.** Where the user put each picture-in-picture box, by surface key, as fractions of the stage.
 *
 * The realtime call keeps its channels' layout this way and the meeting room its participants' tiles, so both save the
 * same form ({@link SerializePlacementMoves}, {@link SerializePipRects}) and read it back tolerantly.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import { MEDIA_PLACEMENTS, type MediaPipRect, type MediaPlacement, type MediaPlacementMove } from './model';

/** Adds a move at the end, dropping the surface's earlier move, so the list keeps one move per surface in order. */
export function RecordPlacementMove(moves: readonly MediaPlacementMove[], move: MediaPlacementMove): MediaPlacementMove[] {
    return [...moves.filter((existing) => existing.SurfaceKey !== move.SurfaceKey), move];
}

/**
 * The moves without any move to the stage: whatever the user put there goes back to its default. The stage goes to the
 * newest move there, so a host whose "unpin" should hand the stage back to its default, not to an earlier move, drops
 * the stage moves before recording the next one.
 */
export function WithoutStageMoves(moves: readonly MediaPlacementMove[]): MediaPlacementMove[] {
    return moves.filter((move) => move.Placement !== 'stage');
}

/** Reads saved moves. Tolerant: a value that is not a list reads as no moves, and a malformed entry is skipped. */
export function ParsePlacementMoves(raw: string | null | undefined): MediaPlacementMove[] {
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
export function SerializePlacementMoves(moves: readonly MediaPlacementMove[]): string {
    return JSON.stringify(moves.map((move) => ({ SurfaceKey: move.SurfaceKey, Placement: move.Placement })));
}

/**
 * Reads saved picture-in-picture boxes, by surface key. Tolerant: a value that is not an object reads as none, and a box
 * that is not four fractions with a size is skipped.
 */
export function ParsePipRects(raw: string | null | undefined): Map<string, MediaPipRect> {
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

/** The saved form of picture-in-picture boxes, by surface key. */
export function SerializePipRects(rects: ReadonlyMap<string, MediaPipRect>): string {
    return JSON.stringify(Object.fromEntries([...rects].map(([key, rect]) => [key, { X: rect.X, Y: rect.Y, W: rect.W, H: rect.H }])));
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
