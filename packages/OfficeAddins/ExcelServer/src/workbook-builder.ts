/**
 * @fileoverview Builds an Open in Excel workbook: headings and no rows, the source record, and the
 * Office parts that open the add-in when the file opens.
 *
 * `exceljs` writes the sheets. It can't write Office web-extension parts, so the file is then
 * reopened with `jszip` and four parts are added, the same ones Excel writes when a task pane is
 * pinned to a document:
 *
 * - `xl/webextensions/webextension1.xml` names the add-in (its GUID, version, store and store type)
 *   and sets `Office.AutoShowTaskpaneWithDocument`, which opens the pane with the file;
 * - `xl/webextensions/taskpanes.xml` docks that pane, through
 *   `xl/webextensions/_rels/taskpanes.xml.rels`;
 * - an `[Content_Types].xml` override for each part, and the package relationship in `_rels/.rels`.
 *
 * The file carries no rows and no credential. Whoever opens it signs in and fills it as themselves.
 *
 * @module @memberjunction/excel-addin-server
 */
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
    EXCEL_SOURCES_SHEET_NAME,
    ExcelSourceColumn,
    ExcelWorkbookManifest,
    ExcelWorkbookSource,
    SplitManifestForCells,
} from '@memberjunction/excel-addin';
import { EscapeXml } from './manifest-builder';

/** How a workbook names the add-in for Office. */
export interface ConnectedWorkbookOptions {
    AddinId: string;
    Version: string;
    Store: string;
    StoreType: string;
}

/** The note written under each sheet's headings until the pane fills it. */
export const EXCEL_EMPTY_SHEET_NOTE = 'Sign in with the MemberJunction add-in to load this data.';

export const WEB_EXTENSION_PART = 'xl/webextensions/webextension1.xml';
export const TASKPANES_PART = 'xl/webextensions/taskpanes.xml';
export const TASKPANES_RELS_PART = 'xl/webextensions/_rels/taskpanes.xml.rels';
export const WEB_EXTENSION_CONTENT_TYPE = 'application/vnd.ms-office.webextension+xml';
export const TASKPANES_CONTENT_TYPE = 'application/vnd.ms-office.webextensiontaskpanes+xml';
export const TASKPANES_RELATIONSHIP_TYPE = 'http://schemas.microsoft.com/office/2011/relationships/webextensiontaskpanes';
const WEB_EXTENSION_RELATIONSHIP_TYPE = 'http://schemas.microsoft.com/office/2011/relationships/webextension';
const ROOT_RELATIONSHIP_ID = 'rIdMJExcelAddinTaskpanes';
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 50;

/** Builds the workbook for a manifest whose sources are already resolved and checked. */
export async function BuildConnectedWorkbook(manifest: ExcelWorkbookManifest, options: ConnectedWorkbookOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MemberJunction';
    workbook.created = new Date(manifest.GeneratedAt);
    for (const source of manifest.Sources) {
        addDataSheet(workbook, source);
    }
    addSourcesSheet(workbook, manifest);
    const written = await workbook.xlsx.writeBuffer();
    return AddWebExtensionParts(Buffer.from(written), options);
}

/** Adds the parts that make Excel open the add-in with this file. */
export async function AddWebExtensionParts(xlsx: Buffer, options: ConnectedWorkbookOptions): Promise<Buffer> {
    const zip = await JSZip.loadAsync(xlsx);
    zip.file(WEB_EXTENSION_PART, buildWebExtensionXml(options));
    zip.file(TASKPANES_PART, TASKPANES_XML);
    zip.file(TASKPANES_RELS_PART, TASKPANES_RELS_XML);
    await updatePart(zip, '[Content_Types].xml', '</Types>', [
        `<Override PartName="/${TASKPANES_PART}" ContentType="${TASKPANES_CONTENT_TYPE}"/>`,
        `<Override PartName="/${WEB_EXTENSION_PART}" ContentType="${WEB_EXTENSION_CONTENT_TYPE}"/>`,
    ]);
    await updatePart(zip, '_rels/.rels', '</Relationships>', [
        `<Relationship Id="${ROOT_RELATIONSHIP_ID}" Type="${TASKPANES_RELATIONSHIP_TYPE}" Target="${TASKPANES_PART}"/>`,
    ]);
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function addDataSheet(workbook: ExcelJS.Workbook, source: ExcelWorkbookSource): void {
    const sheet = workbook.addWorksheet(source.SheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    if (source.Columns.length > 0) {
        sheet.columns = source.Columns.map(c => ({ header: c.Header, key: c.Name, width: columnWidth(c) }));
        sheet.getRow(1).font = { bold: true };
    }
    const note = sheet.getCell(source.Columns.length > 0 ? 'A2' : 'A1');
    note.value = EXCEL_EMPTY_SHEET_NOTE;
    note.font = { italic: true, color: { argb: 'FF6B7280' } };
}

function addSourcesSheet(workbook: ExcelJS.Workbook, manifest: ExcelWorkbookManifest): void {
    const sheet = workbook.addWorksheet(EXCEL_SOURCES_SHEET_NAME, { state: 'veryHidden' });
    SplitManifestForCells(manifest).forEach((chunk, i) => {
        sheet.getCell(i + 1, 1).value = chunk;
    });
}

function columnWidth(column: ExcelSourceColumn): number {
    const base = column.DataType === 'DateTime' ? 20 : column.DataType === 'Date' ? 12 : column.Header.length + 2;
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, base));
}

function buildWebExtensionXml(options: ConnectedWorkbookOptions): string {
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        `<we:webextension xmlns:we="http://schemas.microsoft.com/office/webextensions/webextension/2010/11" id="{${randomUUID().toUpperCase()}}">`,
        `<we:reference id="${EscapeXml(options.AddinId)}" version="${EscapeXml(options.Version)}" store="${EscapeXml(options.Store)}" storeType="${EscapeXml(options.StoreType)}"/>`,
        '<we:alternateReferences/>',
        '<we:properties><we:property name="Office.AutoShowTaskpaneWithDocument" value="true"/></we:properties>',
        '<we:bindings/>',
        '<we:snapshot xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>',
        '</we:webextension>',
    ].join('');
}

const TASKPANES_XML = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<wetp:taskpanes xmlns:wetp="http://schemas.microsoft.com/office/webextensions/taskpanes/2010/11">',
    '<wetp:taskpane dockstate="right" visibility="1" width="350" row="4">',
    '<wetp:webextensionref xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>',
    '</wetp:taskpane>',
    '</wetp:taskpanes>',
].join('');

const TASKPANES_RELS_XML = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    `<Relationship Id="rId1" Type="${WEB_EXTENSION_RELATIONSHIP_TYPE}" Target="webextension1.xml"/>`,
    '</Relationships>',
].join('');

/** Inserts `additions` before `closingTag` in a part exceljs wrote. Throws if the part is missing. */
async function updatePart(zip: JSZip, path: string, closingTag: string, additions: string[]): Promise<void> {
    const part = zip.file(path);
    if (!part) {
        throw new Error(`The workbook has no ${path} part.`);
    }
    const xml = await part.async('string');
    const at = xml.lastIndexOf(closingTag);
    if (at < 0) {
        throw new Error(`The workbook's ${path} part is malformed.`);
    }
    zip.file(path, xml.slice(0, at) + additions.join('') + xml.slice(at));
}
