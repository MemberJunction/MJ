/**
 * Unit tests for AgentRunner's conversation-artifact hydration.
 *
 * WHY THIS EXISTS: BaseAgent gates both the `## Available Artifacts` manifest and the artifact
 * tools on `params.inputArtifacts`. Only `RunAgentInConversation` used to populate it, so any
 * caller that held a conversationDetailId and went through `RunAgent` directly got an
 * artifact-BLIND agent — silently, with no error. Found during the 6.1 release, where it hollowed
 * out all nine of IT57's artifact-tool checks (eight of which then blamed the model for never
 * calling a tool against an artifact it had never been shown).
 *
 * The invariant pinned here: a conversation-linked run gets its artifacts regardless of entry
 * point, and a conversation that has already been scanned is never scanned twice.
 *
 * No DB, no network — RunView/RunQuery are module-mocked and the provider is a fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, InputArtifact } from '@memberjunction/ai-core-plus';

/** Recorded RunView calls, newest last — asserted on to prove the no-double-scan guarantee. */
const runViewCalls: Array<{ EntityName?: string }> = [];
let junctionVersionIds: string[] = [];
const runQueryCalls: Array<{ QueryName?: string }> = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName?: string }) {
                runViewCalls.push(params);
                if (params.EntityName === 'MJ: Conversation Details') {
                    return { Success: true, Results: [{ ID: 'detail-1' }] };
                }
                if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
                    return { Success: true, Results: junctionVersionIds.map((v, i) => ({ ID: `j-${i}`, ArtifactVersionID: v })) };
                }
                return { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery(params: { QueryName?: string }) {
                runQueryCalls.push(params);
                return {
                    Success: true,
                    Results: junctionVersionIds.map((v) => ({
                        VersionID: v,
                        VersionName: `Artifact ${v}`,
                        ContentMode: 'Text',
                        FileID: null,
                        Content: '{"hello":"world"}',
                        MimeType: 'application/json',
                        ForceToolsOnly: false,
                        ArtifactName: `Artifact ${v}`,
                        TypeName: 'JSON',
                        ToolLibraryClass: null,
                        DefaultDeliveryMode: 'ToolsOnly',
                    })),
                };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

/** The private hydration seam, reached through an explicit shape (no `any`). */
interface HydrationBridge {
    hydrateConversationArtifacts(params: ExecuteAgentParams): Promise<ExecuteAgentParams>;
}

const USER = { ID: 'user-1', Email: 'it@example.com' } as unknown as UserInfo;

/** Provider whose ConversationDetail load yields a fixed ConversationID. */
function makeProvider(loadSucceeds = true): { provider: IMetadataProvider; loads: string[] } {
    const loads: string[] = [];
    const provider = {
        GetEntityObject: vi.fn(async () => ({
            ConversationID: 'conv-99',
            Load: vi.fn(async (id: string) => { loads.push(id); return loadSucceeds; }),
        })),
    } as unknown as IMetadataProvider;
    return { provider, loads };
}

function makeParams(over: Partial<ExecuteAgentParams>): ExecuteAgentParams {
    return {
        agent: { ID: 'agent-1', Name: 'IT: Artifact Reader' },
        conversationMessages: [],
        contextUser: USER,
        ...over,
    } as unknown as ExecuteAgentParams;
}

function bridge(provider: IMetadataProvider): HydrationBridge {
    return new AgentRunner(provider) as unknown as HydrationBridge;
}

describe('AgentRunner — conversation artifact hydration on the direct RunAgent path', () => {
    beforeEach(() => {
        runViewCalls.length = 0;
        runQueryCalls.length = 0;
        junctionVersionIds = ['ver-1'];
    });

    it('hydrates inputArtifacts from conversationDetailId alone', async () => {
        const { provider, loads } = makeProvider();
        const result = await bridge(provider).hydrateConversationArtifacts(makeParams({ conversationDetailId: 'detail-1' }));

        expect(loads).toEqual(['detail-1']);   // resolved the conversation off the detail
        const artifacts = result.inputArtifacts as InputArtifact[];
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].typeName).toBe('JSON');
    });

    it('hydrates from a caller-supplied conversationId without loading the detail', async () => {
        const { provider, loads } = makeProvider();
        const result = await bridge(provider).hydrateConversationArtifacts(makeParams({ conversationId: 'conv-99' }));

        expect(loads).toEqual([]);
        expect(result.inputArtifacts).toHaveLength(1);
    });

    it('never scans a conversation twice — an already-set inputArtifacts short-circuits, INCLUDING an empty array', async () => {
        // This is what keeps the RunAgentInConversation path free: it always sets the field, so
        // `[]` means "scanned, none found" rather than "nobody has looked".
        const { provider } = makeProvider();
        const params = makeParams({ conversationDetailId: 'detail-1', inputArtifacts: [] });
        const result = await bridge(provider).hydrateConversationArtifacts(params);

        expect(result).toBe(params);
        expect(runViewCalls).toEqual([]);
        expect(runQueryCalls).toEqual([]);
    });

    it('leaves a non-conversation run untouched and issues no queries', async () => {
        const { provider } = makeProvider();
        const params = makeParams({});
        const result = await bridge(provider).hydrateConversationArtifacts(params);

        expect(result).toBe(params);
        expect(result.inputArtifacts).toBeUndefined();
        expect(runViewCalls).toEqual([]);
    });

    it('leaves inputArtifacts undefined when the conversation has no artifacts', async () => {
        junctionVersionIds = [];
        const { provider } = makeProvider();
        const result = await bridge(provider).hydrateConversationArtifacts(makeParams({ conversationId: 'conv-99' }));

        expect(result.inputArtifacts).toBeUndefined();
        expect(runQueryCalls).toEqual([]);   // nothing to look up
    });

    it('does not hydrate without a contextUser — every read below needs one', async () => {
        const { provider } = makeProvider();
        const params = makeParams({ conversationId: 'conv-99', contextUser: undefined });
        const result = await bridge(provider).hydrateConversationArtifacts(params);

        expect(result).toBe(params);
        expect(runViewCalls).toEqual([]);
    });
});
