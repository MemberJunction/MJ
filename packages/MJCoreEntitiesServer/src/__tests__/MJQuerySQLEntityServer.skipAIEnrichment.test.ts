/**
 * Verifies that MJQuerySQLEntityServer forwards its SkipAIEnrichment flag to the parent
 * query's re-extraction, so a dialect-variant save cannot trigger a model call when the
 * caller opted out.
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

import type { EntityInfo } from '@memberjunction/core';
import { MJQuerySQLEntityServer } from '../custom/MJQuerySQLEntityServer.server';

/** The mocked base class ignores its entity metadata; the real constructor requires one. */
const UNUSED_ENTITY_INFO = {} as EntityInfo;

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
});
