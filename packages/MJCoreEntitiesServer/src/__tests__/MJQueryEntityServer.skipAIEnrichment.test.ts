/**
 * Verifies that SkipAIEnrichment set on an MJQueryEntityServer instance reaches the extraction
 * pipeline context (so the AI enrichment prompt is never run), is sticky across saves, that an
 * explicit RerunExtraction override wins for that run only, that a save whose options carry
 * SkipEntityAIActions skips that save's enrichment (and an option of false never clears a sticky
 * instance flag), and that the host switch
 * (SaveTimeAISettings, QueryParameters) forces the skip for Save() and RerunExtraction alike.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuerySyncContext } from '../custom/query-extraction/types';
import { EntitySaveOptions } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';

const { mockRunExtractionPipeline } = vi.hoisted(() => ({
    mockRunExtractionPipeline: vi.fn().mockResolvedValue({ UsesTemplate: false }),
}));

vi.mock('../custom/query-extraction', () => ({
    RunExtractionPipeline: mockRunExtractionPipeline,
    CleanupQueryData: vi.fn(),
    ConvertTSQLToPostgreSQL: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => {
    class MJQueryEntityExtended {
        public ID = 'q-1';
        public Name = 'Q';
        public SQL = 'SELECT 1';
        public IsSaved = true;
        public UsesTemplate = false;
        public ContextCurrentUser = { ID: 'u-1' };
        public ProviderToUse = {};
        public RunViewProviderToUse = {};
        /** Field dirtiness for Save(): SQL dirty (re-extract), nothing else (no embedding). */
        GetFieldByName(name: string): { Dirty: boolean } {
            return { Dirty: name === 'SQL' };
        }
        GetPlatformSQL(): string | null {
            return null;
        }
        async Save(): Promise<boolean> {
            return true;
        }
    }
    return { MJQueryEntityExtended, MJQuerySQLEntity: class {}, MJSQLDialectEntity: class {}, QueryEngine: { Instance: {} } };
});
vi.mock('@memberjunction/generic-database-provider', () => ({ resolveDbPlatformFromEnv: () => 'sqlserver' }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { EmbedTextLocalForEntity: vi.fn() } }));

import { MJQueryEntityServer } from '../custom/MJQueryEntityServer.server';
import { SaveTimeAISettings } from '@memberjunction/ai';

/** Save options with `SkipEntityAIActions` set as given. */
function saveOptions(skipEntityAIActions: boolean): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.SkipEntityAIActions = skipEntityAIActions;
    return options;
}

/** The base class is mocked, so the EntityInfo the real constructor requires is never read. */
function newQuery(): MJQueryEntityServer {
    return new MJQueryEntityServer({} as EntityInfo);
}

function lastContext(): QuerySyncContext {
    const calls = mockRunExtractionPipeline.mock.calls;
    return calls[calls.length - 1][0] as QuerySyncContext;
}

describe('MJQueryEntityServer SkipAIEnrichment', () => {
    beforeEach(() => {
        mockRunExtractionPipeline.mockClear();
        SaveTimeAISettings.Instance.Config = {};
    });

    it('passes SkipAIEnrichment=true to RunExtractionPipeline, on every re-run (sticky)', async () => {
        const query = newQuery();
        query.SkipAIEnrichment = true;
        await query.RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(true);
        await query.RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(true);
    });

    it('does not skip by default', async () => {
        await newQuery().RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(false);
    });

    it('an explicit RerunExtraction argument overrides the instance flag for that run only', async () => {
        const query = newQuery();
        await query.RerunExtraction(true);
        expect(lastContext().SkipAIEnrichment).toBe(true);
        await query.RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(false);
    });

    it('an explicit false override enriches that run even when the instance flag is set', async () => {
        const query = newQuery();
        query.SkipAIEnrichment = true;
        await query.RerunExtraction(false);
        expect(lastContext().SkipAIEnrichment).toBe(false);
    });

    it('Save() passes the instance flag to the extraction it runs', async () => {
        const query = newQuery();
        query.SkipAIEnrichment = true;
        expect(await query.Save()).toBe(true);
        expect(mockRunExtractionPipeline).toHaveBeenCalledTimes(1);
        expect(lastContext().SkipAIEnrichment).toBe(true);
    });

    it('skips when the host has disabled query enrichment, without any instance flag (Save and RerunExtraction)', async () => {
        SaveTimeAISettings.Instance.Config = { QueryParameters: false };
        await newQuery().RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(true);
        expect(await newQuery().Save()).toBe(true);
        expect(lastContext().SkipAIEnrichment).toBe(true);
        // the host switch wins over an explicit "enrich this run"
        await newQuery().RerunExtraction(false);
        expect(lastContext().SkipAIEnrichment).toBe(true);
    });

    describe('the save option (EntitySaveOptions.SkipEntityAIActions)', () => {
        it('skips enrichment on its own, with no instance flag', async () => {
            expect(await newQuery().Save(saveOptions(true))).toBe(true);
            expect(lastContext().SkipAIEnrichment).toBe(true);
        });

        it('skips enrichment even when the instance flag is explicitly false', async () => {
            const query = newQuery();
            query.SkipAIEnrichment = false;
            await query.Save(saveOptions(true));
            expect(lastContext().SkipAIEnrichment).toBe(true);
        });

        it('applies to that save only: the next default save enriches again', async () => {
            const query = newQuery();
            await query.Save(saveOptions(true));
            await query.Save();
            expect(lastContext().SkipAIEnrichment).toBe(false);
        });

        it('an option of false (the default) keeps a sticky instance flag of true', async () => {
            const query = newQuery();
            query.SkipAIEnrichment = true;
            await query.Save(saveOptions(false));
            expect(lastContext().SkipAIEnrichment).toBe(true);
        });

        it('an option of false with no instance flag enriches', async () => {
            await newQuery().Save(saveOptions(false));
            expect(lastContext().SkipAIEnrichment).toBe(false);
        });
    });

    it('another kind switched off does not skip query enrichment', async () => {
        SaveTimeAISettings.Instance.Config = { TemplateParameters: false, Embeddings: false };
        await newQuery().RerunExtraction();
        expect(lastContext().SkipAIEnrichment).toBe(false);
    });
});
