import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import { FitToField } from '../generic/FitToField';

function record(fields: { Name: string; MaxLength: number }[]): BaseEntity {
    return { EntityInfo: { Fields: fields } } as unknown as BaseEntity;
}

const QUEUE = record([
    { Name: 'ProcessOSVersion', MaxLength: 10 },
    { Name: 'ProcessCwd', MaxLength: 100 },
    { Name: 'Notes', MaxLength: -1 },
]);

describe('FitToField', () => {
    it('truncates a Linux kernel release to the ProcessOSVersion column length', () => {
        expect('6.8.0-1017-azure').toHaveLength(16);
        expect(FitToField(QUEUE, 'ProcessOSVersion', '6.8.0-1017-azure')).toBe('6.8.0-1017');
    });

    it('returns a value that already fits unchanged', () => {
        expect(FitToField(QUEUE, 'ProcessOSVersion', '25.6.0')).toBe('25.6.0');
        expect(FitToField(QUEUE, 'processosversion', '25.6.0')).toBe('25.6.0');
    });

    it('does not truncate an unlimited or unknown field', () => {
        const long = 'x'.repeat(500);
        expect(FitToField(QUEUE, 'Notes', long)).toBe(long);
        expect(FitToField(QUEUE, 'NoSuchField', long)).toBe(long);
    });

    it('maps null and undefined to null', () => {
        expect(FitToField(QUEUE, 'ProcessCwd', null)).toBeNull();
        expect(FitToField(QUEUE, 'ProcessCwd', undefined)).toBeNull();
    });
});
