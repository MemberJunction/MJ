import { describe, it, expect, beforeEach } from 'vitest';
import { RealtimeRecordingController } from '../realtime/realtime-recording-capture';

/** Build a little-endian PCM16 ArrayBuffer from a list of sample values. */
function pcm16(...values: number[]): ArrayBuffer {
    const arr = new Int16Array(values);
    // Return a standalone ArrayBuffer (slice guards against shared-buffer offsets).
    return arr.buffer.slice(0);
}

/** Read the Int16 PCM samples out of an encoded WAV buffer (skip the 44-byte header). */
function readWavSamples(buffer: Buffer): Int16Array {
    const dataBytes = buffer.byteLength - 44;
    const out = new Int16Array(dataBytes / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = buffer.readInt16LE(44 + i * 2);
    }
    return out;
}

/** A controllable clock for deterministic offset tests. */
class FakeClock {
    public Value = 0;
    public Now = (): number => this.Value;
}

describe('RealtimeRecordingController', () => {
    let clock: FakeClock;

    beforeEach(() => {
        clock = new FakeClock();
    });

    describe('Start / lifecycle', () => {
        it('stamps StartedAt on Start and is null before', () => {
            clock.Value = 1_700_000_000_000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            expect(c.StartedAt).toBeNull();
            expect(c.IsRecording).toBe(false);
            c.Start();
            expect(c.IsRecording).toBe(true);
            expect(c.StartedAt).toBeInstanceOf(Date);
            expect(c.StartedAt!.getTime()).toBe(1_700_000_000_000);
        });

        it('Start is idempotent (does not re-stamp t0)', () => {
            clock.Value = 1000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            const first = c.StartedAt!.getTime();
            clock.Value = 5000;
            c.Start();
            expect(c.StartedAt!.getTime()).toBe(first);
        });

        it('NowOffsetMs is 0 before Start', () => {
            const c = new RealtimeRecordingController({ Now: clock.Now });
            clock.Value = 9999;
            expect(c.NowOffsetMs()).toBe(0);
        });

        it('NowOffsetMs tracks the injected clock, monotonic and non-negative', () => {
            clock.Value = 1000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            expect(c.NowOffsetMs()).toBe(0);
            clock.Value = 1500;
            expect(c.NowOffsetMs()).toBe(500);
            clock.Value = 3000;
            expect(c.NowOffsetMs()).toBe(2000);
            // Clock going backwards must never produce a negative offset.
            clock.Value = 500;
            expect(c.NowOffsetMs()).toBe(0);
        });

        it('exposes Media tag (default Audio, overridable)', () => {
            expect(new RealtimeRecordingController().Media).toBe('Audio');
            expect(new RealtimeRecordingController({ Media: 'AudioVideo' }).Media).toBe('AudioVideo');
        });

        it('Reset clears state for reuse', () => {
            clock.Value = 1000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            c.AppendOutbound(pcm16(100, 200));
            expect(c.HasAudio).toBe(true);
            c.Reset();
            expect(c.HasAudio).toBe(false);
            expect(c.StartedAt).toBeNull();
            expect(c.IsRecording).toBe(false);
            expect(c.NowOffsetMs()).toBe(0);
        });
    });

    describe('Append gating and HasAudio', () => {
        it('ignores appends before Start', () => {
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.AppendOutbound(pcm16(1, 2, 3));
            c.AppendInbound(pcm16(4, 5, 6));
            expect(c.HasAudio).toBe(false);
        });

        it('ignores appends after Stop', () => {
            clock.Value = 1000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            c.Stop();
            c.AppendOutbound(pcm16(1, 2, 3));
            expect(c.HasAudio).toBe(false);
        });

        it('Stop does not clear already-captured buffers', () => {
            clock.Value = 1000;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            c.AppendOutbound(pcm16(1, 2, 3));
            c.Stop();
            expect(c.HasAudio).toBe(true);
        });

        it('HasAudio reflects captured frames', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            expect(c.HasAudio).toBe(false);
            c.AppendInbound(pcm16(7));
            expect(c.HasAudio).toBe(true);
        });

        it('does not retain the caller ArrayBuffer (samples are copied)', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            const src = new Int16Array([100, 200, 300]);
            c.AppendOutbound(src.buffer.slice(0));
            // Mutate the original after capture.
            src.fill(0);
            const wav = c.EncodeWav()!;
            const samples = readWavSamples(wav.Buffer);
            expect(samples[0]).toBe(100);
            expect(samples[1]).toBe(200);
            expect(samples[2]).toBe(300);
        });

        it('handles odd-length buffers without throwing (drops trailing byte)', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            // 5 bytes = 2 complete samples + 1 dangling byte.
            const odd = new Uint8Array([0x10, 0x00, 0x20, 0x00, 0x33]);
            expect(() => c.AppendOutbound(odd.buffer.slice(0))).not.toThrow();
            const wav = c.EncodeWav()!;
            const samples = readWavSamples(wav.Buffer);
            expect(samples.length).toBe(2);
            expect(samples[0]).toBe(0x10);
            expect(samples[1]).toBe(0x20);
        });

        it('ignores empty buffers', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            c.AppendOutbound(new ArrayBuffer(0));
            c.AppendOutbound(new ArrayBuffer(1)); // single byte, < 2
            expect(c.HasAudio).toBe(false);
        });
    });

    describe('EncodeWav', () => {
        it('returns null when nothing captured', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            expect(c.EncodeWav()).toBeNull();
        });

        it('produces a canonical WAV header (mono, 16-bit, OutputSampleRate)', () => {
            clock.Value = 0;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: 24000 });
            c.Start();
            c.AppendOutbound(pcm16(1, 2, 3, 4));
            const wav = c.EncodeWav()!;
            const buf = wav.Buffer;

            expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
            expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
            expect(buf.toString('ascii', 12, 16)).toBe('fmt ');
            expect(buf.toString('ascii', 36, 40)).toBe('data');

            expect(buf.readUInt16LE(20)).toBe(1); // PCM format
            expect(buf.readUInt16LE(22)).toBe(1); // mono
            expect(buf.readUInt32LE(24)).toBe(24000); // sample rate
            expect(buf.readUInt16LE(34)).toBe(16); // bits per sample
            expect(buf.readUInt16LE(32)).toBe(2); // block align = 1ch * 2 bytes
            expect(buf.readUInt32LE(28)).toBe(24000 * 2); // byte rate

            const dataSize = buf.readUInt32LE(40);
            const sampleCount = readWavSamples(buf).length;
            expect(dataSize).toBe(sampleCount * 2);
            // RIFF chunk size = 36 + data size
            expect(buf.readUInt32LE(4)).toBe(36 + dataSize);
            expect(wav.SampleRate).toBe(24000);
        });

        it('places two outbound frames at the correct sample positions with silence between', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 1000;
            c.Start(); // t0 at 1000

            // Frame A at offset 0ms -> sample 0
            clock.Value = 1000;
            c.AppendOutbound(pcm16(5000, 5000));

            // Frame B at offset 100ms -> sample round(0.1 * 24000) = 2400
            clock.Value = 1100;
            c.AppendOutbound(pcm16(7000, 7000));

            const samples = readWavSamples(c.EncodeWav()!.Buffer);
            // Frame A near start
            expect(samples[0]).toBe(5000);
            expect(samples[1]).toBe(5000);
            // Silence between
            expect(samples[100]).toBe(0);
            expect(samples[2399]).toBe(0);
            // Frame B at sample 2400
            expect(samples[2400]).toBe(7000);
            expect(samples[2401]).toBe(7000);
        });

        it('sums overlapping inbound + outbound frames at the same offset', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate, InputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            c.AppendOutbound(pcm16(1000, 1000));
            c.AppendInbound(pcm16(2000, 3000));
            const samples = readWavSamples(c.EncodeWav()!.Buffer);
            expect(samples[0]).toBe(3000); // 1000 + 2000
            expect(samples[1]).toBe(4000); // 1000 + 3000
        });

        it('resamples inbound 16000 -> 24000 (stretches by ~1.5x)', () => {
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: 24000, InputSampleRate: 16000 });
            clock.Value = 0;
            c.Start();
            const inputLen = 100;
            const values: number[] = [];
            for (let i = 0; i < inputLen; i++) {
                values.push(1000);
            }
            expect(() => c.AppendInbound(pcm16(...values))).not.toThrow();
            const wav = c.EncodeWav()!;
            const samples = readWavSamples(wav.Buffer);
            // ~1.5x more output samples than input.
            expect(samples.length).toBe(Math.round(inputLen * 1.5));
            // Constant input -> constant output after interpolation.
            expect(samples[10]).toBe(1000);
            expect(samples[100]).toBe(1000);
        });

        it('clamps sums exceeding the Int16 max to 32767', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate, InputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            c.AppendOutbound(pcm16(30000, 30000));
            c.AppendInbound(pcm16(30000, 30000)); // 60000 > 32767
            const samples = readWavSamples(c.EncodeWav()!.Buffer);
            expect(samples[0]).toBe(32767);
            expect(samples[1]).toBe(32767);
        });

        it('reports a DurationMs proportional to timeline length', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            // 24000 samples = exactly 1000ms at 24kHz
            const block: number[] = new Array(24000).fill(500);
            c.AppendOutbound(pcm16(...block));
            const wav = c.EncodeWav()!;
            expect(wav.DurationMs).toBeCloseTo(1000, 5);
        });
    });

    describe('GetPeaks', () => {
        it('returns [] when nothing captured', () => {
            const c = new RealtimeRecordingController({ Now: clock.Now });
            c.Start();
            expect(c.GetPeaks()).toEqual([]);
        });

        it('produces normalized 0..1 peaks (loudest bucket becomes 1)', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start(); // t0 = 0
            // Quiet frame (amplitude 1000), 4 samples, at offset 0 → samples [0..3].
            c.AppendOutbound(pcm16(1000, -1000, 1000, -1000));
            // Loud frame (amplitude 4000), 4 samples, at offset 1000ms → sample 24000 (far ahead,
            // so the two frames land in the two distinct halves of the 2-bucket downsample).
            clock.Value = 1000;
            c.AppendOutbound(pcm16(4000, -4000, 4000, -4000));
            const peaks = c.GetPeaks(2);
            expect(peaks).toHaveLength(2);
            // Quiet bucket relative to the loud one: 1000/4000 = 0.25; loud bucket normalizes to 1.
            expect(peaks[0]).toBeCloseTo(0.25, 5);
            expect(peaks[1]).toBeCloseTo(1, 5);
            // Every value is within [0, 1].
            for (const v of peaks) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        });

        it('uses max-abs within a bucket (negative peak dominates)', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            // Single bucket whose loudest sample is a large negative value.
            c.AppendOutbound(pcm16(100, -8000, 200, 300));
            const peaks = c.GetPeaks(1);
            expect(peaks).toHaveLength(1);
            // Only one bucket → it normalizes to itself = 1 (max-abs found the |-8000|).
            expect(peaks[0]).toBeCloseTo(1, 5);
        });

        it('caps bucket count at the sample count for short recordings', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            c.AppendOutbound(pcm16(1000, 2000, 3000)); // 3 samples
            // Request 600 buckets but only 3 samples exist → at most 3 peaks.
            const peaks = c.GetPeaks(600);
            expect(peaks).toHaveLength(3);
        });

        it('returns [] for an all-silent timeline', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            c.AppendOutbound(pcm16(0, 0, 0, 0));
            expect(c.GetPeaks()).toEqual([]);
        });

        it('defaults to 600 buckets for a long recording', () => {
            const rate = 24000;
            const c = new RealtimeRecordingController({ Now: clock.Now, OutputSampleRate: rate });
            clock.Value = 0;
            c.Start();
            const block: number[] = [];
            for (let i = 0; i < 5000; i++) {
                block.push((i % 100) - 50); // varied non-silent signal
            }
            c.AppendOutbound(pcm16(...block));
            expect(c.GetPeaks()).toHaveLength(600);
        });
    });
});
