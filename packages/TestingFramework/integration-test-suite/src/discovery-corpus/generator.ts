/**
 * generator.ts — writes the labelled agent-discovery corpus (typed-decision plan, Task 3.1): requests
 * that a discoverable agent should handle, and requests that no specialist should, each labelled by
 * construction.
 *
 * Everything here is framework-free and takes its chat driver as a parameter, so it is unit-tested
 * with a fake driver and never spends a token in CI. `rigs/generate-discovery-corpus.ts` is the
 * shell: it loads the agents, creates the real driver off the ClassFactory, and writes the files.
 *
 * The contract:
 *   - one call per task: an agent's requests, or one kind of `none` request, at most
 *     {@link DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL} requests a call;
 *   - every reply is validated ({@link ParseGeneratedRequests}); a bad one is asked again at most
 *     {@link DISCOVERY_CORPUS_MAX_RETRIES} times, and a task that never gets a good reply is reported,
 *     not guessed at;
 *   - near-identical requests are dropped, within a reply and across the corpus
 *     ({@link AreNearDuplicateRequests});
 *   - labels come from construction: `{ label: 'agent', agentId }` or `{ label: 'none', kind }`.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaseLLM, ChatMessage, ChatResult } from '@memberjunction/ai';
import { ChatMessageRole, ChatParams } from '@memberjunction/ai';
import { DecisionDiscoveryCatalog, DecisionDiscoveryOptions, type DecisionDiscoveryAgent, type DecisionDiscoveryOption } from '@memberjunction/ai-agents';
import type { MJAIModelEntity, MJAIModelVendorEntity } from '@memberjunction/core-entities';
import {
    AssertOutputOutsideRepo,
    DISCOVERY_NONE_KINDS,
    type DiscoveryCatalogSnapshot,
    type DiscoveryCorpusLabel,
    type DiscoveryCorpusRequest,
    type DiscoveryLabel,
    type DiscoveryNoneKind
} from '@memberjunction/testing-engine';
import { StripJsonFence } from '../native-tool-matrix/observe';
import { BuildAgentRequestsPrompt, BuildNoneRequestsPrompt, BuildRetryNote, DISCOVERY_CORPUS_GENERATION_PROMPT } from './prompts';

/** How many times a bad reply is asked again. */
export const DISCOVERY_CORPUS_MAX_RETRIES = 2;

/** The most requests one call asks for; a larger task is split across calls. */
export const DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL = 20;

/** A request longer than this is not something a user types into a chat box, and is dropped. */
export const DISCOVERY_CORPUS_MAX_REQUEST_CHARS = 1500;

/** Two requests of at least this many distinct words are near-identical at or above this word overlap (Jaccard). */
export const DISCOVERY_CORPUS_NEAR_DUPLICATE_OVERLAP = 0.8;

/** The fewest distinct words for the overlap test; shorter requests must match exactly after normalizing. */
const NEAR_DUPLICATE_MIN_WORDS = 4;

/** The reply budget per requested message, and the fixed allowance on top. */
const OUTPUT_TOKENS_PER_REQUEST = 150;
const OUTPUT_TOKENS_BASE = 300;

/** The label source every generated label carries. */
export const DISCOVERY_CORPUS_LABEL_SOURCE = 'construction';

/** The part of an MJ chat driver the generator uses. Every `BaseLLM` is one. */
export type DiscoveryCorpusChatDriver = Pick<BaseLLM, 'ChatCompletion'>;

/** One generation call: what it asks for, and the label its requests get. */
export interface DiscoveryCorpusTask {
    /** Names the task in reports: `agent:<name>` or `none:<kind>`, with a part number when split. */
    Key: string;
    /** The label every request from this task gets. */
    Label: DiscoveryLabel;
    /** How many requests the call asks for. */
    Count: number;
    /** The user message. */
    Prompt: string;
}

/** The model the corpus is generated with. */
export interface DiscoveryCorpusModel {
    /** The `MJ: AI Models` name. */
    Name: string;
    /** The registered `BaseLLM` driver class. */
    DriverClass: string;
    /** The vendor's API name for the model. */
    APIName: string;
}

/** What {@link GenerateDiscoveryCorpus} needs. */
export interface DiscoveryCorpusGenerationParams {
    Driver: DiscoveryCorpusChatDriver;
    /** The vendor's API name for the model (`ChatParams.model`). */
    Model: string;
    /** The calls to make ({@link PlanDiscoveryCorpus}). */
    Tasks: ReadonlyArray<DiscoveryCorpusTask>;
    /** Progress lines, if wanted. */
    Log?: (message: string) => void;
}

/** One generated request with its label. */
export interface GeneratedDiscoveryRequest {
    Request: string;
    Label: DiscoveryLabel;
    /** The task it came from. */
    Task: string;
}

/** A task that did not yield everything it asked for. */
export interface DiscoveryCorpusShortfall {
    Task: string;
    Wanted: number;
    Kept: number;
    /** Why, when the task failed outright. */
    Reason: string | null;
}

/** What a generation produced. */
export interface DiscoveryCorpusGenerationResult {
    /** The requests, near-duplicates dropped, interleaved across tasks. */
    Requests: GeneratedDiscoveryRequest[];
    /** Chat calls made, retries included. */
    Calls: number;
    /** Of those, retries after a bad reply. */
    Retries: number;
    /** Requests dropped as near-duplicates of an earlier one in another reply. */
    DuplicatesDropped: number;
    /** Tasks that failed, or whose requests were partly dropped as duplicates. */
    Shortfalls: DiscoveryCorpusShortfall[];
}

/** The files a corpus is written as. */
export interface DiscoveryCorpusFiles {
    /** `corpus.jsonl`, one line per request. */
    Corpus: DiscoveryCorpusRequest[];
    /** `labels.jsonl`, one line per request. */
    Labels: DiscoveryCorpusLabel[];
    /** `agents.json`. */
    Agents: DiscoveryCatalogSnapshot;
}

/** What {@link GenerateOrPlanDiscoveryCorpus} needs. */
export interface DiscoveryCorpusRunParams {
    /** Plan only: no driver is created and no call is made. */
    DryRun: boolean;
    /** Creates the chat driver; called only when generating. */
    CreateDriver: () => DiscoveryCorpusChatDriver;
    /** The vendor's API name for the model. */
    Model: string;
    /** The calls to make ({@link PlanDiscoveryCorpus}). */
    Tasks: ReadonlyArray<DiscoveryCorpusTask>;
    /** Progress lines, if wanted. */
    Log?: (message: string) => void;
}

/** The corpus files the generator writes, and never overwrites. */
export const DISCOVERY_CORPUS_FILES = ['corpus.jsonl', 'labels.jsonl', 'agents.json'] as const;

/** Either the requests a reply holds, or why it cannot be used. */
export type ParsedGeneratedRequests = { Requests: string[] } | { Error: string };

/**
 * The agents a corpus is generated for, as production's discovery sees them: of the agents the user
 * may run (`DecisionDiscoveryRunnableAgents`), the ones that can be discovered directly, minus the
 * conversation manager, that have a description. No option limit applies: the corpus covers them all.
 *
 * @param runnableAgents The agents the user may run.
 * @param conversationManagerId The conversation manager (Sage).
 */
export function DiscoverableAgentsForCorpus(
    runnableAgents: ReadonlyArray<DecisionDiscoveryAgent>,
    conversationManagerId: string
): DecisionDiscoveryOption[] {
    const catalog = DecisionDiscoveryCatalog(runnableAgents, conversationManagerId);
    return DecisionDiscoveryOptions(catalog.map(a => ({ ID: a.ID, Name: a.Name ?? '', Description: a.Description })));
}

/** A model-vendor row a model can be called through. */
export type GenerationModelVendor = Pick<MJAIModelVendorEntity, 'DriverClass' | 'APIName' | 'Status' | 'Priority'>;

/** A model as the generator reads it: the engine's model, with its model-vendor rows. */
export type GenerationModelSource = Pick<MJAIModelEntity, 'Name' | 'IsActive' | 'AIModelType' | 'PowerRank' | 'DriverClass' | 'APIName'> & {
    ModelVendors?: ReadonlyArray<GenerationModelVendor>;
};

/**
 * The model to generate with. A named model must be active and have a driver class and an API name;
 * without a name, the most powerful active LLM that some vendor with an API key serves is used.
 *
 * A model is called through the first of its active vendors whose driver has a key, by priority,
 * and not only through its default vendor: a model is often served by several vendors, and the key
 * may be for any one of them. A named model with no keyed vendor keeps its default, so the missing
 * key is reported by name.
 *
 * @param models The engine's models.
 * @param name The `--model` name, or undefined.
 * @param hasKey Whether a driver class has an API key.
 */
export function PickGenerationModel(
    models: ReadonlyArray<GenerationModelSource>,
    name: string | undefined,
    hasKey: (driverClass: string) => boolean
): DiscoveryCorpusModel {
    const usable = models.filter(m => m.IsActive && !!m.DriverClass && !!m.APIName);
    if (name !== undefined) {
        const target = name.trim().toLowerCase();
        const named = usable.find(m => m.Name.trim().toLowerCase() === target);
        if (!named) {
            throw new Error(`No active model named '${name}' with a driver class and an API name`);
        }
        return keyedRoute(named, hasKey) ?? toModel(named);
    }
    const best = usable
        .filter(m => m.AIModelType.trim().toLowerCase() === 'llm' && keyedRoute(m, hasKey) !== undefined)
        .sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0))[0];
    if (!best) {
        throw new Error('No active LLM has an API key: set AI_VENDOR_API_KEY__<DriverClass> in .env, or pass --model');
    }
    return keyedRoute(best, hasKey) ?? toModel(best);
}

/** The model through its first active vendor (by priority), then its default, whose driver has a key. */
function keyedRoute(model: GenerationModelSource, hasKey: (driverClass: string) => boolean): DiscoveryCorpusModel | undefined {
    const vendors = [...(model.ModelVendors ?? [])]
        .filter(v => v.Status === 'Active' && !!v.DriverClass)
        .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0))
        .map(v => ({ DriverClass: v.DriverClass ?? '', APIName: v.APIName || model.APIName || '' }));
    const routes = [...vendors, { DriverClass: model.DriverClass ?? '', APIName: model.APIName ?? '' }];
    const route = routes.find(r => !!r.DriverClass && !!r.APIName && hasKey(r.DriverClass));
    return route ? { Name: model.Name, ...route } : undefined;
}

/**
 * Splits the `none` requests across the three kinds as evenly as possible, earlier kinds taking the
 * remainder.
 *
 * @param total How many `none` requests.
 */
export function SplitNoneCount(total: number): Record<DiscoveryNoneKind, number> {
    const share = (index: number): number => Math.floor(total / DISCOVERY_NONE_KINDS.length) + (index < total % DISCOVERY_NONE_KINDS.length ? 1 : 0);
    return { chat: share(0), direct: share(1), workflow: share(2) };
}

/**
 * The calls a corpus takes: for each agent, `perAgent` requests; then `none` requests of each kind.
 * A task over {@link DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL} is split into several calls.
 *
 * @param agents The discoverable agents ({@link DiscoverableAgentsForCorpus}).
 * @param perAgent Requests per agent.
 * @param none `none` requests in all.
 */
export function PlanDiscoveryCorpus(agents: ReadonlyArray<DecisionDiscoveryOption>, perAgent: number, none: number): DiscoveryCorpusTask[] {
    const agentTasks = agents.flatMap(agent => splitTask(`agent:${agent.Name}`, perAgent).map(part => ({
        Key: part.Key,
        Label: { label: 'agent' as const, agentId: agent.ID },
        Count: part.Count,
        Prompt: BuildAgentRequestsPrompt(agent, agents.filter(a => a.ID !== agent.ID), part.Count)
    })));
    const split = SplitNoneCount(none);
    const noneTasks = DISCOVERY_NONE_KINDS.flatMap(kind => splitTask(`none:${kind}`, split[kind]).map(part => ({
        Key: part.Key,
        Label: { label: 'none' as const, kind },
        Count: part.Count,
        Prompt: BuildNoneRequestsPrompt(kind, agents, part.Count)
    })));
    return [...agentTasks, ...noneTasks];
}

/**
 * Reads one reply: JSON (a code fence around it is tolerated) of the form `{"requests": [...]}`,
 * whose requests are strings. Blank and over-long requests, and near-duplicates within the reply,
 * are dropped; the reply is usable when at least `count` remain, and the first `count` are kept.
 *
 * @param text The reply's text.
 * @param count How many requests were asked for.
 */
export function ParseGeneratedRequests(text: string, count: number): ParsedGeneratedRequests {
    let json: unknown;
    try {
        json = JSON.parse(StripJsonFence(text));
    } catch {
        return { Error: 'it was not valid JSON' };
    }
    if (!isRequestsReply(json)) {
        return { Error: 'it was not an object with a "requests" array of strings' };
    }
    const kept = DeduplicateRequests(json.requests.map(r => r.trim()).filter(r => r.length > 0 && r.length <= DISCOVERY_CORPUS_MAX_REQUEST_CHARS));
    if (kept.Kept.length < count) {
        return { Error: `it held ${kept.Kept.length} usable, distinct request(s) of the ${count} asked for` };
    }
    return { Requests: kept.Kept.slice(0, count) };
}

/**
 * A request reduced for comparison: lower case, anything but letters and digits as spaces, runs of
 * spaces collapsed.
 *
 * @param request The request.
 */
export function NormalizeRequestText(request: string): string {
    return request.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Whether two requests are near-identical: the same after {@link NormalizeRequestText}, or, when
 * both have at least four distinct words, sharing {@link DISCOVERY_CORPUS_NEAR_DUPLICATE_OVERLAP} of
 * their words (Jaccard overlap).
 *
 * @param a One request.
 * @param b The other.
 */
export function AreNearDuplicateRequests(a: string, b: string): boolean {
    const left = NormalizeRequestText(a);
    const right = NormalizeRequestText(b);
    if (left === right) {
        return true;
    }
    const leftWords = new Set(left.split(' '));
    const rightWords = new Set(right.split(' '));
    if (leftWords.size < NEAR_DUPLICATE_MIN_WORDS || rightWords.size < NEAR_DUPLICATE_MIN_WORDS) {
        return false;
    }
    const shared = [...leftWords].filter(word => rightWords.has(word)).length;
    return shared / (leftWords.size + rightWords.size - shared) >= DISCOVERY_CORPUS_NEAR_DUPLICATE_OVERLAP;
}

/**
 * Keeps each request unless it is near-identical to one kept before it, in order.
 *
 * @param requests The requests.
 * @param earlier Requests already kept elsewhere, which also count.
 */
export function DeduplicateRequests(requests: readonly string[], earlier: readonly string[] = []): { Kept: string[]; Dropped: number } {
    const seen = [...earlier];
    const kept: string[] = [];
    for (const request of requests) {
        if (!seen.some(other => AreNearDuplicateRequests(request, other))) {
            kept.push(request);
            seen.push(request);
        }
    }
    return { Kept: kept, Dropped: requests.length - kept.length };
}

/**
 * Makes one task's call, asking again after a bad reply at most {@link DISCOVERY_CORPUS_MAX_RETRIES}
 * times. A reply the driver reports as failed, or that throws, counts as bad.
 *
 * @param driver The chat driver.
 * @param model The vendor's API name for the model.
 * @param task The task.
 * @returns The requests (or the last reason there are none), and how many calls it took.
 */
export async function GenerateTaskRequests(
    driver: DiscoveryCorpusChatDriver,
    model: string,
    task: DiscoveryCorpusTask
): Promise<{ Requests: string[] | null; Reason: string | null; Calls: number }> {
    let reason: string | null = null;
    for (let attempt = 0; attempt <= DISCOVERY_CORPUS_MAX_RETRIES; attempt++) {
        const reply = await askOnce(driver, BuildGenerationParams(model, task, reason));
        const parsed = 'Error' in reply ? reply : ParseGeneratedRequests(reply.Text, task.Count);
        if ('Requests' in parsed) {
            return { Requests: parsed.Requests, Reason: null, Calls: attempt + 1 };
        }
        reason = parsed.Error;
    }
    return { Requests: null, Reason: reason, Calls: DISCOVERY_CORPUS_MAX_RETRIES + 1 };
}

/**
 * The chat call for a task: the generation prompt as the system message, the task's prompt as the
 * user message, and, on a retry, why the last reply could not be used. JSON is asked for.
 *
 * @param model The vendor's API name for the model.
 * @param task The task.
 * @param retryReason Why the last reply could not be used, or null on the first attempt.
 */
export function BuildGenerationParams(model: string, task: DiscoveryCorpusTask, retryReason: string | null): ChatParams {
    const messages: ChatMessage[] = [
        { role: ChatMessageRole.system, content: DISCOVERY_CORPUS_GENERATION_PROMPT },
        { role: ChatMessageRole.user, content: task.Prompt }
    ];
    if (retryReason) {
        messages.push({ role: ChatMessageRole.user, content: BuildRetryNote(retryReason) });
    }
    const params = new ChatParams();
    params.model = model;
    params.messages = messages;
    params.responseFormat = 'JSON';
    params.maxOutputTokens = OUTPUT_TOKENS_BASE + task.Count * OUTPUT_TOKENS_PER_REQUEST;
    return params;
}

/**
 * Runs every task, then drops requests near-identical to one from an earlier task, and interleaves
 * what is left across tasks (the first request of each task, then the second, and so on), so a
 * prefix of the corpus covers every agent and kind.
 *
 * @param params The driver, the model and the tasks.
 */
export async function GenerateDiscoveryCorpus(params: DiscoveryCorpusGenerationParams): Promise<DiscoveryCorpusGenerationResult> {
    const perTask: GeneratedDiscoveryRequest[][] = [];
    const shortfalls: DiscoveryCorpusShortfall[] = [];
    const kept: string[] = [];
    let calls = 0;
    let dropped = 0;
    for (const task of params.Tasks) {
        const outcome = await GenerateTaskRequests(params.Driver, params.Model, task);
        calls += outcome.Calls;
        const distinct = DeduplicateRequests(outcome.Requests ?? [], kept);
        kept.push(...distinct.Kept);
        dropped += distinct.Dropped;
        perTask.push(distinct.Kept.map(request => ({ Request: request, Label: task.Label, Task: task.Key })));
        if (distinct.Kept.length < task.Count) {
            shortfalls.push({ Task: task.Key, Wanted: task.Count, Kept: distinct.Kept.length, Reason: outcome.Reason });
        }
        params.Log?.(`  ${task.Key}: ${distinct.Kept.length}/${task.Count} kept in ${outcome.Calls} call(s)${outcome.Reason ? ` — ${outcome.Reason}` : ''}`);
    }
    return {
        Requests: interleave(perTask),
        Calls: calls,
        Retries: calls - params.Tasks.length,
        DuplicatesDropped: dropped,
        Shortfalls: shortfalls
    };
}

/**
 * Generates the corpus, or, on a dry run, does nothing at all: the driver is not even created.
 *
 * @param params Whether it is a dry run, how to create the driver, the model and the tasks.
 * @returns What was generated, or null on a dry run.
 */
export async function GenerateOrPlanDiscoveryCorpus(params: DiscoveryCorpusRunParams): Promise<DiscoveryCorpusGenerationResult | null> {
    if (params.DryRun) {
        return null;
    }
    return GenerateDiscoveryCorpus({ Driver: params.CreateDriver(), Model: params.Model, Tasks: params.Tasks, Log: params.Log });
}

/**
 * Checks where a corpus is going before anything is loaded or asked: the directory must be outside
 * every git working tree (`AssertOutputOutsideRepo`, which throws `OutputInsideRepoError`), and must
 * not already hold a corpus, because a regenerated one carries new IDs and would orphan every record
 * built from the old. Returns the resolved directory.
 *
 * @param outDir The `--out` directory; it need not exist yet.
 * @param repoRoots Repositories it must also stay out of (the rig's own).
 */
export function AssertCorpusOutputDir(outDir: string, repoRoots: readonly string[]): string {
    const resolved = AssertOutputOutsideRepo(outDir, repoRoots);
    const existing = DISCOVERY_CORPUS_FILES.map(file => join(resolved, file)).find(path => existsSync(path));
    if (existing) {
        throw new Error(`Refusing to overwrite ${existing}: choose a new --out directory.`);
    }
    return resolved;
}

/**
 * The corpus as its three files: each request with a new ID and the creation time, its label from
 * construction, and the catalog snapshot it was generated from.
 *
 * @param requests The generated requests.
 * @param agents The discoverable agents they were generated for.
 * @param conversationManagerId The conversation manager the catalog excludes.
 * @param newId Makes a request ID (a UUID).
 * @param now The creation time.
 */
export function BuildDiscoveryCorpusFiles(
    requests: ReadonlyArray<GeneratedDiscoveryRequest>,
    agents: ReadonlyArray<DecisionDiscoveryOption>,
    conversationManagerId: string,
    newId: () => string,
    now: Date
): DiscoveryCorpusFiles {
    const createdAt = now.toISOString();
    const lines = requests.map(r => ({ Id: newId(), Generated: r }));
    return {
        Corpus: lines.map(({ Id, Generated }) => ({ id: Id, request: Generated.Request, created_at: createdAt })),
        Labels: lines.map(({ Id, Generated }) => labelLine(Id, Generated.Label)),
        Agents: {
            created_at: createdAt,
            conversation_manager_id: conversationManagerId,
            agents: agents.map(a => ({ ID: a.ID, Name: a.Name, Description: a.Description }))
        }
    };
}

/** One label line, from construction. */
function labelLine(id: string, label: DiscoveryLabel): DiscoveryCorpusLabel {
    return label.label === 'agent'
        ? { id, label: 'agent', agentId: label.agentId, source: DISCOVERY_CORPUS_LABEL_SOURCE }
        : { id, label: 'none', kind: label.kind, source: DISCOVERY_CORPUS_LABEL_SOURCE };
}

/** A task's parts: one per {@link DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL} requests. */
function splitTask(key: string, count: number): Array<{ Key: string; Count: number }> {
    const parts = Math.ceil(count / DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL);
    return Array.from({ length: parts }, (_, i) => ({
        Key: parts > 1 ? `${key} (${i + 1}/${parts})` : key,
        Count: Math.min(DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL, count - i * DISCOVERY_CORPUS_MAX_REQUESTS_PER_CALL)
    }));
}

/** One chat call's text, or why there is none. A thrown error is caught. */
async function askOnce(driver: DiscoveryCorpusChatDriver, params: ChatParams): Promise<{ Text: string } | { Error: string }> {
    let result: ChatResult;
    try {
        result = await driver.ChatCompletion(params);
    } catch (error) {
        return { Error: `the call failed (${error instanceof Error ? error.message : String(error)})` };
    }
    if (!result?.success) {
        return { Error: `the call failed (${result?.errorMessage ?? 'no message'})` };
    }
    const text = result.data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim().length > 0 ? { Text: text } : { Error: 'the reply was empty' };
}

/** Whether a parsed reply is `{ requests: string[] }`. */
function isRequestsReply(value: unknown): value is { requests: string[] } {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !('requests' in value)) {
        return false;
    }
    const requests = value.requests;
    return Array.isArray(requests) && requests.every(r => typeof r === 'string');
}

/** The first item of each list, then the second, and so on. */
function interleave<T>(lists: ReadonlyArray<ReadonlyArray<T>>): T[] {
    const longest = Math.max(0, ...lists.map(l => l.length));
    return Array.from({ length: longest }, (_, i) => lists.flatMap(l => (i < l.length ? [l[i]] : []))).flat();
}

/** The model's name, driver class and API name. */
function toModel(model: Pick<MJAIModelEntity, 'Name' | 'DriverClass' | 'APIName'>): DiscoveryCorpusModel {
    return { Name: model.Name, DriverClass: model.DriverClass ?? '', APIName: model.APIName ?? '' };
}
