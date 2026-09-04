import { describe, expect, it } from 'vitest';
import { buildVersionDownload } from './artifact-version-download.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const dataUri = (mime: string, text: string) => `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

describe('buildVersionDownload', () => {
  it('decodes a data: URI to bytes with its real MIME type and filename', () => {
    // The bug: the data URI was written out verbatim as text/plain named "<name>.txt", so the
    // "downloaded document" was a text file full of base64 and opened as an invalid file.
    const out = buildVersionDownload(dataUri(DOCX, 'PK-docx-bytes'), 'Overview.docx', 'Overview.docx', 1, DOCX);
    expect(out.mimeType).toBe(DOCX);
    expect(out.fileName).toBe('Overview.docx');
    expect(out.data).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(out.data as Uint8Array).toString()).toBe('PK-docx-bytes');
  });

  it('never produces a .txt name for a binary artifact', () => {
    const out = buildVersionDownload(dataUri('application/pdf', '%PDF-1.7'), 'Report.pdf', 'Report.pdf', 2, 'application/pdf');
    expect(out.fileName.endsWith('.txt')).toBe(false);
    expect(out.mimeType).toBe('application/pdf');
  });

  it('falls back to an artifact-derived name when the version has no filename', () => {
    const out = buildVersionDownload(dataUri('application/pdf', 'x'), null, 'My Artifact', 3);
    expect(out.fileName).toBe('My Artifact_v3');
  });

  it('keeps text content as text, with its declared MIME type', () => {
    const out = buildVersionDownload('# A markdown doc', 'notes.md', 'notes.md', 1, 'text/markdown');
    expect(out.data).toBe('# A markdown doc');
    expect(out.mimeType).toBe('text/markdown');
    expect(out.fileName).toBe('notes.md');
  });

  it('defaults text with no MIME type to text/plain and a .txt name', () => {
    const out = buildVersionDownload('plain content', null, 'Thing', 4);
    expect(out.mimeType).toBe('text/plain');
    expect(out.fileName).toBe('Thing_v4.txt');
  });

  it('treats a malformed data: prefix as text rather than throwing', () => {
    const out = buildVersionDownload('data:notreallybase64', null, 'Thing', 1);
    expect(out.mimeType).toBe('text/plain');
    expect(out.data).toBe('data:notreallybase64');
  });
});
