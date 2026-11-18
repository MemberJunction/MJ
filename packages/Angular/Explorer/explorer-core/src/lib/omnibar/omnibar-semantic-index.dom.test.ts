/**
 * @fileoverview Unit, ranking-quality, <15ms warm latency, offline zero-PreviewSearch,
 * and cold/unavailable fallback tests for Stage 6C.2 Client-Only Semantic Omnibox.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    EdgeAIWorkerHost,
    type EdgeWorkerPort,
    type EdgeWorkerReply,
    type EdgeWorkerRequest,
} from '@memberjunction/ng-conversations';
import type { SearchService } from '@memberjunction/ng-search';
import type { ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import {
    OmnibarSemanticIndexService,
    type OmnibarSemanticEntry,
} from './omnibar-semantic-index.service';
import { OmnibarSearchProvider } from './providers/omnibar-search.provider';
import { GetOmnibarNavPayload } from './omnibar-provider';

/** Domain-clustered 32-dim semantic vectors (captures synonyms like unpaid->invoices, merge->duplicate, manage->agent). */
const SEMANTIC_CONCEPTS: Array<{ Terms: string[]; Dims: number[] }> = [
    { Terms: ['unpaid', 'invoice', 'invoices', 'billing', 'overdue', 'ar', 'accounts receivable', 'payment'], Dims: [0, 1] },
    { Terms: ['merge', 'duplicate', 'duplicates', 'dedupe', 'contacts', 'contact', 'cleanup'], Dims: [2, 3] },
    { Terms: ['manage', 'agent', 'agents', 'ai', 'prompt', 'prompts', 'orchestrator'], Dims: [4, 5] },
    { Terms: ['dashboard', 'revenue', 'kpi', 'executive', 'analytics', 'metrics'], Dims: [6, 7] },
    { Terms: ['workflow', 'automation', 'schedule', 'jobs', 'tasks'], Dims: [8, 9] },
    { Terms: ['crm', 'customers', 'pipeline', 'deals', 'sales'], Dims: [10, 11] },
];

function semanticEmbed(text: string): Float32Array {
    const lower = text.toLowerCase();
    const vec = new Float32Array(32);
    for (const concept of SEMANTIC_CONCEPTS) {
        let score = 0;
        for (const t of concept.Terms) {
            if (lower.includes(t)) {
                score += 1;
            }
        }
        if (score > 0) {
            for (const d of concept.Dims) {
                vec[d] += score;
            }
        }
    }
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
        norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm;
    }
    return vec;
}

function toArrayBuffer(vec: Float32Array): ArrayBuffer {
    const buf = new ArrayBuffer(vec.byteLength);
    new Float32Array(buf).set(vec);
    return buf;
}

class OmnibarFakePort implements EdgeWorkerPort {
    public OnReply: ((reply: EdgeWorkerReply) => void) | null = null;
    public EmbedCalls = 0;

    public Post(message: EdgeWorkerRequest): void {
        queueMicrotask(() => {
            if (!this.OnReply) {
                return;
            }
            if (message.Type === 'init') {
                this.OnReply({
                    Type: 'ready',
                    RequestId: message.RequestId,
                    BiEncoderModelId: message.BiEncoderModelId ?? 'bge-small',
                    CrossEncoderLoaded: false,
                    LoadMs: 1,
                });
                return;
            }
            if (message.Type === 'embed') {
                this.EmbedCalls++;
                this.OnReply({
                    Type: 'embedded',
                    RequestId: message.RequestId,
                    Vectors: message.Texts.map((t) => toArrayBuffer(semanticEmbed(t))),
                    Dimensions: 32,
                    DurationMs: 1,
                });
            }
        });
    }

    public Terminate(): void {}
}

const SAMPLE_ENTRIES: OmnibarSemanticEntry[] = [
    {
        Key: 'entity:invoices',
        Kind: 'entity',
        Group: 'Entities',
        Title: 'Invoices',
        Description: 'Customer billing statements, unpaid AR balances, and overdue invoice tracking',
        Icon: 'fa-solid fa-file-invoice-dollar',
        Nav: { kind: 'entity-list', entityName: 'Invoices' },
        SearchText: 'Invoices entity: Customer billing statements, unpaid AR balances, overdue invoices and payments',
    },
    {
        Key: 'view:overdue-invoices',
        Kind: 'view',
        Group: 'Saved Views',
        Title: 'Overdue AR Balances',
        Description: 'Invoices · Unpaid invoices past 30 days',
        Icon: 'fa-solid fa-table-list',
        Nav: { kind: 'view', viewId: 'view-overdue-1', viewName: 'Overdue AR Balances' },
        SearchText: 'Overdue AR Balances saved view for Invoices: unpaid invoices past due',
    },
    {
        Key: 'entity:duplicate-runs',
        Kind: 'entity',
        Group: 'Entities',
        Title: 'Duplicate Runs',
        Description: 'Identify and merge duplicate contacts, accounts, and records',
        Icon: 'fa-solid fa-code-merge',
        Nav: { kind: 'entity-list', entityName: 'Duplicate Runs' },
        SearchText: 'Duplicate Runs entity: dedupe and merge duplicate contacts and records',
    },
    {
        Key: 'agent:agent-manager',
        Kind: 'agent',
        Group: 'Agents',
        Title: 'Agent Manager',
        Description: 'Create, configure, and manage AI agents and prompts · opens chat pre-addressed',
        Icon: 'fa-solid fa-robot',
        Nav: { kind: 'agent', agentName: 'Agent Manager' },
        SearchText: 'Agent Manager AI agent: manage agents, configure AI agents and prompts',
    },
    {
        Key: 'dashboard:exec-kpi',
        Kind: 'dashboard',
        Group: 'Dashboards',
        Title: 'Executive Revenue KPIs',
        Description: 'Sales · Revenue analytics and pipeline metrics',
        Icon: 'fa-solid fa-gauge-high',
        Nav: { kind: 'dashboard', dashboardId: 'dash-1', dashboardName: 'Executive Revenue KPIs' },
        SearchText: 'Executive Revenue KPIs dashboard: revenue analytics and pipeline metrics',
    },
    {
        Key: 'app:crm',
        Kind: 'app',
        Group: 'Apps',
        Title: 'CRM',
        Description: 'Customers, contacts, pipeline deals, and sales accounts',
        Icon: 'fa-solid fa-address-book',
        Nav: { kind: 'app', appId: 'app-crm', appName: 'CRM' },
        SearchText: 'CRM application: customers, pipeline deals, and sales accounts',
    },
];

describe('OmnibarSemanticIndexService & Offline Semantic Omnibar (Stage 6C.2)', () => {
    beforeEach(() => {
        OmnibarSemanticIndexService.Instance.Clear();
        EdgeAIWorkerHost.Instance.ResetForTesting();
    });

    afterEach(() => {
        OmnibarSemanticIndexService.Instance.Clear();
        EdgeAIWorkerHost.Instance.ResetForTesting();
        vi.restoreAllMocks();
    });

    it('indexes browser-resident metadata into float32 SimpleVectorService and ranks semantic queries accurately in < 15ms', async () => {
        EdgeAIWorkerHost.Instance.SetPortFactoryForTesting(() => new OmnibarFakePort());

        const built = await OmnibarSemanticIndexService.Instance.BuildOrRefreshIndex({
            ExplicitEntries: SAMPLE_ENTRIES,
        });
        expect(built).toBe(true);
        expect(OmnibarSemanticIndexService.Instance.IsReady).toBe(true);
        expect(OmnibarSemanticIndexService.Instance.EntryCount).toBe(SAMPLE_ENTRIES.length);

        const cases: Array<{ Query: string; ExpectedTopIds: string[] }> = [
            { Query: 'unpaid invoices', ExpectedTopIds: ['entity:invoices', 'view:overdue-invoices'] },
            { Query: 'merge duplicate contacts', ExpectedTopIds: ['entity:duplicate-runs'] },
            { Query: 'manage agents', ExpectedTopIds: ['agent:agent-manager'] },
        ];

        const latencies: number[] = [];
        for (const c of cases) {
            const res = await OmnibarSemanticIndexService.Instance.Query(c.Query, { MaxResults: 5 });
            latencies.push(res.ElapsedMs);
            expect(res.Suggestions.length).toBeGreaterThan(0);
            expect(c.ExpectedTopIds).toContain(res.Suggestions[0].id);
            expect(GetOmnibarNavPayload(res.Suggestions[0])).not.toBeNull();
        }

        // Benchmark 25 warm queries (and sub-ms synchronous vector lookup)
        for (let i = 0; i < 25; i++) {
            const res = await OmnibarSemanticIndexService.Instance.Query('unpaid invoices', { MaxResults: 5 });
            latencies.push(res.ElapsedMs);
        }
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        expect(p95).toBeLessThan(15);
    });

    it('runs completely offline in OmnibarSearchProvider with ZERO PreviewSearch GraphQL calls', async () => {
        EdgeAIWorkerHost.Instance.SetPortFactoryForTesting(() => new OmnibarFakePort());
        await OmnibarSemanticIndexService.Instance.BuildOrRefreshIndex({
            ExplicitEntries: SAMPLE_ENTRIES,
        });

        const previewSearchSpy = vi.fn().mockRejectedValue(new Error('Network unavailable'));
        const provider = new OmnibarSearchProvider();
        provider.Attach({
            Search: { PreviewSearch: previewSearchSpy } as unknown as SearchService,
            OfflineOnly: true,
        });

        const req: ComposerSuggestionRequest = {
            Query: 'merge duplicate contacts',
            MaxResults: 9,
            ContextUser: null,
            Provider: null,
        };

        const results = await provider.GetSuggestions(req);
        expect(previewSearchSpy).not.toHaveBeenCalled();
        expect(results.some((r) => r.id === 'entity:duplicate-runs')).toBe(true);
        expect(results[results.length - 1].type).toBe('see-all');

        // GetLocalSuggestions also issues 0 PreviewSearch calls and returns semantic matches directly
        const localOnly = await provider.GetLocalSuggestions({ ...req, Query: 'unpaid invoices' });
        expect(previewSearchSpy).not.toHaveBeenCalled();
        expect(localOnly.some((r) => r.id === 'entity:invoices' || r.id === 'view:overdue-invoices')).toBe(true);
    });

    it('gracefully falls back to PreviewSearch when semantic worker is cold or unavailable', async () => {
        // Worker is NOT warmed (IsReady === false)
        const previewSearchSpy = vi.fn().mockResolvedValue({
            Success: true,
            Results: [
                {
                    ResultType: 'entity-record',
                    EntityName: 'Invoices',
                    RecordID: 'inv-100',
                    Title: 'INV-100 Acme',
                    Snippet: 'Unpaid invoice',
                    Score: 0.91,
                },
            ],
        });

        const provider = new OmnibarSearchProvider();
        provider.Attach({
            Search: { PreviewSearch: previewSearchSpy } as unknown as SearchService,
        });

        const emptyWarm = await OmnibarSemanticIndexService.Instance.Query('unpaid invoices');
        expect(emptyWarm.Suggestions).toEqual([]);

        const results = await provider.GetSuggestions({
            Query: 'unpaid invoices',
            MaxResults: 9,
            ContextUser: null,
            Provider: null,
        });
        expect(previewSearchSpy).toHaveBeenCalledTimes(1);
        expect(results.some((r) => r.id === 'Invoices:inv-100')).toBe(true);
    });
});
