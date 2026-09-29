/**
 * discovery-corpus.test.ts — the agent-discovery corpus generator, driven by a fake chat driver.
 *
 * The rig (`rigs/generate-discovery-corpus.ts`) calls a live model, so none of ITS output is
 * deterministic. What decides the corpus is: which agents it covers, what it asks, how a reply is
 * validated and retried, how near-duplicates are dropped, how labels are built, where it may write,
 * and that a dry run calls nothing. That is all here, and none of it spends a token.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatParams, ChatResult, ModelUsage } from '@memberjunction/ai';
import type { ChatResultChoice } from '@memberjunction/ai';
import type { DecisionDiscoveryAgent, DecisionDiscoveryOption } from '@memberjunction/ai-agents';
import type { MJAIModelEntity } from '@memberjunction/core-entities';
import {
    DiscoveryCatalogSnapshotSchema,
    FindRepoRoot,
    JoinDiscoveryCorpus,
    OutputInsideRepoError,
    ParseDiscoveryCorpus,
    ParseDiscoveryLabels,
    SelectDiscoveryLabelSource
} from '@memberjunction/testing-engine';
import {
    AreNearDuplicateRequests,
    AssertCorpusOutputDir,
    BuildDiscoveryCorpusFiles,
    BuildGenerationParams,
    DeduplicateRequests,
    DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL,
    DISCOVERY_CORPUS_MAX_RETRIES,
    DiscoverableAgentsForCorpus,
    GenerateDiscoveryCorpus,
    GenerateOrPlanDiscoveryCorpus,
    GenerateTaskRequests,
    NormalizeRequestText,
    ParseGeneratedRequests,
    PickGenerationModel,
    PlanDiscoveryCorpus,
    type GenerationModelSource,
    SplitNoneCount,
    type DiscoveryCorpusChatDriver,
    type DiscoveryCorpusTask
} from '../discovery-corpus/generator';
import { BuildAgentRequestsPrompt, BuildNoneRequestsPrompt, DISCOVERY_CORPUS_GENERATION_PROMPT } from '../discovery-corpus/prompts';

const SAGE_ID = 'E1000000-0000-4000-8000-0000000000FF';
const BILLING: DecisionDiscoveryOption = { ID: 'E1000000-0000-4000-8000-000000000002', Name: 'Billing Agent', Description: 'Creates invoices and records payments.' };
const MARKETING: DecisionDiscoveryOption = { ID: 'E1000000-0000-4000-8000-000000000003', Name: 'Marketing Agent', Description: 'Writes marketing copy and posts.' };
const AGENTS = [BILLING, MARKETING];

/** A reply holding `requests` as the JSON the prompt asks for. */
function reply(requests: readonly string[]): ChatResult {
    return textReply(JSON.stringify({ requests }));
}

/** A successful reply whose text is `text`. */
function textReply(text: string): ChatResult {
    const result = new ChatResult(true, new Date(0), new Date(1));
    const choice: ChatResultChoice = { message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 };
    result.data = { choices: [choice], usage: new ModelUsage(100, 50) };
    return result;
}

/** A failed reply. */
function failedReply(message: string): ChatResult {
    const result = new ChatResult(false, new Date(0), new Date(1));
    result.errorMessage = message;
    return result;
}

/** A chat driver that answers from a script, in order, and records every call. */
class FakeChatDriver implements DiscoveryCorpusChatDriver {
    public readonly Calls: ChatParams[] = [];

    constructor(private readonly script: Array<ChatResult | Error>) {}

    public async ChatCompletion(params: ChatParams): Promise<ChatResult> {
        this.Calls.push(params);
        const next = this.script.shift();
        if (!next) {
            throw new Error('FakeChatDriver: the script ran out');
        }
        if (next instanceof Error) {
            throw next;
        }
        return next;
    }
}

function task(overrides: Partial<DiscoveryCorpusTask> = {}): DiscoveryCorpusTask {
    return { Key: 'agent:Billing Agent', Label: { label: 'agent', agentId: BILLING.ID }, Count: 3, Prompt: 'write three', ...overrides };
}

describe('the generation prompt', () => {
    it('asks for what real users type, and forbids the agent\'s name and description wording', () => {
        expect(DISCOVERY_CORPUS_GENERATION_PROMPT).toContain('the way a real user types into a chat box');
        expect(DISCOVERY_CORPUS_GENERATION_PROMPT).toContain('name any agent');
        expect(DISCOVERY_CORPUS_GENERATION_PROMPT).toContain("reuse the wording of an agent's description");
        expect(DISCOVERY_CORPUS_GENERATION_PROMPT).toContain('{"requests": [');
    });

    it("gives the agent's description, keeps its name for understanding only, and lists the other agents", () => {
        const prompt = BuildAgentRequestsPrompt(BILLING, [MARKETING], 6);
        expect(prompt).toContain('Write 6 different messages');
        expect(prompt).toContain(`What it does: ${BILLING.Description}`);
        expect(prompt).toContain('never use its name');
        expect(prompt).toContain(`- ${MARKETING.Name}: ${MARKETING.Description}`);
        expect(prompt).not.toContain(`- ${BILLING.Name}:`);
    });

    it('describes each kind of none request, with the catalog to avoid or combine', () => {
        expect(BuildNoneRequestsPrompt('chat', AGENTS, 20)).toContain('small talk');
        expect(BuildNoneRequestsPrompt('direct', AGENTS, 20)).toContain('general knowledge');
        const workflow = BuildNoneRequestsPrompt('workflow', AGENTS, 20);
        expect(workflow).toContain('at least two different agents');
        expect(workflow).toContain(`- ${BILLING.Name}: ${BILLING.Description}`);
    });
});

describe('the agents and the plan', () => {
    it('covers the directly discoverable agents with a description, minus the conversation manager', () => {
        const row = (id: string, name: string, overrides: Partial<DecisionDiscoveryAgent> = {}): DecisionDiscoveryAgent =>
            ({ ID: id, Name: name, Description: `${name} does things`, Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, ...overrides });
        const runnable = [
            row(SAGE_ID, 'Sage'),
            row(BILLING.ID, 'Billing Agent'),
            row('E1000000-0000-4000-8000-000000000004', 'Helper', { InvocationMode: 'Sub-Agent' }),
            row('E1000000-0000-4000-8000-000000000005', 'Child', { ParentID: BILLING.ID }),
            row('E1000000-0000-4000-8000-000000000006', 'Blank', { Description: ' ' }),
            row(MARKETING.ID, 'Marketing Agent')
        ];
        expect(DiscoverableAgentsForCorpus(runnable, SAGE_ID).map(a => a.Name)).toEqual(['Billing Agent', 'Marketing Agent']);
    });

    it('splits the none requests evenly across the kinds', () => {
        expect(SplitNoneCount(60)).toEqual({ chat: 20, direct: 20, workflow: 20 });
        expect(SplitNoneCount(61)).toEqual({ chat: 21, direct: 20, workflow: 20 });
        expect(SplitNoneCount(1)).toEqual({ chat: 1, direct: 0, workflow: 0 });
    });

    it('plans one call per agent and per kind, labelled by construction, splitting large asks', () => {
        const tasks = PlanDiscoveryCorpus(AGENTS, 6, 45);
        expect(tasks.map(t => [t.Key, t.Count])).toEqual([
            ['agent:Billing Agent', 6], ['agent:Marketing Agent', 6],
            ['none:chat', 15], ['none:direct', 15], ['none:workflow', 15]
        ]);
        expect(tasks[0].Label).toEqual({ label: 'agent', agentId: BILLING.ID });
        expect(tasks[4].Label).toEqual({ label: 'none', kind: 'workflow' });
        expect(tasks[0].Prompt).toBe(BuildAgentRequestsPrompt(BILLING, [MARKETING], 6));
        const large = PlanDiscoveryCorpus([BILLING], DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL + 5, 0);
        expect(large.map(t => [t.Key, t.Count])).toEqual([['agent:Billing Agent (1/2)', 20], ['agent:Billing Agent (2/2)', 5]]);
    });
});

describe('PickGenerationModel', () => {
    type ModelRow = Pick<MJAIModelEntity, 'Name' | 'IsActive' | 'AIModelType' | 'PowerRank' | 'DriverClass' | 'APIName'>;
    const models: ModelRow[] = [
        { Name: 'Big', IsActive: true, AIModelType: 'LLM', PowerRank: 20, DriverClass: 'KeylessLLM', APIName: 'big-1' },
        { Name: 'Mid', IsActive: true, AIModelType: 'LLM', PowerRank: 10, DriverClass: 'OpenAILLM', APIName: 'mid-1' },
        { Name: 'Off', IsActive: false, AIModelType: 'LLM', PowerRank: 30, DriverClass: 'OpenAILLM', APIName: 'off-1' },
        { Name: 'Embed', IsActive: true, AIModelType: 'Embeddings', PowerRank: 40, DriverClass: 'OpenAILLM', APIName: 'emb-1' }
    ];
    const hasKey = (driverClass: string): boolean => driverClass === 'OpenAILLM';

    it('uses the named model, in any case', () => {
        expect(PickGenerationModel(models, ' big ', hasKey)).toEqual({ Name: 'Big', DriverClass: 'KeylessLLM', APIName: 'big-1' });
        expect(() => PickGenerationModel(models, 'Off', hasKey)).toThrow("No active model named 'Off'");
    });

    it('otherwise takes the most powerful active LLM with a key', () => {
        expect(PickGenerationModel(models, undefined, hasKey).Name).toBe('Mid');
        expect(() => PickGenerationModel(models, undefined, () => false)).toThrow('No active LLM has an API key');
    });

    it('calls a model through the first of its active vendors that has a key, not only its default', () => {
        const served: GenerationModelSource = {
            Name: 'Served', IsActive: true, AIModelType: 'LLM', PowerRank: 50, DriverClass: 'KeylessLLM', APIName: 'served-1',
            ModelVendors: [
                { DriverClass: 'KeylessLLM', APIName: 'served-keyless', Status: 'Active', Priority: 9 },
                { DriverClass: 'OpenAILLM', APIName: 'served-openai', Status: 'Inactive', Priority: 8 },
                { DriverClass: 'OpenAILLM', APIName: null, Status: 'Active', Priority: 1 }
            ]
        };
        expect(PickGenerationModel([served], 'Served', hasKey)).toEqual({ Name: 'Served', DriverClass: 'OpenAILLM', APIName: 'served-1' });
        expect(PickGenerationModel([...models, served], undefined, hasKey).Name).toBe('Served');
    });
});

describe('reading a reply', () => {
    it('keeps the first requests asked for, trimmed, from JSON or a fenced JSON block', () => {
        expect(ParseGeneratedRequests(JSON.stringify({ requests: [' a b ', 'c d', 'e f', 'g h'] }), 3)).toEqual({ Requests: ['a b', 'c d', 'e f'] });
        expect(ParseGeneratedRequests('```json\n{"requests": ["one", "two"]}\n```', 2)).toEqual({ Requests: ['one', 'two'] });
    });

    it('refuses a reply that is not JSON, or not the asked shape', () => {
        expect(ParseGeneratedRequests('Sure! Here they are: ...', 1)).toEqual({ Error: 'it was not valid JSON' });
        expect(ParseGeneratedRequests('["a", "b"]', 1)).toEqual({ Error: 'it was not an object with a "requests" array of strings' });
        expect(ParseGeneratedRequests('{"requests": ["a", 2]}', 1)).toEqual({ Error: 'it was not an object with a "requests" array of strings' });
        expect(ParseGeneratedRequests('{"items": ["a"]}', 1)).toEqual({ Error: 'it was not an object with a "requests" array of strings' });
    });

    it('refuses a reply with too few usable, distinct requests', () => {
        const parsed = ParseGeneratedRequests(JSON.stringify({ requests: ['Invoice Acme.', 'invoice acme', '', 'x'.repeat(1501)] }), 2);
        expect(parsed).toEqual({ Error: 'it held 1 usable, distinct request(s) of the 2 asked for' });
    });
});

describe('near-duplicates', () => {
    it('normalizes case, punctuation and spacing', () => {
        expect(NormalizeRequestText("  Can you   INVOICE Acme?! ")).toBe('can you invoice acme');
    });

    it('treats the same words, or mostly the same words, as the same request', () => {
        expect(AreNearDuplicateRequests('Invoice Acme, please.', 'invoice acme please')).toBe(true);
        // Ten distinct words each, nine shared: an overlap of 9 / 11.
        expect(AreNearDuplicateRequests('please send acme the march invoice for the consulting work today',
            'please send acme the march invoice for the consulting work now')).toBe(true);
        // Eight each, seven shared: 7 / 9 is under the 0.8 bar.
        expect(AreNearDuplicateRequests('send acme the march invoice for consulting today', 'send acme the march invoice for consulting now')).toBe(false);
        expect(AreNearDuplicateRequests('send acme the march invoice', 'write a launch post for the pricing page')).toBe(false);
        // Short requests must match exactly: one word changes a short request's meaning.
        expect(AreNearDuplicateRequests('thanks so much', 'thanks so little')).toBe(false);
    });

    it('drops a request near-identical to an earlier one, including ones kept elsewhere', () => {
        expect(DeduplicateRequests(['hi there', 'Hi there!', 'bye now'])).toEqual({ Kept: ['hi there', 'bye now'], Dropped: 1 });
        expect(DeduplicateRequests(['bye now', 'see you'], ['BYE NOW'])).toEqual({ Kept: ['see you'], Dropped: 1 });
    });
});

describe('asking, with retries', () => {
    it('asks for JSON from the model, with the generation prompt and the task', () => {
        const params = BuildGenerationParams('gpt-x', task(), null);
        expect(params.model).toBe('gpt-x');
        expect(params.responseFormat).toBe('JSON');
        expect(params.messages).toEqual([
            { role: 'system', content: DISCOVERY_CORPUS_GENERATION_PROMPT },
            { role: 'user', content: 'write three' }
        ]);
        expect(params.maxOutputTokens).toBeGreaterThan(0);
    });

    it('asks again after a bad reply, saying why, and takes the good one', async () => {
        const driver = new FakeChatDriver([textReply('not json'), reply(['one a', 'two b', 'three c'])]);
        const outcome = await GenerateTaskRequests(driver, 'gpt-x', task());
        expect(outcome).toEqual({ Requests: ['one a', 'two b', 'three c'], Reason: null, Calls: 2 });
        expect(driver.Calls[1].messages).toHaveLength(3);
        expect(String(driver.Calls[1].messages[2].content)).toContain('it was not valid JSON');
    });

    it(`gives up after ${DISCOVERY_CORPUS_MAX_RETRIES} retries, counting a failed or throwing call as a bad reply`, async () => {
        const driver = new FakeChatDriver([failedReply('rate limited'), new Error('socket closed'), reply(['only one'])]);
        const outcome = await GenerateTaskRequests(driver, 'gpt-x', task());
        expect(outcome.Requests).toBeNull();
        expect(outcome.Calls).toBe(DISCOVERY_CORPUS_MAX_RETRIES + 1);
        expect(outcome.Reason).toBe('it held 1 usable, distinct request(s) of the 3 asked for');
        expect(driver.Calls).toHaveLength(3);
        expect(String(driver.Calls[2].messages[2].content)).toContain('socket closed');
    });
});

describe('GenerateDiscoveryCorpus', () => {
    const tasks: DiscoveryCorpusTask[] = [
        task({ Key: 'agent:Billing Agent', Count: 2 }),
        task({ Key: 'agent:Marketing Agent', Label: { label: 'agent', agentId: MARKETING.ID }, Count: 2 }),
        task({ Key: 'none:chat', Label: { label: 'none', kind: 'chat' }, Count: 2 })
    ];

    it('labels each request by construction, drops cross-task duplicates, and interleaves the tasks', async () => {
        const driver = new FakeChatDriver([
            reply(['invoice acme for march', 'record the payment from globex']),
            reply(['write a post about the new pricing page', 'Invoice Acme for March!']),
            reply(['hi there', 'thanks, that is all'])
        ]);
        const result = await GenerateDiscoveryCorpus({ Driver: driver, Model: 'gpt-x', Tasks: tasks });
        expect(result.Requests.map(r => [r.Request, r.Label])).toEqual([
            ['invoice acme for march', { label: 'agent', agentId: BILLING.ID }],
            ['write a post about the new pricing page', { label: 'agent', agentId: MARKETING.ID }],
            ['hi there', { label: 'none', kind: 'chat' }],
            ['record the payment from globex', { label: 'agent', agentId: BILLING.ID }],
            ['thanks, that is all', { label: 'none', kind: 'chat' }]
        ]);
        expect(result).toMatchObject({ Calls: 3, Retries: 0, DuplicatesDropped: 1 });
        expect(result.Shortfalls).toEqual([{ Task: 'agent:Marketing Agent', Wanted: 2, Kept: 1, Reason: null }]);
    });

    it('reports a task that never got a usable reply, and carries on', async () => {
        const driver = new FakeChatDriver([
            textReply('no'), textReply('no'), textReply('no'),
            reply(['write a post about the new pricing page', 'draft a tweet for the launch']),
            reply(['hi there', 'thanks, that is all'])
        ]);
        const result = await GenerateDiscoveryCorpus({ Driver: driver, Model: 'gpt-x', Tasks: tasks });
        expect(result.Requests).toHaveLength(4);
        expect(result).toMatchObject({ Calls: 5, Retries: 2 });
        expect(result.Shortfalls).toEqual([{ Task: 'agent:Billing Agent', Wanted: 2, Kept: 0, Reason: 'it was not valid JSON' }]);
    });
});

describe('the dry run', () => {
    it('creates no driver and makes no call', async () => {
        let created = 0;
        const driver = new FakeChatDriver([]);
        const result = await GenerateOrPlanDiscoveryCorpus({
            DryRun: true,
            CreateDriver: () => {
                created++;
                return driver;
            },
            Model: 'gpt-x',
            Tasks: PlanDiscoveryCorpus(AGENTS, 6, 60)
        });
        expect(result).toBeNull();
        expect(created).toBe(0);
        expect(driver.Calls).toHaveLength(0);
    });

    it('generates when it is not a dry run', async () => {
        const driver = new FakeChatDriver([reply(['invoice acme', 'bill globex'])]);
        const result = await GenerateOrPlanDiscoveryCorpus({ DryRun: false, CreateDriver: () => driver, Model: 'gpt-x', Tasks: [task({ Count: 2 })] });
        expect(result?.Requests).toHaveLength(2);
        expect(driver.Calls).toHaveLength(1);
    });
});

describe('the files', () => {
    it('writes a corpus and construction labels that the Decision Eval harness reads back, with the catalog snapshot', () => {
        const ids = ['F1000000-0000-4000-8000-000000000001', 'F1000000-0000-4000-8000-000000000002'];
        const files = BuildDiscoveryCorpusFiles(
            [
                { Request: 'invoice acme', Label: { label: 'agent', agentId: BILLING.ID }, Task: 'agent:Billing Agent' },
                { Request: 'hi there', Label: { label: 'none', kind: 'chat' }, Task: 'none:chat' }
            ],
            AGENTS, SAGE_ID, () => ids.shift() ?? 'none left', new Date('2026-09-29T12:00:00.000Z'));
        expect(files.Corpus).toEqual([
            { id: 'F1000000-0000-4000-8000-000000000001', request: 'invoice acme', created_at: '2026-09-29T12:00:00.000Z' },
            { id: 'F1000000-0000-4000-8000-000000000002', request: 'hi there', created_at: '2026-09-29T12:00:00.000Z' }
        ]);
        expect(files.Labels).toEqual([
            { id: 'F1000000-0000-4000-8000-000000000001', label: 'agent', agentId: BILLING.ID, source: 'construction' },
            { id: 'F1000000-0000-4000-8000-000000000002', label: 'none', kind: 'chat', source: 'construction' }
        ]);
        const corpus = ParseDiscoveryCorpus(files.Corpus.map(line => JSON.stringify(line)).join('\n'));
        const labels = SelectDiscoveryLabelSource(ParseDiscoveryLabels(files.Labels.map(line => JSON.stringify(line)).join('\n')), 'construction');
        expect(JoinDiscoveryCorpus(corpus, labels).Cases).toHaveLength(2);
        expect(DiscoveryCatalogSnapshotSchema.parse(files.Agents)).toEqual({
            created_at: '2026-09-29T12:00:00.000Z',
            conversation_manager_id: SAGE_ID,
            agents: AGENTS.map(a => ({ ID: a.ID, Name: a.Name, Description: a.Description }))
        });
    });
});

describe('where it may write', () => {
    const repoRoot = FindRepoRoot(dirname(fileURLToPath(import.meta.url)));

    it('refuses a directory inside the repository', () => {
        expect(repoRoot).not.toBeNull();
        expect(() => AssertCorpusOutputDir(join(repoRoot ?? '', 'discovery-corpus-out'), [])).toThrow(OutputInsideRepoError);
    });

    it('accepts a fresh directory outside it, and refuses one that already holds a corpus', () => {
        const outside = mkdtempSync(join(tmpdir(), 'discovery-corpus-test-'));
        expect(AssertCorpusOutputDir(join(outside, 'new'), [repoRoot ?? ''])).toContain('new');
        mkdirSync(join(outside, 'used'));
        writeFileSync(join(outside, 'used', 'labels.jsonl'), '');
        expect(() => AssertCorpusOutputDir(join(outside, 'used'), [])).toThrow('Refusing to overwrite');
    });
});
