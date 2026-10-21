import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePcmMicCapture, IPcmMicCapture } from '../audio/micCapture';
import { FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';

/** A node that accepts connections and ignores them. */
class FakeNode {
    public connect<T>(target: T): T {
        return target;
    }
    public disconnect(): void {}
}

/** A source node: the stream it reads, and what it was connected to. */
class FakeSourceNode extends FakeNode {
    public readonly Targets: unknown[] = [];
    public Disconnected = false;
    constructor(public readonly Stream: MediaStream) {
        super();
    }
    public override connect<T>(target: T): T {
        this.Targets.push(target);
        return target;
    }
    public override disconnect(): void {
        this.Disconnected = true;
    }
}

class FakeWorkletNode extends FakeNode {
    public static Instances: FakeWorkletNode[] = [];
    public readonly port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null } = { onmessage: null };
    constructor() {
        super();
        FakeWorkletNode.Instances.push(this);
    }
}

class FakeAudioContext {
    public static Instances: FakeAudioContext[] = [];
    public readonly Sources: FakeSourceNode[] = [];
    public readonly destination = new FakeNode();
    public readonly audioWorklet = { addModule: async (_url: string): Promise<void> => undefined };
    public Closed = false;
    constructor() {
        FakeAudioContext.Instances.push(this);
    }
    public createMediaStreamSource(stream: MediaStream): FakeSourceNode {
        const source = new FakeSourceNode(stream);
        this.Sources.push(source);
        return source;
    }
    public createGain(): FakeNode & { gain: { value: number } } {
        return Object.assign(new FakeNode(), { gain: { value: 1 } });
    }
    public async close(): Promise<void> {
        this.Closed = true;
    }
}

describe('CreatePcmMicCapture', () => {
    let chunks: string[];
    let capture: IPcmMicCapture;
    const first = new FakeMediaStream([new FakeTrack()]);
    const second = new FakeMediaStream([new FakeTrack()]);
    const context = (): FakeAudioContext => FakeAudioContext.Instances[0];
    const worklet = (): FakeWorkletNode => FakeWorkletNode.Instances[0];

    beforeEach(async () => {
        FakeAudioContext.Instances = [];
        FakeWorkletNode.Instances = [];
        vi.stubGlobal('AudioContext', FakeAudioContext);
        vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:capture-worklet');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        chunks = [];
        capture = await CreatePcmMicCapture(first, 16000, (chunk) => chunks.push(chunk));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('captures the stream it was created with into the worklet', () => {
        expect(context().Sources.map((s) => s.Stream)).toEqual([first]);
        expect(context().Sources[0].Targets).toEqual([worklet()]);
    });

    describe('Rebind', () => {
        it('reads the new stream into the same worklet and releases the old source', () => {
            capture.Rebind(second);
            expect(FakeAudioContext.Instances).toHaveLength(1);
            expect(context().Sources.map((s) => s.Stream)).toEqual([first, second]);
            expect(context().Sources[1].Targets).toEqual([worklet()]);
            expect(context().Sources[0].Disconnected).toBe(true);
        });

        it('keeps the chunks flowing to the same callback', () => {
            capture.Rebind(second);
            worklet().port.onmessage?.(new MessageEvent('message', { data: new Float32Array([0.5, -0.5]) }));
            expect(chunks).toHaveLength(1);
        });

        it('refuses a stream without an audio track and keeps capturing the current one', () => {
            expect(() => capture.Rebind(new FakeMediaStream([]))).toThrow('no audio track');
            expect(context().Sources).toHaveLength(1);
            expect(context().Sources[0].Disconnected).toBe(false);
        });

        it('does nothing after Stop', () => {
            capture.Stop();
            capture.Rebind(second);
            expect(context().Sources).toHaveLength(1);
            expect(context().Closed).toBe(true);
        });
    });
});
