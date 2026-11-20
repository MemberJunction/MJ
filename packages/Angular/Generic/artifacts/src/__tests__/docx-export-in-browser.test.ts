/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';

describe('Word export in a browser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the .docx file when the Node Buffer is not available', async () => {
    vi.stubGlobal('Buffer', undefined);

    const bytes = await new DocumentImportExportService().ConvertMarkdownToDocxBytes('# Plan\n\nHello', 'Plan');

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  });
});
