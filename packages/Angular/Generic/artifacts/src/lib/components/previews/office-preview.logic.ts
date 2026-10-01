/**
 * Pure helpers behind the Word and Excel previews, kept out of the components so they can be tested on the node preset
 * and reused by anything that has the bytes of an Office file.
 */
import type { ColDef } from 'ag-grid-community';

/** One worksheet, parsed for display in an AG Grid. */
export interface SheetData {
  name: string;
  rowData: Record<string, string | number | boolean | null>[];
  columnDefs: ColDef[];
}

/** The minimum of SheetJS this code uses, so the library is loaded on demand and typed here alone. */
export interface XlsxModuleShim {
  read(data: ArrayBuffer, opts: { type: 'array' | 'buffer' | 'binary' | 'base64' | 'string' }): WorkbookShim;
  utils: {
    sheet_to_json<T>(sheet: unknown, opts: { defval: null; raw: boolean }): T[];
  };
}

export interface WorkbookShim {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

/** The minimum of mammoth this code uses. */
export interface MammothModuleShim {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages?: { message: string }[] }>;
}

/** Fetches a URL as bytes, failing on a non-2xx status. */
export async function FetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching file`);
  }
  return response.arrayBuffer();
}

/**
 * Converts a Word document's bytes to HTML with mammoth. Warnings about unsupported features are passed to `warn`
 * rather than failing the conversion.
 */
export async function ConvertDocxToHtml(
  arrayBuffer: ArrayBuffer,
  mammoth: MammothModuleShim,
  warn: (message: string) => void = (m) => console.warn('[DocxPreview] mammoth:', m),
): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer });
  for (const m of result.messages ?? []) warn(m.message);
  return result.value;
}

/**
 * Parses every sheet of a workbook into rows and AG Grid column definitions. Values come back formatted as strings
 * (`raw: false`) so dates and numbers display as the sheet shows them; empty cells are null.
 */
export function ParseWorkbook(workbook: WorkbookShim, XLSX: XlsxModuleShim): SheetData[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(sheet, {
      defval: null,
      raw: false,
    });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const columnDefs: ColDef[] = headers.map((h) => ({ field: h, headerName: h, tooltipField: h }));
    return { name, rowData: rows, columnDefs };
  });
}
