import { describe, it, expect } from 'vitest';
import {
    DEFAULT_EXPORT_OPTIONS,
    CommonStyles,
    mergeCellStyles,
} from '../types';
import type {
    ExportFormat,
    ExportResult,
    ExportOptions,
    CSVOptions,
    JSONOptions,
    ExportColumn,
    ExportData,
    SamplingMode,
    CellStyle,
    SheetDefinition,
    WorkbookMetadata,
} from '../types';

describe('ExportFormat type', () => {
    it('should include excel format', () => {
        const format: ExportFormat = 'excel';
        expect(format).toBe('excel');
    });

    it('should include csv format', () => {
        const format: ExportFormat = 'csv';
        expect(format).toBe('csv');
    });

    it('should include json format', () => {
        const format: ExportFormat = 'json';
        expect(format).toBe('json');
    });
});

describe('SamplingMode type', () => {
    it('should support all mode', () => {
        const mode: SamplingMode = 'all';
        expect(mode).toBe('all');
    });

    it('should support top mode', () => {
        const mode: SamplingMode = 'top';
        expect(mode).toBe('top');
    });

    it('should support bottom mode', () => {
        const mode: SamplingMode = 'bottom';
        expect(mode).toBe('bottom');
    });

    it('should support every-nth mode', () => {
        const mode: SamplingMode = 'every-nth';
        expect(mode).toBe('every-nth');
    });

    it('should support random mode', () => {
        const mode: SamplingMode = 'random';
        expect(mode).toBe('random');
    });
});

describe('DEFAULT_EXPORT_OPTIONS', () => {
    it('should have excel as default format', () => {
        expect(DEFAULT_EXPORT_OPTIONS.format).toBe('excel');
    });

    it('should include headers by default', () => {
        expect(DEFAULT_EXPORT_OPTIONS.includeHeaders).toBe(true);
    });

    it('should have "all" sampling mode by default', () => {
        expect(DEFAULT_EXPORT_OPTIONS.sampling?.mode).toBe('all');
    });

    it('should have "export" as default file name', () => {
        expect(DEFAULT_EXPORT_OPTIONS.fileName).toBe('export');
    });

    it('should have "Sheet1" as default sheet name', () => {
        expect(DEFAULT_EXPORT_OPTIONS.sheetName).toBe('Sheet1');
    });

    it('should have bold headers in styling defaults', () => {
        expect(DEFAULT_EXPORT_OPTIONS.styling?.boldHeaders).toBe(true);
    });

    it('should have freeze header in styling defaults', () => {
        expect(DEFAULT_EXPORT_OPTIONS.styling?.freezeHeader).toBe(true);
    });

    it('should have auto filter in styling defaults', () => {
        expect(DEFAULT_EXPORT_OPTIONS.styling?.autoFilter).toBe(true);
    });
});

describe('CommonStyles', () => {
    it('should have a bold style', () => {
        expect(CommonStyles.bold.font?.bold).toBe(true);
    });

    it('should have an italic style', () => {
        expect(CommonStyles.italic.font?.italic).toBe(true);
    });

    it('should have a red text style', () => {
        expect(CommonStyles.redText.font?.color).toBe('FF0000');
    });

    it('should have a green text style', () => {
        expect(CommonStyles.greenText.font?.color).toBe('008000');
    });

    it('should have a blue text style', () => {
        expect(CommonStyles.blueText.font?.color).toBe('0000FF');
    });

    it('should have a yellow highlight style', () => {
        expect(CommonStyles.yellowHighlight.fill?.fgColor).toBe('FFFF00');
    });

    it('should have a centered style', () => {
        expect(CommonStyles.centered.alignment?.horizontal).toBe('center');
        expect(CommonStyles.centered.alignment?.vertical).toBe('middle');
    });

    it('should have a currency format style', () => {
        expect(CommonStyles.currency.numFmt).toBe('$#,##0.00');
    });

    it('should have a percentage format style', () => {
        expect(CommonStyles.percentage.numFmt).toBe('0.00%');
    });

    it('should have a date format style', () => {
        expect(CommonStyles.date.numFmt).toBe('yyyy-mm-dd');
    });

    it('should have a dateTime format style', () => {
        expect(CommonStyles.dateTime.numFmt).toBe('yyyy-mm-dd hh:mm:ss');
    });

    it('should have a thin border style', () => {
        expect(CommonStyles.thinBorder.border?.top?.style).toBe('thin');
        expect(CommonStyles.thinBorder.border?.bottom?.style).toBe('thin');
        expect(CommonStyles.thinBorder.border?.left?.style).toBe('thin');
        expect(CommonStyles.thinBorder.border?.right?.style).toBe('thin');
    });

    it('should have a header style with bold white text on blue background', () => {
        expect(CommonStyles.header.font?.bold).toBe(true);
        expect(CommonStyles.header.font?.color).toBe('FFFFFF');
        expect(CommonStyles.header.fill?.fgColor).toBe('4472C4');
    });
});

describe('mergeCellStyles', () => {
    it('should return empty object when no styles provided', () => {
        const result = mergeCellStyles();
        expect(result).toEqual({});
    });

    it('should skip undefined styles', () => {
        const result = mergeCellStyles(undefined, undefined);
        expect(result).toEqual({});
    });

    it('should merge font styles', () => {
        const style1: CellStyle = { font: { bold: true } };
        const style2: CellStyle = { font: { italic: true } };
        const result = mergeCellStyles(style1, style2);
        expect(result.font?.bold).toBe(true);
        expect(result.font?.italic).toBe(true);
    });

    it('should merge fill styles', () => {
        const style1: CellStyle = { fill: { pattern: 'solid' } };
        const style2: CellStyle = { fill: { fgColor: 'FF0000' } };
        const result = mergeCellStyles(style1, style2);
        expect(result.fill?.pattern).toBe('solid');
        expect(result.fill?.fgColor).toBe('FF0000');
    });

    it('should merge alignment styles', () => {
        const style1: CellStyle = { alignment: { horizontal: 'center' } };
        const style2: CellStyle = { alignment: { wrapText: true } };
        const result = mergeCellStyles(style1, style2);
        expect(result.alignment?.horizontal).toBe('center');
        expect(result.alignment?.wrapText).toBe(true);
    });

    it('should override numFmt with later value', () => {
        const style1: CellStyle = { numFmt: '#,##0' };
        const style2: CellStyle = { numFmt: '$#,##0.00' };
        const result = mergeCellStyles(style1, style2);
        expect(result.numFmt).toBe('$#,##0.00');
    });

    it('should override font properties with later values', () => {
        const style1: CellStyle = { font: { bold: true, color: 'FF0000' } };
        const style2: CellStyle = { font: { color: '0000FF' } };
        const result = mergeCellStyles(style1, style2);
        expect(result.font?.bold).toBe(true);
        expect(result.font?.color).toBe('0000FF');
    });

    it('should merge three or more styles', () => {
        const style1: CellStyle = { font: { bold: true } };
        const style2: CellStyle = { fill: { fgColor: 'FFFF00' } };
        const style3: CellStyle = { numFmt: '0.00%' };
        const result = mergeCellStyles(style1, style2, style3);
        expect(result.font?.bold).toBe(true);
        expect(result.fill?.fgColor).toBe('FFFF00');
        expect(result.numFmt).toBe('0.00%');
    });

    it('should merge border styles', () => {
        const style1: CellStyle = { border: { top: { style: 'thin', color: '000000' } } };
        const style2: CellStyle = { border: { bottom: { style: 'thick', color: 'FF0000' } } };
        const result = mergeCellStyles(style1, style2);
        expect(result.border?.top?.style).toBe('thin');
        expect(result.border?.bottom?.style).toBe('thick');
    });
});
