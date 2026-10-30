import { describe, it, expect } from 'vitest';
import {
    BuildSheetMatrix,
    EXCEL_MAX_CELL_LENGTH,
    EXCEL_MAX_SHEET_NAME_LENGTH,
    EXCEL_MAX_SOURCES_PER_WORKBOOK,
    EXCEL_SOURCES_CHUNK_SIZE,
    EXCEL_WORKBOOK_CONTRACT_VERSION,
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
    MakeUniqueSheetName,
    NextSourceKey,
    ParseWorkbookManifest,
    RemoveWorkbookSource,
    ResolveColumns,
    SplitManifestForCells,
    TableNameForSource,
    ToExcelCellValue,
    ToExcelSerialDate,
    UpsertWorkbookSource,
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

    it('accepts Entity sources with EntityName and refuses Entity sources without EntityName or Query sources with EntityName', () => {
        const entitySource = viewSource({ Kind: 'Entity', Name: 'People', EntityName: 'MJ: People' });
        const parsed = ParseWorkbookManifest(SplitManifestForCells(manifest([entitySource])));
        expect(parsed.Success).toBe(true);
        expect(parsed.Manifest?.Sources[0].EntityName).toBe('MJ: People');

        const missingEntityName = manifest([viewSource({ Kind: 'Entity' })]);
        expect(ParseWorkbookManifest([JSON.stringify(missingEntityName)]).Success).toBe(false);

        const queryWithEntityName = manifest([viewSource({ Kind: 'Query', ID: QUERY_ID, EntityName: 'MJ: People' })]);
        expect(ParseWorkbookManifest([JSON.stringify(queryWithEntityName)]).Success).toBe(false);
    });
});

describe('NextSourceKey / UpsertWorkbookSource / RemoveWorkbookSource', () => {
    it('picks the lowest unused source key', () => {
        expect(NextSourceKey([])).toBe('s1');
        expect(NextSourceKey([{ Key: 's1' }, { Key: 's3' }])).toBe('s2');
    });

    it('creates a manifest from scratch, appends new sheets, replaces same-sheet sources keeping Key, and unlinks down to null', () => {
        const host = { ServerName: 'Cheese Federation', AddinUrl: 'https://mj.example.org/office/excel' };
        const first = UpsertWorkbookSource(
            null,
            host,
            { Kind: 'Entity', ID: VIEW_ID, Name: 'People', EntityName: 'People', Columns: viewSource().Columns },
            'People',
            '2026-10-30T12:00:00.000Z',
        );
        expect(first.Source.Key).toBe('s1');
        expect(first.Manifest.Sources).toHaveLength(1);

        const second = UpsertWorkbookSource(
            first.Manifest,
            host,
            { Kind: 'Query', ID: QUERY_ID, Name: 'Renewals', Columns: [] },
            'Renewals',
            '2026-10-30T12:01:00.000Z',
        );
        expect(second.Source.Key).toBe('s2');
        expect(second.Manifest.Sources).toHaveLength(2);

        const replaced = UpsertWorkbookSource(
            second.Manifest,
            host,
            { Kind: 'View', ID: VIEW_ID, Name: 'Active People', EntityName: 'People', Columns: viewSource().Columns },
            'PEOPLE',
            '2026-10-30T12:02:00.000Z',
        );
        expect(replaced.Source.Key).toBe('s1');
        expect(replaced.Source.SheetName).toBe('People');
        expect(replaced.Manifest.Sources).toHaveLength(2);

        const afterFirstUnlink = RemoveWorkbookSource(replaced.Manifest, 's1', '2026-10-30T12:03:00.000Z');
        expect(afterFirstUnlink?.Sources.map(s => s.Key)).toEqual(['s2']);
        expect(RemoveWorkbookSource(afterFirstUnlink!, 's2')).toBeNull();
    });

    it('enforces EXCEL_MAX_SOURCES_PER_WORKBOOK when adding distinct sheets', () => {
        const host = { ServerName: 'Cheese Federation', AddinUrl: 'https://mj.example.org/office/excel' };
        let current: ExcelWorkbookManifest | null = null;
        for (let i = 1; i <= EXCEL_MAX_SOURCES_PER_WORKBOOK; i++) {
            current = UpsertWorkbookSource(
                current,
                host,
                { Kind: 'Query', ID: QUERY_ID, Name: `Q${i}`, Columns: [] },
                `Sheet${i}`,
            ).Manifest;
        }
        expect(() =>
            UpsertWorkbookSource(current, host, { Kind: 'Query', ID: QUERY_ID, Name: 'Overflow', Columns: [] }, 'Overflow'),
        ).toThrow(/at most/);
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
