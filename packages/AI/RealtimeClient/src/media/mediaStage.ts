/**
 * @fileoverview MEDIA STAGE: a headless layout model. Participants, placeable surfaces and the user's moves go
 * in; a layout comes out: one stage, a stack of picture-in-picture tiles, tabs, hidden surfaces, the other
 * participants (for a filmstrip or grid), and a screen-share split. It knows nothing about Angular, the DOM,
 * LiveKit or the realtime client, so the realtime overlay and the meeting room lay out the same way.
 *
 * Placement rules:
 * - A surface goes where the user last moved it, if that placement is allowed for it; otherwise to its default.
 * - **One stage.** The surface the user moved to the stage most recently wins it. A surface it displaces goes
 *   to its own default placement, or to a PiP when its default is also the stage. With no move, the first
 *   surface whose default is the stage keeps it, so a new surface never takes the stage on its own.
 * - **PiPs stack** in one corner, newest first: the latest move first, then surfaces by when they appeared.
 * - When no surface holds the stage, the spotlight participant does: a pin, then the active speaker, then a
 *   speaking participant, then the agent, then the first other participant, then the user.
 * - A participant already shown through a surface on the stage or in a PiP (the avatar, the user's camera) is not
 *   repeated among the others, and one shown in a PiP does not take the spotlight: the next in line does.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

import type { MediaParticipant, MediaPlacement, MediaPlacementMove, MediaSurface } from './model';
import { MEDIA_PLACEMENTS } from './model';

/** What the stage is laid out from. */
export interface MediaStageInput {
    /** Everyone in the session. The local user has `Role: 'self'`. */
    Participants: readonly MediaParticipant[];
    /** Identities the platform reports as speaking, most recent first (a meeting room's active-speaker list). */
    ActiveSpeakers?: readonly string[];
    /** Surfaces that can be placed, in the order they appeared. */
    Surfaces?: readonly MediaSurface[];
    /** The user's moves, oldest first. Only each surface's latest move counts, so a host may keep just those, in order. */
    Moves?: readonly MediaPlacementMove[];
    /** A participant the user pinned to the stage. */
    PinnedIdentity?: string | null;
    /** Whether the user's own tile is among the other participants. Defaults to true. */
    ShowSelfView?: boolean;
}

/** One tile: a placed surface, or a participant. */
export type MediaTile = { Kind: 'surface'; Surface: MediaSurface } | { Kind: 'participant'; Participant: MediaParticipant };

/** Where everything goes. */
export interface MediaStageLayout {
    /** What fills the stage: a surface placed there, else the spotlight participant; null for an empty session. */
    Stage: MediaTile | null;
    /** Picture-in-picture surfaces, newest first. */
    Pips: readonly MediaSurface[];
    /** Surfaces shown as tabs, in the order they appeared. */
    Tabs: readonly MediaSurface[];
    /** Surfaces the user hid, so the UI can offer them back. */
    Hidden: readonly MediaSurface[];
    /** Participants not already on screen (on the stage or in a PiP), for a filmstrip or grid; the user first when shown. */
    Others: readonly MediaParticipant[];
    /** The screen being shared and the current speaker, for a split view; null when nobody is sharing. */
    Split: { Sharer: MediaParticipant; Speaker: MediaParticipant | null } | null;
}

/** Lays out the stage. Pure: the same input always gives the same layout. */
export function LayoutMediaStage(input: MediaStageInput): MediaStageLayout {
    const placed = ResolveSurfacePlacements(input.Surfaces ?? [], input.Moves ?? []);
    const inPips = new Set(placed.Pips.flatMap((s) => (s.Video ? [s.Video.ParticipantIdentity] : [])));
    const candidates = input.Participants.filter((p) => !inPips.has(p.Identity));
    const spotlight = placed.Stage ? null : SelectSpotlight(candidates, input.ActiveSpeakers ?? [], input.PinnedIdentity ?? null);
    const onScreen = new Set([placed.Stage, ...placed.Pips].flatMap((s) => (s?.Video ? [s.Video.ParticipantIdentity] : [])));
    if (spotlight) {
        onScreen.add(spotlight.Identity);
    }
    const shown = SelectDisplayParticipants(input.Participants, input.ShowSelfView ?? true);
    return {
        Stage: placed.Stage ? { Kind: 'surface', Surface: placed.Stage } : spotlight ? { Kind: 'participant', Participant: spotlight } : null,
        Pips: placed.Pips,
        Tabs: placed.Tabs,
        Hidden: placed.Hidden,
        Others: shown.filter((p) => !onScreen.has(p.Identity)),
        Split: selectSplit(input.Participants, input.ActiveSpeakers ?? []),
    };
}

/** Each surface's placement after the user's moves, with the one-stage and PiP-order rules applied. */
export function ResolveSurfacePlacements(
    surfaces: readonly MediaSurface[],
    moves: readonly MediaPlacementMove[]
): { Stage: MediaSurface | null; Pips: MediaSurface[]; Tabs: MediaSurface[]; Hidden: MediaSurface[] } {
    const latestMove = latestMoves(surfaces, moves);
    const wanted = new Map(surfaces.map((s) => [s.Key, latestMove.get(s.Key)?.Placement ?? s.DefaultPlacement]));
    const stage = pickStage(surfaces, wanted, latestMove);
    const result = { Stage: stage, Pips: [] as MediaSurface[], Tabs: [] as MediaSurface[], Hidden: [] as MediaSurface[] };
    for (const surface of surfaces) {
        if (surface === stage) {
            continue;
        }
        const placement = wanted.get(surface.Key) === 'stage' ? PlacementOffStage(surface) : (wanted.get(surface.Key) ?? surface.DefaultPlacement);
        if (placement === 'pip') {
            result.Pips.push(surface);
        } else if (placement === 'tab') {
            result.Tabs.push(surface);
        } else if (placement === 'hidden') {
            result.Hidden.push(surface);
        }
    }
    result.Pips.sort((a, b) => recency(b, surfaces, latestMove) - recency(a, surfaces, latestMove));
    return result;
}

/**
 * The spotlight participant: a pin, then the active speaker, then a speaking participant, then the agent, then
 * the first other participant, then the user.
 */
export function SelectSpotlight(
    participants: readonly MediaParticipant[],
    activeSpeakers: readonly string[],
    pinnedIdentity: string | null
): MediaParticipant | null {
    const pinned = pinnedIdentity ? participants.find((p) => p.Identity === pinnedIdentity) : undefined;
    if (pinned) {
        return pinned;
    }
    const others = participants.filter((p) => p.Role !== 'self');
    const speakerId = activeSpeakers.find((id) => others.some((p) => p.Identity === id));
    // The platform's active-speaker list can miss a server-published agent; a participant's own speaking flag
    // catches it.
    const speaking = (speakerId ? others.find((p) => p.Identity === speakerId) : undefined) ?? others.find((p) => p.IsSpeaking);
    return speaking ?? others.find((p) => p.Role === 'agent') ?? others[0] ?? participants.find((p) => p.Role === 'self') ?? null;
}

/** The participants to show in a filmstrip or grid: the user first, when shown. */
export function SelectDisplayParticipants(participants: readonly MediaParticipant[], showSelfView: boolean): MediaParticipant[] {
    const self = participants.filter((p) => p.Role === 'self');
    const others = participants.filter((p) => p.Role !== 'self');
    return showSelfView ? [...self, ...others] : others;
}

/** The first participant sharing a screen, if any. */
export function SelectScreenSharer(participants: readonly MediaParticipant[]): MediaParticipant | null {
    return participants.find((p) => p.Video.screen !== undefined) ?? null;
}

/** The speaker pane beside a shared screen: the active speaker other than the sharer, then the agent, then the first other non-sharer, then the user. */
export function SelectSplitSpeaker(participants: readonly MediaParticipant[], activeSpeakers: readonly string[]): MediaParticipant | null {
    const sharerId = SelectScreenSharer(participants)?.Identity;
    const speakerId = activeSpeakers.find((id) => id !== sharerId && participants.some((p) => p.Identity === id));
    const speaking =
        (speakerId ? participants.find((p) => p.Identity === speakerId) : undefined) ??
        participants.find((p) => p.IsSpeaking && p.Identity !== sharerId);
    const others = participants.filter((p) => p.Role !== 'self');
    return speaking ?? others.find((p) => p.Role === 'agent') ?? others.find((p) => p.Identity !== sharerId) ?? participants.find((p) => p.Role === 'self') ?? null;
}

function selectSplit(participants: readonly MediaParticipant[], activeSpeakers: readonly string[]): MediaStageLayout['Split'] {
    const sharer = SelectScreenSharer(participants);
    return sharer ? { Sharer: sharer, Speaker: SelectSplitSpeaker(participants, activeSpeakers) } : null;
}

/** Whether a placement is allowed for a surface. */
function allows(surface: MediaSurface, placement: MediaPlacement): boolean {
    return !surface.AllowedPlacements || surface.AllowedPlacements.includes(placement);
}

/** Each live surface's latest allowed move, with its position in the move list (its recency). */
function latestMoves(surfaces: readonly MediaSurface[], moves: readonly MediaPlacementMove[]): Map<string, { Placement: MediaPlacement; Order: number }> {
    const byKey = new Map(surfaces.map((s) => [s.Key, s]));
    const latest = new Map<string, { Placement: MediaPlacement; Order: number }>();
    moves.forEach((move, order) => {
        const surface = byKey.get(move.SurfaceKey);
        if (surface && allows(surface, move.Placement)) {
            latest.set(move.SurfaceKey, { Placement: move.Placement, Order: order });
        }
    });
    return latest;
}

/** The stage holder: the latest move to the stage, else the first surface whose default is the stage. */
function pickStage(
    surfaces: readonly MediaSurface[],
    wanted: Map<string, MediaPlacement>,
    latestMove: Map<string, { Placement: MediaPlacement; Order: number }>
): MediaSurface | null {
    const contenders = surfaces.filter((s) => wanted.get(s.Key) === 'stage');
    const moved = contenders.filter((s) => latestMove.get(s.Key)?.Placement === 'stage');
    if (moved.length > 0) {
        return moved.reduce((a, b) => ((latestMove.get(b.Key)?.Order ?? -1) > (latestMove.get(a.Key)?.Order ?? -1) ? b : a));
    }
    return contenders[0] ?? null;
}

/**
 * Where a surface goes when it leaves the stage, displaced by another or sent off it: its default, or the first allowed of
 * PiP, tab, hidden.
 */
export function PlacementOffStage(surface: MediaSurface): MediaPlacement {
    if (surface.DefaultPlacement !== 'stage' && allows(surface, surface.DefaultPlacement)) {
        return surface.DefaultPlacement;
    }
    return MEDIA_PLACEMENTS.slice(1).find((p) => allows(surface, p)) ?? 'hidden';
}

/** Higher is newer: a move outranks appearance order, and a later move outranks an earlier one. */
function recency(surface: MediaSurface, surfaces: readonly MediaSurface[], latestMove: Map<string, { Placement: MediaPlacement; Order: number }>): number {
    const move = latestMove.get(surface.Key);
    return move ? surfaces.length + move.Order : surfaces.indexOf(surface);
}
