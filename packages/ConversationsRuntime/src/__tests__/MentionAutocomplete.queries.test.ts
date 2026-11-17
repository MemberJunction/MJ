/**
 * @fileoverview Where MentionAutocomplete's '#' query candidates come from.
 *
 * The query list is read from the QueryEngine, never from the metadata provider's deprecated
 * query lists (left empty here, as they are once the provider stops loading queries). A query is
 * offered only when its UserCanRun check says canRun; one whose check denies it, or throws, is
 * left out. A host that passes its own provider gets that provider's engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { globalEngine, providerEngine, getProviderInstance } = vi.hoisted(() => {
    const makeEngine = () => ({ Config: vi.fn().mockResolvedValue(undefined), Queries: [] as object[] });
    const providerEngine = makeEngine();
    return { globalEngine: makeEngine(), providerEngine, getProviderInstance: vi.fn(() => providerEngine) };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { Config: vi.fn().mockResolvedValue(undefined), ReadableAgents: [], GetAgentConfigurationPresets: vi.fn().mockReturnValue([]) } },
    AIAgentPermissionHelper: { HasPermission: vi.fn().mockResolvedValue(true) },
    AISkillPermissionHelper: { GetAccessibleSkills: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        public static Provider = { Entities: [], Queries: [], EntityByName: () => undefined };
    },
}));
vi.mock('@memberjunction/core-entities', () => ({
    QueryEngine: { Instance: globalEngine, GetProviderInstance: getProviderInstance },
}));

import { MentionAutocomplete } from '../mentions/MentionAutocomplete';

const CURRENT_USER = { ID: 'user-me', Name: 'Me Myself', Email: 'me@example.com' } as never;

function query(id: string, name: string, canRun: boolean | 'throws') {
    return {
        ID: id,
        Name: name,
        Description: null,
        UserCanRun: vi.fn(() => {
            if (canRun === 'throws') throw new Error('permission check failed');
            return { canRun, deniedEntities: canRun ? [] : ['Members'] };
        }),
    };
}

describe('MentionAutocomplete — query candidates from the QueryEngine', () => {
    let engine: MentionAutocomplete;

    beforeEach(() => {
        engine = new MentionAutocomplete();
        globalEngine.Queries = [];
        providerEngine.Queries = [];
        globalEngine.Config.mockClear();
        getProviderInstance.mockClear();
    });

    it('offers the engine\'s runnable queries under #, though the provider lists none', async () => {
        globalEngine.Queries = [query('Q1', 'Revenue by Month', true)];
        await engine.initialize(CURRENT_USER);
        expect(globalEngine.Config).toHaveBeenCalledWith(false, CURRENT_USER, undefined);
        expect(engine.GetAvailableQueries().map((q) => q.ID)).toEqual(['Q1']);
        const suggestions = engine.getSuggestions('revenue', false, '#').filter((s) => s.type === 'query');
        expect(suggestions.map((s) => s.id)).toEqual(['Q1']);
    });

    it('leaves out a query whose UserCanRun denies the user, and one whose check throws', async () => {
        globalEngine.Queries = [query('Q1', 'Open', true), query('Q2', 'Denied', false), query('Q3', 'Broken', 'throws')];
        await engine.initialize(CURRENT_USER);
        expect(engine.GetAvailableQueries().map((q) => q.ID)).toEqual(['Q1']);
    });

    it('reads the queries of the provider it was given', async () => {
        const provider = { Entities: [], Queries: [], EntityByName: () => undefined } as never;
        providerEngine.Queries = [query('P1', 'Provider Query', true)];
        globalEngine.Queries = [query('G1', 'Global Query', true)];
        await engine.initialize(CURRENT_USER, provider);
        expect(getProviderInstance).toHaveBeenCalledWith(provider, expect.anything());
        expect(engine.GetAvailableQueries().map((q) => q.ID)).toEqual(['P1']);
    });
});
