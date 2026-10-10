/**
 * @fileoverview MEDIA LAYOUT: the user's layout of a media stage as a host keeps and saves it.
 * - **Moves.** One move per surface, oldest first: the list `LayoutMediaStage` and `ResolveSurfacePlacements` read.
 *   {@link RecordPlacementMove} keeps it that way, and {@link WithoutStageMoves} hands the stage back to its default.
 * - **Boxes.** Where the user put each picture-in-picture box, by surface key, as fractions of the stage.
 * - **Self-view.** Whether the user hid their own tile, for a host that lets them (the meeting room).
 *
 * The realtime call keeps its channels' layout this way and the meeting room its participants' tiles, so both save the
 * same form ({@link SerializePlacementMoves}, {@link SerializePipRects}, {@link SerializeSelfViewHidden}) and read it
 * back tolerantly, through {@link MediaLayoutPrefs} under each host's own keys.
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

/** Adds a box at the end, dropping the surface's earlier box, so the boxes the user moved most recently come last. */
export function RecordPipRect(rects: ReadonlyMap<string, MediaPipRect>, key: string, rect: MediaPipRect): Map<string, MediaPipRect> {
    const next = new Map(rects);
    next.delete(key);
    next.set(key, rect);
    return next;
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

/**
 * Reads whether the user hid their self-view. Tolerant: only a saved `true` hides it; nothing saved, `false` or anything
 * else shows it.
 */
export function ParseSelfViewHidden(raw: string | null | undefined): boolean {
    return raw === SerializeSelfViewHidden(true);
}

/** The saved form of whether the user hid their self-view: JSON `true` or `false`. */
export function SerializeSelfViewHidden(hidden: boolean): string {
    return JSON.stringify(hidden);
}

/** A per-user settings store: MJ's `UserInfoEngine` is one, or anything with the same two methods. */
export interface MediaLayoutSettings {
    /** The text saved under a key, or `undefined` when there is none. */
    GetSetting(key: string): string | undefined;
    /** Saves text under a key; the store may wait for a burst of changes to end. */
    SetSettingDebounced(key: string, value: string): void;
}

/** The keys a host saves its layout under, so two hosts never overwrite each other's. */
export interface MediaLayoutKeys {
    /** Where the moves go. */
    Moves: string;
    /** Where the picture-in-picture boxes go. */
    PipRects: string;
    /** Where whether the user hid their self-view goes. A host with no Hide on the user's own tile leaves it out. */
    SelfViewHidden?: string;
}

/** How many moves, and how many boxes, a saved layout keeps: the newest. The oldest go first. */
export const MEDIA_LAYOUT_SAVED_LIMIT = 50;

/**
 * A host's saved layout: its moves, its picture-in-picture boxes and whether the user hid their self-view, in a per-user
 * settings store under the host's own keys. Reading treats a store that is not ready (it throws) as nothing saved;
 * writing skips one, or one that fails to save, so the layout then lasts for this session only. Writing keeps the newest
 * {@link MEDIA_LAYOUT_SAVED_LIMIT} moves and boxes.
 */
export class MediaLayoutPrefs {
    /**
     * @param store The settings store, looked up each time it is used, since a host's store may be ready only later.
     * @param keys Where this host's layout goes.
     */
    constructor(
        private readonly store: () => MediaLayoutSettings,
        private readonly keys: MediaLayoutKeys
    ) {}

    /** The saved moves, oldest first; none when nothing is saved or the store is not ready. */
    public LoadMoves(): MediaPlacementMove[] {
        return ParsePlacementMoves(this.read(this.keys.Moves));
    }

    /** The saved boxes, by surface key; none when nothing is saved or the store is not ready. */
    public LoadPipRects(): Map<string, MediaPipRect> {
        return ParsePipRects(this.read(this.keys.PipRects));
    }

    /** Saves the moves, the newest {@link MEDIA_LAYOUT_SAVED_LIMIT} of them. */
    public SaveMoves(moves: readonly MediaPlacementMove[]): void {
        this.write(this.keys.Moves, SerializePlacementMoves(moves.slice(-MEDIA_LAYOUT_SAVED_LIMIT)));
    }

    /** Saves the boxes, the newest {@link MEDIA_LAYOUT_SAVED_LIMIT} of them (the last in the map's order). */
    public SavePipRects(rects: ReadonlyMap<string, MediaPipRect>): void {
        this.write(this.keys.PipRects, SerializePipRects(new Map([...rects].slice(-MEDIA_LAYOUT_SAVED_LIMIT))));
    }

    /**
     * Whether the user hid their self-view: shown when nothing usable is saved, the store is not ready, or the host keeps
     * no self-view setting (it named no key for it).
     */
    public LoadSelfViewHidden(): boolean {
        const key = this.keys.SelfViewHidden;
        return key !== undefined && ParseSelfViewHidden(this.read(key));
    }

    /** Saves whether the user hid their self-view; nothing, for a host that keeps no self-view setting. */
    public SaveSelfViewHidden(hidden: boolean): void {
        const key = this.keys.SelfViewHidden;
        if (key !== undefined) {
            this.write(key, SerializeSelfViewHidden(hidden));
        }
    }

    private read(key: string): string | undefined {
        try {
            return this.store().GetSetting(key);
        } catch {
            return undefined;
        }
    }

    private write(key: string, value: string): void {
        try {
            this.store().SetSettingDebounced(key, value);
        } catch {
            // The store is not ready, or failed to save: the layout lasts for this session only.
        }
    }
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
