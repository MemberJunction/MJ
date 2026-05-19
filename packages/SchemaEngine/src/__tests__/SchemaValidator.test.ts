import { describe, it, expect } from 'vitest';
import { SchemaValidator } from '../SchemaValidator.js';
import type { TableDefinition } from '../interfaces.js';

const valid = (): TableDefinition => ({
    SchemaName: 'custom',
    TableName: 'TestTable',
    EntityName: 'Test Table',
    Columns: [
        { Name: 'ExternalId', Type: 'string', IsNullable: false },
        { Name: 'Name', Type: 'string', IsNullable: true },
    ],
});

describe('SchemaValidator', () => {
    it('passes a valid table definition', () => {
        const result = SchemaValidator.Validate(valid());
        expect(result.Valid).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('rejects empty SchemaName', () => {
        const result = SchemaValidator.Validate({ ...valid(), SchemaName: '' });
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.toLowerCase().includes('schema'))).toBe(true);
    });

    it('rejects the __mj schema', () => {
        const result = SchemaValidator.Validate({ ...valid(), SchemaName: '__mj' });
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('__mj'))).toBe(true);
    });

    it('rejects invalid SchemaName characters', () => {
        const result = SchemaValidator.Validate({ ...valid(), SchemaName: 'my schema' });
        expect(result.Valid).toBe(false);
    });

    it('rejects empty TableName', () => {
        const result = SchemaValidator.Validate({ ...valid(), TableName: '' });
        expect(result.Valid).toBe(false);
    });

    it('rejects empty Columns array', () => {
        const result = SchemaValidator.Validate({ ...valid(), Columns: [] });
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('column'))).toBe(true);
    });

    it('rejects invalid column names', () => {
        const result = SchemaValidator.Validate({
            ...valid(),
            Columns: [{ Name: 'bad name', Type: 'string', IsNullable: true }],
        });
        expect(result.Valid).toBe(false);
    });

    it('rejects SoftPrimaryKey that does not reference a column', () => {
        const result = SchemaValidator.Validate({ ...valid(), SoftPrimaryKeys: ['NonExistentColumn'] });
        expect(result.Valid).toBe(false);
        expect(result.Errors.some(e => e.includes('NonExistentColumn'))).toBe(true);
    });

    it('accepts SoftPrimaryKey that references a valid column', () => {
        const result = SchemaValidator.Validate({ ...valid(), SoftPrimaryKeys: ['ExternalId'] });
        expect(result.Valid).toBe(true);
    });

    it('accepts SoftPrimaryKey that references an AdditionalColumn', () => {
        const result = SchemaValidator.Validate({
            ...valid(),
            AdditionalColumns: [{ Name: 'SyncKey', Type: 'string', IsNullable: false }],
            SoftPrimaryKeys: ['SyncKey'],
        });
        expect(result.Valid).toBe(true);
    });

    it('validates AdditionalColumn names', () => {
        const result = SchemaValidator.Validate({
            ...valid(),
            AdditionalColumns: [{ Name: 'bad col', Type: 'string', IsNullable: false }],
        });
        expect(result.Valid).toBe(false);
    });
});
