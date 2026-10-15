/**
 * Verifies that MJTemplateContentEntityServer passes the save's EntitySaveOptions.SkipEntityAIActions to the
 * template extraction pipeline as skipAIEnrichment, as MJ: Queries does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntitySaveOptions } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';

const { mockRunTemplateExtractionPipeline } = vi.hoisted(() => ({
    mockRunTemplateExtractionPipeline: vi.fn().mockResolvedValue({ parameters: [], Warnings: [] }),
}));

vi.mock('../custom/template-extraction', () => ({
    RunTemplateExtractionPipeline: mockRunTemplateExtractionPipeline,
}));
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({ SQLServerDataProvider: class {} }));
vi.mock('@memberjunction/core-entities', () => {
    /** Transaction calls are no-ops; the base Save succeeds and the content is new. */
    class MJTemplateContentEntity {
        public ID = 'tc-1';
        public TemplateID = 't-1';
        public Template = 'Template';
        public TemplateText = 'Hello {{ name }}';
        public IsSaved = false;
        public ContextCurrentUser = { ID: 'u-1' };
        public ProviderToUse = {
            BeginTransaction: async (): Promise<void> => undefined,
            CommitTransaction: async (): Promise<void> => undefined,
            RollbackTransaction: async (): Promise<void> => undefined,
        };
        GetFieldByName(): { Dirty: boolean } {
            return { Dirty: true };
        }
        async Save(): Promise<boolean> {
            return true;
        }
    }
    return { MJTemplateContentEntity, MJTemplateParamEntity: class {}, MJTemplateEntity: class {} };
});

import { MJTemplateContentEntityServer } from '../custom/MJTemplateContentEntityServer.server';

/** The base class is mocked, so the EntityInfo the real constructor requires is never read. */
function newContent(): MJTemplateContentEntityServer {
    return new MJTemplateContentEntityServer({} as EntityInfo);
}

/** Save options with `SkipEntityAIActions` set as given. */
function saveOptions(skipEntityAIActions: boolean): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.SkipEntityAIActions = skipEntityAIActions;
    return options;
}

/** The skipAIEnrichment argument (4th) of the last RunTemplateExtractionPipeline call. */
function lastSkipArgument(): boolean {
    const calls = mockRunTemplateExtractionPipeline.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][3] as boolean;
}

describe('MJTemplateContentEntityServer SkipEntityAIActions', () => {
    beforeEach(() => {
        mockRunTemplateExtractionPipeline.mockClear();
    });

    it('runs the AI stage by default', async () => {
        expect(await newContent().Save()).toBe(true);
        expect(lastSkipArgument()).toBe(false);
    });

    it('skips the AI stage when the save sets SkipEntityAIActions', async () => {
        expect(await newContent().Save(saveOptions(true))).toBe(true);
        expect(lastSkipArgument()).toBe(true);
    });
});
