import { describe, it, expect } from 'vitest';
import {
    BuildSheetMatrix,
    EXCEL_MAX_CELL_LENGTH,
    EXCEL_MAX_SHEET_NAME_LENGTH,
    EXCEL_SOURCES_CHUNK_SIZE,
    EXCEL_WORKBOOK_CONTRACT_VERSION,
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
    MakeUniqueSheetName,
    ParseWorkbookManifest,
    ResolveColumns,
    SplitManifestForCells,
    TableNameForSource,
    ToExcelCellValue,
    ToExcelSerialDate,
} from '../contract';

const VIEW_ID = '1F5D2C3B-4A6E-4F70-8B9C-0D1E2F3A4B5C';
const QUERY_ID = '2a6e3d4c-5b7f-4081-9cad-1e2f3a4b5c6d';

function viewSource(overrides: Partial<ExcelWorkbookSource> = {}): ExcelWorkbookSource {
    return {
        Key: 's1',
        Kind: 'View',
        ID: VIEW_ID,
        Name: 'Active Members',
        SheetName: 'Active Members',
        Columns: [
            { Name: 'FirstName', Header: 'First Name', DataType: 'Text' },
            { Name: 'JoinDate', Header: 'Joined', DataType: 'Date' },
        ],
        ...overrides,
    };
}

function manifest(sources: ExcelWorkbookSource[] = [viewSource()]): ExcelWorkbookManifest {
    return {
        ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
        ServerName: 'Example Association',
        AddinUrl: 'https://mj.example.org/office/excel',
        GeneratedAt: '2026-10-30T12:00:00.000Z',
        Sources: sources,
    };
}

describe('SplitManifestForCells / ParseWorkbookManifest', () => {
    it('round-trips a manifest', () => {
        const original = manifest([viewSource(), viewSource({ Key: 's2', Kind: 'Query', ID: QUERY_ID, SheetName: 'Renewals', Parameters: { Year: 2026, Region: ['East', 'West'] } })]);
        const result = ParseWorkbookManifest(SplitManifestForCells(original));
        expect(result.Success).toBe(true);
        expect(result.Manifest).toEqual(original);
    });

    it('splits long manifests into cell-sized chunks that rejoin', () => {
        const columns = Array.from({ length: 900 }, (_, i) => ({ Name: `Field${i}`, Header: `A long column heading number ${i}`, DataType: 'Text' as const }));
        const cells = SplitManifestForCells(manifest([viewSource({ Columns: columns })]));
        expect(cells.length).toBeGreaterThan(1);
        expect(cells.every(c => c.length <= EXCEL_SOURCES_CHUNK_SIZE)).toBe(true);
        expect(ParseWorkbookManifest(cells).Success).toBe(true);
    });

    it('refuses an empty sheet, broken JSON and a different contract version', () => {
        expect(ParseWorkbookManifest([]).Success).toBe(false);
        expect(ParseWorkbookManifest(['{not json']).Success).toBe(false);
        const old = { ...manifest(), ContractVersion: 99 };
        expect(ParseWorkbookManifest([JSON.stringify(old)]).ErrorMessage).toMatch(/different version/);
    });

    it('refuses a source whose ID is not a UUID', () => {
        const tampered = manifest([viewSource({ ID: "1' OR 1=1 --" })]);
        expect(ParseWorkbookManifest([JSON.stringify(tampered)]).Success).toBe(false);
    });

    it('refuses parameters on a view and non-primitive parameter values', () => {
        expect(ParseWorkbookManifest([JSON.stringify(manifest([viewSource({ Parameters: { A: 1 } })]))]).Success).toBe(false);
        const badValue = { ...viewSource({ Kind: 'Query', ID: QUERY_ID }), Parameters: { A: { nested: true } } };
        expect(ParseWorkbookManifest([JSON.stringify(manifest([badValue as unknown as ExcelWorkbookSource]))]).Success).toBe(false);
    });

    it('refuses duplicate keys and sheets', () => {
        const dupKeys = manifest([viewSource(), viewSource({ SheetName: 'Other' })]);
        expect(ParseWorkbookManifest([JSON.stringify(dupKeys)]).Success).toBe(false);
        const dupSheets = manifest([viewSource(), viewSource({ Key: 's2', SheetName: 'ACTIVE MEMBERS' })]);
        expect(ParseWorkbookManifest([JSON.stringify(dupSheets)]).Success).toBe(false);
    });

    it('treats an unknown column data type as text', () => {
        const odd = manifest([viewSource({ Columns: [{ Name: 'X', Header: 'X', DataType: 'Fancy' as 'Text' }] })]);
        expect(ParseWorkbookManifest([JSON.stringify(odd)]).Manifest?.Sources[0].Columns[0].DataType).toBe('Text');
    });
});

describe('MakeUniqueSheetName', () => {
    it('strips characters Excel forbids and keeps names unique case-insensitively', () => {
        const used = new Set<string>();
        expect(MakeUniqueSheetName('Members: [2026]/East?', used)).toBe('Members 2026 East');
        expect(MakeUniqueSheetName('members 2026 east', used)).toBe('members 2026 east (2)');
    });

    it('caps names at Excel\'s length limit, suffix included', () => {
        const used = new Set<string>();
        const long = 'A'.repeat(50);
        const first = MakeUniqueSheetName(long, used);
        const second = MakeUniqueSheetName(long, used);
        expect(first.length).toBe(EXCEL_MAX_SHEET_NAME_LENGTH);
        expect(second.length).toBeLessThanOrEqual(EXCEL_MAX_SHEET_NAME_LENGTH);
        expect(second.endsWith('(2)')).toBe(true);
    });

    it('replaces blank, reserved and quote-wrapped names', () => {
        const used = new Set<string>();
        expect(MakeUniqueSheetName('   ', used)).toBe('Data');
        expect(MakeUniqueSheetName('History', used)).toBe('Data (2)');
        expect(MakeUniqueSheetName("'Quoted'", used)).toBe('Quoted');
    });
});

describe('cell conversion', () => {
    const noDates = () => null;

    it('turns nulls into blanks, keeps numbers and booleans, and serializes objects', () => {
        expect(ToExcelCellValue(null, 'Text', noDates)).toBe('');
        expect(ToExcelCellValue(42, 'Number', noDates)).toBe(42);
        expect(ToExcelCellValue(true, 'Boolean', noDates)).toBe(true);
        expect(ToExcelCellValue({ a: 1 }, 'Text', noDates)).toBe('{"a":1}');
    });

    it('truncates text to Excel\'s cell limit', () => {
        const value = ToExcelCellValue('x'.repeat(EXCEL_MAX_CELL_LENGTH + 10), 'Text', noDates);
        expect(typeof value === 'string' && value.length).toBe(EXCEL_MAX_CELL_LENGTH);
    });

    it('keeps a date string that does not parse', () => {
        expect(ToExcelCellValue('soon', 'DateTime', noDates)).toBe('soon');
    });

    it('builds a heading row then one row per record', () => {
        const matrix = BuildSheetMatrix(viewSource().Columns, [{ FirstName: 'Ada', JoinDate: '2026-01-02' }], (v, dateOnly) => ToExcelSerialDate(v, dateOnly, () => 0));
        expect(matrix).toEqual([['First Name', 'Joined'], ['Ada', 46024]]);
    });

    it('uses the first row\'s keys when a source declares no columns', () => {
        const source = viewSource({ Columns: [] });
        expect(ResolveColumns(source, [{ A: 1, B: 2 }]).map(c => c.Name)).toEqual(['A', 'B']);
        expect(ResolveColumns(source, [])).toEqual([]);
    });

    it('names tables from the source key', () => {
        expect(TableNameForSource({ Key: 's3' })).toBe('MJ_s3');
    });
});

describe('ToExcelSerialDate', () => {
    it('keeps a date-only value on its calendar day whatever the offset', () => {
        expect(ToExcelSerialDate('2026-01-02', true, () => 300)).toBe(46024);
        expect(ToExcelSerialDate('2026-01-02T00:00:00Z', true, () => -600)).toBe(46024);
    });

    it('shifts a date-time into local wall-clock time', () => {
        // 2026-01-02 12:00 UTC at UTC-5 (offset +300 minutes) is 07:00 local.
        const serial = ToExcelSerialDate('2026-01-02T12:00:00Z', false, () => 300);
        expect(serial).toBeCloseTo(46024 + 7 / 24, 6);
    });

    it('returns null for values that are not dates', () => {
        expect(ToExcelSerialDate('not a date', false, () => 0)).toBeNull();
        expect(ToExcelSerialDate('01/02/2026', true, () => 0)).toBeNull();
    });
});
