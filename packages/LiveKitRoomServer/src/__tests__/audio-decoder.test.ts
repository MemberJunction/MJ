import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DecodeAudio, FloatToPcm16, MAX_DECODED_AUDIO_SECONDS } from '../room-audio/audio-decoder';
import { BuildWav } from './room-audio-test-helpers';

const MP3_FIXTURE = fileURLToPath(new URL('./fixtures/tone-440hz-22050.mp3', import.meta.url));

/** PCM16 value a float decodes to, allowing for each bit depth's own rounding. */
function near(actual: number, expectedFloat: number, tolerance = 2): void {
  expect(Math.abs(actual - FloatToPcm16(expectedFloat))).toBeLessThanOrEqual(tolerance);
}

describe('DecodeAudio — WAV', () => {
  it('decodes 16-bit mono PCM at its own rate', async () => {
    const wav = BuildWav({ SampleRate: 8000, BitsPerSample: 16, Channels: [[0, 0.5, -0.5, 1]] });
    const decoded = await DecodeAudio(wav);
    expect(decoded.SampleRate).toBe(8000);
    expect(decoded.Pcm.length).toBe(4);
    near(decoded.Pcm[1], 0.5);
    near(decoded.Pcm[2], -0.5);
  });

  it('downmixes stereo by averaging the channels', async () => {
    const wav = BuildWav({ SampleRate: 16000, BitsPerSample: 16, Channels: [[0.5, 0.5], [-0.5, 0.5]] });
    const { Pcm } = await DecodeAudio(wav);
    near(Pcm[0], 0);
    near(Pcm[1], 0.5);
  });

  it('downmixes more than two channels', async () => {
    const wav = BuildWav({ SampleRate: 16000, BitsPerSample: 16, Channels: [[0.6], [0.3], [0]] });
    near((await DecodeAudio(wav)).Pcm[0], 0.3);
  });

  it.each([
    ['8-bit unsigned', 1, 8, 300],
    ['24-bit', 1, 24, 2],
    ['32-bit integer', 1, 32, 2],
    ['32-bit float', 3, 32, 2],
    ['64-bit float', 3, 64, 2],
  ])('decodes %s', async (_label, code, bits, tolerance) => {
    const wav = BuildWav({ FormatCode: code, SampleRate: 44100, BitsPerSample: bits, Channels: [[0.25, -0.75]] });
    const { Pcm, SampleRate } = await DecodeAudio(wav);
    expect(SampleRate).toBe(44100);
    near(Pcm[0], 0.25, tolerance);
    near(Pcm[1], -0.75, tolerance);
  });

  it('reads the real format code out of a WAVE_FORMAT_EXTENSIBLE header', async () => {
    const wav = BuildWav({ FormatCode: 3, Extensible: true, SampleRate: 48000, BitsPerSample: 32, Channels: [[0.5], [0.5]] });
    near((await DecodeAudio(wav)).Pcm[0], 0.5);
  });

  it('skips chunks that are not data, including an odd-sized one with its pad byte', async () => {
    const wav = BuildWav({
      SampleRate: 8000,
      BitsPerSample: 16,
      Channels: [[0.5, -0.25]],
      ExtraChunks: [
        { Id: 'LIST', Body: new Uint8Array([1, 2, 3]) },
        { Id: 'fact', Body: new Uint8Array(4) },
      ],
    });
    const { Pcm } = await DecodeAudio(wav);
    expect(Pcm.length).toBe(2);
    near(Pcm[0], 0.5);
    near(Pcm[1], -0.25);
  });

  it('clamps a data chunk whose declared size runs past the end of the file', async () => {
    const wav = BuildWav({ SampleRate: 8000, BitsPerSample: 16, Channels: [[0.5, 0.5, 0.5]] });
    new DataView(wav.buffer).setUint32(wav.byteLength - 6 - 4, 0xffffffff, true); // the data chunk's size field
    expect((await DecodeAudio(wav)).Pcm.length).toBe(3);
  });

  it('refuses an encoding it cannot play, naming it', async () => {
    const wav = BuildWav({ FormatCode: 2, SampleRate: 8000, BitsPerSample: 16, Channels: [[0]] });
    await expect(DecodeAudio(wav)).rejects.toThrow(/format code 2, 16-bit/);
  });

  it('refuses a WAV with no data chunk', async () => {
    const wav = BuildWav({ SampleRate: 8000, BitsPerSample: 16, Channels: [[0]] });
    await expect(DecodeAudio(wav.subarray(0, wav.byteLength - 10))).rejects.toThrow(/no data chunk/);
  });

  it('refuses audio longer than the cap before decoding it', async () => {
    const frames = MAX_DECODED_AUDIO_SECONDS + 1;
    const wav = BuildWav({ SampleRate: 1, BitsPerSample: 16, Channels: [new Array<number>(frames).fill(0)] });
    await expect(DecodeAudio(wav)).rejects.toThrow(/at most 900 s/);
  });
});

describe('DecodeAudio — MP3', () => {
  it('decodes an MP3 file to mono PCM at its own rate', async () => {
    const bytes = new Uint8Array(readFileSync(MP3_FIXTURE));
    const { Pcm, SampleRate } = await DecodeAudio(bytes, { FileName: 'hold.mp3' });
    expect(SampleRate).toBe(22050);
    // 0.3 s of tone, give or take the encoder's padding frames.
    expect(Pcm.length).toBeGreaterThan(0.25 * 22050);
    expect(Pcm.length).toBeLessThan(0.4 * 22050);
    const peak = Pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(peak).toBeGreaterThan(0.08 * 32767); // ffmpeg's sine source is 1/8 full scale
    expect(peak).toBeLessThan(0.2 * 32767);
  });
});

describe('DecodeAudio — format detection', () => {
  it('names a recognisable container it does not support', async () => {
    const ogg = new Uint8Array([...'OggS'].map((c) => c.charCodeAt(0)).concat(new Array<number>(20).fill(0)));
    await expect(DecodeAudio(ogg, { MimeType: 'audio/mpeg' })).rejects.toThrow(/Unsupported audio format: Ogg/);
  });

  it('names the hint when the bytes are not recognisable', async () => {
    await expect(DecodeAudio(new Uint8Array([1, 2, 3, 4]), { MimeType: 'audio/aac' })).rejects.toThrow(/Unsupported audio format: audio\/aac/);
  });

  it('refuses unrecognisable bytes with no hint', async () => {
    await expect(DecodeAudio(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/unrecognised bytes/);
  });

  it('refuses an empty file', async () => {
    await expect(DecodeAudio(new Uint8Array(0))).rejects.toThrow(/empty/);
  });
});
