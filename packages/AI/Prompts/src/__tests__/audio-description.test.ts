import { describe, it, expect } from 'vitest';
import { ModelUsage } from '@memberjunction/ai';
import { Base64ByteLength, CountCharacters, DetectAudioFormat, SecondsIn } from '../audio/audio-description';

describe('audio description helpers', () => {
  describe('DetectAudioFormat', () => {
    it.each([
      ['wav', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])],
      ['ogg', Buffer.from('OggS\0\0\0\0')],
      ['flac', Buffer.from('fLaC\0\0\0\0')],
      ['webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0])],
      ['mp4', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')])],
      ['mp3', Buffer.from('ID3\x04\0\0\0\0')],
      ['mp3', Buffer.from([0xff, 0xfb, 0x90, 0x44])],
      ['aac', Buffer.from([0xff, 0xf1, 0x50, 0x80])],
    ])('recognizes %s', (format, bytes) => {
      expect(DetectAudioFormat(bytes)).toBe(format);
    });

    it('returns undefined for headerless or missing audio', () => {
      expect(DetectAudioFormat(Buffer.from([1, 2, 3, 4, 5, 6]))).toBeUndefined();
      expect(DetectAudioFormat(undefined)).toBeUndefined();
      expect(DetectAudioFormat(Buffer.from([0xff]))).toBeUndefined();
    });
  });

  describe('Base64ByteLength', () => {
    it.each([['abc'], ['abcd'], ['abcde'], ['']])('matches the decoded size of %j', (text) => {
      const base64 = Buffer.from(text).toString('base64');

      expect(Base64ByteLength(base64)).toBe(Buffer.from(base64, 'base64').byteLength);
    });

    it('treats a missing string as empty', () => {
      expect(Base64ByteLength(undefined)).toBe(0);
    });
  });

  it('CountCharacters counts code points, not UTF-16 units', () => {
    expect(CountCharacters('Héllo 👋')).toBe(7);
  });

  describe('SecondsIn', () => {
    it('reads the side asked for, only from a Seconds measure', () => {
      const usage = ModelUsage.ForMedia('Seconds', 12, 3);

      expect(SecondsIn(usage, 'input')).toBe(12);
      expect(SecondsIn(usage, 'output')).toBe(3);
      expect(SecondsIn(ModelUsage.ForMedia('Characters', 12), 'input')).toBeUndefined();
      expect(SecondsIn(undefined, 'input')).toBeUndefined();
    });

    it('does not report zero seconds as a duration', () => {
      expect(SecondsIn(ModelUsage.ForMedia('Seconds', 0, 0), 'output')).toBeUndefined();
    });
  });
});
