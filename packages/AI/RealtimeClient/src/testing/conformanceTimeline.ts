/**
 * @fileoverview The ordered record of one conformance session: what the driver did with the kit's recorders (the
 * avatar's video players and the PCM playback), what the client emitted, and what it logged. Checks read it by kind and
 * from a mark, so "since the barge-in" and "in this turn" are one slice.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */
import type { RealtimeTrack, RealtimeVideoFrame } from '@memberjunction/ai';
import type { RealtimeClientError, RealtimeClientState, RealtimeClientUsage } from '../generic/baseRealtimeClient';
import type { MediaVideoSource } from '../media/model';
import type { VideoPlayoutOptions } from '../media/videoPlayout';

/**
 * One thing that happened in a conformance session, in the order it happened. `Player` numbers the video players the
 * driver created in the session, from 0.
 */
export type RealtimeVideoConformanceEvent =
    /** The driver created a video player. */
    | { Kind: 'player-created'; Player: number; Options: VideoPlayoutOptions }
    /** The driver handed a frame of video to a player. */
    | { Kind: 'player-append'; Player: number; Frame: RealtimeVideoFrame }
    /** The driver told a player the turn's video is all in. */
    | { Kind: 'player-end-of-turn'; Player: number }
    /** The driver dropped what a player had not played (barge-in). */
    | { Kind: 'player-flush'; Player: number }
    /** The driver released a player. */
    | { Kind: 'player-dispose'; Player: number }
    /** The driver changed whether a player plays the video's audio. */
    | { Kind: 'player-carries-voice'; Player: number; CarriesVoice: boolean }
    /** The driver queued PCM on the voice playback, with its media time when the driver gave one. */
    | { Kind: 'voice-enqueue'; Data: ArrayBuffer; MediaTimeMs?: number }
    /** The driver dropped the PCM the voice playback had not played. */
    | { Kind: 'voice-flush' }
    /** The driver closed the voice playback. */
    | { Kind: 'voice-close' }
    /** The client reported a state. */
    | { Kind: 'state'; State: RealtimeClientState }
    /** The client handed over the agent's video (`OnRemoteVideo`). */
    | { Kind: 'remote-video'; Video: MediaVideoSource }
    /** The client reported a barge-in (`OnInterruption`). */
    | { Kind: 'interruption' }
    /** The client reported usage (`OnUsage`). */
    | { Kind: 'usage'; Usage: RealtimeClientUsage }
    /** The client reported a track's state (`OnTrackStateChange`). */
    | { Kind: 'track'; Track: RealtimeTrack }
    /** The client reported an error (`OnError`). */
    | { Kind: 'error'; Error: RealtimeClientError }
    /** Something logged a warning while the session ran. */
    | { Kind: 'warn'; Message: string }
    /** Something logged an info line while the session ran. */
    | { Kind: 'info'; Message: string };

/** The kinds of {@link RealtimeVideoConformanceEvent}. */
export type RealtimeVideoConformanceEventKind = RealtimeVideoConformanceEvent['Kind'];

/** The event of one kind. */
export type RealtimeVideoConformanceEventOf<K extends RealtimeVideoConformanceEventKind> = Extract<RealtimeVideoConformanceEvent, { Kind: K }>;

/** An ordered, append-only record of a conformance session, shared by its recorders and its observers. */
export class RealtimeVideoConformanceTimeline {
    private readonly entries: RealtimeVideoConformanceEvent[] = [];

    /** Every event, in order. */
    public get Entries(): readonly RealtimeVideoConformanceEvent[] {
        return this.entries;
    }

    /** Appends one event. */
    public Record(event: RealtimeVideoConformanceEvent): void {
        this.entries.push(event);
    }

    /** The position the next event will take. Pass it to {@link Of} or {@link Since} to read only what came after. */
    public Mark(): number {
        return this.entries.length;
    }

    /** The events from a mark on. */
    public Since(mark: number): readonly RealtimeVideoConformanceEvent[] {
        return this.entries.slice(mark);
    }

    /**
     * The events of one kind, in order, from a mark on.
     *
     * @param kind The kind to keep.
     * @param since A {@link Mark}; default the start of the session.
     */
    public Of<K extends RealtimeVideoConformanceEventKind>(kind: K, since: number = 0): RealtimeVideoConformanceEventOf<K>[] {
        return this.entries.slice(since).filter((event): event is RealtimeVideoConformanceEventOf<K> => event.Kind === kind);
    }
}
