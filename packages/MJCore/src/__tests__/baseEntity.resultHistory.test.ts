/**
 * BaseEntity result-history cap tests (memory-leak fix C3).
 *
 * Verifies that `RegisterResultHistoryEntry` enforces the `MAX_RESULT_HISTORY` cap
 * (50) on `_resultHistory`, dropping oldest entries on overflow. Without the cap,
 * entity instances held in long-lived engine arrays leaked one BaseEntityResult
 * per Save/Delete attempt.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity, BaseEntityResult } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {}

let productEntityInfo: EntityInfo;

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

function makeResult(message: string): BaseEntityResult {
    const r = new BaseEntityResult();
    r.Success = false;
    r.Type = 'update';
    r.Message = message;
    r.StartedAt = new Date();
    r.EndedAt = new Date();
    return r;
}

describe('BaseEntity.RegisterResultHistoryEntry (cap at MAX_RESULT_HISTORY)', () => {
    it('exposes MAX_RESULT_HISTORY = 50', () => {
        expect(BaseEntity.MAX_RESULT_HISTORY).toBe(50);
    });

    it('appends results when under the cap', () => {
        const entity = new MJTestEntity(productEntityInfo);
        for (let i = 0; i < 10; i++) {
            entity.RegisterResultHistoryEntry(makeResult(`r${i}`));
        }
        expect(entity.ResultHistory).toHaveLength(10);
        expect(entity.ResultHistory[0].Message).toBe('r0');
        expect(entity.ResultHistory[9].Message).toBe('r9');
    });

    it('keeps the most recent 50 when pushing more than the cap', () => {
        const entity = new MJTestEntity(productEntityInfo);
        for (let i = 0; i < 200; i++) {
            entity.RegisterResultHistoryEntry(makeResult(`r${i}`));
        }
        expect(entity.ResultHistory).toHaveLength(BaseEntity.MAX_RESULT_HISTORY);
        // Oldest preserved entry is r150, newest is r199
        expect(entity.ResultHistory[0].Message).toBe('r150');
        expect(entity.ResultHistory[entity.ResultHistory.length - 1].Message).toBe('r199');
    });

    it('LatestResult always reflects the most recent push, even after overflow', () => {
        const entity = new MJTestEntity(productEntityInfo);
        for (let i = 0; i < 75; i++) {
            entity.RegisterResultHistoryEntry(makeResult(`r${i}`));
        }
        expect(entity.LatestResult.Message).toBe('r74');
    });

    it('exact-cap boundary: pushing exactly 50 keeps all 50', () => {
        const entity = new MJTestEntity(productEntityInfo);
        for (let i = 0; i < 50; i++) {
            entity.RegisterResultHistoryEntry(makeResult(`r${i}`));
        }
        expect(entity.ResultHistory).toHaveLength(50);
        expect(entity.ResultHistory[0].Message).toBe('r0');
    });

    it('one-over-cap boundary: pushing 51 drops the first entry', () => {
        const entity = new MJTestEntity(productEntityInfo);
        for (let i = 0; i < 51; i++) {
            entity.RegisterResultHistoryEntry(makeResult(`r${i}`));
        }
        expect(entity.ResultHistory).toHaveLength(50);
        expect(entity.ResultHistory[0].Message).toBe('r1');
        expect(entity.ResultHistory[49].Message).toBe('r50');
    });
});
