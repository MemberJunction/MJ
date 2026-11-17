import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

type SetValueGenerator = { generateSetStatementValue(f: EntityFieldInfo, value: unknown): string };

/** Calls the private SET-statement renderer; it reads only its arguments. */
function render(value: unknown): string {
    const field = { Name: 'Priority', TSType: EntityFieldTSType.Number } as EntityFieldInfo;
    const generator = SQLServerDataProvider.prototype as unknown as SetValueGenerator;
    return generator.generateSetStatementValue(field, value);
}

describe('SQLServerDataProvider numeric SET values', () => {
    it.each([
        [5, '5'],
        [0, '0'],
        [-3, '-3'],
        [1.5, '1.5'],
        ['42', '42'],
        ['-7.25', '-7.25'],
        [' 5 ', '5'],
        ['.5', '.5'],
        ['+5', '+5'],
        [1e21, '1e+21'],
        [1e-7, '1e-7'],
        [BigInt('9007199254740993'), '9007199254740993'],
    ])('renders %s as a number literal', (value, expected) => {
        expect(render(value)).toBe(expected);
    });

    it('keeps the digits of a high-precision decimal', () => {
        expect(render('12345678901234567890.123456789')).toBe('12345678901234567890.123456789');
    });

    it.each([
        ['abc'],
        ['12abc'],
        ['1 2'],
        ['1;2'],
        ['1--'],
        [''],
        ['   '],
        ['NaN'],
        ['Infinity'],
        ['0x10'],
        [NaN],
        [Infinity],
        [true],
        [{ a: 1 }],
    ])('refuses %s', (value) => {
        expect(() => render(value)).toThrow('Invalid non-numeric value provided for numeric field Priority');
    });
});
