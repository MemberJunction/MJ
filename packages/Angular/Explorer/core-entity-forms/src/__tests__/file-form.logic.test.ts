/**
 * The Files form's viewer decisions (MJ#4947): which media types report their own load, and when a size is shown.
 */
import { describe, it, expect } from 'vitest';
import { ClassifyFileMediaType, DescribeFileSize, MediaLoadsByElement } from '../lib/custom/Files/file-form.logic';

describe('MediaLoadsByElement', () => {
  it('is true for the types the viewer renders in an element with a load event, and for the Office previews, which report their own', () => {
    for (const type of ['image', 'pdf', 'video', 'audio', 'docx', 'xlsx'] as const) expect(MediaLoadsByElement(type)).toBe(true);
  });

  it('is false for text, which is fetched, and for any other type, which gets a fallback card and no element', () => {
    expect(MediaLoadsByElement('text')).toBe(false);
    expect(MediaLoadsByElement('other')).toBe(false);
  });
});

describe('DescribeFileSize', () => {
  it('formats a known size', () => {
    expect(DescribeFileSize(0)).toBe('0 B');
    expect(DescribeFileSize(6512)).toBe('6.4 KB');
    expect(DescribeFileSize(3284976)).toBe('3.1 MB');
  });

  it('is null when the size is unknown, so the badge and the row are left out instead of reading "0 B"', () => {
    expect(DescribeFileSize(null)).toBeNull();
    expect(DescribeFileSize(undefined)).toBeNull();
    expect(DescribeFileSize(Number.NaN)).toBeNull();
    expect(DescribeFileSize(-1)).toBeNull();
  });
});

describe('ClassifyFileMediaType', () => {
  it('recognises Word and Excel files by name when the server stored them as octet-stream (MJ#4957)', () => {
    expect(ClassifyFileMediaType('application/octet-stream', 'review.docx')).toBe('docx');
    expect(ClassifyFileMediaType('application/octet-stream', 'renewals.xlsx')).toBe('xlsx');
    expect(ClassifyFileMediaType('application/octet-stream', 'macros.xlsm')).toBe('xlsx');
    expect(ClassifyFileMediaType('application/octet-stream', 'legacy.xls')).toBe('xlsx');
  });

  it('recognises them by MIME type too, with any charset parameter ignored', () => {
    expect(ClassifyFileMediaType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x')).toBe('docx');
    expect(ClassifyFileMediaType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=binary', 'x')).toBe('xlsx');
    expect(ClassifyFileMediaType('application/vnd.ms-excel', 'x')).toBe('xlsx');
  });

  it('leaves legacy .doc and other binaries to the fallback card: mammoth reads OOXML only', () => {
    expect(ClassifyFileMediaType('application/octet-stream', 'old.doc')).toBe('other');
    expect(ClassifyFileMediaType('application/octet-stream', 'bundle.zip')).toBe('other');
    expect(ClassifyFileMediaType(null, null)).toBe('other');
  });

  it('keeps the earlier categories', () => {
    expect(ClassifyFileMediaType('image/png', 'a.png')).toBe('image');
    expect(ClassifyFileMediaType('application/pdf', 'a')).toBe('pdf');
    expect(ClassifyFileMediaType(null, 'clip.mp4')).toBe('video');
    expect(ClassifyFileMediaType(null, 'song.mp3')).toBe('audio');
    expect(ClassifyFileMediaType('text/plain', 'notes')).toBe('text');
    expect(ClassifyFileMediaType(null, 'data.csv')).toBe('text');
  });
});
