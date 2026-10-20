/**
 * The option set decision discovery asks about, as production (BaseAgent) and the Decision Eval
 * harness both build it (decision-discovery.ts): the permitted catalog, the host's allow-list, the
 * option cap, and narrowing by the semantic search. BaseAgent's own wiring of these is pinned by
 * agent-decision-discovery.test.ts, which runs unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AIModelConfiguration } from '@memberjunction/ai';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import type { EntitySearchResult, SearchEntityParams, UserInfo } from '@memberjunction/core';
import type { MJAIModelVendorEntity, MJAIPromptModelEntity } from '@memberjunction/core-entities';
import {
    BuildDecisionDiscoveryOptionSet,
    DECISION_DISCOVERY_MAX_OPTIONS,
    DECISION_DISCOVERY_SEARCH_ENTITY,
    DecisionDiscoveryAgent,
    DecisionDiscoveryAgentSearch,
    DecisionDiscoveryCatalog,
    DecisionDiscoveryRunnableAgents,
    DecisionDiscoverySearch,
    DecisionPromptOptionCap,
} from '../decision-discovery';

const SAGE_ID = 'CCCCCCCC-0000-4000-8000-000000000001';
const USER = { ID: 'CCCCCCCC-0000-4000-8000-0000000000AA' } satisfies Pick<UserInfo, 'ID'>;

function agent(n: number, overrides: Partial<DecisionDiscoveryAgent> = {}): DecisionDiscoveryAgent {
    return {
        ID: `CCCCCCCC-1000-4000-8000-${String(n).padStart(12, '0')}`,
        Name: `Agent ${n}`,
        Description: `Handles task type ${n}`,
        Status: 'Active',
        InvocationMode: 'Top-Level',
        ParentID: null,
        ...overrides,
    };
}

const SAGE: DecisionDiscoveryAgent = { ...agent(0), ID: SAGE_ID, Name: 'Sage', Description: 'Routes requests' };
const RESEARCH = agent(1, { Name: 'Research Agent' });
const BILLING = agent(2, { Name: 'Billing Agent' });
const MARKETING = agent(3, { Name: 'Marketing Agent' });
const SUB_AGENT = agent(4, { InvocationMode: 'Sub-Agent' });
const CHILD = agent(5, { ParentID: RESEARCH.ID });
const BLANK = agent(6, { Description: '   ' });

/** A search that ranks the given IDs, recording each call's topK. */
function rankingSearch(rankedIDs: string[], topKs: number[] = []): DecisionDiscoverySearch {
    return async (topK: number): Promise<EntitySearchResult[]> => {
        topKs.push(topK);
        return rankedIDs.map((id, i) => ({ entityRecordDocumentId: null, recordId: id, score: 1 / (i + 1), matchType: 'hybrid', components: {} }));
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DecisionDiscoveryCatalog', () => {
    it('keeps the directly discoverable agents in catalog order, without the running agent', () => {
        const catalog = DecisionDiscoveryCatalog([SAGE, RESEARCH, SUB_AGENT, BILLING, CHILD, MARKETING], SAGE_ID);
        expect(catalog.map(a => a.Name)).toEqual(['Research Agent', 'Billing Agent', 'Marketing Agent']);
    });

    it('recognises the running agent in any case', () => {
        expect(DecisionDiscoveryCatalog([SAGE, RESEARCH], SAGE_ID.toLowerCase()).map(a => a.ID)).toEqual([RESEARCH.ID]);
    });
});

describe('DecisionDiscoveryRunnableAgents', () => {
    it("filters through the shared permission filter, for the user's run permission", async () => {
        const filter = vi.spyOn(AIAgentPermissionHelper, 'FilterRunnableAgents').mockImplementation(async agents => agents.slice(1));
        const runnable = await DecisionDiscoveryRunnableAgents([SAGE, RESEARCH, BILLING], USER as UserInfo);
        expect(runnable).toEqual([RESEARCH, BILLING]);
        expect(filter).toHaveBeenCalledTimes(1);
        expect(filter.mock.calls[0][1]).toBe(USER);
        expect(filter.mock.calls[0][2]).toBeUndefined();
    });
});

describe('BuildDecisionDiscoveryOptionSet', () => {
    it('offers every permitted, discoverable agent with a description, minus the running agent', async () => {
        const set = await BuildDecisionDiscoveryOptionSet({ Agents: [SAGE, RESEARCH, SUB_AGENT, BILLING, BLANK, MARKETING], RunningAgentID: SAGE_ID });
        expect(set.Options).toEqual([
            { ID: RESEARCH.ID, Name: RESEARCH.Name, Description: RESEARCH.Description },
            { ID: BILLING.ID, Name: BILLING.Name, Description: BILLING.Description },
            { ID: MARKETING.ID, Name: MARKETING.Name, Description: MARKETING.Description },
        ]);
        expect(set).toMatchObject({ CatalogSize: 4, WithoutDescription: [BLANK.ID], OptionLimit: DECISION_DISCOVERY_MAX_OPTIONS });
        expect(set.HostAllowListSize).toBeUndefined();
        expect(set.NarrowedFrom).toBeUndefined();
        expect(set.Error).toBeUndefined();
    });

    it("keeps only the agents on the host's allow-list, matching IDs in any case, and records its size", async () => {
        const set = await BuildDecisionDiscoveryOptionSet({
            Agents: [RESEARCH, BILLING, MARKETING],
            RunningAgentID: SAGE_ID,
            HostAllowedIDs: [BILLING.ID.toLowerCase(), MARKETING.ID, 'not-an-agent'],
        });
        expect(set.Options.map(o => o.ID)).toEqual([BILLING.ID, MARKETING.ID]);
        expect(set).toMatchObject({ CatalogSize: 2, HostAllowListSize: 3 });
    });

    it('never offers the running agent, even when the host lists it', async () => {
        const set = await BuildDecisionDiscoveryOptionSet({ Agents: [SAGE, RESEARCH], RunningAgentID: SAGE_ID, HostAllowedIDs: [SAGE_ID, RESEARCH.ID] });
        expect(set.Options.map(o => o.ID)).toEqual([RESEARCH.ID]);
    });

    it('offers no one when the allow-list is empty', async () => {
        const set = await BuildDecisionDiscoveryOptionSet({ Agents: [RESEARCH, BILLING], RunningAgentID: SAGE_ID, HostAllowedIDs: [] });
        expect(set.Options).toEqual([]);
        expect(set).toMatchObject({ CatalogSize: 0, HostAllowListSize: 0 });
    });

    it('runs no search when the options fit the declared cap', async () => {
        const topKs: number[] = [];
        const set = await BuildDecisionDiscoveryOptionSet({
            Agents: [RESEARCH, BILLING, MARKETING], RunningAgentID: SAGE_ID, DeclaredCap: 3, Search: rankingSearch([], topKs),
        });
        expect(topKs).toEqual([]);
        expect(set).toMatchObject({ OptionLimit: 3, DeclaredOptionCap: 3 });
        expect(set.Options).toHaveLength(3);
    });

    it('narrows to the declared cap by search rank, over-fetching threefold, and skips results that are not options', async () => {
        const topKs: number[] = [];
        const ranked = [SAGE_ID, SUB_AGENT.ID, MARKETING.ID, 'CCCCCCCC-9999-4000-8000-000000000000', RESEARCH.ID, BILLING.ID];
        const set = await BuildDecisionDiscoveryOptionSet({
            Agents: [SAGE, RESEARCH, BILLING, MARKETING, SUB_AGENT], RunningAgentID: SAGE_ID, DeclaredCap: 2, Search: rankingSearch(ranked, topKs),
        });
        expect(topKs).toEqual([6]);
        expect(set.Options.map(o => o.ID)).toEqual([MARKETING.ID, RESEARCH.ID]);
        expect(set).toMatchObject({ OptionLimit: 2, DeclaredOptionCap: 2, NarrowedFrom: 3, CatalogSize: 3 });
    });

    it(`caps a catalog at ${DECISION_DISCOVERY_MAX_OPTIONS} options when no model declares a cap`, async () => {
        const many = Array.from({ length: 30 }, (_, i) => agent(100 + i));
        const topKs: number[] = [];
        const ranked = [...many].reverse().map(a => a.ID);
        const set = await BuildDecisionDiscoveryOptionSet({ Agents: many, RunningAgentID: SAGE_ID, Search: rankingSearch(ranked, topKs) });
        expect(topKs).toEqual([DECISION_DISCOVERY_MAX_OPTIONS * 3]);
        expect(set.Options.map(o => o.ID)).toEqual(ranked.slice(0, DECISION_DISCOVERY_MAX_OPTIONS));
        expect(set).toMatchObject({ OptionLimit: DECISION_DISCOVERY_MAX_OPTIONS, NarrowedFrom: 30 });
        expect(set.DeclaredOptionCap).toBeUndefined();
    });

    it('says why, and offers nothing, when the options exceed the limit and there is no search', async () => {
        const set = await BuildDecisionDiscoveryOptionSet({ Agents: [RESEARCH, BILLING, MARKETING], RunningAgentID: SAGE_ID, DeclaredCap: 2 });
        expect(set.Options).toEqual([]);
        expect(set.NarrowedFrom).toBe(3);
        expect(set.Error).toBe('3 agents exceed the limit of 2 options, and the provider cannot run the semantic search that narrows them');
    });
});

describe('DecisionDiscoveryAgentSearch', () => {
    it("runs Find Candidate Agents' search: hybrid over MJ: AI Agents, with no floor, as the user", async () => {
        const calls: SearchEntityParams[] = [];
        const provider = {
            SearchEntity: async (params: SearchEntityParams): Promise<EntitySearchResult[]> => {
                calls.push(params);
                return [];
            },
        };
        await DecisionDiscoveryAgentSearch(provider, 'invoice Acme', USER as UserInfo)(12);
        expect(calls).toEqual([{
            entityName: DECISION_DISCOVERY_SEARCH_ENTITY,
            searchText: 'invoice Acme',
            options: { mode: 'hybrid', topK: 12, minScore: 0, contextUser: USER },
        }]);
        expect(DECISION_DISCOVERY_SEARCH_ENTITY).toBe('MJ: AI Agents');
    });
});

describe('DecisionPromptOptionCap', () => {
    const PROMPT_ID = 'CCCCCCCC-2000-4000-8000-000000000001';
    const MODEL_A = 'CCCCCCCC-3000-4000-8000-000000000001';
    const MODEL_B = 'CCCCCCCC-3000-4000-8000-000000000002';
    const VENDOR = 'CCCCCCCC-4000-4000-8000-000000000001';
    const MODEL_VENDOR = 'CCCCCCCC-5000-4000-8000-000000000001';

    type PromptModelRow = Pick<MJAIPromptModelEntity, 'PromptID' | 'ModelID' | 'VendorID' | 'Status'>;

    /** An engine whose prompt is bound to `rows`, and whose models declare the caps in `caps` by model ID. */
    function engine(rows: PromptModelRow[], caps: Record<string, number | null>, seen: Array<string | undefined> = []) {
        const prompt = { ID: PROMPT_ID, Name: 'Default Decision' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;
        const modelVendor = { ID: MODEL_VENDOR, ModelID: MODEL_A, VendorID: VENDOR } satisfies Pick<MJAIModelVendorEntity, 'ID' | 'ModelID' | 'VendorID'>;
        return {
            Prompts: [prompt as MJAIPromptEntityExtended],
            PromptModels: rows.map(r => r as MJAIPromptModelEntity),
            ModelVendors: [modelVendor as MJAIModelVendorEntity],
            GetEffectiveModelConfiguration: (modelID: string, modelVendorID?: string): AIModelConfiguration | null => {
                seen.push(modelVendorID);
                return { Decision: { MaxChoiceOptions: caps[modelID] ?? null } };
            },
        };
    }

    it('is the smallest cap among the Active and Preview models the prompt is bound to', () => {
        const rows: PromptModelRow[] = [
            { PromptID: PROMPT_ID, ModelID: MODEL_A, VendorID: null, Status: 'Active' },
            { PromptID: PROMPT_ID, ModelID: MODEL_B, VendorID: null, Status: 'Preview' },
        ];
        expect(DecisionPromptOptionCap(engine(rows, { [MODEL_A]: 40, [MODEL_B]: 12 }), 'default decision')).toBe(12);
    });

    it('ignores inactive bindings and models with no cap', () => {
        const rows: PromptModelRow[] = [
            { PromptID: PROMPT_ID, ModelID: MODEL_A, VendorID: null, Status: 'Active' },
            { PromptID: PROMPT_ID, ModelID: MODEL_B, VendorID: null, Status: 'Inactive' },
        ];
        expect(DecisionPromptOptionCap(engine(rows, { [MODEL_A]: null, [MODEL_B]: 3 }), 'Default Decision')).toBeUndefined();
    });

    it("reads a vendor-bound model through its model-vendor row's configuration", () => {
        const seen: Array<string | undefined> = [];
        const rows: PromptModelRow[] = [{ PromptID: PROMPT_ID, ModelID: MODEL_A, VendorID: VENDOR, Status: 'Active' }];
        expect(DecisionPromptOptionCap(engine(rows, { [MODEL_A]: 8 }, seen), 'Default Decision')).toBe(8);
        expect(seen).toEqual([MODEL_VENDOR]);
    });

    it('is undefined when the prompt is not found', () => {
        expect(DecisionPromptOptionCap(engine([], {}), 'No Such Prompt')).toBeUndefined();
    });
});
