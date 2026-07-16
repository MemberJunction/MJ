/**
 * Unit tests for the omnibar provider registry + the concrete providers' pure logic.
 *
 * The OmnibarProvider base registers via the MJ ClassFactory; these tests register
 * fakes under the same base and verify discovery ordering/exclusion, then exercise
 * each shipping provider's suggestion mapping with a mocked OmnibarContext — no
 * Angular TestBed, no network.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { of } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import {
    DiscoverOmnibarProviders, GetOmnibarNavPayload, OmnibarProvider, OMNIBAR_NAV_KEY,
} from './omnibar-provider';
import { OmnibarSearchProvider } from './providers/omnibar-search.provider';
import { OmnibarCommandProvider } from './providers/omnibar-command.provider';
import { OmnibarAgentProvider } from './providers/omnibar-agent.provider';
import { LoadOmnibarProviders } from './index';
import { ResolveOmnibarEnabled } from './omnibar-user-setting';

const REQ: ComposerSuggestionRequest = { Query: '', MaxResults: 9, ContextUser: null, Provider: null };

@RegisterClass(OmnibarProvider, 'test-zebra')
class ZebraProvider extends OmnibarProvider {
    public readonly TriggerChar = '$';
    public readonly Key = 'test-zebra';
    public override readonly Priority = 1;
    public readonly ModeLabel = 'Zebra';
    public async GetSuggestions(): Promise<MentionSuggestion[]> {
        return [{ type: 'zebra', id: 'z1', name: 'Z', displayName: 'Z' }];
    }
}

@RegisterClass(OmnibarProvider, 'test-alpha')
class AlphaProvider extends OmnibarProvider {
    public readonly TriggerChar = '!';
    public readonly Key = 'test-alpha';
    public override readonly Priority = 99;
    public readonly ModeLabel = 'Alpha';
    public async GetSuggestions(): Promise<MentionSuggestion[]> {
        return [];
    }
}

describe('DiscoverOmnibarProviders', () => {
    beforeAll(() => {
        LoadOmnibarProviders();
        // Touch the fakes so their decorators execute even under aggressive isolation.
        void ZebraProvider;
        void AlphaProvider;
    });

    it('discovers registered providers including the shipping four', () => {
        const keys = DiscoverOmnibarProviders().map((p) => p.Key);
        expect(keys).toContain('omnibar-search');
        expect(keys).toContain('omnibar-records');
        expect(keys).toContain('omnibar-commands');
        expect(keys).toContain('omnibar-agents');
        expect(keys).toContain('test-zebra');
    });

    it('sorts by Priority desc then Key asc', () => {
        const providers = DiscoverOmnibarProviders();
        const priorities = providers.map((p) => p.Priority);
        expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    });

    it('filters ExcludedTriggerKeys case-insensitively', () => {
        const keys = DiscoverOmnibarProviders(['TEST-ZEBRA']).map((p) => p.Key);
        expect(keys).not.toContain('test-zebra');
        expect(keys).toContain('test-alpha');
    });

    it('returns stable singleton instances across calls', () => {
        const a = DiscoverOmnibarProviders().find((p) => p.Key === 'test-zebra');
        const b = DiscoverOmnibarProviders().find((p) => p.Key === 'test-zebra');
        expect(a).toBe(b);
    });
});

describe('GetOmnibarNavPayload', () => {
    it('reads the payload and tolerates its absence', () => {
        const withNav: MentionSuggestion = {
            type: 'record', id: '1', name: 'A', displayName: 'A',
            data: { [OMNIBAR_NAV_KEY]: { kind: 'record', entityName: 'Users', recordId: 'X' } },
        };
        const without: MentionSuggestion = { type: 'entity', id: '2', name: 'B', displayName: 'B' };
        expect(GetOmnibarNavPayload(withNav)?.kind).toBe('record');
        expect(GetOmnibarNavPayload(without)).toBeNull();
    });
});

describe('OmnibarSearchProvider', () => {
    it('maps preview results to grouped suggestions and always appends see-all', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({
            Search: {
                PreviewSearch: async () => ({
                    Success: true,
                    Results: [
                        { Title: 'Amanda Reyes', Snippet: 'At risk', EntityName: 'Members', RecordID: 'r1', ResultType: 'entity-record', Score: 0.94 },
                        { Title: 'Playbook.pdf', Snippet: '', EntityName: '', RecordID: 'f1', ResultType: 'storage-file', Score: 0.7, RawMetadata: '{"x":1}' },
                    ],
                }),
            } as never,
        });
        const out = await provider.GetSuggestions({ ...REQ, Query: 'renewal' });
        expect(out).toHaveLength(3);
        expect(GetOmnibarNavPayload(out[0])).toEqual({ kind: 'record', entityName: 'Members', recordId: 'r1' });
        expect(GetOmnibarNavPayload(out[1])?.kind).toBe('file');
        const seeAll = GetOmnibarNavPayload(out[2]);
        expect(seeAll).toEqual({ kind: 'search', query: 'renewal' });
    });

    it('degrades to just see-all when the search service throws', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({ Search: { PreviewSearch: async () => { throw new Error('down'); } } as never });
        const out = await provider.GetSuggestions({ ...REQ, Query: 'x' });
        expect(out).toHaveLength(1);
        expect(GetOmnibarNavPayload(out[0])?.kind).toBe('search');
    });

    it('returns [] with no Search service attached (graceful degradation)', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({});
        expect(await provider.GetSuggestions({ ...REQ, Query: 'x' })).toEqual([]);
    });
});

describe('OmnibarCommandProvider', () => {
    const apps = [
        { ID: 'a1', Name: 'Skills Studio', Description: 'Author skills', Icon: 'fa-solid fa-wand-magic-sparkles', Color: '', GetNavItems: async () => [] },
        { ID: 'a2', Name: 'Chat', Description: 'Conversations', Icon: '', Color: '', GetNavItems: async () => [{ Label: 'Conversations', Icon: '' }] },
    ];
    const context = {
        Apps: { Applications: of(apps) } as never, // installed-apps stream (the provider deliberately ignores AllApplications)
        PaletteService: { GetRecentApps: async () => ['a2'] } as never,
    };

    it('fuzzy-ranks apps (starts-with beats contains) and payloads carry kind app', async () => {
        const provider = new OmnibarCommandProvider();
        provider.Attach(context);
        const out = await provider.GetSuggestions({ ...REQ, Query: 'sk' });
        expect(out.length).toBeGreaterThan(0);
        expect(out[0].displayName).toBe('Skills Studio');
        expect(GetOmnibarNavPayload(out[0])).toEqual({ kind: 'app', appId: 'a1', appName: 'Skills Studio' });
    });

    it('empty state orders by recency (recent app a2 first)', async () => {
        const provider = new OmnibarCommandProvider();
        provider.Attach(context);
        const out = await provider.EmptyStateSuggestions(REQ);
        expect(out[0].displayName).toBe('Chat');
    });
});

describe('OmnibarAgentProvider', () => {
    it('returns [] gracefully when no agent-mentions composer plugin is registered', async () => {
        const provider = new OmnibarAgentProvider();
        provider.Attach({});
        // In this test bundle ng-conversations' plugins are not loaded, so the
        // composer-registry delegate resolves to null — the graceful path.
        expect(await provider.GetSuggestions({ ...REQ, Query: 'sa' })).toEqual([]);
    });
});

describe('ResolveOmnibarEnabled (two-layer gate: instance availability × per-user opt-in)', () => {
    it('is OFF when the instance master switch is off, regardless of the user setting', () => {
        expect(ResolveOmnibarEnabled(false, 'true')).toBe(false);
        expect(ResolveOmnibarEnabled(false, 'false')).toBe(false);
        expect(ResolveOmnibarEnabled(false, undefined)).toBe(false);
    });

    it('is OFF by default (opt-in): available instance + no user setting = legacy trio', () => {
        expect(ResolveOmnibarEnabled(true, undefined)).toBe(false);
    });

    it('is ON only when the user explicitly opted in with the string "true"', () => {
        expect(ResolveOmnibarEnabled(true, 'true')).toBe(true);
        expect(ResolveOmnibarEnabled(true, 'false')).toBe(false);
        expect(ResolveOmnibarEnabled(true, '')).toBe(false);
        expect(ResolveOmnibarEnabled(true, 'TRUE')).toBe(false); // exact-match contract
        expect(ResolveOmnibarEnabled(true, '1')).toBe(false);
    });
});
