import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import type {
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeSessionError,
    RealtimeToolCall,
    RealtimeToolDefinition,
    RealtimeTranscript,
} from '@memberjunction/ai';

import {
    ElevenLabsConnectArgs,
    ElevenLabsRealtime,
    ElevenLabsRealtimeSession,
    ElevenLabsRealtimeSocket,
    ElevenLabsServerEvent,
} from '../elevenLabsRealtime';

/* ------------------------------------------------------------------ */
/*  Fake in-memory conversation socket + REST surface                 */
/*                                                                    */
/*  Captures outbound frames / REST calls and exposes the             */
/*  server-message callback so tests can drive ElevenLabs-shaped      */
/*  events with NO network.                                           */
/* ------------------------------------------------------------------ */

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    user_audio_chunk?: string;
    text?: string;
    conversation_config_override?: {
        agent?: { prompt?: { prompt?: string }; first_message?: string };
        tts?: { voice_id?: string };
    };
    tool_call_id?: string;
    result?: unknown;
    is_error?: boolean;
    event_id?: number;
}

class FakeSocket implements ElevenLabsRealtimeSocket {
    public Sent: string[] = [];
    public Closed = false;

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }
    public SentFrames(): ParsedFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedFrame);
    }
}

/**
 * Builds a full agent detail the way the REST API would return it. By DEFAULT the agent enables
 * every override the driver requires, i.e. it is already up to date and must not be PATCHed;
 * individual `…OverrideEnabled` flags opt into the drifted shapes the ensure flow has to repair.
 */
function makeAgentDetail(opts: {
    agentId: string;
    name: string;
    tools?: RealtimeToolDefinition[];
    promptOverrideEnabled?: boolean;
    llmOverrideEnabled?: boolean;
    voiceOverrideEnabled?: boolean;
    firstMessageOverrideEnabled?: boolean;
    createdAtUnixSecs?: number;
}): ElevenLabs.GetAgentResponseModel {
    return {
        agentId: opts.agentId,
        name: opts.name,
        createdAtUnixSecs: opts.createdAtUnixSecs ?? 0,
        conversationConfig: {
            agent: {
                prompt: {
                    prompt: 'stored base prompt',
                    tools: (opts.tools ?? []).map((t) => ElevenLabsRealtime.MapToolToClientTool(t)),
                },
            },
        },
        platformSettings: {
            overrides: {
                conversationConfigOverride: {
                    agent: {
                        // `llm: true` joined the required set with #3859 — a fixture agent "this
                        // driver just provisioned" carries the full current enablement, or the
                        // round-trip tests would read every fixture as drifted.
                        prompt: { prompt: opts.promptOverrideEnabled ?? true, llm: opts.llmOverrideEnabled ?? true },
                        firstMessage: opts.firstMessageOverrideEnabled ?? true,
                    },
                    tts: { voiceId: opts.voiceOverrideEnabled ?? true },
                },
            },
        },
        metadata: { createdAtUnixSecs: 0, updatedAtUnixSecs: 0 },
    } as ElevenLabs.GetAgentResponseModel;
}

/**
 * Test subclass that swaps every REST / transport seam for in-memory fakes, capturing all
 * calls so assertions can inspect the managed-agent ensure flow and the wire frames.
 */
class TestElevenLabsRealtime extends ElevenLabsRealtime {
    /** The remote agent inventory the fake REST surface serves. */
    public Agents: ElevenLabs.GetAgentResponseModel[] = [];
    public ListCalls: string[] = [];
    public GetCalls: string[] = [];
    public CreateBodies: ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost[] = [];
    public UpdateCalls: Array<{ agentId: string; body: ElevenLabs.conversationalAi.UpdateAgentRequest }> = [];
    public SignedUrlMints: string[] = [];
    public Socket = new FakeSocket();
    public LastConnectArgs: ElevenLabsConnectArgs | null = null;

    /**
     * Number of leading `listAgents` calls that return NOTHING regardless of inventory —
     * simulates ElevenLabs' eventually-consistent agent search, where a freshly created
     * (or concurrently created) agent is briefly invisible to find-by-name.
     */
    public SearchMissesBeforeHit = 0;

    protected override async listAgents(search: string): Promise<ElevenLabs.AgentSummaryResponseModel[]> {
        this.ListCalls.push(search);
        if (this.ListCalls.length <= this.SearchMissesBeforeHit) {
            return []; // search index has not caught up yet
        }
        return this.Agents.filter((a) => a.name.includes(search)).map(
            (a) => ({ agentId: a.agentId, name: a.name, createdAtUnixSecs: a.createdAtUnixSecs ?? 0 }) as ElevenLabs.AgentSummaryResponseModel
        );
    }

    /** Tests must not actually sleep between lookup retries. */
    protected override async pauseBetweenAgentLookups(): Promise<void> {
        return undefined;
    }
    protected override async getAgent(agentId: string): Promise<ElevenLabs.GetAgentResponseModel> {
        this.GetCalls.push(agentId);
        const agent = this.Agents.find((a) => a.agentId === agentId);
        if (!agent) {
            throw new Error(`fake REST: no agent ${agentId}`);
        }
        return agent;
    }
    protected override async createAgent(
        body: ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost
    ): Promise<string> {
        this.CreateBodies.push(body);
        return 'agent_created_001';
    }
    protected override async updateAgent(
        agentId: string,
        body: ElevenLabs.conversationalAi.UpdateAgentRequest
    ): Promise<void> {
        this.UpdateCalls.push({ agentId, body });
    }
    protected override async mintSignedUrl(agentId: string): Promise<string> {
        this.SignedUrlMints.push(agentId);
        return `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}&token=signed-token`;
    }
    protected override async connectConversation(args: ElevenLabsConnectArgs): Promise<ElevenLabsRealtimeSocket> {
        this.LastConnectArgs = args;
        return this.Socket;
    }

    /** Drives an inbound ElevenLabs server event through the registered callback. */
    public Emit(event: ElevenLabsServerEvent): void {
        this.LastConnectArgs?.OnMessage(event);
    }
}

/**
 * The override object for a session with NO voice configured — i.e. exactly what the driver
 * sent before per-session voice existed. Assertions build on this so the voice delta is the
 * only thing visible in each test.
 */
function promptOnlyOverrides(prompt = 'You are the session voice.'): Record<string, unknown> {
    return { agent: { prompt: { prompt } } };
}

/**
 * The override object for a session that also configures a first message. Written as an explicit
 * literal rather than a spread of {@link promptOnlyOverrides} because `first_message` is a SIBLING
 * of `prompt` INSIDE `agent` — a shallow spread would silently drop one of the two, which is
 * precisely the merge mistake these tests exist to catch.
 */
function promptAndFirstMessageOverrides(
    firstMessage: string,
    prompt = 'You are the session voice.'
): Record<string, unknown> {
    return { agent: { prompt: { prompt }, first_message: firstMessage } };
}

/** Every `true` leaf in a nested override-enablement object, as a key path. */
function enabledLeafPaths(node: unknown, prefix: string[] = []): string[][] {
    if (node === null || typeof node !== 'object') {
        return [];
    }
    const paths: string[][] = [];
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (value === true) {
            paths.push([...prefix, key]);
        } else if (value !== null && typeof value === 'object') {
            paths.push(...enabledLeafPaths(value, [...prefix, key]));
        }
    }
    return paths;
}

/** Deep copy of an enablement object with the leaf at `path` turned off. */
function withLeafDisabled(source: object, path: string[]): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
    let cursor = clone;
    for (const key of path.slice(0, -1)) {
        cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[path[path.length - 1]] = false;
    return clone;
}

/** Builds the minimal session params; callers override per test. */
function makeParams(overrides: Partial<RealtimeSessionParams> = {}): RealtimeSessionParams {
    return {
        Model: 'MJ Realtime Co-Agent',
        SystemPrompt: 'You are the session voice.',
        ...overrides,
    };
}

const WEATHER_TOOL: RealtimeToolDefinition = {
    Name: 'get_weather',
    Description: 'Get the weather for a city',
    ParametersSchema: { type: 'object', properties: { city: { type: 'string' } } },
};

function metadataEvent(): ElevenLabsServerEvent {
    return {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
            conversation_id: 'conv_1',
            agent_output_audio_format: 'pcm_16000',
            user_input_audio_format: 'pcm_16000',
        },
    };
}

/** Lets the in-flight StartSession continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Starts a session and completes the initiation handshake. */
async function startSession(
    driver: TestElevenLabsRealtime,
    params: Partial<RealtimeSessionParams> = {}
): Promise<IRealtimeSession> {
    const promise = driver.StartSession(makeParams(params));
    await flushAsync();
    driver.Emit(metadataEvent());
    return promise;
}

/** Collects every emission from a session into arrays for assertions. */
function collect(session: IRealtimeSession): {
    outputs: ArrayBuffer[];
    transcripts: RealtimeTranscript[];
    toolCalls: RealtimeToolCall[];
    errors: RealtimeSessionError[];
    interruptions: number[];
} {
    const outputs: ArrayBuffer[] = [];
    const transcripts: RealtimeTranscript[] = [];
    const toolCalls: RealtimeToolCall[] = [];
    const errors: RealtimeSessionError[] = [];
    const interruptions: number[] = [];
    session.OnOutput((chunk) => outputs.push(chunk));
    session.OnTranscript((t) => transcripts.push(t));
    session.OnToolCall((c) => toolCalls.push(c));
    session.OnError((e) => errors.push(e));
    session.OnInterruption(() => interruptions.push(interruptions.length + 1));
    return { outputs, transcripts, toolCalls, errors, interruptions };
}

/* ------------------------------------------------------------------ */
/*  Managed-agent ensure flow                                          */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime managed-agent ensure flow', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('uses a verbatim agent_… Model as the agent id with NO management REST calls', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Model: 'agent_deployment_owned_42' }));

        expect(driver.ListCalls).toEqual([]);
        expect(driver.CreateBodies).toEqual([]);
        expect(driver.UpdateCalls).toEqual([]);
        expect(driver.SignedUrlMints).toEqual(['agent_deployment_owned_42']);
        expect(cfg.SessionConfig['agentId']).toBe('agent_deployment_owned_42');
    });

    it('creates a missing managed agent with the tool set and the prompt-override enablement', async () => {
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        // every lookup targets the managed name (the count varies — a miss is retried against
        // ElevenLabs' eventually-consistent search before we conclude the agent is absent)
        expect(driver.ListCalls.every((c) => c === 'MJ Realtime Co-Agent')).toBe(true);
        expect(driver.CreateBodies).toHaveLength(1);
        const body = driver.CreateBodies[0];
        expect(body.name).toBe('MJ Realtime Co-Agent');
        // the per-session system-prompt AND voice overrides are explicitly ENABLED (ElevenLabs
        // drops any override the agent has not allowed, so both must be declared up front)
        expect(body.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.prompt).toBe(true);
        expect(body.platformSettings?.overrides?.conversationConfigOverride?.tts?.voiceId).toBe(true);
        // the stored prompt is a placeholder, never a session prompt
        expect(body.conversationConfig.agent?.prompt?.prompt).toContain('placeholder');
        // tools ride as inline CLIENT tools that block on (and then speak) their results
        expect(body.conversationConfig.agent?.prompt?.tools).toEqual([
            {
                type: 'client',
                name: 'get_weather',
                description: 'Get the weather for a city',
                // typed nodes without a description get one synthesized (their schema model
                // requires a marker on every value-typed node, root object included)
                parameters: { type: 'object', description: 'An object value.', properties: { city: { type: 'string', description: 'A string value.' } } },
                expectsResponse: true,
                responseTimeoutSecs: 120,
            },
        ]);
        expect(driver.SignedUrlMints).toEqual(['agent_created_001']);
    });

    it('reuses an existing managed agent untouched when tools and override enablement match', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];

        const cfg = await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.CreateBodies).toEqual([]);
        expect(driver.UpdateCalls).toEqual([]);
        expect(cfg.SessionConfig['agentId']).toBe('agent_existing_7');
    });

    it('matches the tool fingerprint ORDER-INSENSITIVELY', async () => {
        const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL, toolB] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [toolB, WEATHER_TOOL] }));
        expect(driver.UpdateCalls).toEqual([]);
    });

    it('PATCHes the managed agent when the tool set drifted', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        expect(driver.UpdateCalls[0].agentId).toBe('agent_existing_7');
        expect(driver.UpdateCalls[0].body.conversationConfig?.agent?.prompt?.tools).toHaveLength(1);
    });

    /**
     * Regression guard for issue #3374. Every agent provisioned BEFORE per-session voice shipped
     * enables the prompt override and nothing else. Because the drift check used to test only the
     * prompt override, such an agent matched on tools + prompt and was never PATCHed — so enabling
     * `tts.voiceId` in the create/update body alone would have been a silent no-op on every
     * existing deployment, and the voice sent with each session would be dropped by the platform.
     */
    it('PATCHes an agent provisioned BEFORE per-session voice (prompt override on, voice override missing)', async () => {
        driver.Agents = [
            makeAgentDetail({
                agentId: 'agent_existing_7',
                name: 'MJ Realtime Co-Agent',
                tools: [WEATHER_TOOL],
                voiceOverrideEnabled: false,
            }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        const enabled = driver.UpdateCalls[0].body.platformSettings?.overrides?.conversationConfigOverride;
        expect(enabled?.tts?.voiceId).toBe(true);
        expect(enabled?.agent?.prompt?.prompt).toBe(true); // the prompt override is not lost in the repair
    });

    /**
     * Pins the two halves of the override contract together: whatever `buildAgentBody` WRITES
     * must satisfy the `OverridesSatisfied` drift check that READS it. Enable an override on
     * one side only and this fails — as a create-then-PATCH-forever loop on every session,
     * which is the loud version of the silent bug in #3374.
     */
    it('considers an agent this driver just provisioned already satisfied (no PATCH loop)', async () => {
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        const written = driver.CreateBodies[0].platformSettings?.overrides?.conversationConfigOverride;
        expect(written).toBeDefined();

        // serve that exact enablement back as a pre-existing agent
        const second = new TestElevenLabsRealtime('fake-api-key');
        const provisioned = makeAgentDetail({ agentId: 'agent_x', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] });
        provisioned.platformSettings = { overrides: { conversationConfigOverride: written } };
        second.Agents = [provisioned];

        await second.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(second.UpdateCalls).toEqual([]);
    });

    /**
     * The #3374 guard, generalised. For EVERY override `buildAgentBody` writes, an agent missing
     * just that one must be repaired — otherwise the write side can declare an override the drift
     * check does not require, and already-deployed agents silently drop it forever (exactly the
     * original defect, which enabled `tts.voiceId` on new agents while never repairing old ones).
     *
     * Driven off what the driver actually wrote, so a newly-added override is covered
     * automatically: add one to the enablement without teaching `OverridesSatisfied` about it and
     * this fails.
     */
    it('repairs an agent missing ANY single required override', async () => {
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        const written = driver.CreateBodies[0].platformSettings?.overrides?.conversationConfigOverride;
        const paths = enabledLeafPaths(written);
        expect(paths.length).toBeGreaterThan(1); // prompt + voice at minimum

        for (const path of paths) {
            const fresh = new TestElevenLabsRealtime('fake-api-key');
            const stale = makeAgentDetail({ agentId: 'agent_x', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] });
            stale.platformSettings = {
                overrides: { conversationConfigOverride: withLeafDisabled(written ?? {}, path) },
            };
            fresh.Agents = [stale];

            await fresh.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

            expect(fresh.UpdateCalls, `override '${path.join('.')}' is written but never required`).toHaveLength(1);
        }
    });

    it('sends the per-session llm override when the config bag carries one (#3859)', () => {
        const overrides = ElevenLabsRealtime.BuildSessionOverrides('be the interviewer', { llm: 'gemini-2.5-pro' });
        expect((overrides['agent'] as Record<string, unknown>)['prompt'])
            .toEqual({ prompt: 'be the interviewer', llm: 'gemini-2.5-pro' });
    });

    it('omits llm entirely when unconfigured — the frame is byte-for-byte what it was (#3859)', () => {
        const overrides = ElevenLabsRealtime.BuildSessionOverrides('be the interviewer', {});
        expect((overrides['agent'] as Record<string, unknown>)['prompt']).toEqual({ prompt: 'be the interviewer' });
    });

    it('re-PATCHes a deployed agent whose configured llm changed (#3859 — the never-learns defect)', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_stale_llm', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL], Config: { llm: 'gemini-2.5-pro' } }));
        expect(driver.UpdateCalls).toHaveLength(1);
        const prompt = driver.UpdateCalls[0].body.conversationConfig?.agent?.prompt;
        expect(prompt?.llm).toBe('gemini-2.5-pro');
    });

    it('re-PATCHes when the configured temperature changed, and writes it onto the agent body (#3859)', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_cold', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL], Config: { temperature: 0.7 } }));
        expect(driver.UpdateCalls).toHaveLength(1);
        expect(driver.UpdateCalls[0].body.conversationConfig?.agent?.prompt?.temperature).toBe(0.7);
    });

    it('does NOT stampede a PATCH war against a hand-tuned agent when the bag says nothing (#3859)', async () => {
        // Half the point of the managed agent is that a deployment may tune it. An unconfigured
        // desire matches anything.
        const tuned = makeAgentDetail({ agentId: 'agent_tuned', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] });
        (tuned.conversationConfig!.agent!.prompt as { llm?: string; temperature?: number }).llm = 'claude-sonnet-4';
        (tuned.conversationConfig!.agent!.prompt as { llm?: string; temperature?: number }).temperature = 0.4;
        driver.Agents = [tuned];
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        expect(driver.UpdateCalls).toEqual([]);
    });

    it('a config llm change inside ONE process is not served from the ensure cache (#3859)', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_cached', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        const listsAfterFirst = driver.ListCalls.length;
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL], Config: { llm: 'gemini-2.5-pro' } }));
        // The second session must go back to REST — the cache key carries the desired settings.
        expect(driver.ListCalls.length).toBeGreaterThan(listsAfterFirst);
        expect(driver.UpdateCalls).toHaveLength(1);
    });

    it('PATCHes the managed agent when the prompt override is not enabled', async () => {
        driver.Agents = [
            makeAgentDetail({
                agentId: 'agent_existing_7',
                name: 'MJ Realtime Co-Agent',
                tools: [WEATHER_TOOL],
                promptOverrideEnabled: false,
            }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        expect(
            driver.UpdateCalls[0].body.platformSettings?.overrides?.conversationConfigOverride?.agent?.prompt?.prompt
        ).toBe(true);
    });

    it('ignores exact-name-but-different agents and non-client tools when fingerprinting', async () => {
        const detail = makeAgentDetail({ agentId: 'agent_x', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] });
        // graft a deployment-side webhook tool next to the managed client tools
        detail.conversationConfig.agent?.prompt?.tools?.push({
            type: 'webhook',
        } as ElevenLabs.PromptAgentApiModelOutputToolsItem.Webhook);
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_other', name: 'MJ Realtime Co-Agent (staging)', tools: [] }),
            detail,
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.GetCalls).toEqual(['agent_x']); // exact-name match only
        expect(driver.UpdateCalls).toEqual([]); // webhook tool did not poison the fingerprint
    });

    /**
     * Live-verified defect: ElevenLabs' agent search is EVENTUALLY CONSISTENT. A single
     * find-by-name miss made the ensure flow conclude the agent did not exist and CREATE one,
     * forking a duplicate managed agent — observed live, twice, against a real account.
     * The miss must be retried before concluding absence.
     */
    it('ADOPTS an existing agent the search missed at first, instead of creating a duplicate', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];
        driver.SearchMissesBeforeHit = 1; // first lookup returns nothing, the retry finds it

        const cfg = await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.CreateBodies).toEqual([]); // NO duplicate agent
        expect(cfg.SessionConfig['agentId']).toBe('agent_existing_7');
        expect(driver.ListCalls.length).toBeGreaterThan(1); // it actually retried
    });

    it('gives up retrying and creates EXACTLY ONE agent when the name genuinely does not exist', async () => {
        driver.SearchMissesBeforeHit = Number.MAX_SAFE_INTEGER; // search never returns anything

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.CreateBodies).toHaveLength(1); // bounded: one create, never a loop
        expect(driver.ListCalls.length).toBeLessThanOrEqual(5); // and a small, capped number of lookups
    });

    it('adopts the OLDEST agent when duplicates share the name, so every process converges', async () => {
        // a duplicate pair as left behind by the pre-fix race; listed newest-first
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_newer', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL], createdAtUnixSecs: 200 }),
            makeAgentDetail({ agentId: 'agent_older', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL], createdAtUnixSecs: 100 }),
        ];

        const cfg = await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(cfg.SessionConfig['agentId']).toBe('agent_older');
        expect(driver.CreateBodies).toEqual([]);
    });

    it('caches the ensure result per name + tool fingerprint (no repeat REST round-trips)', async () => {
        driver.Agents = [
            makeAgentDetail({ agentId: 'agent_existing_7', name: 'MJ Realtime Co-Agent', tools: [WEATHER_TOOL] }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        expect(driver.ListCalls).toHaveLength(1);

        // a DIFFERENT tool set re-runs the ensure flow
        await driver.CreateClientSession(makeParams({ Tools: [] }));
        expect(driver.ListCalls).toHaveLength(2);
        expect(driver.UpdateCalls).toHaveLength(1);
    });

    /**
     * Two sessions opening AT ONCE on one driver against a not-yet-provisioned agent name must
     * provision ONE agent, not one each.
     *
     * The ensure cache stores the RESOLVED agent id, so it is only populated after the whole
     * find-create round-trip finishes. Both callers therefore used to miss the cache, both find
     * nothing, and both create — forking a duplicate that then competes for the name forever.
     * This is the intra-process half of the fork {@link ElevenLabsRealtime.findAgentByName}
     * guards against across processes, and unlike that one it is fully closable here: the
     * in-flight ensure is itself what the second caller should await.
     *
     * Not a contrived race — a server opening several realtime sessions the moment a new managed
     * agent name appears is the ordinary case.
     */
    it('provisions ONE agent when two sessions ensure the same new name concurrently', async () => {
        const [first, second] = await Promise.all([
            driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] })),
            driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] })),
        ]);

        expect(driver.CreateBodies).toHaveLength(1);
        expect((first.SessionConfig as { agentId: string }).agentId).toBe(
            (second.SessionConfig as { agentId: string }).agentId
        );
    });

    /**
     * A transient REST failure must not disable the managed agent for the life of the process.
     *
     * The ensure cache stores the in-flight PROMISE (so concurrent callers can join it), which
     * means a REJECTED ensure is a cache entry too — and every later session for that name would
     * replay the same stale failure forever, from memory, without ever retrying the API. One
     * blipped request would take the agent down until restart. The failed entry must be evicted.
     */
    it('retries after a transient ensure failure instead of caching the rejection', async () => {
        class FlakyElevenLabsRealtime extends TestElevenLabsRealtime {
            public FailNextList = true;
            protected override async listAgents(search: string): Promise<ElevenLabs.AgentSummaryResponseModel[]> {
                if (this.FailNextList) {
                    this.FailNextList = false;
                    throw new Error('ElevenLabs REST 503: temporarily unavailable');
                }
                return super.listAgents(search);
            }
        }
        const flaky = new FlakyElevenLabsRealtime('fake-api-key');

        await expect(flaky.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }))).rejects.toThrow(
            /temporarily unavailable/
        );

        // the blip is over — the next session must reach the API again, not replay the rejection
        const cfg = await flaky.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));
        expect((cfg.SessionConfig as { agentId: string }).agentId).toBe('agent_created_001');
    });
});

/* ------------------------------------------------------------------ */
/*  Client-direct minting                                              */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime client-direct (CreateClientSession)', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('advertises client-direct support', () => {
        expect(driver.SupportsClientDirect).toBe(true);
    });

    it('mints a well-formed config: provider, model, signed URL as the token, ~15-minute expiry', async () => {
        const before = Date.now();
        const cfg = await driver.CreateClientSession(makeParams());
        const after = Date.now();

        expect(cfg.Provider).toBe('elevenlabs');
        expect(cfg.Model).toBe('MJ Realtime Co-Agent');
        expect(cfg.EphemeralToken).toBe(
            'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_created_001&token=signed-token'
        );
        const expires = new Date(cfg.ExpiresAt).getTime();
        expect(expires).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
        expect(expires).toBeLessThanOrEqual(after + 15 * 60 * 1000);
    });

    it('packs the pact SessionConfig: agentId + wire-shaped prompt override + Config passthrough', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voiceHint: 'warm' } }));

        expect(cfg.SessionConfig).toEqual({
            agentId: 'agent_created_001',
            overrides: { agent: { prompt: { prompt: 'You are the session voice.' } } },
            config: { voiceHint: 'warm' },
        });
    });
});

/* ------------------------------------------------------------------ */
/*  Per-session voice (issue #3374)                                    */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime per-session voice', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('carries the configured voice as a RAW-WIRE tts.voice_id override alongside the prompt', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voice: '21m00Tcm4TlvDq8ikWAM' } }));

        expect(cfg.SessionConfig['overrides']).toEqual({
            ...promptOnlyOverrides(),
            // snake_case: this object is forwarded VERBATIM onto the websocket by the client
            // driver, never through the SDK's camelCase serializer
            tts: { voice_id: '21m00Tcm4TlvDq8ikWAM' },
        });
    });

    it('leaves a voice-less session byte-for-byte as it was before per-session voice existed', async () => {
        const cfg = await driver.CreateClientSession(makeParams());

        expect(cfg.SessionConfig['overrides']).toEqual(promptOnlyOverrides());
    });

    it('reads the DRIVER-NEUTRAL `voice` key, the same one AssemblyAI and Inworld read', async () => {
        // `voiceId` is NOT the contract — a bag carrying only it must not silently half-work
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voiceId: 'ignored_key' } }));

        expect(cfg.SessionConfig['overrides']).toEqual(promptOnlyOverrides());
    });

    it.each([
        ['a blank string', '   '],
        ['an empty string', ''],
        ['a non-string', 42],
        ['null', null],
    ])('omits the tts override entirely when the voice is %s', async (_label, voice) => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voice } }));

        expect(cfg.SessionConfig['overrides']).toEqual(promptOnlyOverrides());
    });

    it('trims a padded voice id', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { voice: '  voice_abc  ' } }));

        expect(cfg.SessionConfig['overrides']).toEqual({ ...promptOnlyOverrides(), tts: { voice_id: 'voice_abc' } });
    });

    it('sends the SAME voice override on the server-bridged initiation frame (topology parity)', async () => {
        await startSession(driver, { Config: { voice: 'voice_abc' } });

        expect(driver.Socket.SentFrames()[0]).toEqual({
            type: 'conversation_initiation_client_data',
            conversation_config_override: { ...promptOnlyOverrides(), tts: { voice_id: 'voice_abc' } },
        });
    });

    it('does not vary the MANAGED AGENT by voice — voice is per-session, so one agent is shared', async () => {
        await driver.CreateClientSession(makeParams({ Config: { voice: 'voice_a' } }));
        const lookupsAfterFirst = driver.ListCalls.length;
        await driver.CreateClientSession(makeParams({ Config: { voice: 'voice_b' } }));

        // one agent, and the differing voice re-ensures NOTHING: a per-session override must
        // never fan out managed agents nor re-hit the REST surface
        expect(driver.CreateBodies).toHaveLength(1);
        expect(driver.ListCalls).toHaveLength(lookupsAfterFirst);
    });
});

/* ------------------------------------------------------------------ */
/*  Per-session first message (issue #3557)                            */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime per-session first message', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('carries the configured first message as a RAW-WIRE agent.first_message override alongside the prompt', async () => {
        const cfg = await driver.CreateClientSession(
            makeParams({ Config: { firstMessage: 'Hi, thanks for joining — ready when you are.' } })
        );

        // snake_case AND nested beside `prompt`: this object is forwarded VERBATIM onto the
        // websocket, never through the SDK's camelCase serializer
        expect(cfg.SessionConfig['overrides']).toEqual(
            promptAndFirstMessageOverrides('Hi, thanks for joining — ready when you are.')
        );
    });

    it('leaves a first-message-less session byte-for-byte as it was before this existed', async () => {
        const cfg = await driver.CreateClientSession(makeParams());

        expect(cfg.SessionConfig['overrides']).toEqual(promptOnlyOverrides());
    });

    it.each([
        ['a blank string', '   '],
        ['an empty string', ''],
        ['a non-string', 42],
        ['null', null],
    ])('omits the first_message override entirely when it is %s', async (_label, firstMessage) => {
        // an ENABLED-but-empty first_message is exactly the platform's wait-for-user default, so
        // sending one is at best noise — omit the key instead
        const cfg = await driver.CreateClientSession(makeParams({ Config: { firstMessage } }));

        expect(cfg.SessionConfig['overrides']).toEqual(promptOnlyOverrides());
    });

    it('trims a padded first message', async () => {
        const cfg = await driver.CreateClientSession(makeParams({ Config: { firstMessage: '  Hello there.  ' } }));

        expect(cfg.SessionConfig['overrides']).toEqual(promptAndFirstMessageOverrides('Hello there.'));
    });

    it('sends the SAME first-message override on the server-bridged initiation frame (topology parity)', async () => {
        await startSession(driver, { Config: { firstMessage: 'Hello there.' } });

        expect(driver.Socket.SentFrames()[0]).toEqual({
            type: 'conversation_initiation_client_data',
            conversation_config_override: promptAndFirstMessageOverrides('Hello there.'),
        });
    });

    it('composes with the voice override rather than displacing it', async () => {
        const cfg = await driver.CreateClientSession(
            makeParams({ Config: { firstMessage: 'Hello there.', voice: 'voice_abc' } })
        );

        expect(cfg.SessionConfig['overrides']).toEqual({
            ...promptAndFirstMessageOverrides('Hello there.'),
            tts: { voice_id: 'voice_abc' },
        });
    });

    it('ENABLES the first-message override on the managed agent it provisions', async () => {
        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        // ElevenLabs DROPS any override the agent has not explicitly allowed, so the enablement
        // must be written even for sessions that send no first message
        expect(
            driver.CreateBodies[0].platformSettings?.overrides?.conversationConfigOverride?.agent?.firstMessage
        ).toBe(true);
    });

    it('does not vary the MANAGED AGENT by first message — it is per-session, so one agent is shared', async () => {
        await driver.CreateClientSession(makeParams({ Config: { firstMessage: 'Greeting A' } }));
        const lookupsAfterFirst = driver.ListCalls.length;
        await driver.CreateClientSession(makeParams({ Config: { firstMessage: 'Greeting B' } }));

        expect(driver.CreateBodies).toHaveLength(1);
        expect(driver.ListCalls).toHaveLength(lookupsAfterFirst);
    });

    /**
     * The #3374 failure mode, one override later. Every agent provisioned before this change
     * enables prompt + voice and nothing else; unless `OverridesSatisfied` REQUIRES the new
     * override, such an agent still matches on tools and is never re-PATCHed — so the platform
     * silently drops the first message forever on every existing deployment.
     */
    it('PATCHes an agent provisioned BEFORE per-session first message (prompt + voice on, firstMessage missing)', async () => {
        driver.Agents = [
            makeAgentDetail({
                agentId: 'agent_existing_7',
                name: 'MJ Realtime Co-Agent',
                tools: [WEATHER_TOOL],
                firstMessageOverrideEnabled: false,
            }),
        ];

        await driver.CreateClientSession(makeParams({ Tools: [WEATHER_TOOL] }));

        expect(driver.UpdateCalls).toHaveLength(1);
        const enabled = driver.UpdateCalls[0].body.platformSettings?.overrides?.conversationConfigOverride;
        expect(enabled?.agent?.firstMessage).toBe(true);
        // the overrides that were already enabled are not lost in the repair
        expect(enabled?.agent?.prompt?.prompt).toBe(true);
        expect(enabled?.tts?.voiceId).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Server-bridged session                                             */
/* ------------------------------------------------------------------ */

describe('ElevenLabsRealtime server-bridged session (StartSession)', () => {
    let driver: TestElevenLabsRealtime;

    beforeEach(() => {
        driver = new TestElevenLabsRealtime('fake-api-key');
    });

    it('sends the initiation frame with the per-session prompt override before anything else', async () => {
        await startSession(driver);
        expect(driver.Socket.SentFrames()[0]).toEqual({
            type: 'conversation_initiation_client_data',
            conversation_config_override: { agent: { prompt: { prompt: 'You are the session voice.' } } },
        });
    });

    it('resolves ONLY after the initiation metadata confirms the session config is applied', async () => {
        let resolved = false;
        const promise = driver.StartSession(makeParams()).then((s) => {
            resolved = true;
            return s;
        });
        await flushAsync();
        expect(resolved).toBe(false); // socket open + init sent, but no metadata yet

        driver.Emit(metadataEvent());
        await promise;
        expect(resolved).toBe(true);
    });

    it('rejects StartSession when the transport dies before the metadata arrives', async () => {
        const promise = driver.StartSession(makeParams());
        await flushAsync();
        driver.LastConnectArgs?.OnClose(1011, 'server error');

        await expect(promise).rejects.toThrow('closed unexpectedly');
    });

    it('injects InitialContext as a contextual_update once the metadata arrives', async () => {
        await startSession(driver, { InitialContext: 'Prior conversation: the user likes brevity.' });
        expect(driver.Socket.SentFrames().at(-1)).toEqual({
            type: 'contextual_update',
            text: 'Prior conversation: the user likes brevity.',
        });
    });

    describe('event matrix', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await startSession(driver, { Tools: [WEATHER_TOOL] });
        });

        it('forwards audio events as raw ArrayBuffers', () => {
            const { outputs } = collect(session);
            const bytes = new Uint8Array([1, 2, 3, 4]);
            driver.Emit({
                type: 'audio',
                audio_event: { audio_base_64: Buffer.from(bytes).toString('base64'), event_id: 1 },
            });

            expect(outputs).toHaveLength(1);
            expect(new Uint8Array(outputs[0])).toEqual(bytes);
        });

        it('emits user_transcript and agent_response as FINAL transcripts (no deltas on this provider)', () => {
            const { transcripts } = collect(session);
            driver.Emit({ type: 'user_transcript', user_transcription_event: { user_transcript: 'what is MJ?' } });
            driver.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'MJ is a platform.' } });

            expect(transcripts).toEqual([
                { Role: 'user', Text: 'what is MJ?', IsFinal: true },
                { Role: 'assistant', Text: 'MJ is a platform.', IsFinal: true },
            ]);
        });

        it('re-finalizes the assistant turn from agent_response_correction (post-barge-in truncation)', () => {
            const { transcripts } = collect(session);
            driver.Emit({
                type: 'agent_response_correction',
                agent_response_correction_event: {
                    original_agent_response: 'long answer that was cut',
                    corrected_agent_response: 'long answer',
                },
            });
            expect(transcripts).toEqual([{ Role: 'assistant', Text: 'long answer', IsFinal: true }]);
        });

        it('surfaces client_tool_call with JSON-string arguments', () => {
            const { toolCalls } = collect(session);
            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'call-1', parameters: { city: 'NYC' } },
            });
            expect(toolCalls).toEqual([{ CallID: 'call-1', ToolName: 'get_weather', Arguments: '{"city":"NYC"}' }]);
        });

        it('surfaces interruption (true barge-in) to the consumer', () => {
            const { interruptions } = collect(session);
            driver.Emit({ type: 'interruption', interruption_event: { event_id: 5 } });
            expect(interruptions).toHaveLength(1);
        });

        it("answers every ping with a pong echoing the ping's event_id", () => {
            driver.Emit({ type: 'ping', ping_event: { event_id: 42, ping_ms: 50 } });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'pong', event_id: 42 });
        });

        it('ignores vad_score and unknown frame types', () => {
            const { transcripts, errors } = collect(session);
            const framesBefore = driver.Socket.Sent.length;
            driver.Emit({ type: 'vad_score', vad_score_event: { vad_score: 0.93 } });
            driver.Emit({ type: 'sparkly_future_event' });
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
            expect(driver.Socket.Sent.length).toBe(framesBefore);
        });
    });

    describe('outbound actions', () => {
        let session: IRealtimeSession;

        beforeEach(async () => {
            session = await startSession(driver, { Tools: [WEATHER_TOOL] });
        });

        it('streams client audio as bare-key user_audio_chunk frames', () => {
            const bytes = new Uint8Array([9, 8, 7]);
            session.SendInput(bytes.buffer);
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                user_audio_chunk: Buffer.from(bytes).toString('base64'),
            });
        });

        it('completes the tool round-trip: client_tool_call → client_tool_result with parsed JSON', async () => {
            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'call-1', parameters: { city: 'NYC' } },
            });

            await session.SendToolResult('call-1', JSON.stringify({ tempF: 72 }));

            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'client_tool_result',
                tool_call_id: 'call-1',
                result: { tempF: 72 },
                is_error: false,
            });
        });

        it('passes non-JSON tool output through as a raw string', async () => {
            await session.SendToolResult('call-2', 'plain text outcome');
            expect(driver.Socket.SentFrames().at(-1)?.result).toBe('plain text outcome');
        });

        it('sends context notes as NATIVE contextual_update frames, immediately even mid-response', () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } }); // response in flight
            session.SendContextNote?.('[delegated-agent progress] gathering data');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'contextual_update',
                text: '[delegated-agent progress] gathering data',
            });
        });

        it('emulates RequestSpokenUpdate as a user_message when idle', () => {
            session.RequestSpokenUpdate?.('Say one short progress sentence.');
            expect(driver.Socket.SentFrames().at(-1)).toEqual({
                type: 'user_message',
                text: 'Say one short progress sentence.',
            });
        });

        it('QUEUES a spoken update behind an in-flight response and flushes on agent_response_complete', () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } });
            const framesBefore = driver.Socket.Sent.length;

            session.RequestSpokenUpdate?.('working on it');
            expect(driver.Socket.Sent.length).toBe(framesBefore); // deferred — never barges in

            driver.Emit({ type: 'agent_response_complete' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'working on it' });
        });

        it('releases the busy flag on a tool-call frame WITHOUT draining queued narration (deadlock guard)', async () => {
            driver.Emit({ type: 'audio', audio_event: { audio_base_64: 'AAAA', event_id: 1 } });
            session.RequestSpokenUpdate?.('narrate later'); // queued behind the response

            driver.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'c1', parameters: {} },
            });
            // the queued narration must NOT slip in between the tool call and its result
            expect(driver.Socket.SentFrames().filter((f) => f.type === 'user_message')).toHaveLength(0);

            // the tool result is never queued — the platform asked for it and blocks on it
            await session.SendToolResult('c1', '{"ok":true}');
            expect(driver.Socket.SentFrames().at(-1)?.type).toBe('client_tool_result');

            // the narration drains at the next real response boundary
            driver.Emit({ type: 'agent_response_complete' });
            expect(driver.Socket.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'narrate later' });
        });
    });

    describe('RegisterTools idempotency', () => {
        it('no-ops silently for a set identical (order-insensitively) to the connect-time set', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const toolB: RealtimeToolDefinition = { Name: 'b_tool', Description: 'b', ParametersSchema: {} };
                const session = await startSession(driver, { Tools: [WEATHER_TOOL, toolB] });
                const framesBefore = driver.Socket.Sent.length;

                await session.RegisterTools([toolB, WEATHER_TOOL]);

                expect(warn).not.toHaveBeenCalled();
                expect(driver.Socket.Sent.length).toBe(framesBefore);
            } finally {
                warn.mockRestore();
            }
        });

        it('warns and does nothing for a DIFFERENT post-start set', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                const session = await startSession(driver, { Tools: [WEATHER_TOOL] });
                const framesBefore = driver.Socket.Sent.length;

                await session.RegisterTools([]);

                expect(warn).toHaveBeenCalledOnce();
                expect(driver.Socket.Sent.length).toBe(framesBefore);
            } finally {
                warn.mockRestore();
            }
        });
    });

    describe('error fatality and close semantics', () => {
        it('surfaces a websocket error as a FATAL session error', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            driver.LastConnectArgs?.OnError('socket exploded');

            expect(errors).toEqual([{ Message: 'socket exploded', Fatal: true }]);
        });

        it('surfaces an UNEXPECTED close as a FATAL error with the close detail', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            driver.LastConnectArgs?.OnClose(4001, 'token expired');

            expect(errors).toEqual([
                { Message: 'ElevenLabs conversation closed unexpectedly (code 4001 — token expired)', Fatal: true },
            ]);
        });

        it('stays silent when the close follows a consumer Close()', async () => {
            const session = await startSession(driver);
            const { errors } = collect(session);

            await session.Close();
            driver.LastConnectArgs?.OnClose(1000, 'bye');

            expect(errors).toEqual([]);
            expect(driver.Socket.Closed).toBe(true);
        });
    });
});

// ── Schema sanitization (ElevenLabs client-tool validator quirks) ──────────────
import { SanitizeToolParametersForElevenLabs } from '../elevenLabsRealtime';

describe('SanitizeToolParametersForElevenLabs', () => {
    const fontSizeSchema = {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The text.' },
            fontSize: { type: 'number', enum: [12, 14, 18, 24, 32], description: 'Optional size.' }
        },
        required: ['text']
    };

    it('strips numeric enums and appends the allowed values to the description', () => {
        const out = SanitizeToolParametersForElevenLabs(fontSizeSchema);
        const fontSize = (out['properties'] as Record<string, Record<string, unknown>>)['fontSize'];
        expect(fontSize['enum']).toBeUndefined();
        expect(fontSize['description']).toContain('Optional size.');
        expect(fontSize['description']).toContain('Allowed values: 12, 14, 18, 24, 32');
    });

    it('preserves STRING enums untouched', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: { shape: { type: 'string', enum: ['rect', 'ellipse', 'diamond'] } }
        });
        const shape = (out['properties'] as Record<string, Record<string, unknown>>)['shape'];
        expect(shape['enum']).toEqual(['rect', 'ellipse', 'diamond']);
    });

    it('walks nested objects and array items', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                rows: { type: 'array', items: { type: 'object', properties: { size: { type: 'number', enum: [1, 2] } } } }
            }
        });
        const size = ((((out['properties'] as Record<string, Record<string, unknown>>)['rows']['items'] as Record<string, unknown>)['properties'] as Record<string, Record<string, unknown>>))['size'];
        expect(size['enum']).toBeUndefined();
        expect(size['description']).toContain('Allowed values: 1, 2');
    });

    it('never mutates the input and is idempotent', () => {
        const original = JSON.parse(JSON.stringify(fontSizeSchema));
        const once = SanitizeToolParametersForElevenLabs(fontSizeSchema);
        const twice = SanitizeToolParametersForElevenLabs(once);
        expect(fontSizeSchema).toEqual(original);
        expect(twice).toEqual(once);
    });

    it('MapToolToClientTool ships the SANITIZED schema to the agents API', () => {
        const mapped = ElevenLabsRealtime.MapToolToClientTool({
            Name: 'Whiteboard_AddText',
            Description: 'Add text',
            ParametersSchema: fontSizeSchema
        });
        const params = mapped.parameters as unknown as Record<string, Record<string, Record<string, unknown>>>;
        expect(params['properties']['fontSize']['enum']).toBeUndefined();
        expect(params['properties']['fontSize']['description']).toContain('Allowed values');
    });

    /**
     * Live-verified defect: ElevenLabs REORDERS schema keys on round-trip (a schema sent as
     * `{type, properties}` comes back `{description, type, properties}`). Fingerprinting a
     * key-order-sensitive `JSON.stringify` therefore reported permanent drift and re-PATCHed
     * the agent on EVERY session.
     */
    it('is insensitive to JSON key ORDER (the remote reorders schema keys)', () => {
        const sent = { type: 'object', description: 'A thing.', properties: { city: { type: 'string', description: 'City.' } } };
        const returned = { description: 'A thing.', properties: { city: { description: 'City.', type: 'string' } }, type: 'object' };

        expect(ElevenLabsRealtime.ToolSetFingerprint([{ Name: 'T', Description: 'd', ParametersSchema: sent }]))
            .toBe(ElevenLabsRealtime.ToolSetFingerprint([{ Name: 'T', Description: 'd', ParametersSchema: returned }]));
    });

    /**
     * Live-verified defect (the real shape, captured from a round-tripped agent): ElevenLabs
     * MATERIALIZES its own defaults into the stored schema — `dynamic_variable: ""`,
     * `is_omitted: false`, `required: []`, `isSystemProvided: false`, `constantValue: ""` …
     * The stored form is a SUPERSET of what we sent, so equality on the raw form reports drift
     * forever and re-PATCHes the agent on every session.
     */
    it('ignores the empty defaults ElevenLabs materializes into the stored schema', () => {
        const sent = { type: 'object', properties: { city: { type: 'string', description: 'A string value.' } }, description: 'An object value.' };
        const stored = {
            description: 'An object value.', dynamic_variable: '', is_omitted: false, type: 'object', required: [],
            properties: { city: { type: 'string', description: 'A string value.', isSystemProvided: false,
                dynamicVariable: '', allowed_values_dynamic_variable: '', constantValue: '', is_omitted: false } },
        };

        expect(ElevenLabsRealtime.ToolSetFingerprint([{ Name: 'T', Description: 'd', ParametersSchema: stored }]))
            .toBe(ElevenLabsRealtime.ToolSetFingerprint([{ Name: 'T', Description: 'd', ParametersSchema: sent }]));
    });

    /**
     * Bounds the pruning above. `isMaterializedDefault` matches on the VALUE (`''`/`false`/`[]`),
     * not on a list of platform field names, so it also prunes meaningful entries that happen to
     * hold one — `additionalProperties: false` among them. That costs sensitivity to an entry's
     * PRESENCE, which is accepted and documented; it must NOT cost sensitivity to an entry's
     * VALUE, or a genuine schema change would stop triggering the repair PATCH.
     */
    it('still DISTINGUISHES a meaningful value change even when one side prunes (false → true)', () => {
        const fp = (additionalProperties: boolean): string => ElevenLabsRealtime.ToolSetFingerprint([
            { Name: 'T', Description: 'd', ParametersSchema: { type: 'object', additionalProperties, properties: {} } },
        ]);
        expect(fp(false)).not.toBe(fp(true));
    });

    it('still DISTINGUISHES schemas that differ only in ARRAY order (arrays are data, not sets)', () => {
        const fp = (values: string[]): string => ElevenLabsRealtime.ToolSetFingerprint([
            { Name: 'T', Description: 'd', ParametersSchema: { type: 'object', properties: { shape: { type: 'string', enum: values } } } },
        ]);
        // a reordered enum is a genuinely different schema — canonicalization must not erase it
        expect(fp(['rect', 'ellipse'])).not.toBe(fp(['ellipse', 'rect']));
    });

    it('ToolSetFingerprint hashes the sanitized form (no PATCH-loop drift vs the remote)', () => {
        const raw = [{ Name: 'T', Description: 'd', ParametersSchema: fontSizeSchema }];
        const sanitized = [{ Name: 'T', Description: 'd', ParametersSchema: SanitizeToolParametersForElevenLabs(fontSizeSchema) }];
        expect(ElevenLabsRealtime.ToolSetFingerprint(raw)).toBe(ElevenLabsRealtime.ToolSetFingerprint(sanitized));
    });
});

describe('SanitizeToolParametersForElevenLabs — leaf descriptions', () => {
    it('synthesizes a description on typed nodes lacking one (the Highlight itemIds.items 422)', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                itemIds: { type: 'array', items: { type: 'string' }, description: 'IDs of items.' }
            }
        });
        const items = ((out['properties'] as Record<string, Record<string, unknown>>)['itemIds']['items']) as Record<string, unknown>;
        expect(items['description']).toBe('A string value.');
        // the parent already had one — untouched
        expect((out['properties'] as Record<string, Record<string, unknown>>)['itemIds']['description']).toBe('IDs of items.');
    });

    it('leaves nodes with any accepted marker untouched', () => {
        const out = SanitizeToolParametersForElevenLabs({
            type: 'object',
            properties: {
                a: { type: 'string', description: 'has one' },
                b: { type: 'number', constant_value: 5 }
            }
        });
        const props = out['properties'] as Record<string, Record<string, unknown>>;
        expect(props['a']['description']).toBe('has one');
        expect(props['b']['description']).toBeUndefined();
    });
});
