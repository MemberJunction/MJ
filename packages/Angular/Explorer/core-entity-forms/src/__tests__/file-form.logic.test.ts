/**
 * The Files form's viewer decisions (MJ#4947): which media types report their own load, and when a size is shown.
 */
import { describe, it, expect } from 'vitest';
import { ClassifyFileMediaType, DescribeFileSize, IsEmbeddableMediaUrl, MediaLoadsByElement } from '../lib/custom/Files/file-form.logic';

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

describe('IsEmbeddableMediaUrl (PR #6034 URL scheme screening)', () => {
  const origin = 'https://explorer.example.com';

  it('accepts absolute http/https URLs and same-origin relative media streaming paths', () => {
    expect(IsEmbeddableMediaUrl('https://cdn.example.com/files/report.pdf', origin)).toBe(true);
    expect(IsEmbeddableMediaUrl('http://localhost:4000/media/123?token=abc', origin)).toBe(true);
    expect(IsEmbeddableMediaUrl('/media/file-123?token=signed-jwt', origin)).toBe(true);
    expect(IsEmbeddableMediaUrl('  https://cdn.example.com/image.png  ', origin)).toBe(true);
  });

  it('rejects javascript:, data:, blob:, vbscript:, file:, scheme-relative //, and empty inputs', () => {
    expect(IsEmbeddableMediaUrl('javascript:alert(document.domain)', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('  JAVASCRIPT:alert(1)', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('data:text/html,<script>alert(1)</script>', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('blob:https://explorer.example.com/550e8400', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('vbscript:msgbox(1)', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('file:///etc/passwd', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('//evil.example.com/phish.pdf', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl('   ', origin)).toBe(false);
    expect(IsEmbeddableMediaUrl(null, origin)).toBe(false);
    expect(IsEmbeddableMediaUrl(undefined, origin)).toBe(false);
  });
});
