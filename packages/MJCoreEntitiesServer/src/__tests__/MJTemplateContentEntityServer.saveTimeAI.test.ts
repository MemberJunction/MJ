/**
 * Verifies that MJTemplateContentEntityServer honours both AI opt-outs on save: the host-level
 * `saveTimeAI.TemplateParameters` switch (SaveTimeAISettings) and the per-instance
 * SkipAIEnrichment flag. Either one makes the save pass skipAIEnrichment=true to the template
 * extraction pipeline; with neither, the pipeline runs its AI stage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { SaveTimeAISettings } from '@memberjunction/ai';

/** The base class is mocked, so the EntityInfo the real constructor requires is never read. */
function newContent(): MJTemplateContentEntityServer {
    return new MJTemplateContentEntityServer({} as EntityInfo);
}

/** The skipAIEnrichment argument (4th) of the last RunTemplateExtractionPipeline call. */
function lastSkipArgument(): boolean {
    const calls = mockRunTemplateExtractionPipeline.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][3] as boolean;
}

describe('MJTemplateContentEntityServer save-time AI opt-outs', () => {
    beforeEach(() => {
        mockRunTemplateExtractionPipeline.mockClear();
    });
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('runs the AI stage by default (no host switch, no instance flag)', async () => {
        expect(await newContent().Save()).toBe(true);
        expect(lastSkipArgument()).toBe(false);
    });

    it("skips the AI stage when the host sets saveTimeAI.TemplateParameters = false", async () => {
        SaveTimeAISettings.Instance.Config = { TemplateParameters: false };
        expect(await newContent().Save()).toBe(true);
        expect(lastSkipArgument()).toBe(true);
    });

    it('is not affected by the query switch alone', async () => {
        SaveTimeAISettings.Instance.Config = { QueryParameters: false, TemplateParameters: true };
        await newContent().Save();
        expect(lastSkipArgument()).toBe(false);
    });

    it('skips the AI stage when the instance flag is set', async () => {
        const content = newContent();
        content.SkipAIEnrichment = true;
        await content.Save();
        expect(lastSkipArgument()).toBe(true);
    });
});
