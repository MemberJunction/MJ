/**
 * @fileoverview A microphone for conformance sessions: a `MediaStream` with one audio track that captures nothing. It
 * needs no devices and no DOM, only `EventTarget`, so the kit runs in plain Node. The track and the stream are plain
 * objects with the platform's member names, so a driver uses them as it uses the browser's.
 *
 * @module @memberjunction/ai-realtime-client/testing
 */

/** The `EventTarget` half of a platform object, delegated to a real `EventTarget`. */
function eventTargetOf(events: EventTarget): Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'> {
    return {
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events),
    };
}

/** An audio track that captures nothing. `stop()` ends it, as a real track's does. */
function createSilentAudioTrack(): MediaStreamTrack {
    let readyState: MediaStreamTrackState = 'live';
    return {
        ...eventTargetOf(new EventTarget()),
        contentHint: '',
        enabled: true,
        id: 'conformance-microphone-track',
        kind: 'audio',
        label: 'Conformance microphone',
        muted: false,
        onended: null,
        onmute: null,
        onunmute: null,
        get readyState(): MediaStreamTrackState {
            return readyState;
        },
        applyConstraints: async (): Promise<void> => undefined,
        clone: (): MediaStreamTrack => createSilentAudioTrack(),
        getCapabilities: (): MediaTrackCapabilities => ({}),
        getConstraints: (): MediaTrackConstraints => ({}),
        getSettings: (): MediaTrackSettings => ({}),
        stop: (): void => {
            readyState = 'ended';
        },
    };
}

/** A stream of the tracks it was made with. */
function createStream(tracks: MediaStreamTrack[]): MediaStream {
    return {
        ...eventTargetOf(new EventTarget()),
        active: true,
        id: 'conformance-microphone',
        onaddtrack: null,
        onremovetrack: null,
        addTrack: (track: MediaStreamTrack): void => {
            tracks.push(track);
        },
        clone: (): MediaStream => createStream([...tracks]),
        getAudioTracks: (): MediaStreamTrack[] => tracks.filter((track) => track.kind === 'audio'),
        getTrackById: (trackId: string): MediaStreamTrack | null => tracks.find((track) => track.id === trackId) ?? null,
        getTracks: (): MediaStreamTrack[] => [...tracks],
        getVideoTracks: (): MediaStreamTrack[] => tracks.filter((track) => track.kind === 'video'),
        removeTrack: (track: MediaStreamTrack): void => {
            const index = tracks.indexOf(track);
            if (index >= 0) {
                tracks.splice(index, 1);
            }
        },
    };
}

/** A microphone stream with one audio track that captures nothing, to connect a driver with. */
export function CreateConformanceMicrophone(): MediaStream {
    return createStream([createSilentAudioTrack()]);
}
