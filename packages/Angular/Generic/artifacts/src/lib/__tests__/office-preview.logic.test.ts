/**
 * The pure parts of the shared Word and Excel previews (MJ#4957): workbook parsing into grid rows and columns, and the
 * mammoth conversion's handling of warnings.
 */
import { describe, it, expect } from 'vitest';
import { ConvertDocxToHtml, ParseWorkbook, type MammothModuleShim, type XlsxModuleShim, EscapeHtml } from '../components/previews/office-preview.logic';

describe('ParseWorkbook', () => {
  const XLSX: XlsxModuleShim = {
    read: () => ({ SheetNames: [], Sheets: {} }),
    utils: {
      sheet_to_json: <T>(sheet: unknown) => sheet as T[],
    },
  };

  it('gives every sheet its rows, and columns from the first row, in sheet order', () => {
    const sheets = ParseWorkbook(
      {
        SheetNames: ['Renewals', 'Notes'],
        Sheets: {
          Renewals: [{ Month: 'Jul', Renewals: '42' }, { Month: 'Aug', Renewals: '51' }],
          Notes: [{ Note: 'Second sheet' }],
        },
      },
      XLSX,
    );
    expect(sheets.map((s) => s.name)).toEqual(['Renewals', 'Notes']);
    expect(sheets[0].rowData).toHaveLength(2);
    expect(sheets[0].columnDefs.map((c) => c.field)).toEqual(['Month', 'Renewals']);
    expect(sheets[1].columnDefs.map((c) => c.headerName)).toEqual(['Note']);
  });

  it('gives an empty sheet no columns rather than failing', () => {
    const [empty] = ParseWorkbook({ SheetNames: ['Blank'], Sheets: { Blank: [] } }, XLSX);
    expect(empty.rowData).toEqual([]);
    expect(empty.columnDefs).toEqual([]);
  });
});

describe('ConvertDocxToHtml', () => {
  it('returns the HTML and reports mammoth warnings without failing', async () => {
    const warned: string[] = [];
    const mammoth: MammothModuleShim = {
      convertToHtml: async () => ({ value: '<h1>Review</h1><p>Body</p>', messages: [{ message: 'Unrecognised style' }] }),
    };
    const html = await ConvertDocxToHtml(new ArrayBuffer(8), mammoth, (m) => warned.push(m));
    expect(html).toBe('<h1>Review</h1><p>Body</p>');
    expect(warned).toEqual(['Unrecognised style']);
  });

  it('lets a mammoth failure propagate, so the viewer shows an error rather than a blank page', async () => {
    const mammoth = { convertToHtml: async () => { throw new Error('not a docx'); } };
    await expect(ConvertDocxToHtml(new ArrayBuffer(4), mammoth)).rejects.toThrow('not a docx');
  });
});

describe('EscapeHtml', () => {
  it('escapes the five characters that can close or open a tag or an attribute', () => {
    expect(EscapeHtml('</title><script>alert(1)</script> & "q" \'s\'')).toBe('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot; &#39;s&#39;');
  });
});
