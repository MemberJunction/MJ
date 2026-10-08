/**
 * @fileoverview MEDIA ELEMENT AUDIO ROUTER: takes a media element's audio into Web Audio once per page and hands it out
 * as a `MediaStream`, so every realtime call that shows the element can play, meter and record its voice.
 *
 * A browser connects an element to Web Audio only once, ever (`createMediaElementSource`). Connected inside one call's
 * audio context, an element would be silent in every later call, and silent for good once that context closed. So the
 * router owns one page-level `AudioContext`, created on the first route and resumed whenever it is found suspended. It
 * routes each element into a `MediaStreamAudioDestinationNode`, never into its own speakers, so the element is heard
 * only through the calls that take its stream, and it returns that same stream for the element every time.
 *
 * An element stays routed for the life of the page: its source node keeps it referenced. A player detaches its media
 * when it lets an element go, so what stays behind is small.
 *
 * @module @memberjunction/ai-realtime-client
 */
import { BaseSingleton } from '@memberjunction/global';

/** Routes media elements' audio into one page-level audio context and hands each one out as a stream. */
export class MediaElementAudioRouter extends BaseSingleton<MediaElementAudioRouter> {
    /** The page's routing context: `undefined` until the first route, `null` when this browser could not create one. */
    private context: AudioContext | null | undefined = undefined;
    /** Each element routed, with the stream that carries its audio; `null` for an element the browser refused. */
    private readonly streams = new WeakMap<HTMLMediaElement, MediaStream | null>();

    protected constructor() {
        super();
    }

    /** The page's router. */
    public static get Instance(): MediaElementAudioRouter {
        return super.getInstance<MediaElementAudioRouter>();
    }

    /**
     * The stream that carries `element`'s audio. The first call for an element routes it; every later call returns the
     * same stream. Resumes the routing context when it is suspended. `null` when this browser can't route the element
     * (no Web Audio, or the element already feeds an audio context the router doesn't own), logged once per element;
     * never throws.
     *
     * @param element The element whose audio a call wants.
     */
    public StreamFor(element: HTMLMediaElement): MediaStream | null {
        const context = this.ensureContext();
        if (this.streams.has(element)) {
            return this.streams.get(element) ?? null;
        }
        const stream = context ? this.route(context, element) : null;
        this.streams.set(element, stream);
        return stream;
    }

    /** The routing context, created on first use and resumed when suspended; `null` when it can't be created. */
    private ensureContext(): AudioContext | null {
        if (this.context === undefined) {
            this.context = MediaElementAudioRouter.createContext();
        }
        const context = this.context;
        if (context?.state === 'suspended') {
            context.resume().catch((error) => {
                console.warn('[MediaElementAudioRouter] Could not resume the audio context that carries media elements\' audio:', error);
            });
        }
        return context;
    }

    private static createContext(): AudioContext | null {
        try {
            return new AudioContext();
        } catch (error) {
            console.warn('[MediaElementAudioRouter] Web Audio is not available: media elements\' audio stays on the elements.', error);
            return null;
        }
    }

    /** Connects the element's audio to a new stream destination, and to nothing else. */
    private route(context: AudioContext, element: HTMLMediaElement): MediaStream | null {
        try {
            const destination = context.createMediaStreamDestination();
            context.createMediaElementSource(element).connect(destination);
            return destination.stream;
        } catch (error) {
            console.warn('[MediaElementAudioRouter] Could not route the media element\'s audio, so calls that show it will not carry its voice:', error);
            return null;
        }
    }
}
