import path from 'node:path';

export type SqlCell = string | number | boolean | Date | null;

/** CSV parsing, type coercion, and truth-file refusal for the pstruth bulk loaders. */
export class TruthCsv {
  /** Parse an unquoted CSV (with or without a trailing newline); throws if any quote character is present. */
  public static Parse(text: string): { Header: string[]; Rows: string[][] } {
    if (text.includes('"')) {
      throw new Error('TruthCsv.Parse: quoted fields are refused (generators emit unquoted CSV)');
    }
    const rawLines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }
    if (rawLines.length === 0) {
      return { Header: [], Rows: [] };
    }
    const [headerLine, ...rowLines] = rawLines;
    return {
      Header: headerLine!.split(','),
      Rows: rowLines.map((line) => line.split(',')),
    };
  }

  /** Ensure `header` is an ordered subset of `tableColumns`, throwing with the first offending column name. */
  public static AssertHeaderOrder(header: readonly string[], tableColumns: readonly string[]): void {
    let lastIdx = -1;
    for (const col of header) {
      const idx = tableColumns.indexOf(col);
      if (idx === -1) {
        throw new Error(`CSV column '${col}' does not exist in target table (${tableColumns.join(', ')})`);
      }
      if (idx <= lastIdx) {
        throw new Error(`CSV column '${col}' is out of table column order`);
      }
      lastIdx = idx;
    }
  }

  /** Coerce a string cell to its mssql parameter value; empty string becomes null. */
  public static CoerceCell(value: string, sqlType: string): SqlCell {
    if (value === '') return null;
    const upper = sqlType.toUpperCase();
    if (upper === 'INT') {
      if (!/^-?\d+$/.test(value)) {
        throw new Error(`Value '${value}' is not an integer`);
      }
      const n = Number(value);
      if (!Number.isSafeInteger(n)) {
        throw new Error(`Value '${value}' is not an integer`);
      }
      return n;
    }
    if (upper === 'FLOAT') {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new Error(`Value '${value}' is not a finite float`);
      }
      return n;
    }
    if (upper === 'BIT') {
      if (value === '1' || value.toLowerCase() === 'true') return true;
      if (value === '0' || value.toLowerCase() === 'false') return false;
      throw new Error(`Value '${value}' is not a bit (expected 0/1/true/false)`);
    }
    if (upper === 'DATE') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m) {
        throw new Error(`Value '${value}' is not an ISO date (YYYY-MM-DD)`);
      }
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    if (upper === 'UNIQUEIDENTIFIER') {
      return value.toLowerCase();
    }
    if (upper.startsWith('NVARCHAR')) {
      return value;
    }
    throw new Error(`Unsupported SQL type '${sqlType}'`);
  }

  /** Refuse any file whose basename starts with `truth` (case-insensitive). */
  public static AssertNotTruthFile(filePath: string): void {
    if (path.basename(filePath).toLowerCase().startsWith('truth')) {
      throw new Error(`Refusing to load truth file into database: ${filePath}`);
    }
  }
}
