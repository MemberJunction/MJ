/**
 * A fake Web Audio surface for the media element router and the PCM playback: every `AudioContext` built is recorded,
 * with the nodes created in it and what each was connected to. Install it with {@link InstallFakeWebAudio}; remove it
 * with `vi.unstubAllGlobals()`. {@link ResetMediaElementAudioRouter} forgets the page's router between tests.
 */
import { vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { MediaElementAudioRouter } from '../../audio/mediaElementAudioRouter';
import { FakeMediaStream } from './realtime-fakes';

/** A node that records every `connect(target)`, and what it was made from. */
export class FakeAudioNode {
    public readonly Targets: Array<FakeAudioNode | FakeStreamDestination> = [];
    public buffer: AudioBuffer | null = null;
    public onended: (() => void) | null = null;

    constructor(
        public readonly Kind: 'speakers' | 'gain' | 'element-source' | 'stream-source' | 'buffer-source',
        public readonly From: HTMLMediaElement | MediaStream | null = null
    ) {}

    public connect(target: FakeAudioNode | FakeStreamDestination): void {
        this.Targets.push(target);
    }
    public start(_when?: number): void {}
    public stop(): void {}
}

/** A `MediaStreamAudioDestinationNode`: each one carries its own stream. */
export class FakeStreamDestination {
    public readonly stream: MediaStream = new FakeMediaStream([]);
}

/** An audio context that records what was built in it. */
export class FakeWebAudioContext {
    /** Every context built, in order. */
    public static readonly Instances: FakeWebAudioContext[] = [];
    /** The state the next context starts in. */
    public static StartState: AudioContextState = 'running';
    /** Makes the next context's constructor throw, as a browser without Web Audio would. */
    public static FailNext = false;

    public currentTime = 0;
    public state: AudioContextState;
    public readonly destination = new FakeAudioNode('speakers');
    public readonly Gains: FakeAudioNode[] = [];
    public readonly StreamDestinations: FakeStreamDestination[] = [];
    public readonly ElementSources: FakeAudioNode[] = [];
    public readonly StreamSources: FakeAudioNode[] = [];
    public ResumeCalls = 0;
    /** Makes `createMediaElementSource` throw, as a browser does for an element that already feeds another context. */
    public RefuseElements = false;

    constructor(public readonly Options?: AudioContextOptions) {
        if (FakeWebAudioContext.FailNext) {
            FakeWebAudioContext.FailNext = false;
            throw new Error('no audio device');
        }
        this.state = FakeWebAudioContext.StartState;
        FakeWebAudioContext.Instances.push(this);
    }

    public createGain(): FakeAudioNode {
        const gain = new FakeAudioNode('gain');
        this.Gains.push(gain);
        return gain;
    }
    public createMediaStreamDestination(): FakeStreamDestination {
        const destination = new FakeStreamDestination();
        this.StreamDestinations.push(destination);
        return destination;
    }
    public createMediaElementSource(element: HTMLMediaElement): FakeAudioNode {
        if (this.RefuseElements) {
            throw new Error('HTMLMediaElement already connected previously to a different MediaElementSourceNode');
        }
        const node = new FakeAudioNode('element-source', element);
        this.ElementSources.push(node);
        return node;
    }
    public createMediaStreamSource(stream: MediaStream): FakeAudioNode {
        const node = new FakeAudioNode('stream-source', stream);
        this.StreamSources.push(node);
        return node;
    }
    public resume(): Promise<void> {
        this.ResumeCalls++;
        this.state = 'running';
        return Promise.resolve();
    }
    public close(): Promise<void> {
        this.state = 'closed';
        return Promise.resolve();
    }
}

/** Installs {@link FakeWebAudioContext} as `AudioContext`, with no contexts recorded yet. */
export function InstallFakeWebAudio(): void {
    FakeWebAudioContext.Instances.length = 0;
    FakeWebAudioContext.StartState = 'running';
    FakeWebAudioContext.FailNext = false;
    vi.stubGlobal('AudioContext', FakeWebAudioContext);
}

/** Forgets the page's media element router, so the next use builds a new one (and a new routing context). */
export function ResetMediaElementAudioRouter(): void {
    const store = GetGlobalObjectStore();
    if (store) {
        delete store[`___SINGLETON__${MediaElementAudioRouter.name}`];
    }
}
