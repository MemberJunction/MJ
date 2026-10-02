/**
 * A SQL `date` column (a calendar day) exported as the day it stores.
 *
 * The driver delivers a calendar day as a Date at UTC midnight, or as its ISO string. Every test pins
 * TZ west of Greenwich: at UTC the local and UTC days agree and none of these could fail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { CSVExporter } from '../csv-exporter';
import { JSONExporter } from '../json-exporter';
import { ExcelExporter } from '../excel-exporter';
import type { ExportColumn } from '../types';

const columns: ExportColumn[] = [
    { name: 'Name' },
    { name: 'PaymentDate', dataType: 'dateonly' },
];

/** A calendar day as the driver materialises it, and as it arrives over the wire. */
const rows = [
    { Name: 'from a Date', PaymentDate: new Date('2026-10-01T00:00:00.000Z') },
    { Name: 'from the wire', PaymentDate: '2026-01-01T00:00:00.000Z' },
    { Name: 'from a bare day', PaymentDate: '2026-03-08' },
    { Name: 'absent', PaymentDate: null },
];

describe('date-only columns in exports', () => {
    const originalTZ = process.env.TZ;
    beforeEach(() => {
        process.env.TZ = 'America/Chicago';
    });
    afterEach(() => {
        process.env.TZ = originalTZ;
    });

    it('CSV writes ISO 8601 YYYY-MM-DD, with no time and no shift', async () => {
        const result = await new CSVExporter({ columns }).export(rows);
        const lines = new TextDecoder().decode(result.data).replace(/^﻿/, '').split('\r\n');
        expect(lines.slice(1)).toEqual([
            'from a Date,2026-10-01',
            'from the wire,2026-01-01',
            'from a bare day,2026-03-08',
            'absent,',
        ]);
    });

    it('CSV still writes an instant column (`date`) as a full ISO timestamp', async () => {
        const result = await new CSVExporter({ columns: [{ name: 'At', dataType: 'date' }] }).export([
            { At: new Date('2026-10-01T02:30:00.000Z') },
        ]);
        expect(new TextDecoder().decode(result.data)).toContain('2026-10-01T02:30:00.000Z');
    });

    it('JSON writes YYYY-MM-DD for a date-only column', async () => {
        const result = await new JSONExporter({ columns, prettyPrint: false }).export(rows);
        const parsed = JSON.parse(new TextDecoder().decode(result.data)) as Array<Record<string, unknown>>;
        expect(parsed.map((r) => r['PaymentDate'])).toEqual(['2026-10-01', '2026-01-01', '2026-03-08', null]);
    });

    it('Excel writes a real date cell on the stored day', async () => {
        const result = await new ExcelExporter({ columns }).export(rows);
        expect(result.success).toBe(true);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(result.data as unknown as ArrayBuffer);
        const sheet = workbook.worksheets[0];
        const cell = (row: number) => sheet.getRow(row).getCell(2);
        // ExcelJS reads a date cell back as UTC midnight of its serial day.
        expect((cell(2).value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect((cell(3).value as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect((cell(4).value as Date).toISOString()).toBe('2026-03-08T00:00:00.000Z');
        expect(cell(2).numFmt).toBe('yyyy-mm-dd');
    });
});
