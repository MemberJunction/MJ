import { describe, it, expect } from 'vitest';
import { CompositeKey } from '../generic/compositeKey';
import {
    AfterKeyNotSupportedError,
    IsKeysetPaginationOrderableType,
    KEYSET_PAGINATION_ORDERABLE_PK_TYPES,
    RunViewParams,
} from '../views/runView';

describe('RunViewParams.AfterKey support', () => {
    describe('AfterKeyNotSupportedError', () => {
        it('exposes EntityName, Reason, and a sensible message', () => {
            const err = new AfterKeyNotSupportedError('My Entity', 'CompositePK', 'because');
            expect(err).toBeInstanceOf(Error);
            expect(err.EntityName).toBe('My Entity');
            expect(err.Reason).toBe('CompositePK');
            expect(err.message).toBe('because');
            expect(err.name).toBe('AfterKeyNotSupportedError');
        });

        it('supports all defined reason codes', () => {
            const reasons = ['CompositePK', 'UnsupportedPKType', 'IncompatibleOrderBy', 'StartRowConflict', 'AfterKeyShape'] as const;
            for (const r of reasons) {
                const err = new AfterKeyNotSupportedError('E', r, 'msg');
                expect(err.Reason).toBe(r);
            }
        });
    });

    describe('IsKeysetPaginationOrderableType', () => {
        it('accepts standard PK types', () => {
            for (const t of ['uniqueidentifier', 'uuid', 'int', 'bigint', 'nvarchar', 'datetime', 'date', 'bit']) {
                expect(IsKeysetPaginationOrderableType(t)).toBe(true);
            }
        });

        it('strips parameter-style suffixes', () => {
            expect(IsKeysetPaginationOrderableType('nvarchar(255)')).toBe(true);
            expect(IsKeysetPaginationOrderableType('decimal(18, 2)')).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(IsKeysetPaginationOrderableType('UNIQUEIDENTIFIER')).toBe(true);
            expect(IsKeysetPaginationOrderableType('INT')).toBe(true);
        });

        it('rejects unsupported types', () => {
            for (const t of ['xml', 'sql_variant', 'varbinary', '', null, undefined as unknown as string]) {
                expect(IsKeysetPaginationOrderableType(t)).toBe(false);
            }
        });

        it('exports the readonly allowlist', () => {
            expect(Array.isArray(KEYSET_PAGINATION_ORDERABLE_PK_TYPES)).toBe(true);
            expect(KEYSET_PAGINATION_ORDERABLE_PK_TYPES).toContain('uniqueidentifier');
        });
    });

    describe('RunViewParams.Equals — AfterKey awareness', () => {
        it('returns true when both params omit AfterKey', () => {
            const a: RunViewParams = { EntityName: 'X', MaxRows: 100 };
            const b: RunViewParams = { EntityName: 'X', MaxRows: 100 };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('returns true when both params have identical AfterKey', () => {
            const a: RunViewParams = {
                EntityName: 'X', MaxRows: 100,
                AfterKey: CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678'),
            };
            const b: RunViewParams = {
                EntityName: 'X', MaxRows: 100,
                AfterKey: CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678'),
            };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('returns false when AfterKey differs', () => {
            const a: RunViewParams = {
                EntityName: 'X', MaxRows: 100,
                AfterKey: CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678'),
            };
            const b: RunViewParams = {
                EntityName: 'X', MaxRows: 100,
                AfterKey: CompositeKey.FromID('b1b2c3d4-1234-5678-9abc-def012345678'),
            };
            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('returns false when only one side has AfterKey', () => {
            const a: RunViewParams = {
                EntityName: 'X', MaxRows: 100,
                AfterKey: CompositeKey.FromID('a1b2c3d4-1234-5678-9abc-def012345678'),
            };
            const b: RunViewParams = { EntityName: 'X', MaxRows: 100 };
            expect(RunViewParams.Equals(a, b)).toBe(false);
        });
    });
});
