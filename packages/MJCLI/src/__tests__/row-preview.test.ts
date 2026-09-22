import { describe, it, expect } from 'vitest';
import { FormatRowPreview, type RowPreviewColumn } from '../lib/row-preview';

// Real mssql column metadata carries `type` as the exact type constructor
// (e.g. `sql.NVarChar`, `sql.Text`) — a function named after the SQL type
// because the driver defines each one as an ES2015 shorthand method. This
// fake reproduces that shape without needing a live driver.
function typed(name: string): RowPreviewColumn {
  const ctor = function () {
    return {};
  };
  Object.defineProperty(ctor, 'name', { value: name });
  return { type: ctor };
}

describe('FormatRowPreview', () => {
  it('renders non-null scalar columns', () => {
    const columns = { Name: typed('NVarChar'), IsActive: typed('Bit') };
    const row = { Name: 'Anthropic Vertex Key', IsActive: true };
    expect(FormatRowPreview(row, columns)).toEqual(['Name: Anthropic Vertex Key', 'IsActive: true']);
  });

  it('skips null and missing values', () => {
    const columns = { Description: typed('NVarChar') };
    expect(FormatRowPreview({ Description: null }, columns)).toEqual([]);
    expect(FormatRowPreview({}, columns)).toEqual([]);
  });

  it('skips large-object SQL types even when the value is a short string', () => {
    const columns = { Payload: typed('Xml') };
    expect(FormatRowPreview({ Payload: '<a/>' }, columns)).toEqual([]);
  });

  it('skips a VarBinary column', () => {
    const columns = { Blob: typed('VarBinary') };
    expect(FormatRowPreview({ Blob: Buffer.from('x') }, columns)).toEqual([]);
  });

  it('skips a Buffer value regardless of its declared type', () => {
    // Defense in depth: even if the type name weren't in the skip set, a
    // non-scalar JS value must never be rendered.
    const columns = { Blob: typed('SomeUnknownType') };
    expect(FormatRowPreview({ Blob: Buffer.from('x') }, columns)).toEqual([]);
  });

  it('truncates a long value', () => {
    const columns = { Notes: typed('NVarChar') };
    const long = 'x'.repeat(200);
    const [line] = FormatRowPreview({ Notes: long }, columns);
    expect(line.length).toBeLessThan(80);
    expect(line).toContain('…');
  });

  it('caps the number of columns shown', () => {
    const columns: Record<string, RowPreviewColumn> = {};
    const row: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      columns[`Col${i}`] = typed('Int');
      row[`Col${i}`] = i;
    }
    expect(FormatRowPreview(row, columns)).toHaveLength(6);
  });

  it('formats a Date value as ISO', () => {
    const columns = { CreatedAt: typed('DateTime') };
    const date = new Date('2026-01-04T12:00:00.000Z');
    expect(FormatRowPreview({ CreatedAt: date }, columns)).toEqual(['CreatedAt: 2026-01-04T12:00:00.000Z']);
  });

  it('returns an empty array when nothing is safe to show', () => {
    const columns = { Blob: typed('VarBinary'), Xml: typed('Xml') };
    expect(FormatRowPreview({ Blob: Buffer.from('x'), Xml: '<a/>' }, columns)).toEqual([]);
  });
});
