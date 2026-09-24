import { describe, expect, it } from 'vitest';
import { BuildVersionDownload } from './artifact-version-download.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const dataUri = (mime: string, text: string) => `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

describe('buildVersionDownload', () => {
  it('decodes a data: URI to bytes with its real MIME type and filename', () => {
    // The bug: the data URI was written out verbatim as text/plain named "<name>.txt", so the
    // "downloaded document" was a text file full of base64 and opened as an invalid file.
    const out = BuildVersionDownload(dataUri(DOCX, 'PK-docx-bytes'), 'Overview.docx', 'Overview.docx', 1, DOCX);
    expect(out.MimeType).toBe(DOCX);
    expect(out.FileName).toBe('Overview.docx');
    expect(out.Data).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(out.Data as Uint8Array).toString()).toBe('PK-docx-bytes');
  });

  it('never produces a .txt name for a binary artifact', () => {
    const out = BuildVersionDownload(dataUri('application/pdf', '%PDF-1.7'), 'Report.pdf', 'Report.pdf', 2, 'application/pdf');
    expect(out.FileName.endsWith('.txt')).toBe(false);
    expect(out.MimeType).toBe('application/pdf');
  });

  it('falls back to an artifact-derived name when the version has no filename', () => {
    const out = BuildVersionDownload(dataUri('application/pdf', 'x'), null, 'My Artifact', 3);
    expect(out.FileName).toBe('My Artifact_v3');
  });

  it('keeps text content as text, with its declared MIME type', () => {
    const out = BuildVersionDownload('# A markdown doc', 'notes.md', 'notes.md', 1, 'text/markdown');
    expect(out.Data).toBe('# A markdown doc');
    expect(out.MimeType).toBe('text/markdown');
    expect(out.FileName).toBe('notes.md');
  });

  it('defaults text with no MIME type to text/plain and a .txt name', () => {
    const out = BuildVersionDownload('plain content', null, 'Thing', 4);
    expect(out.MimeType).toBe('text/plain');
    expect(out.FileName).toBe('Thing_v4.txt');
  });

  it('treats a malformed data: prefix as text rather than throwing', () => {
    const out = BuildVersionDownload('data:notreallybase64', null, 'Thing', 1);
    expect(out.MimeType).toBe('text/plain');
    expect(out.Data).toBe('data:notreallybase64');
  });
});
