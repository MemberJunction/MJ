import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
    EXCEL_SOURCES_SHEET_NAME,
    EXCEL_WORKBOOK_CONTRACT_VERSION,
    ExcelWorkbookManifest,
    ParseWorkbookManifest,
} from '@memberjunction/excel-addin';
import {
    BuildConnectedWorkbook,
    EXCEL_EMPTY_SHEET_NOTE,
    TASKPANES_CONTENT_TYPE,
    TASKPANES_PART,
    TASKPANES_RELATIONSHIP_TYPE,
    TASKPANES_RELS_PART,
    WEB_EXTENSION_CONTENT_TYPE,
    WEB_EXTENSION_PART,
} from '../workbook-builder';

const options = { AddinId: 'AAEB4761-75CC-4DB1-99BD-7790FAD307C6', Version: '1.0.0.0', Store: 'EXCatalog', StoreType: 'EXCatalog' };

const manifest: ExcelWorkbookManifest = {
    ContractVersion: EXCEL_WORKBOOK_CONTRACT_VERSION,
    ServerName: 'Cheese Federation',
    AddinUrl: 'https://api.example.org/office/excel',
    GeneratedAt: '2026-10-30T12:00:00.000Z',
    Sources: [
        {
            Key: 's1', Kind: 'View', ID: '6F1D4A6E-0C5E-4B53-9E0B-6F2C1D8E9A10', Name: 'Active Members', SheetName: 'Active Members',
            Columns: [
                { Name: 'FirstName', Header: 'First Name', DataType: 'Text' },
                { Name: 'JoinDate', Header: 'Joined', DataType: 'Date' },
            ],
        },
        {
            Key: 's2', Kind: 'Query', ID: '7A2B3C4D-1E2F-4A5B-8C9D-0E1F2A3B4C5D', Name: 'Renewals', SheetName: 'Renewals',
            Columns: [], Parameters: { Year: 2026 },
        },
    ],
};

async function build(): Promise<{ zip: JSZip; workbook: ExcelJS.Workbook }> {
    const buffer = await BuildConnectedWorkbook(manifest, options);
    const zip = await JSZip.loadAsync(buffer);
    const workbook = new ExcelJS.Workbook();
    // exceljs types `load` against an older Node Buffer type; the bytes are the same.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return { zip, workbook };
}

describe('BuildConnectedWorkbook', () => {
    it('adds the web-extension parts that open the add-in with the file', async () => {
        const { zip } = await build();
        const webExtension = await zip.file(WEB_EXTENSION_PART)!.async('string');
        expect(webExtension).toContain(`<we:reference id="${options.AddinId}" version="1.0.0.0" store="EXCatalog" storeType="EXCatalog"/>`);
        expect(webExtension).toContain('<we:property name="Office.AutoShowTaskpaneWithDocument" value="true"/>');
        expect(webExtension).toMatch(/<we:webextension [^>]*id="\{[0-9A-F-]{36}\}"/);
        expect(await zip.file(TASKPANES_PART)!.async('string')).toContain('r:id="rId1"');
        expect(await zip.file(TASKPANES_RELS_PART)!.async('string')).toContain('Target="webextension1.xml"');
    });

    it('registers the parts in [Content_Types].xml and the package relationships', async () => {
        const { zip } = await build();
        const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
        expect(contentTypes).toContain(`<Override PartName="/${WEB_EXTENSION_PART}" ContentType="${WEB_EXTENSION_CONTENT_TYPE}"/>`);
        expect(contentTypes).toContain(`<Override PartName="/${TASKPANES_PART}" ContentType="${TASKPANES_CONTENT_TYPE}"/>`);
        expect(contentTypes.trim().endsWith('</Types>')).toBe(true);
        const rels = await zip.file('_rels/.rels')!.async('string');
        expect(rels).toContain(`Type="${TASKPANES_RELATIONSHIP_TYPE}" Target="${TASKPANES_PART}"`);
        expect(rels).toContain('officeDocument'); // exceljs's own relationship survives
    });

    it('writes headings and no rows on each data sheet', async () => {
        const { workbook } = await build();
        const members = workbook.getWorksheet('Active Members')!;
        expect(members.getRow(1).getCell(1).value).toBe('First Name');
        expect(members.getRow(1).getCell(2).value).toBe('Joined');
        expect(members.getRow(1).font?.bold).toBe(true);
        expect(members.getCell('A2').value).toBe(EXCEL_EMPTY_SHEET_NOTE);
        expect(members.rowCount).toBe(2);
        const renewals = workbook.getWorksheet('Renewals')!;
        expect(renewals.getCell('A1').value).toBe(EXCEL_EMPTY_SHEET_NOTE);
        expect(renewals.rowCount).toBe(1);
    });

    it('records the sources on a very-hidden sheet the pane can parse back', async () => {
        const { workbook } = await build();
        const sheet = workbook.getWorksheet(EXCEL_SOURCES_SHEET_NAME)!;
        expect(sheet.state).toBe('veryHidden');
        const cells: string[] = [];
        sheet.getColumn(1).eachCell(cell => {
            cells.push(String(cell.value));
        });
        const parsed = ParseWorkbookManifest(cells);
        expect(parsed.Success).toBe(true);
        expect(parsed.Manifest).toEqual(manifest);
    });

    it('holds no credential anywhere in the file', async () => {
        const { zip } = await build();
        const texts = await Promise.all(Object.values(zip.files).filter(f => !f.dir).map(f => f.async('string')));
        expect(texts.join('\n')).not.toMatch(/mj_sk_|APIKey/);
    });
});
