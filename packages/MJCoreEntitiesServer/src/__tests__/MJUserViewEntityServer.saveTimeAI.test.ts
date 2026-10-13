/**
 * MJUserViewEntityServer generates a Smart Filter WHERE clause on save (the base class's
 * UpdateWhereClause calls GenerateSmartFilterWhereClause only while SmartFilterImplemented is true).
 * The host switch saveTimeAI.ViewSmartFilters = false turns that model call off for every save.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    // `unknown` on purpose: a no-op class decorator accepts any constructor and returns it unchanged.
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    /** Stands in for the client class: only the getter the server subclass overrides matters here. */
    class MJUserViewEntityExtended {
        protected get SmartFilterImplemented(): boolean {
            return false;
        }
    }
    return { ...actual, MJUserViewEntityExtended };
});
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class {} }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: {} } }));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class {} }));

import { MJUserViewEntityServer } from '../custom/MJUserViewEntityServer.server';
import { SaveTimeAISettings } from '@memberjunction/ai';

/** Exposes the protected getter the base class's UpdateWhereClause branches on. */
class TestableUserViewServer extends MJUserViewEntityServer {
    public get SmartFilterImplementedForTest(): boolean {
        return this.SmartFilterImplemented;
    }
}

function newView(): TestableUserViewServer {
    return new TestableUserViewServer({} as EntityInfo);
}

describe('MJUserViewEntityServer save-time smart filter switch', () => {
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('generates smart filters by default', () => {
        expect(newView().SmartFilterImplementedForTest).toBe(true);
    });

    it('does not generate them while the host sets saveTimeAI.ViewSmartFilters = false', () => {
        SaveTimeAISettings.Instance.Config = { ViewSmartFilters: false };
        expect(newView().SmartFilterImplementedForTest).toBe(false);
    });

    it('another kind switched off leaves smart filters on', () => {
        SaveTimeAISettings.Instance.Config = { QueryParameters: false, Embeddings: false };
        expect(newView().SmartFilterImplementedForTest).toBe(true);
    });
});
