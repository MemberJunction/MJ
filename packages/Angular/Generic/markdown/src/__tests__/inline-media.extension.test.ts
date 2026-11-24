import { describe, expect, it } from 'vitest';
import {
  FormatInlineMediaTimestamp,
  ParseInlineMediaCues,
  ParseInlineMediaTimestampSeconds,
} from '../lib/extensions/inline-media.extension';

describe('inline-media.extension', () => {
  describe('ParseInlineMediaTimestampSeconds', () => {
    it('should parse seconds, MM:SS, HH:MM:SS.mmm, and SRT comma milliseconds', () => {
      expect(ParseInlineMediaTimestampSeconds('75')).toBe(75);
      expect(ParseInlineMediaTimestampSeconds('01:15')).toBe(75);
      expect(ParseInlineMediaTimestampSeconds('00:01:15.500')).toBe(75.5);
      expect(ParseInlineMediaTimestampSeconds('01:02:03,250')).toBe(3723.25);
    });

    it('should reject negative, empty, or out-of-range timestamps', () => {
      expect(ParseInlineMediaTimestampSeconds('')).toBeNull();
      expect(ParseInlineMediaTimestampSeconds('-5')).toBeNull();
      expect(ParseInlineMediaTimestampSeconds('00:75:00')).toBeNull();
      expect(ParseInlineMediaTimestampSeconds('00:01:99')).toBeNull();
      expect(ParseInlineMediaTimestampSeconds('abc')).toBeNull();
    });
  });

  describe('FormatInlineMediaTimestamp', () => {
    it('should format milliseconds as MM:SS and H:MM:SS', () => {
      expect(FormatInlineMediaTimestamp(0)).toBe('00:00');
      expect(FormatInlineMediaTimestamp(75_500)).toBe('01:15');
      expect(FormatInlineMediaTimestamp(3_661_000)).toBe('1:01:01');
    });
  });

  describe('ParseInlineMediaCues', () => {
    it('should parse WebVTT with BOM, NOTE/STYLE blocks, voice spans, and entities', () => {
      const vtt = [
        '\uFEFFWEBVTT - Demo',
        '',
        'NOTE',
        'Generated caption track',
        '',
        'STYLE',
        '::cue { color: yellow; }',
        '',
        'intro',
        '00:00:01.000 --> 00:00:04.500 align:start',
        '<v.loud Host Name>Welcome &amp; <b>hello</b>!</v>',
        '',
        '00:00:05.000 --> 00:00:09.000',
        'Moderator: Please open section 2.',
      ].join('\r\n');

      expect(ParseInlineMediaCues(vtt)).toEqual([
        {
          Id: 'intro',
          StartMs: 1000,
          EndMs: 4500,
          SpeakerLabel: 'Host Name',
          Text: 'Welcome & hello !',
        },
        {
          Id: 'cue-2',
          StartMs: 5000,
          EndMs: 9000,
          SpeakerLabel: 'Moderator',
          Text: 'Please open section 2.',
        },
      ]);
    });

    it('should parse SubRip (SRT) cues and keep non-blank lines after whitespace-only cue lines', () => {
      const srt = [
        '1',
        '00:00:10,000 --> 00:00:14,250',
        '   ',
        'First spoken line',
        'Second spoken line',
        '',
        '2',
        '00:00:15,000 --> 00:00:18,000',
        '<i>Closing remark</i>',
      ].join('\n');

      expect(ParseInlineMediaCues(srt)).toEqual([
        {
          Id: '1',
          StartMs: 10000,
          EndMs: 14250,
          Text: 'First spoken line Second spoken line',
        },
        {
          Id: '2',
          StartMs: 15000,
          EndMs: 18000,
          Text: 'Closing remark',
        },
      ]);
    });
  });
});
