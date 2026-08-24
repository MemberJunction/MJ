/**
 * The BASE BulkCreate contract: a straight loop over Save() with identical semantics, stopping
 * at the first failure and reporting how far it got. This default is what makes the capability
 * universally safe — a provider with no set-based path still honours every caller.
 */
import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import type { BaseEntity } from '../generic/baseEntity';

function entity(saveResult: boolean, message = 'save refused') {
    return {
        Save: vi.fn().mockResolvedValue(saveResult),
        LatestResult: { CompleteMessage: message },
    } as unknown as BaseEntity;
}

const base = { BulkCreate: DatabaseProviderBase.prototype.BulkCreate };

describe('DatabaseProviderBase.BulkCreate (default)', () => {
    it('saves every entity in order and reports per-record mechanism', async () => {
        const entities = [entity(true), entity(true), entity(true)];
        const result = await base.BulkCreate.call({}, entities);
        expect(result).toEqual({ Success: true, RowsInserted: 3, Mechanism: 'per-record' });
        for (const e of entities) expect(e.Save).toHaveBeenCalledTimes(1);
    });

    it('stops at the first failure, reporting how many landed and why it stopped', async () => {
        const entities = [entity(true), entity(false, 'constraint violated'), entity(true)];
        const result = await base.BulkCreate.call({}, entities);
        expect(result.Success).toBe(false);
        expect(result.RowsInserted).toBe(1);
        expect(result.ErrorMessage).toBe('constraint violated');
        expect(entities[2].Save).not.toHaveBeenCalled();
    });

    it('an empty set succeeds with zero rows', async () => {
        const result = await base.BulkCreate.call({}, []);
        expect(result).toEqual({ Success: true, RowsInserted: 0, Mechanism: 'per-record' });
    });
});
