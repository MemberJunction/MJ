import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimePcmPlayback } from '../audio/pcmPlayback';
import { InstallFakeDom } from './helpers/fake-dom';
import { FakeWebAudioContext, InstallFakeWebAudio, ResetMediaElementAudioRouter } from './helpers/fake-web-audio';

/** Records every `connect(target)` so tests can assert the audio graph's edges. */
class FakeNode {
    public Targets: unknown[] = [];
    public buffer: unknown = null;
    public onended: (() => void) | null = null;
    public connect(target: unknown): void {
        this.Targets.push(target);
    }
    public start(_when: number): void {}
    public stop(): void {}
}

const STREAM_SENTINEL = { id: 'tap-stream' } as unknown as MediaStream;
const DESTINATION_SENTINEL = { id: 'speakers' };

let lastContext: FakeAudioContext | null = null;
let withStreamDestination = true;

class FakeAudioContext {
    public currentTime = 0;
    public destination = DESTINATION_SENTINEL;
    public Gain = new FakeNode();
    public StreamDestination = { stream: STREAM_SENTINEL };
    public Sources: FakeNode[] = [];

    constructor(_options?: AudioContextOptions) {
        lastContext = this;
        if (withStreamDestination) {
            (this as unknown as { createMediaStreamDestination: () => unknown }).createMediaStreamDestination = () =>
                this.StreamDestination;
        }
    }
    public createGain(): FakeNode {
        return this.Gain;
    }
    public createBuffer(_channels: number, length: number, rate: number): unknown {
        return { duration: length / rate, copyToChannel: () => {} };
    }
    public createBufferSource(): FakeNode {
        const source = new FakeNode();
        this.Sources.push(source);
        return source;
    }
    public async close(): Promise<void> {}
}

describe('RealtimePcmPlayback output stream', () => {
    const original = (globalThis as { AudioContext?: unknown }).AudioContext;

    beforeEach(() => {
        lastContext = null;
        withStreamDestination = true;
        (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
    });
    afterEach(() => {
        (globalThis as { AudioContext?: unknown }).AudioContext = original;
    });

    it('GetOutputStream returns the stream destination node stream', () => {
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBe(STREAM_SENTINEL);
    });

    it('routes the master gain to both the speakers and the stream tap', () => {
        new RealtimePcmPlayback(24000);
        const targets = lastContext!.Gain.Targets;
        expect(targets).toContain(DESTINATION_SENTINEL);
        expect(targets).toContain(lastContext!.StreamDestination);
    });

    it('connects enqueued chunks to the master gain so the tap carries them', () => {
        const playback = new RealtimePcmPlayback(24000);
        playback.Enqueue(new Int16Array([1000, -1000, 500]).buffer);
        expect(lastContext!.Sources).toHaveLength(1);
        expect(lastContext!.Sources[0].Targets).toEqual([lastContext!.Gain]);
    });

    it('returns null and still constructs when the context has no createMediaStreamDestination', () => {
        withStreamDestination = false;
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBeNull();
        expect(lastContext!.Gain.Targets).toEqual([DESTINATION_SENTINEL]);
    });

    it('still constructs, keeps the speakers wired, and warns when creating the recording tap throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            class ThrowingTapContext extends FakeAudioContext {
                constructor(options?: AudioContextOptions) {
                    super(options);
                    (this as unknown as { createMediaStreamDestination: () => unknown }).createMediaStreamDestination = () => {
                        throw new Error('tap unavailable');
                    };
                }
            }
            (globalThis as { AudioContext?: unknown }).AudioContext = ThrowingTapContext;

            const playback = new RealtimePcmPlayback(24000);

            expect(playback.GetOutputStream()).toBeNull();
            expect(lastContext!.Gain.Targets).toEqual([DESTINATION_SENTINEL]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0][0])).toContain('Could not create the recording tap');
        } finally {
            warn.mockRestore();
        }
    });
});

describe('RealtimePcmPlayback.ConnectMediaElement', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        ResetMediaElementAudioRouter();
        InstallFakeWebAudio();
        InstallFakeDom();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        ResetMediaElementAudioRouter();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    /** The playback's own context: the one built with its sample rate (the router's has no options). */
    function contextOf(index = 0): FakeWebAudioContext {
        const playbacks = FakeWebAudioContext.Instances.filter((c) => c.Options?.sampleRate === 24000);
        return playbacks[index];
    }

    function routerContext(): FakeWebAudioContext | undefined {
        return FakeWebAudioContext.Instances.find((c) => c.Options === undefined);
    }

    it("takes the element's stream from the page router into its master gain, where the speakers, the meter and the tap take it", () => {
        const playback = new RealtimePcmPlayback(24000);
        const element = document.createElement('video');
        playback.ConnectMediaElement(element);

        const own = contextOf();
        const router = routerContext();
        expect(router?.ElementSources.map((node) => node.From)).toEqual([element]);
        expect(own.ElementSources).toEqual([]);
        expect(own.StreamSources.map((node) => node.From)).toEqual([router?.StreamDestinations[0].stream]);
        const masterGain = own.Gains[0];
        expect(own.StreamSources[0].Targets).toEqual([masterGain]);
        expect(masterGain.Targets).toEqual([own.destination, own.StreamDestinations[0]]);
    });

    it('two playbacks sharing one element both carry its audio, from one source node', () => {
        const element = document.createElement('video');
        const first = new RealtimePcmPlayback(24000);
        first.ConnectMediaElement(element);
        first.Close();
        const second = new RealtimePcmPlayback(24000);
        second.ConnectMediaElement(element);

        const stream = routerContext()?.StreamDestinations[0].stream;
        expect(routerContext()?.ElementSources).toHaveLength(1);
        for (const own of [contextOf(0), contextOf(1)]) {
            expect(own.StreamSources.map((node) => node.From)).toEqual([stream]);
            expect(own.StreamSources[0].Targets).toEqual([own.Gains[0]]);
        }
    });

    it('takes an element once per playback', () => {
        const playback = new RealtimePcmPlayback(24000);
        const element = document.createElement('video');
        playback.ConnectMediaElement(element);
        playback.ConnectMediaElement(element);
        expect(contextOf().StreamSources).toHaveLength(1);
    });

    it('adds nothing and does not throw when the router refuses the element (the router logs why)', () => {
        const playback = new RealtimePcmPlayback(24000);
        playback.ConnectMediaElement(document.createElement('video'));
        const router = routerContext();
        if (!router) {
            throw new Error('The router built no context.');
        }
        router.RefuseElements = true;

        expect(() => playback.ConnectMediaElement(document.createElement('video'))).not.toThrow();
        expect(contextOf().StreamSources).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('[MediaElementAudioRouter] Could not route the media element');
    });

    it("logs, and does not throw, when it can't take the router's stream", () => {
        const playback = new RealtimePcmPlayback(24000);
        vi.spyOn(contextOf(), 'createMediaStreamSource').mockImplementation(() => {
            throw new Error('the stream has ended');
        });

        expect(() => playback.ConnectMediaElement(document.createElement('video'))).not.toThrow();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain("Could not take the media element's audio");
    });
});
