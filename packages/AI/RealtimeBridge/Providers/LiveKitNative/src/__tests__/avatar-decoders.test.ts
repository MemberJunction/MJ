import { describe, expect, it, vi } from 'vitest';
import { AvatarAacDecoder, type AvatarPcmChunk } from '../avatar-aac-decoder';
import { AvatarAudioDecoderArgs, AvatarDecoderProcess, AvatarVideoDecoderArgs, FfmpegTakesFpsMode } from '../avatar-decoder-process';
import { AvatarH264Decoder, type AvatarVideoFrame } from '../avatar-h264-decoder';
import { FakeChildProcess } from './avatar-test-helpers';

const V9 = { Major: 9, Minor: 0, Text: '9.0.2' };
const V42 = { Major: 4, Minor: 2, Text: '4.2.7' };

/** The value after `flag` in an argument list. */
function after(args: readonly string[], flag: string): string | undefined {
    const at = args.indexOf(flag);
    return at < 0 ? undefined : args[at + 1];
}

describe('the decoders\' command lines', () => {
    it('passes frame timing through with -fps_mode from ffmpeg 5.1, with -vsync before it', () => {
        expect(FfmpegTakesFpsMode({ Major: 5, Minor: 1, Text: '' })).toBe(true);
        expect(FfmpegTakesFpsMode({ Major: 5, Minor: 0, Text: '' })).toBe(false);
        expect(after(AvatarVideoDecoderArgs(V9), '-fps_mode')).toBe('passthrough');
        expect(AvatarVideoDecoderArgs(V9)).not.toContain('-vsync');
        expect(after(AvatarVideoDecoderArgs(V42), '-vsync')).toBe('passthrough');
        expect(AvatarVideoDecoderArgs(V42)).not.toContain('-fps_mode');
    });

    it('decodes H.264 from stdin into raw I420 on stdout, one thread, low delay, minimal probing, flushed per packet', () => {
        const args = AvatarVideoDecoderArgs(V9);
        const input = args.indexOf('-i');
        expect(after(args, '-threads')).toBe('1');
        expect(args.slice(0, input)).toEqual(expect.arrayContaining(['-flags', 'low_delay', '-probesize', '32', '-analyzeduration', '0', '-f', 'h264']));
        expect(args.slice(input)).toEqual(['-i', 'pipe:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-flush_packets', '1', 'pipe:1']);
    });

    it('decodes ADTS AAC into mono 16-bit PCM at the voice track\'s rate', () => {
        const args = AvatarAudioDecoderArgs(24000);
        expect(args.slice(args.indexOf('-i'))).toEqual(['-i', 'pipe:0', '-f', 's16le', '-ar', '24000', '-ac', '1', '-flush_packets', '1', 'pipe:1']);
        expect(after(args, '-f')).toBe('aac');
    });

    it('never asks for nobuffer (it dropped packets read from a pipe)', () => {
        for (const args of [AvatarVideoDecoderArgs(V9), AvatarVideoDecoderArgs(V42), AvatarAudioDecoderArgs(24000)]) {
            expect(args.join(' ')).not.toContain('nobuffer');
        }
    });
});

describe('AvatarDecoderProcess', () => {
    function start(child = new FakeChildProcess()): { child: FakeChildProcess; output: Uint8Array[]; failures: string[]; process: AvatarDecoderProcess } {
        const output: Uint8Array[] = [];
        const failures: string[] = [];
        const process = new AvatarDecoderProcess({ Name: 'video', Path: '/bin/ffmpeg', Args: ['-x'], OnOutput: (c) => output.push(c), OnFailure: (r) => failures.push(r), Spawn: () => child });
        return { child, output, failures, process };
    }

    it('writes to stdin and hands stdout on', async () => {
        const { child, output, process } = start();
        process.Write(Uint8Array.from([1, 2]));
        child.stdout.write(Buffer.from([7, 8, 9]));
        await new Promise((r) => setImmediate(r));
        expect(Buffer.concat(child.Written)).toEqual(Buffer.from([1, 2]));
        expect(output.map((c) => Array.from(c))).toEqual([[7, 8, 9]]);
    });

    it('reports an exit it did not ask for once, with the tail of stderr', async () => {
        const { child, failures } = start();
        child.stderr.write('frame broke\nInvalid data found when processing input\n');
        await new Promise((r) => setImmediate(r));
        child.Exit(1);
        child.Exit(1);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatch(/^the video decoder exited \(code 1\): frame broke \| Invalid data/);
    });

    it('reports a process that could not start', () => {
        const { child, failures } = start();
        child.emit('error', new Error('spawn ffmpeg ENOENT'));
        expect(failures).toEqual(['the video decoder could not start: spawn ffmpeg ENOENT']);
    });

    it('kills the process on Dispose and reports nothing after', () => {
        const { child, failures, process } = start();
        process.Dispose();
        child.Exit(null, 'SIGKILL');
        expect(child.Killed).toBe('SIGKILL');
        expect(failures).toEqual([]);
        expect(process.IsRunning).toBe(false);
        process.Write(Uint8Array.from([1]));
        expect(child.Written).toHaveLength(0);
    });

    it('pauses and resumes reading stdout (back-pressure)', () => {
        const { child, process } = start();
        const pause = vi.spyOn(child.stdout, 'pause');
        const resume = vi.spyOn(child.stdout, 'resume');
        process.PauseOutput();
        process.ResumeOutput();
        expect(pause).toHaveBeenCalledOnce();
        expect(resume).toHaveBeenCalledOnce();
    });
});

describe('AvatarH264Decoder', () => {
    function start(): { child: FakeChildProcess; frames: AvatarVideoFrame[]; decoder: AvatarH264Decoder } {
        const child = new FakeChildProcess();
        const frames: AvatarVideoFrame[] = [];
        const decoder = new AvatarH264Decoder({ Width: 4, Height: 2, OnFrame: (f) => frames.push(f), OnFailure: vi.fn() }, '/bin/ffmpeg', V9, () => child);
        return { child, frames, decoder };
    }
    const unit = (seq: number, time: number) => ({ Seq: seq, Epoch: 7, Time: time, Data: Uint8Array.from([0, 0, 0, 1, seq]) });
    const FRAME = 4 * 2 * 1.5; // I420

    it('cuts the output into frames by the declared size and gives each the place of its unit, in order', async () => {
        const { child, frames, decoder } = start();
        decoder.Decode(unit(0, 0));
        decoder.Decode(unit(1, 0.0417));
        child.stdout.write(Buffer.alloc(5, 1));
        child.stdout.write(Buffer.concat([Buffer.alloc(FRAME - 5, 1), Buffer.alloc(3, 2)]));
        child.stdout.write(Buffer.alloc(FRAME - 3, 2));
        await new Promise((r) => setImmediate(r));
        expect(frames.map((f) => [f.Seq, f.Epoch, f.Time, f.Width, f.Height])).toEqual([
            [0, 7, 0, 4, 2],
            [1, 7, 0.0417, 4, 2],
        ]);
        expect(Array.from(frames[0].Data)).toEqual(Array(FRAME).fill(1));
        expect(Array.from(frames[1].Data)).toEqual(Array(FRAME).fill(2));
        expect(frames[0].Data.byteOffset).toBe(0); // rtc-node reads the buffer from its start
    });

    it('drops the frames of units written before a fence', async () => {
        const { child, frames, decoder } = start();
        decoder.Decode(unit(0, 0));
        decoder.Decode(unit(1, 0.04));
        decoder.Fence();
        decoder.Decode(unit(2, 0.08));
        child.stdout.write(Buffer.alloc(FRAME * 3));
        await new Promise((r) => setImmediate(r));
        expect(frames.map((f) => f.Seq)).toEqual([2]);
    });

    it('drops frames beyond the units written', async () => {
        const { child, frames, decoder } = start();
        decoder.Decode(unit(0, 0));
        child.stdout.write(Buffer.alloc(FRAME * 2));
        await new Promise((r) => setImmediate(r));
        expect(frames).toHaveLength(1);
    });
});

describe('AvatarAacDecoder', () => {
    function start(): { child: FakeChildProcess; chunks: AvatarPcmChunk[]; decoder: AvatarAacDecoder } {
        const child = new FakeChildProcess();
        const chunks: AvatarPcmChunk[] = [];
        const decoder = new AvatarAacDecoder({ SampleRate: 24000, OnPcm: (c) => chunks.push(c), OnFailure: vi.fn() }, '/bin/ffmpeg', () => child);
        return { child, chunks, decoder };
    }
    const unit = (seq: number, samples: number, decoded = samples) => ({ Seq: seq, Epoch: 3, Time: seq * 0.0427, DecodedSamples: decoded, Samples: samples, Data: Uint8Array.from([0xff, 0xf1, seq]) });

    /** Little-endian 16-bit samples. */
    function pcm(...samples: number[]): Buffer {
        const out = Buffer.alloc(samples.length * 2);
        samples.forEach((s, i) => out.writeInt16LE(s, i * 2));
        return out;
    }

    it('cuts the output into one chunk per frame, by its sample count, across any chunking of stdout', async () => {
        const { child, chunks, decoder } = start();
        decoder.Decode(unit(0, 2));
        decoder.Decode(unit(1, 3));
        const out = pcm(10, -10, 20, -20, 30);
        child.stdout.write(out.subarray(0, 3));
        child.stdout.write(out.subarray(3));
        await new Promise((r) => setImmediate(r));
        expect(chunks.map((c) => [c.Seq, c.Epoch, Array.from(c.Pcm)])).toEqual([
            [0, 3, [10, -10]],
            [1, 3, [20, -20, 30]],
        ]);
    });

    it('trims a frame the stream declares shorter than it decodes (a stream\'s last frame), and keeps the next frame aligned', async () => {
        const { child, chunks, decoder } = start();
        decoder.Decode(unit(0, 2, 3)); // decodes to 3 samples, the timeline gives it 2
        decoder.Decode(unit(1, 2));
        child.stdout.write(pcm(1, 2, 3, 4, 5));
        await new Promise((r) => setImmediate(r));
        expect(chunks.map((c) => Array.from(c.Pcm))).toEqual([[1, 2], [4, 5]]);
    });

    it('drops the PCM of frames written before a fence, and of frames that decode to nothing', async () => {
        const { child, chunks, decoder } = start();
        decoder.Decode(unit(0, 1));
        decoder.Fence();
        decoder.Decode(unit(1, 0));
        decoder.Decode(unit(2, 1));
        child.stdout.write(pcm(5, 6));
        await new Promise((r) => setImmediate(r));
        expect(chunks.map((c) => [c.Seq, Array.from(c.Pcm)])).toEqual([[2, [6]]]);
    });
});
