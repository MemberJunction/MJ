import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('exceljs', () => ({ default: {} }));
vi.mock('../custom/utilities/base-file-handler', () => ({ BaseFileHandlerAction: class BaseFileHandlerAction {} }));

import { ParseCellRange } from '../custom/files/excel-reader.action';

describe('ParseCellRange', () => {
    it.each([
        ['A1:D10', { StartColumn: 'A', StartRow: '1', EndColumn: 'D', EndRow: '10' }],
        ['AB12:XFD1048576', { StartColumn: 'AB', StartRow: '12', EndColumn: 'XFD', EndRow: '1048576' }],
        ['Sheet!B2:C3', { StartColumn: 'B', StartRow: '2', EndColumn: 'C', EndRow: '3' }],
        ['$A$1:$B$2', null],
        ['A1:B', null],
        ['A:B2', null],
        ['a1:b2', null],
        ['A1:2 then C3:D4', { StartColumn: 'C', StartRow: '3', EndColumn: 'D', EndRow: '4' }],
        ['', null],
    ])('parses %j', (text, expected) => {
        expect(ParseCellRange(text)).toEqual(expected);
    });

    it('reads 100k capitals with no row number in linear time', () => {
        const started = Date.now();
        expect(ParseCellRange('A'.repeat(100_000))).toBeNull();
        expect(ParseCellRange('AB1 '.repeat(25_000))).toBeNull();
        expect(Date.now() - started).toBeLessThan(2500);
    });
});
