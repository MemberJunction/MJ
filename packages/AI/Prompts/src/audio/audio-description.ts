/**
 * @fileoverview Helpers the audio runners use to describe audio on a run row without storing it.
 * Internal to the package.
 *
 * @module @memberjunction/ai-prompts
 */

import type { ModelUsage } from '@memberjunction/ai';

/**
 * The number of characters in text as a speech vendor counts them: Unicode code points, so an emoji
 * or an accented letter written as one code point counts once, not as two UTF-16 units.
 */
export function CountCharacters(text: string): number {
  return Array.from(text).length;
}

/**
 * The size in bytes of the data a base 64 string encodes, without decoding it. Padding (`=`) and
 * whitespace are not data.
 */
export function Base64ByteLength(base64: string | undefined): number {
  if (!base64) {
    return 0;
  }
  const compact = base64.replace(/\s/g, '');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

/**
 * The seconds of audio in a usage record, when it is counted in `Seconds`: the output units for
 * audio a model produced, the input units for audio it was given. Undefined otherwise, rather than
 * a guess.
 */
export function SecondsIn(usage: ModelUsage | undefined, side: 'input' | 'output'): number | undefined {
  if (usage?.unitKind !== 'Seconds') {
    return undefined;
  }
  const seconds = side === 'input' ? usage.inputUnits : usage.outputUnits;
  return seconds !== undefined && seconds > 0 ? seconds : undefined;
}

/** Leading bytes that identify an audio container, checked in order. */
const AUDIO_SIGNATURES: Array<{ Format: string; Matches: (bytes: Buffer) => boolean }> = [
  { Format: 'wav', Matches: b => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE' },
  { Format: 'ogg', Matches: b => ascii(b, 0, 4) === 'OggS' },
  { Format: 'flac', Matches: b => ascii(b, 0, 4) === 'fLaC' },
  { Format: 'webm', Matches: b => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { Format: 'mp4', Matches: b => ascii(b, 4, 8) === 'ftyp' },
  { Format: 'mp3', Matches: b => ascii(b, 0, 3) === 'ID3' },
  // ADTS AAC and MPEG audio both open with a sync word; the layer bits (00 for ADTS) tell them apart.
  { Format: 'aac', Matches: b => b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  { Format: 'mp3', Matches: b => b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0 },
];

/**
 * The container format of audio bytes, read from their leading bytes, or undefined when they are
 * not a recognized container (raw PCM, for one, has no header).
 */
export function DetectAudioFormat(bytes: Buffer | undefined): string | undefined {
  if (!bytes || bytes.length < 4) {
    return undefined;
  }
  return AUDIO_SIGNATURES.find(signature => signature.Matches(bytes))?.Format;
}

/** The bytes in [start, end) as ASCII, or an empty string when the buffer is too short. */
function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.length >= end ? bytes.toString('latin1', start, end) : '';
}
