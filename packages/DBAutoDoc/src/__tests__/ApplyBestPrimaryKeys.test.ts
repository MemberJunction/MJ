/**
 * #6004: discovery flagged the columns of EVERY primary-key candidate at or above the minimum
 * confidence, ignoring status, so a table could end up keyed on the union of two candidates and a
 * pruned candidate's columns stayed flagged. Only the best surviving candidate is applied now.
 */
import { describe, it, expect } from 'vitest';
import { ApplyBestPrimaryKeysToState } from '../discovery/ApplyPrimaryKeys.js';
import type { ColumnDefinition, DatabaseDocumentation, TableDefinition } from '../types/state.js';
import type { PKCandidate } from '../types/discovery.js';

function column(name: string, isPrimaryKey = false): ColumnDefinition {
    return { name, dataType: 'int', isNullable: false, isPrimaryKey, isForeignKey: false, descriptionIterations: [] };
}

function table(name: string, columns: ColumnDefinition[]): TableDefinition {
    return { name, rowCount: 10, dependsOn: [], dependents: [], columns, descriptionIterations: [] } as TableDefinition;
}

function state(tables: TableDefinition[]): DatabaseDocumentation {
    return { schemas: [{ name: 'dbo', tables, descriptionIterations: [] }] } as unknown as DatabaseDocumentation;
}

function candidate(tableName: string, columnNames: string[], confidence: number, status: PKCandidate['status'] = 'candidate'): PKCandidate {
    return {
        schemaName: 'dbo', tableName, columnNames, confidence, status,
        discoveredInIteration: 1, validatedByLLM: false,
        evidence: { uniqueness: 1, nullCount: 0, totalRows: 10, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
    };
}

function flagged(t: TableDefinition): string[] {
    return t.columns.filter(c => c.isPrimaryKey).map(c => c.name);
}

describe('ApplyBestPrimaryKeysToState (#6004)', () => {
    it('flags only the best candidate when two have different column sets', () => {
        const orders = table('Orders', [column('OrderID'), column('OrderNo'), column('LineNo')]);
        const s = state([orders]);

        ApplyBestPrimaryKeysToState(s, [
            candidate('Orders', ['OrderNo', 'LineNo'], 80),
            candidate('Orders', ['OrderID'], 95),
        ], 70);

        expect(flagged(orders)).toEqual(['OrderID']);
        expect(orders.columns.find(c => c.name === 'OrderID')?.primaryKeySource).toBe('discovery');
    });

    it('a rejected best candidate gives way to the next one', () => {
        const orders = table('Orders', [column('OrderID'), column('OrderNo')]);
        const s = state([orders]);

        ApplyBestPrimaryKeysToState(s, [
            candidate('Orders', ['OrderID'], 95, 'rejected'),
            candidate('Orders', ['OrderNo'], 85),
        ], 70);

        expect(flagged(orders)).toEqual(['OrderNo']);
    });

    it('after pruning, re-applying unflags the rejected candidate and flags the next best', () => {
        const orders = table('Orders', [column('OrderID'), column('OrderNo')]);
        const s = state([orders]);
        const best = candidate('Orders', ['OrderID'], 95);
        const next = candidate('Orders', ['OrderNo'], 85);
        ApplyBestPrimaryKeysToState(s, [best, next], 70);
        expect(flagged(orders)).toEqual(['OrderID']);

        best.status = 'rejected';
        ApplyBestPrimaryKeysToState(s, [best, next], 70);

        expect(flagged(orders)).toEqual(['OrderNo']);
        expect(orders.columns.find(c => c.name === 'OrderID')?.primaryKeySource).toBeUndefined();
    });

    it('leaves a table unkeyed when every candidate is below the minimum or rejected', () => {
        const orders = table('Orders', [column('OrderID'), column('OrderNo')]);
        const s = state([orders]);

        ApplyBestPrimaryKeysToState(s, [candidate('Orders', ['OrderID'], 60), candidate('Orders', ['OrderNo'], 90, 'rejected')], 70);

        expect(flagged(orders)).toEqual([]);
    });

    it('never clears or adds to a schema-declared key', () => {
        const orders = table('Orders', [column('OrderID', true), column('OrderNo')]);
        const s = state([orders]);

        ApplyBestPrimaryKeysToState(s, [candidate('Orders', ['OrderNo'], 99)], 70);

        expect(flagged(orders)).toEqual(['OrderID']);
        expect(orders.columns.find(c => c.name === 'OrderID')?.primaryKeySource).toBeUndefined();
    });

    it('breaks a confidence tie in favour of the candidate ranked first', () => {
        const orders = table('Orders', [column('OrderID'), column('OrderNo')]);
        const s = state([orders]);

        ApplyBestPrimaryKeysToState(s, [candidate('Orders', ['OrderNo'], 90), candidate('Orders', ['OrderID'], 90)], 70);

        expect(flagged(orders)).toEqual(['OrderNo']);
    });
});
