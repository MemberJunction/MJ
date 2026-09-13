/**
 * @fileoverview A grid row's id must identify that row, or ag-Grid merges rows away.
 *
 * ag-Grid treats `getRowId` as authoritative and SILENTLY collapses rows that return the same
 * id, raising error #2 — *"Duplicate node id … from getRowId"*. Both of `getRowKey`'s branches
 * could return one constant for every row in the grid:
 *
 *  - `buildPkString` FORMATS without validating, so a row whose primary-key column was not in
 *    the SELECT produced the literal `"ID|undefined"` — the same string for all N rows;
 *  - the configured-key-field branch returned `''` whenever that field was absent or null.
 *
 * The visible symptom is a grid showing one row where the data had hundreds, which reads as a
 * data-loading bug rather than an identity bug.
 *
 * **The reported trigger for this defect is NOT reproduced here.** The register named a
 * different package and a different ag-Grid error, and which of the two paths fires depends on
 * runtime data and on whether the client or infinite grid instance is live. These tests pin the
 * defensive property — no two rows ever share an id — which holds regardless of which path
 * was the real one.
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { buildPkString, buildUsablePkString } from '../lib/utils/record.util';
import { EntityDataGridComponent } from '../lib/entity-data-grid/entity-data-grid.component';

function field(name: string, isPrimaryKey: boolean): EntityFieldInfo {
    return {
        Name: name,
        IsPrimaryKey: isPrimaryKey,
        TSType: 'string',
        Type: isPrimaryKey ? 'uniqueidentifier' : 'nvarchar',
        DisplayNameOrName: name,
    } as unknown as EntityFieldInfo;
}

/** Single-column `ID` key, the common case. */
function singleKeyEntity(): EntityInfo {
    const id = field('ID', true);
    const name = field('Name', false);
    return {
        Name: 'Contacts',
        Fields: [id, name],
        PrimaryKeys: [id],
    } as unknown as EntityInfo;
}

/** Two-column key, to prove the guard is per-component and not "check ID". */
function compositeKeyEntity(): EntityInfo {
    const orderId = field('OrderID', true);
    const lineNo = field('LineNo', true);
    return {
        Name: 'Order Lines',
        Fields: [orderId, lineNo],
        PrimaryKeys: [orderId, lineNo],
    } as unknown as EntityInfo;
}

describe('buildUsablePkString — a formatter is not a validator', () => {
    it('returns the key for a row that carries it', () => {
        expect(buildUsablePkString({ ID: 'abc', Name: 'Ada' }, singleKeyEntity())).toBe('ID|abc');
    });

    it('returns null — not "ID|undefined" — when the PK column was not selected', () => {
        // This is the exact string buildPkString produces, and it is identical for every row.
        expect(buildPkString({ Name: 'Ada' }, singleKeyEntity())).toBe('ID|undefined');
        expect(buildUsablePkString({ Name: 'Ada' }, singleKeyEntity())).toBeNull();
    });

    it('returns null when the PK value is present but null or empty', () => {
        expect(buildUsablePkString({ ID: null }, singleKeyEntity())).toBeNull();
        expect(buildUsablePkString({ ID: '' }, singleKeyEntity())).toBeNull();
    });

    it('accepts falsy-but-real key values — 0 and false are usable keys', () => {
        expect(buildUsablePkString({ ID: 0 }, singleKeyEntity())).toBe('ID|0');
        expect(buildUsablePkString({ ID: false }, singleKeyEntity())).toBe('ID|false');
    });

    it('accepts the literal string "undefined" as a value, because it IS one', () => {
        // Sniffing the formatted string for the text "undefined" would reject this row; the
        // check is on the VALUES, so it does not.
        expect(buildUsablePkString({ ID: 'undefined' }, singleKeyEntity())).toBe('ID|undefined');
    });

    it('rejects a composite key with only one half present', () => {
        const entity = compositeKeyEntity();
        expect(buildUsablePkString({ OrderID: '11055', LineNo: 3 }, entity)).toBe('OrderID|11055||LineNo|3');
        expect(buildUsablePkString({ OrderID: '11055' }, entity)).toBeNull();
    });
});

interface GridHarness {
    getRowKey(row: Record<string, unknown>): string;
    /** {@link EntityDataGridComponent.getRowId}'s body, which lives on the prototype. */
    resolveRowId(params: { data?: Record<string, unknown> }): string;
}

function buildGrid(entityInfo: EntityInfo | null, keyField = 'ID'): GridHarness {
    const component = Object.create(EntityDataGridComponent.prototype) as EntityDataGridComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        _entityInfo: entityInfo,
        _keyField: keyField,
        _syntheticRowKeys: new WeakMap<object, string>(),
        _syntheticRowKeySeq: 0,
    });
    const priv = component as unknown as {
        getRowKey(row: Record<string, unknown>): string;
        resolveRowId(params: { data?: Record<string, unknown> }): string;
    };
    return {
        getRowKey: priv.getRowKey.bind(component),
        resolveRowId: priv.resolveRowId.bind(component),
    };
}

describe('EntityDataGridComponent.getRowKey — no two rows share an id', () => {
    it('uses the real key when the row carries one', () => {
        const grid = buildGrid(singleKeyEntity());
        expect(grid.getRowKey({ ID: 'c-1', Name: 'Ada' })).toBe('ID|c-1');
    });

    it('gives 200 keyless rows 200 DISTINCT ids', () => {
        const grid = buildGrid(singleKeyEntity());
        const rows = Array.from({ length: 200 }, (_, i) => ({ Name: `row ${i}` }));

        const ids = rows.map(r => grid.getRowKey(r));

        expect(new Set(ids).size).toBe(200);
        expect(ids).not.toContain('ID|undefined');
        expect(ids).not.toContain('');
    });

    it('gives the SAME row object the same id on every call — a sort must not renumber rows', () => {
        const grid = buildGrid(singleKeyEntity());
        const row = { Name: 'Ada' };

        expect(grid.getRowKey(row)).toBe(grid.getRowKey(row));
    });

    it('gives two rows with IDENTICAL column values distinct ids', () => {
        // A value-derived fallback (hashing the columns) collapses these two; the previous
        // behaviour collapsed every row regardless.
        const grid = buildGrid(singleKeyEntity());
        const a = { Name: 'Ada' };
        const b = { Name: 'Ada' };

        expect(grid.getRowKey(a)).not.toBe(grid.getRowKey(b));
    });

    it('falls back to a synthetic id when the configured key field is missing (no EntityInfo)', () => {
        const grid = buildGrid(null, 'RowKey');
        const rows = [{ Other: 1 }, { Other: 2 }, { RowKey: null }, { RowKey: '' }];

        const ids = rows.map(r => grid.getRowKey(r as Record<string, unknown>));

        expect(new Set(ids).size).toBe(4);
        expect(ids).not.toContain('');
    });

    it('still honours the configured key field when it IS present', () => {
        const grid = buildGrid(null, 'RowKey');
        expect(grid.getRowKey({ RowKey: 'k-7' })).toBe('k-7');
    });

    it('mixes real and synthetic ids in one grid without collision', () => {
        const grid = buildGrid(singleKeyEntity());
        const ids = [
            grid.getRowKey({ ID: 'c-1' }),
            grid.getRowKey({ Name: 'no key 1' }),
            grid.getRowKey({ ID: 'c-2' }),
            grid.getRowKey({ Name: 'no key 2' }),
        ];
        expect(new Set(ids).size).toBe(4);
    });
});

describe('EntityDataGridComponent.getRowId — survives an unloaded infinite-model node', () => {
    it('passes through the minted __pk', () => {
        const grid = buildGrid(singleKeyEntity());
        expect(grid.resolveRowId({ data: { __pk: 'ID|c-1' } })).toBe('ID|c-1');
    });

    it('returns a distinct non-empty id when ag-Grid passes a node whose data has not loaded', () => {
        // The infinite row model calls getRowId for rows it has not fetched yet. Reading
        // `params.data['__pk']` off that threw inside ag-Grid's own call stack.
        const grid = buildGrid(singleKeyEntity());

        const a = grid.resolveRowId({});
        const b = grid.resolveRowId({ data: {} });
        const c = grid.resolveRowId({ data: { __pk: '' } });

        expect([a, b, c].every(id => id.length > 0)).toBe(true);
        expect(new Set([a, b, c]).size).toBe(3);
    });
});
