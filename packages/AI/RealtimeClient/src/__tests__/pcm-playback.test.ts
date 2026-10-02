import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimePcmPlayback } from '../audio/pcmPlayback';

/**
 * Web Audio is absent in the node test environment, so the engine runs against a minimal fake
 * `AudioContext` that records the node graph. What this spec pins is the SPEAKER-MUTE topology:
 * sources → masterGain (the meter tap) → outputGain (the mute stage) → destination. Muting must
 * drive the OUTPUT stage to 0 and leave the master stage alone, so the call UI's audio-reactive
 * visuals keep seeing the agent's voice while the listener hears nothing (obligation #10).
 */
class FakeGainNode {
    public gain = { value: 1 };
    public connectedTo: unknown[] = [];
    public connect(target: unknown): unknown {
        this.connectedTo.push(target);
        return target;
    }
}

class FakeBufferSource {
    public buffer: unknown = null;
    public onended: (() => void) | null = null;
    public connectedTo: unknown[] = [];
    public connect(target: unknown): unknown {
        this.connectedTo.push(target);
        return target;
    }
    public start(): void {}
    public stop(): void {}
}

class FakeAudioContext {
    public static Instances: FakeAudioContext[] = [];
    public readonly destination = { kind: 'destination' };
    public currentTime = 0;
    public Gains: FakeGainNode[] = [];
    public Sources: FakeBufferSource[] = [];
    constructor(public options: { sampleRate: number }) {
        FakeAudioContext.Instances.push(this);
    }
    public createGain(): FakeGainNode {
        const g = new FakeGainNode();
        this.Gains.push(g);
        return g;
    }
    public createBuffer(_channels: number, length: number, sampleRate: number): { duration: number; copyToChannel(): void } {
        return { duration: length / sampleRate, copyToChannel: () => {} };
    }
    public createBufferSource(): FakeBufferSource {
        const s = new FakeBufferSource();
        this.Sources.push(s);
        return s;
    }
    public async close(): Promise<void> {}
}

describe('RealtimePcmPlayback speaker mute', () => {
    beforeEach(() => {
        FakeAudioContext.Instances = [];
        vi.stubGlobal('AudioContext', FakeAudioContext);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('routes sources through master → output → destination, with the mute stage LAST', () => {
        const playback = new RealtimePcmPlayback(24000);
        const ctx = FakeAudioContext.Instances[0];
        expect(ctx.Gains).toHaveLength(2);
        const [master, output] = ctx.Gains;
        expect(master.connectedTo).toEqual([output]);
        expect(output.connectedTo).toEqual([ctx.destination]);

        playback.Enqueue(new Int16Array([1000, -1000, 500]).buffer);
        expect(ctx.Sources).toHaveLength(1);
        expect(ctx.Sources[0].connectedTo).toEqual([master]); // sources feed the METER tap, not the mute stage
    });

    it('SetMuted drives only the output stage to 0 and restores it to 1', () => {
        const playback = new RealtimePcmPlayback(24000);
        const [master, output] = FakeAudioContext.Instances[0].Gains;

        expect(playback.IsMuted).toBe(false);
        playback.SetMuted(true);
        expect(playback.IsMuted).toBe(true);
        expect(output.gain.value).toBe(0);
        expect(master.gain.value).toBe(1); // the meter upstream still sees full level

        playback.SetMuted(false);
        expect(playback.IsMuted).toBe(false);
        expect(output.gain.value).toBe(1);
    });

    it('keeps scheduling and reporting playback while muted', () => {
        const playback = new RealtimePcmPlayback(24000);
        const ctx = FakeAudioContext.Instances[0];
        playback.SetMuted(true);
        playback.Enqueue(new Int16Array(2400).buffer); // 100 ms of audio
        expect(ctx.Sources).toHaveLength(1);
        expect(playback.IsPlaying).toBe(true); // muted ≠ stopped: the UI still shows the agent speaking
    });
});
