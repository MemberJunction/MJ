/**
 * Verifies that MJQuerySQLEntityServer forwards its SkipAIEnrichment flag to the parent
 * query's re-extraction, and that a save whose options carry SkipEntityAIActions forwards true
 * regardless of the flag, so a dialect-variant save cannot trigger a model call when the caller
 * opted out either way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRerunExtraction, parentQuery, dialect } = vi.hoisted(() => {
    const rerun = vi.fn().mockResolvedValue(undefined);
    return {
        mockRerunExtraction: rerun,
        parentQuery: { ID: 'q-1', Name: 'Parent', SQL: 'SELECT 1', RerunExtraction: rerun },
        dialect: { ID: 'd-1', PlatformKey: 'sqlserver' },
    };
});

vi.mock('@memberjunction/core-entities', () => {
    class MJQuerySQLEntity {
        public QueryID = 'q-1';
        public SQLDialectID = 'd-1';
        public ContextCurrentUser = { ID: 'u-1' };
        async Save(): Promise<boolean> {
            return true;
        }
    }
    return {
        MJQuerySQLEntity,
        QueryEngine: { Instance: { Queries: [parentQuery], SQLDialects: [dialect], Config: vi.fn() } },
    };
});
vi.mock('@memberjunction/generic-database-provider', () => ({ resolveDbPlatformFromEnv: () => 'sqlserver' }));
vi.mock('../custom/MJQueryEntityServer.server', () => ({ MJQueryEntityServer: class {} }));

import { EntitySaveOptions } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import { MJQuerySQLEntityServer } from '../custom/MJQuerySQLEntityServer.server';

/** The mocked base class ignores its entity metadata; the real constructor requires one. */
const UNUSED_ENTITY_INFO = {} as EntityInfo;

/** Save options with `SkipEntityAIActions` set as given. */
function saveOptions(skipEntityAIActions: boolean): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.SkipEntityAIActions = skipEntityAIActions;
    return options;
}

describe('MJQuerySQLEntityServer SkipAIEnrichment forwarding', () => {
    beforeEach(() => {
        mockRerunExtraction.mockClear();
    });

    it('passes true to the parent re-extraction when the flag is set', async () => {
        const variant = new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO);
        variant.SkipAIEnrichment = true;
        await variant.Save();
        expect(mockRerunExtraction).toHaveBeenCalledWith(true);
    });

    it('passes undefined (parent default) when the flag is not set', async () => {
        await new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO).Save();
        expect(mockRerunExtraction).toHaveBeenCalledWith(undefined);
    });

    it('forwards true when the save carries SkipEntityAIActions and no flag is set', async () => {
        await new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO).Save(saveOptions(true));
        expect(mockRerunExtraction).toHaveBeenCalledWith(true);
    });

    it('forwards true when the save carries SkipEntityAIActions even though the flag is false', async () => {
        const variant = new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO);
        variant.SkipAIEnrichment = false;
        await variant.Save(saveOptions(true));
        expect(mockRerunExtraction).toHaveBeenCalledWith(true);
    });

    it('an option of false (the default) forwards the variant flag unchanged', async () => {
        const variant = new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO);
        variant.SkipAIEnrichment = true;
        await variant.Save(saveOptions(false));
        expect(mockRerunExtraction).toHaveBeenLastCalledWith(true);
        variant.SkipAIEnrichment = false;
        await variant.Save(saveOptions(false));
        expect(mockRerunExtraction).toHaveBeenLastCalledWith(false);
        await new MJQuerySQLEntityServer(UNUSED_ENTITY_INFO).Save(saveOptions(false));
        expect(mockRerunExtraction).toHaveBeenLastCalledWith(undefined);
    });
});
