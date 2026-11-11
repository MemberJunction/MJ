import { describe, it, expect, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { ParseWorkbook, XlsxModuleShim } from '../lib/components/previews/office-preview.logic';

/**
 * The spreadsheet preview parses bytes users upload, so the SheetJS release it runs must carry the fixes for
 * the prototype-pollution and ReDoS advisories (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9; #4016). These
 * tests pin the release and check that a workbook whose names and headers are prototype keys parses as
 * plain data without touching Object.prototype.
 */

const SheetJS = XLSX as unknown as XlsxModuleShim & { version: string };
const PROTO_KEYS = ['__proto__', 'constructor', 'prototype', 'polluted'];

function hostileWorkbookBytes(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['__proto__', 'constructor', 'polluted'],
    ['{"polluted":"yes"}', 'x', 'yes'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'constructor');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'prototype');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('SheetJS release used by the spreadsheet preview', () => {
  afterEach(() => {
    for (const key of PROTO_KEYS) {
      if (key !== '__proto__' && key !== 'constructor' && Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
        delete (Object.prototype as Record<string, unknown>)[key];
      }
    }
  });

  it('is 0.20.3 or later (fixed for both advisories)', () => {
    const [major, minor, patch] = SheetJS.version.split('.').map(Number);
    expect(major * 10000 + minor * 100 + patch).toBeGreaterThanOrEqual(2003);
  });

  it('parses a workbook with prototype-key sheet names and headers without polluting Object.prototype', () => {
    const workbook = SheetJS.read(hostileWorkbookBytes(), { type: 'array' });
    const sheets = ParseWorkbook(workbook, SheetJS);

    expect(sheets.map((s) => s.name)).toEqual(['constructor', 'prototype']);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(sheets[0].rowData).toHaveLength(1);
  });
});
