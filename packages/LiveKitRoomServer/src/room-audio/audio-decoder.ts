/**
 * @fileoverview {@link DecodeAudio} — turns an audio file's bytes (WAV or MP3) into mono PCM16, the one shape the
 * room audio player plays. WAV is parsed here (RIFF chunk walk, integer PCM 8/16/24/32-bit and IEEE float 32/64-bit,
 * any channel count downmixed); MP3 is decoded by `mpg123-decoder`, a WebAssembly build of libmpg123 with no native
 * build step. Anything else is refused with an error that names the format it saw.
 *
 * @module @memberjunction/livekit-room-server
 */

import { MPEGDecoder } from 'mpg123-decoder';

/** Decoded audio: mono 16-bit PCM and its sample rate. */
export interface DecodedAudio {
  /** Mono PCM16 samples. */
  Pcm: Int16Array;
  /** The rate of {@link Pcm}, in Hz. */
  SampleRate: number;
}

/** What the caller knows about the bytes, used only when the bytes themselves do not say what they are. */
export interface AudioFormatHint {
  /** The MIME type (e.g. `audio/mpeg`, `audio/wav`). */
  MimeType?: string;
  /** The file name (its extension is read). */
  FileName?: string;
}

/** The longest audio {@link DecodeAudio} accepts, in seconds (15 minutes). Hold music loops; a longer file is a mistake. */
export const MAX_DECODED_AUDIO_SECONDS = 15 * 60;

/** The formats {@link DecodeAudio} can play. */
type SupportedFormat = 'wav' | 'mp3';

/** The parts of a WAV `fmt ` chunk the decoder needs. */
interface WavFormat {
  FormatCode: number;
  Channels: number;
  SampleRate: number;
  BitsPerSample: number;
}

/** Reads one sample at a byte offset and returns it scaled to [-1, 1]. */
type SampleReader = (view: DataView, offset: number) => number;

const WAV_FORMAT_PCM = 1;
const WAV_FORMAT_FLOAT = 3;
const WAV_FORMAT_EXTENSIBLE = 0xfffe;

/**
 * Decodes WAV or MP3 bytes into mono PCM16. The format is read from the bytes' own signature first and from the hint
 * only when the bytes carry none (a bare MP3 frame stream).
 *
 * @param bytes The file's bytes.
 * @param hint The MIME type and/or file name, when known.
 * @returns Mono PCM16 at the file's own sample rate.
 * @throws {Error} when the format is not WAV or MP3, the file is malformed or empty, or it is longer than
 *   {@link MAX_DECODED_AUDIO_SECONDS}.
 */
export async function DecodeAudio(bytes: Uint8Array, hint?: AudioFormatHint): Promise<DecodedAudio> {
  if (bytes.byteLength === 0) {
    throw new Error('Cannot decode audio: the file is empty.');
  }
  const format = detectFormat(bytes, hint);
  const decoded = format === 'wav' ? decodeWav(bytes) : await decodeMp3(bytes);
  AssertAudioDurationWithinCap(decoded.Pcm.length, decoded.SampleRate);
  return decoded;
}

/** Throws when `sampleCount` samples at `sampleRate` run longer than {@link MAX_DECODED_AUDIO_SECONDS}. */
export function AssertAudioDurationWithinCap(sampleCount: number, sampleRate: number): void {
  const seconds = sampleCount / sampleRate;
  if (seconds > MAX_DECODED_AUDIO_SECONDS) {
    throw new Error(
      `Audio is ${Math.round(seconds)} s long; the room audio player accepts at most ${MAX_DECODED_AUDIO_SECONDS} s ` +
        '(15 minutes). Trim the file — hold music loops, so a few minutes is plenty.',
    );
  }
}

// ── Format detection ─────────────────────────────────────────────────────────────────────────────────────────────

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function isMp3Signature(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 3 && ascii(bytes, 0, 3) === 'ID3') {
    return true;
  }
  // An MPEG audio frame header starts with 11 set sync bits.
  return bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

/** Names a recognisable but unsupported container from its signature, for the error message. */
function describeUnsupportedSignature(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'Ogg (Vorbis/Opus)';
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'fLaC') return 'FLAC';
  if (bytes.byteLength >= 8 && ascii(bytes, 4, 4) === 'ftyp') return 'MP4/M4A (AAC)';
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'FORM') return 'AIFF';
  if (bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'WebM/Matroska';
  return undefined;
}

function formatFromHint(hint?: AudioFormatHint): SupportedFormat | undefined {
  const mime = hint?.MimeType?.toLowerCase().split(';')[0].trim() ?? '';
  const name = hint?.FileName?.toLowerCase() ?? '';
  if (['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'].includes(mime) || name.endsWith('.wav')) return 'wav';
  if (['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'].includes(mime) || name.endsWith('.mp3')) return 'mp3';
  return undefined;
}

function detectFormat(bytes: Uint8Array, hint?: AudioFormatHint): SupportedFormat {
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    return 'wav';
  }
  if (isMp3Signature(bytes)) {
    return 'mp3';
  }
  const unsupported = describeUnsupportedSignature(bytes);
  const hinted = unsupported ? undefined : formatFromHint(hint);
  if (hinted === 'mp3') {
    return 'mp3'; // an MP3 stream may begin mid-frame; let the decoder resync
  }
  const seen = unsupported ?? (hint?.MimeType || hint?.FileName || 'unrecognised bytes');
  throw new Error(`Unsupported audio format: ${seen}. The room audio player plays WAV (PCM or float) and MP3.`);
}

// ── WAV ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Walks the RIFF chunks and returns the `fmt ` description and the `data` byte range. */
function readWavChunks(bytes: Uint8Array): { Format: WavFormat; DataOffset: number; DataLength: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: WavFormat | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = readWavFormat(view, body, size);
    } else if (id === 'data') {
      if (!format) {
        throw new Error('Malformed WAV: the data chunk comes before the fmt chunk.');
      }
      // A streaming writer may leave the size as 0 or 0xFFFFFFFF; clamp to what is actually there.
      return { Format: format, DataOffset: body, DataLength: Math.min(size, bytes.byteLength - body) };
    }
    offset = body + size + (size & 1); // chunks are word-aligned: an odd-sized chunk carries one pad byte
  }
  throw new Error(format ? 'Malformed WAV: no data chunk.' : 'Malformed WAV: no fmt chunk.');
}

function readWavFormat(view: DataView, body: number, size: number): WavFormat {
  if (size < 16 || body + 16 > view.byteLength) {
    throw new Error('Malformed WAV: the fmt chunk is truncated.');
  }
  let formatCode = view.getUint16(body, true);
  if (formatCode === WAV_FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= view.byteLength) {
    formatCode = view.getUint16(body + 24, true); // the first two bytes of the SubFormat GUID are the real code
  }
  return {
    FormatCode: formatCode,
    Channels: view.getUint16(body + 2, true),
    SampleRate: view.getUint32(body + 4, true),
    BitsPerSample: view.getUint16(body + 14, true),
  };
}

function sampleReaderFor(format: WavFormat): SampleReader {
  const { FormatCode: code, BitsPerSample: bits } = format;
  if (code === WAV_FORMAT_PCM && bits === 8) return (v, o) => (v.getUint8(o) - 128) / 128;
  if (code === WAV_FORMAT_PCM && bits === 16) return (v, o) => v.getInt16(o, true) / 32768;
  if (code === WAV_FORMAT_PCM && bits === 24) {
    return (v, o) => ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608);
  }
  if (code === WAV_FORMAT_PCM && bits === 32) return (v, o) => v.getInt32(o, true) / 2147483648;
  if (code === WAV_FORMAT_FLOAT && bits === 32) return (v, o) => v.getFloat32(o, true);
  if (code === WAV_FORMAT_FLOAT && bits === 64) return (v, o) => v.getFloat64(o, true);
  throw new Error(
    `Unsupported WAV encoding: format code ${code}, ${bits}-bit. The room audio player plays integer PCM ` +
      '(8/16/24/32-bit) and IEEE float (32/64-bit) WAV.',
  );
}

function decodeWav(bytes: Uint8Array): DecodedAudio {
  const { Format: format, DataOffset: dataOffset, DataLength: dataLength } = readWavChunks(bytes);
  if (format.Channels < 1 || format.SampleRate < 1) {
    throw new Error(`Malformed WAV: ${format.Channels} channel(s) at ${format.SampleRate} Hz.`);
  }
  const read = sampleReaderFor(format);
  const bytesPerSample = format.BitsPerSample / 8;
  const frameBytes = bytesPerSample * format.Channels;
  const frames = Math.floor(dataLength / frameBytes);
  if (frames === 0) {
    throw new Error('Cannot decode audio: the WAV data chunk holds no samples.');
  }
  AssertAudioDurationWithinCap(frames, format.SampleRate); // before allocating the output for an over-long file
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pcm = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const base = dataOffset + frame * frameBytes;
    let sum = 0;
    for (let channel = 0; channel < format.Channels; channel++) {
      sum += read(view, base + channel * bytesPerSample);
    }
    pcm[frame] = FloatToPcm16(sum / format.Channels);
  }
  return { Pcm: pcm, SampleRate: format.SampleRate };
}

/** Converts one [-1, 1] float sample to PCM16, clamping anything outside the range. */
export function FloatToPcm16(sample: number): number {
  const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

// ── MP3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function decodeMp3(bytes: Uint8Array): Promise<DecodedAudio> {
  const decoder = new MPEGDecoder();
  try {
    await decoder.ready;
    const result = decoder.decode(bytes);
    if (result.samplesDecoded === 0 || result.channelData.length === 0) {
      const reason = result.errors.length > 0 ? result.errors[0].message : 'no audio frames found';
      throw new Error(`Cannot decode MP3: ${reason}.`);
    }
    return { Pcm: downmixFloatChannels(result.channelData, result.samplesDecoded), SampleRate: result.sampleRate };
  } finally {
    decoder.free();
  }
}

function downmixFloatChannels(channels: Float32Array[], sampleCount: number): Int16Array {
  const pcm = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i];
    }
    pcm[i] = FloatToPcm16(sum / channels.length);
  }
  return pcm;
}
