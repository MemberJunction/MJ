/**
 * Stage 1 Behavior-Pinning Suite: Prompt Byte-for-Byte Snapshot Check.
 *
 * Drives REAL BaseAgent prompt assembly (`preparePromptParams`, `gatherPromptTemplateData`,
 * `InjectAgentPersonaAndInstructions`, `assembleOutgoingMessages`, `buildVolatileStateMessage`)
 * and renders the real Loop system prompt template across a fixed 4-agent corpus:
 *   1. `loop-standard`        — standard Loop agent with actions, sub-agents, payload, scratchpad
 *   2. `loop-persona-derived` — derived instance (Pepper -> Chief of Staff) with Persona, stacked
 *                               AdditionalInstructions, and active skills catalog
 *   3. `loop-native-only`     — native-only implicit-control-flow agent with native tool schemas
 *   4. `flow-step-prompt`     — Flow step prompt (direct child prompt without system prompt)
 *
 * Locks exact byte-for-byte identity (via committed snapshots + SHA-256) and verifies
 * static-prefix-first / volatile-tail-last ordering so prompt-prefix caching can NEVER silently
 * drift across Stage 2 helper extraction PRs.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import '../agent-types/loop-agent-type';
import '../agent-types/flow-agent-type';
import { RUNTIME_STATE_TAG } from '../constants';
import type { ChatMessage } from '@memberjunction/ai';
import type {
    AgentConfiguration,
    AIPromptParams,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentPersonaEntity, MJAIAgentTypeEntity, MJAIPersonaEntity } from '@memberjunction/core-entities';
import type { EffectiveAgentPersona } from '@memberjunction/ai-engine-base';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

const CORPUS_IDS = {
    LOOP_TYPE: 'a1000000-0000-4000-8000-000000000001',
    FLOW_TYPE: 'a1000000-0000-4000-8000-000000000002',
    SYS_PROMPT: 'a2000000-0000-4000-8000-000000000001',
    CHILD_PROMPT: 'a2000000-0000-4000-8000-000000000002',
    FLOW_CHILD_PROMPT: 'a2000000-0000-4000-8000-000000000003',
    STD_AGENT: 'a3000000-0000-4000-8000-000000000001',
    COS_ROOT: 'a3000000-0000-4000-8000-000000000002',
    PEPPER_AGENT: 'a3000000-0000-4000-8000-000000000003',
    NATIVE_AGENT: 'a3000000-0000-4000-8000-000000000004',
    FLOW_AGENT: 'a3000000-0000-4000-8000-000000000005',
    SUB_AGENT: 'a3000000-0000-4000-8000-000000000006',
    ACTION_SEARCH: 'a4000000-0000-4000-8000-000000000001',
    ACTION_CREATE: 'a4000000-0000-4000-8000-000000000002',
    SKILL_BRIEF: 'a5000000-0000-4000-8000-000000000001',
    USER_ALICE: 'a6000000-0000-4000-8000-000000000001',
} as const;

const corpusCatalog = new Map<string, unknown>();

const mockAIEngine = {
    Config: vi.fn(async () => undefined),
    Agents: [] as MJAIAgentEntityExtended[],
    AgentRelationships: [],
    AgentCategories: [],
    ScopedPromptParts: [],
    ScopedPromptConfigs: [],
    AgentTypes: [
        {
            ID: CORPUS_IDS.LOOP_TYPE,
            Name: 'Loop',
            DriverClass: 'LoopAgentType',
            SystemPromptID: CORPUS_IDS.SYS_PROMPT,
            AgentPromptPlaceholder: '_AGENT_PROMPT_',
        },
        {
            ID: CORPUS_IDS.FLOW_TYPE,
            Name: 'Flow',
            DriverClass: 'FlowAgentType',
            SystemPromptID: null,
            AgentPromptPlaceholder: null,
        },
    ] as unknown as MJAIAgentTypeEntity[],
    Prompts: [
        { ID: CORPUS_IDS.SYS_PROMPT, Name: 'Loop System Prompt', EffortLevel: null },
        { ID: CORPUS_IDS.CHILD_PROMPT, Name: 'Corpus Child Prompt', EffortLevel: null },
        { ID: CORPUS_IDS.FLOW_CHILD_PROMPT, Name: 'Flow Step Prompt', EffortLevel: null },
    ],
    AgentPrompts: [],
    AgentActions: [
        { ID: 'aa-1', AgentID: CORPUS_IDS.STD_AGENT, ActionID: CORPUS_IDS.ACTION_SEARCH, Action: 'Search Records', Status: 'Active' },
        { ID: 'aa-2', AgentID: CORPUS_IDS.STD_AGENT, ActionID: CORPUS_IDS.ACTION_CREATE, Action: 'Create Summary', Status: 'Active' },
        { ID: 'aa-3', AgentID: CORPUS_IDS.PEPPER_AGENT, ActionID: CORPUS_IDS.ACTION_SEARCH, Action: 'Search Records', Status: 'Active' },
        { ID: 'aa-4', AgentID: CORPUS_IDS.NATIVE_AGENT, ActionID: CORPUS_IDS.ACTION_SEARCH, Action: 'Search Records', Status: 'Active' },
    ],
    GetSubAgents: (agentId: string) =>
        agentId === CORPUS_IDS.STD_AGENT
            ? [{ ID: CORPUS_IDS.SUB_AGENT, Name: 'Research Specialist', Description: 'Performs deep entity research', Status: 'Active' }]
            : [],
    GetAutoActivatableSkillsForAgent: () => [],
    GetSkillsForAgent: (agent: { ID: string }) =>
        agent.ID === CORPUS_IDS.PEPPER_AGENT
            ? [{ ID: CORPUS_IDS.SKILL_BRIEF, Name: 'Executive Brief', Description: 'Formats concise morning briefs', Status: 'Active' }]
            : [],
    GetClientToolsForAgent: () => [],
    GetAgentConfigurationPresets: () => [],
    GetAgentBaseCatalog: (agentId: string) => corpusCatalog.get(agentId),
    SetAgentBaseCatalog: (agentId: string, c: unknown) => {
        corpusCatalog.set(agentId, c);
    },
    ResolveAgentPersona: (agentId: string): EffectiveAgentPersona | null => {
        if (agentId !== CORPUS_IDS.PEPPER_AGENT) return null;
        return {
            Persona: { Name: 'Sage', Description: 'Executive advisor' } as MJAIPersonaEntity,
            AgentPersona: { ID: 'ap-1', AgentID: CORPUS_IDS.PEPPER_AGENT, PersonaID: 'p-1' } as MJAIAgentPersonaEntity,
            Tone: 'Crisp, analytical, direct',
            SpeakingStyle: 'Short bullet summaries',
            Voice: null,
            EffectiveVoiceID: null,
            EffectiveModelID: null,
            EffectiveVendorID: null,
            StyleOverride: null,
        };
    },
    GetStackedAdditionalInstructions: (agentId: string) => {
        if (agentId !== CORPUS_IDS.PEPPER_AGENT) return [];
        return [
            { AgentID: CORPUS_IDS.COS_ROOT, AgentName: 'Chief of Staff', Instructions: 'Cite record IDs for all facts.', IsRootOrTemplate: true },
            { AgentID: CORPUS_IDS.PEPPER_AGENT, AgentName: 'Pepper', Instructions: 'Prioritize Q4 board items.', IsRootOrTemplate: false },
        ];
    },
};

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return mockAIEngine;
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return {
                Config: async () => undefined,
                Actions: [
                    {
                        ID: CORPUS_IDS.ACTION_SEARCH,
                        Name: 'Search Records',
                        Description: 'Searches MJ entities by query text',
                        Status: 'Active',
                        Params: {
                            Items: [
                                { Name: 'Query', Type: 'Input', IsRequired: true, Description: 'Search query', ValueType: 'Scalar', IsArray: false },
                                { Name: 'Results', Type: 'Output', IsRequired: false, Description: 'Matched records', ValueType: 'Scalar', IsArray: true },
                            ],
                        },
                        ResultCodes: { Items: [] },
                    },
                    {
                        ID: CORPUS_IDS.ACTION_CREATE,
                        Name: 'Create Summary',
                        Description: 'Creates a structured executive summary',
                        Status: 'Active',
                        Params: {
                            Items: [
                                { Name: 'Title', Type: 'Input', IsRequired: true, Description: 'Summary title', ValueType: 'Scalar', IsArray: false },
                            ],
                        },
                        ResultCodes: { Items: [] },
                    },
                ],
            };
        },
    },
}));

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname_, '../../../../..');
const LOOP_TEMPLATE = readFileSync(
    join(REPO_ROOT, 'metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md'),
    'utf8',
);

function sha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

class PromptSnapshotProbe extends BaseAgent {
    protected override async loadPromptTemplateText(
        prompt: MJAIPromptEntityExtended | undefined,
    ): Promise<string | null> {
        if (prompt?.ID === CORPUS_IDS.SYS_PROMPT) {
            return LOOP_TEMPLATE;
        }
        return null;
    }

    public async BuildCorpusSnapshot(
        config: AgentConfiguration,
        payload: Record<string, unknown>,
        params: ExecuteAgentParams,
        childPromptBody: string,
        scratchpadNotes?: string,
    ): Promise<{
        systemPromptRendered: string;
        systemPromptSha256: string;
        outgoingMessages: ChatMessage[];
        toolNames: string[];
        templateRole: string | undefined;
    }> {
        if (scratchpadNotes) {
            this.scratchpadManager.SetNotes(scratchpadNotes);
        }
        this.InjectAgentPersonaAndInstructions(params.agent, params.conversationMessages, params.contextUser);
        const promptParams = await this.preparePromptParams(config, payload, params);
        // Pin date/time fields deterministically across host timezones
        if (promptParams.data) {
            promptParams.data._CURRENT_DATE = '2026-11-27';
            promptParams.data._CURRENT_DAY_OF_WEEK = 'Friday';
            promptParams.data._CURRENT_TIME = '12:00 PM UTC';
            promptParams.data.agentSpecificPrompt = childPromptBody;
        }
        const volatileMsg = await this.buildVolatileStateMessage(
            params,
            promptParams,
            payload,
            config.childPrompt,
            config.agentType,
            config.systemPrompt,
        );
        const outgoingMessages = volatileMsg
            ? this.assembleOutgoingMessages(promptParams.conversationMessages ?? params.conversationMessages, volatileMsg, false)
            : (promptParams.conversationMessages ?? []);
        // Pin any locale-dependent date/time inside volatile state message deterministically
        const normalizedOutgoing = outgoingMessages.map((m) => ({
            role: m.role,
            content:
                typeof m.content === 'string'
                    ? m.content
                          .replace(/Current Date\/Time: [^\n]+/g, 'Current Date/Time: Friday, 2026-11-27 12:00 PM UTC')
                          .replace(/\d{1,2}:\d{2}\s?[AP]M\s?[A-Z]{2,5}/g, '12:00 PM UTC')
                    : m.content,
            volatileState: Boolean((m as { metadata?: { volatileState?: boolean } }).metadata?.volatileState),
        }));

        const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false, trimBlocks: false, lstripBlocks: false });
        const systemPromptRendered = config.systemPrompt
            ? env.renderString(LOOP_TEMPLATE, promptParams.data ?? {})
            : env.renderString(childPromptBody, promptParams.data ?? {});

        return {
            systemPromptRendered,
            systemPromptSha256: sha256(systemPromptRendered),
            outgoingMessages: normalizedOutgoing as unknown as ChatMessage[],
            toolNames: (promptParams.tools ?? []).map((t) => t.name).sort(),
            templateRole: promptParams.templateMessageRole,
        };
    }
}

const ALICE = { ID: CORPUS_IDS.USER_ALICE, Name: 'Alice Executive', Email: 'alice@test.mj' } as UserInfo;

function makeCorpusAgent(id: string, name: string, typeId: string, overrides: Record<string, unknown> = {}): MJAIAgentEntityExtended {
    return {
        ID: id,
        Name: name,
        Description: `${name} corpus fixture`,
        Status: 'Active',
        TypeID: typeId,
        BaseAgentID: null,
        ModelSelectionMode: 'Agent Type',
        DefaultPromptEffortLevel: null,
        AgentTypePromptParams: null,
        DeclareActionsAsNativeTools: false,
        AllowMemoryWrite: false,
        AcceptsSkills: 'All',
        SkillActivationMode: 'Auto',
        OwnerUserID: CORPUS_IDS.USER_ALICE,
        ...overrides,
    } as unknown as MJAIAgentEntityExtended;
}

describe('Stage 1 Pinning — Prompt Byte-for-Byte Snapshot & Prefix-Cache Order', () => {
    beforeEach(() => {
        corpusCatalog.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-27T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the 4-agent corpus byte-for-byte identically to committed snapshot fixtures', async () => {
        const loopType = mockAIEngine.AgentTypes[0];
        const flowType = mockAIEngine.AgentTypes[1];
        const sysPrompt = { ID: CORPUS_IDS.SYS_PROMPT, Name: 'Loop System Prompt' } as MJAIPromptEntityExtended;
        const childPrompt = { ID: CORPUS_IDS.CHILD_PROMPT, Name: 'Corpus Child Prompt' } as MJAIPromptEntityExtended;
        const flowChildPrompt = { ID: CORPUS_IDS.FLOW_CHILD_PROMPT, Name: 'Flow Step Prompt' } as MJAIPromptEntityExtended;

        const corpus: Array<{
            key: string;
            agent: MJAIAgentEntityExtended;
            config: AgentConfiguration;
            payload: Record<string, unknown>;
            childBody: string;
            notes?: string;
        }> = [
            {
                key: 'loop-standard',
                agent: makeCorpusAgent(CORPUS_IDS.STD_AGENT, 'Standard Loop Agent', CORPUS_IDS.LOOP_TYPE),
                config: { success: true, agentType: loopType, systemPrompt: sysPrompt, childPrompt },
                payload: { project: 'Apollo', step: 1 },
                childBody: 'You are the Standard Loop Agent. Solve the user request accurately.',
                notes: 'Checked initial requirements.',
            },
            {
                key: 'loop-persona-derived',
                agent: makeCorpusAgent(CORPUS_IDS.PEPPER_AGENT, 'Pepper', CORPUS_IDS.LOOP_TYPE, {
                    BaseAgentID: CORPUS_IDS.COS_ROOT,
                    AllowMemoryWrite: true,
                }),
                config: { success: true, agentType: loopType, systemPrompt: sysPrompt, childPrompt },
                payload: { briefingDate: '2026-11-27' },
                childBody: 'You are Chief of Staff. Synthesize priorities for your principal.',
                notes: 'Board deck review pending.',
            },
            {
                key: 'loop-native-only',
                agent: makeCorpusAgent(CORPUS_IDS.NATIVE_AGENT, 'Native Tool Agent', CORPUS_IDS.LOOP_TYPE, {
                    DeclareActionsAsNativeTools: true,
                }),
                config: { success: true, agentType: loopType, systemPrompt: sysPrompt, childPrompt },
                payload: { mode: 'native' },
                childBody: 'Use native tools cleanly without JSON envelopes.',
            },
            {
                key: 'flow-step-prompt',
                agent: makeCorpusAgent(CORPUS_IDS.FLOW_AGENT, 'Deterministic Flow Agent', CORPUS_IDS.FLOW_TYPE),
                config: { success: true, agentType: flowType, systemPrompt: undefined as unknown as MJAIPromptEntityExtended, childPrompt: flowChildPrompt },
                payload: { orderId: 'ORD-100', amount: 250 },
                childBody: 'Analyze order {{ _CURRENT_PAYLOAD.orderId }} for amount {{ _CURRENT_PAYLOAD.amount }}.',
            },
        ];

        for (const entry of corpus) {
            const probe = new PromptSnapshotProbe();
            const params: ExecuteAgentParams = {
                agent: entry.agent,
                conversationMessages: [{ role: 'user', content: `Execute ${entry.key}` }],
                contextUser: ALICE,
                disableDataPreloading: true,
            };
            const snap = await probe.BuildCorpusSnapshot(entry.config, entry.payload, params, entry.childBody, entry.notes);
            const fixturePath = join(__dirname_, `fixtures/base-agent-prompt-corpus.${entry.key}.snapshot.json`);
            await expect(JSON.stringify(snap, null, 2)).toMatchFileSnapshot(fixturePath);
        }
    });

    it('enforces static-first / volatile-tail prefix caching: Turn 1 and Turn 2 system prompts are SHA-256 identical despite payload and scratchpad mutations', async () => {
        const loopType = mockAIEngine.AgentTypes[0];
        const sysPrompt = { ID: CORPUS_IDS.SYS_PROMPT, Name: 'Loop System Prompt' } as MJAIPromptEntityExtended;
        const childPrompt = { ID: CORPUS_IDS.CHILD_PROMPT, Name: 'Corpus Child Prompt' } as MJAIPromptEntityExtended;
        const agent = makeCorpusAgent(CORPUS_IDS.STD_AGENT, 'Standard Loop Agent', CORPUS_IDS.LOOP_TYPE);
        const config: AgentConfiguration = { success: true, agentType: loopType, systemPrompt: sysPrompt, childPrompt };

        const probe = new PromptSnapshotProbe();
        const messages: ChatMessage[] = [{ role: 'user', content: 'Run multi-turn cache test' }];
        const params: ExecuteAgentParams = { agent, conversationMessages: messages, contextUser: ALICE, disableDataPreloading: true };

        const turn1 = await probe.BuildCorpusSnapshot(config, { turn: 1, counter: 10 }, params, 'Static instructions only.', 'Note turn 1');
        // Mutate conversation, payload, and scratchpad for Turn 2
        messages.push({ role: 'assistant', content: 'Turn 1 complete' });
        messages.push({ role: 'user', content: 'Continue to turn 2' });
        const turn2 = await probe.BuildCorpusSnapshot(config, { turn: 2, counter: 99, extra: 'volatile' }, params, 'Static instructions only.', 'Note turn 2 mutated');

        // 1. Static system prompt prefix is byte-identical (exact SHA-256 match)
        expect(turn2.systemPromptSha256).toBe(turn1.systemPromptSha256);
        expect(turn2.systemPromptRendered).toBe(turn1.systemPromptRendered);

        // 2. Volatile data NEVER leaks into the static system prompt
        expect(turn1.systemPromptRendered).not.toContain('Note turn 1');
        expect(turn2.systemPromptRendered).not.toContain('Note turn 2 mutated');
        expect(turn2.systemPromptRendered).not.toContain('"counter": 99');

        // 3. Volatile runtime state block lands strictly at the LAST outgoing message
        const lastTurn2 = turn2.outgoingMessages.at(-1) as unknown as { content: string; volatileState: boolean };
        expect(lastTurn2.volatileState).toBe(true);
        expect(lastTurn2.content).toContain(`<${RUNTIME_STATE_TAG}>`);
        expect(lastTurn2.content).toContain('Note turn 2 mutated');
    });
});
