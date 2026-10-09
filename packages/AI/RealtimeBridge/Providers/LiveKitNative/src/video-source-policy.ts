/**
 * @fileoverview Which cameras and shared screens the agent's bot shows the model: a ranking, and a hold that stops the
 * view flapping between speakers.
 *
 * ## Ranking (best first; the bot reads the top `Streams`)
 * 1. **Shared screens**, the most recently shared first. A share takes the view at once.
 * 2. **The active speaker's camera**: the person leading the room's active-speaker list whose camera can be read, once
 *    they have led for the onset ({@link DEFAULT_SPEAKER_ONSET_MS}).
 * 3. **The camera being read.**
 * 4. **The camera of whoever spoke most recently.**
 * 5. **The first camera in room order** (participants in join order, their tracks in publish order), so the model sees
 *    someone as soon as anyone lets agents see them.
 *
 * ## Hold
 * A camera whose first frame reached the model less than the dwell ago ({@link DEFAULT_SPEAKER_HOLD_MS}) keeps its
 * place against another camera; a shared screen still replaces it. Withdrawn consent, leaving and every other end are
 * handled by the watcher before the policy runs, at once: the policy only ever sees sources that may be read.
 *
 * One camera and one screen per person, since the model tells sources apart by person and kind.
 *
 * Pure: no I/O, no timers, no SDK types. {@link RoomVideoWatcher} builds the snapshot and applies the picks.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import type { NativeRoomVideoSourceKind } from '@memberjunction/ai-bridge-livekit';

/** How long (ms) a person must lead the active-speaker list before the view moves to their camera. */
export const DEFAULT_SPEAKER_ONSET_MS = 1500;

/** How long (ms) a camera stays in view, counted from its first frame, before another camera may replace it. */
export const DEFAULT_SPEAKER_HOLD_MS = 4000;

/** Why the policy picked a source; the watcher logs it with each switch. */
export type VideoSourcePickReason = 'screen' | 'speaker' | 'kept' | 'last-speaker' | 'room-order';

/** A source that may be read: an unmuted camera or shared screen of a person who lets agents see them. */
export interface VideoSourceCandidate {
    /** Unique per publication. */
    Key: string;
    /** Who publishes it. */
    OwnerIdentity: string;
    /** A camera or a shared screen. */
    Kind: NativeRoomVideoSourceKind;
    /** For a screen, when the bot learned of the share: a higher number is more recent. Ignored for a camera. */
    ShareOrder: number;
    /** Its place in room order: participants in join order, their tracks in publish order. */
    RoomOrder: number;
}

/** A source the bot reads now, or has asked for and waits for. */
export interface VideoSourceSelection {
    /** The candidate key it was picked under. */
    Key: string;
    /** A camera or a shared screen. */
    Kind: NativeRoomVideoSourceKind;
    /** When its first frame reached the model (the dwell starts there); absent before. */
    FirstFrameAtMs?: number;
}

/** The person leading the active-speaker list among those whose camera can be read, and since when. */
export interface VideoSpeakerLeader {
    /** Their participant identity. */
    Identity: string;
    /** When they started leading. */
    SinceMs: number;
}

/** Everything the policy decides from. All times are on one monotonic millisecond clock. */
export interface VideoSourcePolicyInput {
    /** The sources that may be read now. */
    Candidates: readonly VideoSourceCandidate[];
    /** The sources being read, in the order they were picked. */
    Selected: readonly VideoSourceSelection[];
    /** The active-speaker leader, if anyone whose camera can be read is speaking. */
    Leader?: VideoSpeakerLeader;
    /** Each person's last time in the active-speaker list. */
    LastSpokeAtMs: ReadonlyMap<string, number>;
    /** Now. */
    NowMs: number;
    /** How many sources the model takes at once. */
    Streams: number;
    /** {@link DEFAULT_SPEAKER_ONSET_MS} or an override. */
    OnsetMs: number;
    /** {@link DEFAULT_SPEAKER_HOLD_MS} or an override. */
    HoldMs: number;
}

/** One source the policy picked. */
export interface VideoSourcePick {
    /** The candidate's key. */
    Key: string;
    /** The rule that put it there. */
    Reason: VideoSourcePickReason;
}

/** What the policy decided. */
export interface VideoSourcePolicyResult {
    /** The sources to read, best first; at most `Streams`. */
    Picks: VideoSourcePick[];
    /** The sources it would pick with no hold; they differ from {@link Picks} while the hold delays a change. */
    UnheldPicks: VideoSourcePick[];
    /** When the delayed change may happen; absent when the hold delays nothing. */
    NextChangeAtMs?: number;
}

/**
 * The active-speaker leader after a change of the speaker list or of who can be read: the first person in the list
 * (as LiveKit ordered it) whose camera can be read. The same person keeps their start time; anyone else starts now.
 *
 * @param previous The leader before this change.
 * @param speakerIdentities The active-speaker list, people only.
 * @param cameraOwners Who has a camera that may be read.
 * @param nowMs Now.
 */
export function NextVideoSpeakerLeader(
    previous: VideoSpeakerLeader | undefined,
    speakerIdentities: readonly string[],
    cameraOwners: ReadonlySet<string>,
    nowMs: number,
): VideoSpeakerLeader | undefined {
    const identity = speakerIdentities.find((id) => cameraOwners.has(id));
    if (identity === undefined) {
        return undefined;
    }
    return previous?.Identity === identity ? previous : { Identity: identity, SinceMs: nowMs };
}

/**
 * Picks the sources the model sees: the top `Streams` of the ranking (see the file header), with the hold applied.
 *
 * @param input The snapshot to decide from.
 */
export function ChooseVideoSources(input: VideoSourcePolicyInput): VideoSourcePolicyResult {
    const candidates = onePerPersonAndKind(input.Candidates, input.Selected);
    const streams = Math.max(0, Math.floor(input.Streams));
    const unheld = rankVideoSources(candidates, input, true).slice(0, streams);
    const picks = keepDwellingCameras(rankVideoSources(candidates, input, false).slice(0, streams), candidates, input);
    if (sameKeys(picks, unheld)) {
        return { Picks: picks, UnheldPicks: unheld };
    }
    return { Picks: picks, UnheldPicks: unheld, NextChangeAtMs: nextChangeAt(candidates, input) };
}

/** Whether the speaker leader takes the view: they have led for the onset, or the onset is being ignored. */
function leaderTakesView(input: VideoSourcePolicyInput, ignoreOnset: boolean): boolean {
    return input.Leader !== undefined && (ignoreOnset || input.NowMs - input.Leader.SinceMs >= input.OnsetMs);
}

/** Every candidate, best first, each tagged with the rule that ranked it. */
function rankVideoSources(candidates: readonly VideoSourceCandidate[], input: VideoSourcePolicyInput, ignoreOnset: boolean): VideoSourcePick[] {
    const ranked: VideoSourcePick[] = [];
    const add = (list: readonly VideoSourceCandidate[], reason: VideoSourcePickReason): void => {
        for (const candidate of list) {
            if (!ranked.some((pick) => pick.Key === candidate.Key)) {
                ranked.push({ Key: candidate.Key, Reason: reason });
            }
        }
    };
    const cameras = candidates.filter((c) => c.Kind === 'camera');
    add([...candidates.filter((c) => c.Kind === 'screen')].sort((a, b) => b.ShareOrder - a.ShareOrder), 'screen');
    if (leaderTakesView(input, ignoreOnset)) {
        add(cameras.filter((c) => c.OwnerIdentity === input.Leader?.Identity), 'speaker');
    }
    add(inSelectionOrder(cameras, input.Selected), 'kept');
    add(byLastSpoke(cameras, input.LastSpokeAtMs), 'last-speaker');
    add([...cameras].sort((a, b) => a.RoomOrder - b.RoomOrder), 'room-order');
    return ranked;
}

/** The cameras being read, in the order they were picked. */
function inSelectionOrder(cameras: readonly VideoSourceCandidate[], selected: readonly VideoSourceSelection[]): VideoSourceCandidate[] {
    return selected.flatMap((s) => cameras.filter((c) => c.Key === s.Key));
}

/** The cameras of people who have spoken, the most recent speaker first. */
function byLastSpoke(cameras: readonly VideoSourceCandidate[], lastSpokeAtMs: ReadonlyMap<string, number>): VideoSourceCandidate[] {
    return cameras
        .filter((c) => lastSpokeAtMs.has(c.OwnerIdentity))
        .sort((a, b) => (lastSpokeAtMs.get(b.OwnerIdentity) ?? 0) - (lastSpokeAtMs.get(a.OwnerIdentity) ?? 0));
}

/**
 * The dwell: a camera being read whose first frame reached the model less than the hold ago keeps its place against
 * another camera. It takes the place of the lowest-ranked camera pick that is not itself dwelling; when every pick is a
 * screen or a dwelling camera, it gives way (a screen always wins).
 */
function keepDwellingCameras(picks: VideoSourcePick[], candidates: readonly VideoSourceCandidate[], input: VideoSourcePolicyInput): VideoSourcePick[] {
    const result = [...picks];
    const dwelling = dwellingCameras(candidates, input);
    const dwellingKeys = new Set(dwelling.map((s) => s.Key));
    const kindOf = new Map(candidates.map((c) => [c.Key, c.Kind]));
    for (const held of dwelling) {
        if (result.some((pick) => pick.Key === held.Key)) {
            continue;
        }
        const index = lastIndexWhere(result, (pick) => kindOf.get(pick.Key) === 'camera' && !dwellingKeys.has(pick.Key));
        if (index >= 0) {
            result[index] = { Key: held.Key, Reason: 'kept' };
        }
    }
    return result;
}

/** The cameras being read that are still candidates and whose first frame reached the model less than the hold ago. */
function dwellingCameras(candidates: readonly VideoSourceCandidate[], input: VideoSourcePolicyInput): VideoSourceSelection[] {
    const readable = new Set(candidates.map((c) => c.Key));
    return input.Selected.filter(
        (s) =>
            s.Kind === 'camera' &&
            readable.has(s.Key) &&
            s.FirstFrameAtMs !== undefined &&
            input.NowMs - s.FirstFrameAtMs < input.HoldMs,
    );
}

/** The earliest moment the hold could stop delaying a change: the leader's onset ends, or a dwelling camera's dwell. */
function nextChangeAt(candidates: readonly VideoSourceCandidate[], input: VideoSourcePolicyInput): number | undefined {
    const times = dwellingCameras(candidates, input).map((s) => (s.FirstFrameAtMs ?? input.NowMs) + input.HoldMs);
    if (input.Leader && input.Leader.SinceMs + input.OnsetMs > input.NowMs) {
        times.push(input.Leader.SinceMs + input.OnsetMs);
    }
    return times.length > 0 ? Math.min(...times) : undefined;
}

/**
 * One camera and one screen per person: the one being read when there is one, else the first camera in room order or the
 * newest screen. Keeps the candidates' order.
 */
function onePerPersonAndKind(candidates: readonly VideoSourceCandidate[], selected: readonly VideoSourceSelection[]): VideoSourceCandidate[] {
    const selectedKeys = new Set(selected.map((s) => s.Key));
    const best = new Map<string, VideoSourceCandidate>();
    for (const candidate of candidates) {
        const slot = `${candidate.Kind}:${candidate.OwnerIdentity}`;
        const current = best.get(slot);
        if (!current || isPreferred(candidate, current, selectedKeys)) {
            best.set(slot, candidate);
        }
    }
    return candidates.filter((c) => best.get(`${c.Kind}:${c.OwnerIdentity}`) === c);
}

/** Whether `candidate` beats `current` for the same person and kind. */
function isPreferred(candidate: VideoSourceCandidate, current: VideoSourceCandidate, selectedKeys: ReadonlySet<string>): boolean {
    if (selectedKeys.has(candidate.Key) !== selectedKeys.has(current.Key)) {
        return selectedKeys.has(candidate.Key);
    }
    return candidate.Kind === 'screen' ? candidate.ShareOrder > current.ShareOrder : candidate.RoomOrder < current.RoomOrder;
}

/** Whether two pick lists name the same sources, in any order. */
function sameKeys(a: readonly VideoSourcePick[], b: readonly VideoSourcePick[]): boolean {
    return a.length === b.length && a.every((pick) => b.some((other) => other.Key === pick.Key));
}

/** The index of the last item that matches, or -1. */
function lastIndexWhere<T>(items: readonly T[], match: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) {
        if (match(items[i])) {
            return i;
        }
    }
    return -1;
}
