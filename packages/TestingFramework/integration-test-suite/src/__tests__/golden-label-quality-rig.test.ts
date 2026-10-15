/**
 * Unit tests of the label-quality rig's pure logic (`rigs/feature-pipelines/lib/golden-label-quality-rig.ts`): the
 * checkpoint key (instructions, labeler models and case inputs), answer parsing and the corrective retry, the labeler
 * order and the budget ceiling. The rig itself calls live models, so none of this runs it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseLLM, ChatParams, ChatResult, type ClassifyParams, type ClassifyResult, type SummarizeParams, type SummarizeResult } from '@memberjunction/ai';
import {
    GoldenLabelQualityRig, LabelBudgetExceededError, LabelCheckpointMismatchError, LabelerCallError,
    type LabelCheckpointKey, type LabelerAFile, type LabelerCandidate, type LabelSpend, type NewLabeler,
} from '../../rigs/feature-pipelines/lib/golden-label-quality-rig';

/** An LLM double that answers each call with the next scripted reply (null = a failed call), recording what it was sent. */
class ScriptedLLM extends BaseLLM {
    public Sent: ChatParams[] = [];
    constructor(private readonly replies: Array<string | null>) {
        super('k');
    }
    protected async nonStreamingChatCompletion(p: ChatParams): Promise<ChatResult> {
        this.Sent.push(p);
        const reply = this.replies[this.Sent.length - 1];
        const r = new ChatResult(reply !== null, new Date(), new Date());
        if (reply === null) {
            r.errorMessage = '503 unavailable';
            r.statusText = 'error';
            return r;
        }
        r.data = { choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop', index: 0 }] };
        return r;
    }
    protected async createStreamingRequest(): Promise<AsyncIterable<string>> { return { async *[Symbol.asyncIterator]() { /* none */ } }; }
    protected processStreamingChunk(c: string) { return { content: c, finishReason: undefined, usage: null }; }
    protected finalizeStreamingResponse(): ChatResult { return new ChatResult(true, new Date(), new Date()); }
    public async ClassifyText(_p: ClassifyParams): Promise<ClassifyResult> { throw new Error('n/a'); }
    public async SummarizeText(_p: SummarizeParams): Promise<SummarizeResult> { throw new Error('n/a'); }
}

const ALLOWED = { JobFunctions: ['Sales', 'Operations', 'Education & Training'], SeniorityLevel: ['Director', 'Individual Contributor'] };
const zeroSpend = (): LabelSpend => ({ Calls: 0, PromptTokens: 0, CompletionTokens: 0, CacheReadTokens: 0, Cost: 0, LastCallCost: 0 });
const labeler = (llm: BaseLLM): NewLabeler => ({ Identity: { ID: 'B', Vendor: 'OpenAI', Model: 'M', PromptSha256: 'x' }, LLM: llm, APIName: 'm', ModelID: 'mid', VendorID: 'vid' });
const fileA = (title: string): LabelerAFile => ({
    About: 'test',
    Cases: [
        { ID: 'g01', Input: { CurrentJobTitle: title }, Expected: { JobFunctions: ['Sales'], SeniorityLevel: ['Director'] }, Labeler: 'A' },
        { ID: 'g02', Input: { CurrentJobTitle: 'Instructor' }, Expected: { JobFunctions: ['Education & Training'], SeniorityLevel: ['Individual Contributor'] }, Labeler: 'A' },
    ],
});
const keyFor = (a: LabelerAFile, over: Partial<LabelCheckpointKey> = {}): LabelCheckpointKey => ({
    InstructionsSha256: 'i1', CasesSha256: GoldenLabelQualityRig.CasesInputSha256(a), Models: { B: 'GPT', C: 'Gemini' }, ...over,
});

describe('label-quality rig: checkpoint', () => {
    let dir = '';
    let path = '';
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        dir = mkdtempSync(join(tmpdir(), 'glq-'));
        path = join(dir, 'audit.json.partial.json');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const save = (key: LabelCheckpointKey, cost: number): void => {
        writeFileSync(path, JSON.stringify({ ...key, Answers: { g01: { B: { JobFunctions: ['Sales'], SeniorityLevel: ['Director'] } } }, Spend: { ...zeroSpend(), Calls: 1, Cost: cost, LastCallCost: cost } }));
    };

    it('starts empty when there is no checkpoint', () => {
        const key = keyFor(fileA('Director of Sales'));
        const cp = GoldenLabelQualityRig.LoadCheckpoint(path, key, zeroSpend());
        expect(cp.Answers).toEqual({});
        expect(cp.CasesSha256).toBe(key.CasesSha256);
    });

    it('reuses the answers and carries their spend when instructions, models and case inputs match', () => {
        const key = keyFor(fileA('Director of Sales'));
        save(key, 0.003);
        const spend = zeroSpend();
        const cp = GoldenLabelQualityRig.LoadCheckpoint(path, key, spend);
        expect(cp.Answers['g01']['B']).toEqual({ JobFunctions: ['Sales'], SeniorityLevel: ['Director'] });
        expect(spend.Cost).toBe(0.003);
        expect(cp.Spend).toBe(spend);
    });

    it('refuses a checkpoint made for another title under the same case ID (answers would belong to the old title)', () => {
        save(keyFor(fileA('Director of Sales')), 0.003);
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(fileA('Sales Director')), zeroSpend()))
            .toThrow(LabelCheckpointMismatchError);
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(fileA('Sales Director')), zeroSpend()))
            .toThrow(/case inputs/);
    });

    it('refuses a checkpoint made under other instructions or other labeler models', () => {
        const a = fileA('Director of Sales');
        save(keyFor(a), 0.003);
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(a, { InstructionsSha256: 'i2' }), zeroSpend())).toThrow(/instructions/);
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(a, { Models: { B: 'GPT', C: 'Other' } }), zeroSpend())).toThrow(/labeler models/);
    });

    it('refuses a file that is not a checkpoint (e.g. one written before case inputs were recorded)', () => {
        writeFileSync(path, JSON.stringify({ InstructionsSha256: 'i1', Models: {}, Answers: {}, Spend: zeroSpend() }));
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(fileA('x')), zeroSpend())).toThrow(/not a label checkpoint/);
        writeFileSync(path, JSON.stringify({ InstructionsSha256: 'i1', CasesSha256: 5, Models: {}, Answers: {}, Spend: zeroSpend() }));
        expect(() => GoldenLabelQualityRig.LoadCheckpoint(path, keyFor(fileA('x')), zeroSpend())).toThrow(/not a label checkpoint/);
    });

    it('case-input hash: changes with a title or a case ID, not with labeler A\'s expected labels', () => {
        const a = fileA('Director of Sales');
        const base = GoldenLabelQualityRig.CasesInputSha256(a);
        expect(GoldenLabelQualityRig.CasesInputSha256(fileA('Sales Director'))).not.toBe(base);
        expect(GoldenLabelQualityRig.CasesInputSha256({ ...a, Cases: a.Cases.map((c, i) => (i === 0 ? { ...c, ID: 'g99' } : c)) })).not.toBe(base);
        expect(GoldenLabelQualityRig.CasesInputSha256({ ...a, Cases: a.Cases.map((c) => ({ ...c, Expected: { JobFunctions: ['Operations'], SeniorityLevel: ['Director'] } })) })).toBe(base);
    });
});

describe('label-quality rig: labeler A file shape', () => {
    it('accepts a labeler A file and rejects one with a missing output or a non-text title', () => {
        expect(GoldenLabelQualityRig.IsLabelerAFile(fileA('Owner'))).toBe(true);
        const missing = { About: 'x', Cases: [{ ID: 'g01', Input: { CurrentJobTitle: 'Owner' }, Expected: { JobFunctions: ['Sales'] }, Labeler: 'A' }] };
        expect(GoldenLabelQualityRig.IsLabelerAFile(missing)).toBe(false);
        const badTitle = { About: 'x', Cases: [{ ID: 'g01', Input: { CurrentJobTitle: 7 }, Expected: { JobFunctions: ['Sales'], SeniorityLevel: ['Director'] }, Labeler: 'A' }] };
        expect(GoldenLabelQualityRig.IsLabelerAFile(badTitle)).toBe(false);
        expect(GoldenLabelQualityRig.IsLabelerAFile({ cases: [] })).toBe(false);
    });
});

describe('label-quality rig: answers', () => {
    // CleanJSON reports unparseable text on console.warn; the tests assert the outcome instead.
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));

    it('maps names to the taxonomy spelling, ignoring case and a markdown fence', () => {
        const r = GoldenLabelQualityRig.ParseAnswer('```json\n{"JobFunctions":["education & training","Sales"],"SeniorityLevel":["director"]}\n```', ALLOWED);
        expect(r).toEqual({ Answer: { JobFunctions: ['Education & Training', 'Sales'], SeniorityLevel: ['Director'] }, Problems: [] });
    });

    it('rejects invalid JSON, a non-object, an empty output and a name outside the taxonomy', () => {
        expect(GoldenLabelQualityRig.ParseAnswer('not json', ALLOWED).Answer).toBeNull();
        expect(GoldenLabelQualityRig.ParseAnswer('["Sales"]', ALLOWED).Problems).toEqual(['the answer is not a JSON object']);
        expect(GoldenLabelQualityRig.ParseAnswer('{"JobFunctions":[],"SeniorityLevel":["Director"]}', ALLOWED).Answer).toBeNull();
        const outside = GoldenLabelQualityRig.ParseAnswer('{"JobFunctions":["Grand Poobah"],"SeniorityLevel":["Director"]}', ALLOWED);
        expect(outside.Answer).toBeNull();
        expect(outside.Problems[0]).toMatch(/JobFunctions must be a non-empty array of names/);
    });

    it('retries an invalid answer once, telling the labeler what was wrong, and keeps the valid second answer', async () => {
        const llm = new ScriptedLLM(['{"JobFunctions":["Grand Poobah"],"SeniorityLevel":["Director"]}', '{"JobFunctions":["Sales"],"SeniorityLevel":["Director"]}']);
        const answer = await GoldenLabelQualityRig.Label(labeler(llm), 'guide', 'Director of Sales', ALLOWED, zeroSpend(), 1);
        expect(answer).toEqual({ JobFunctions: ['Sales'], SeniorityLevel: ['Director'] });
        expect(llm.Sent).toHaveLength(2);
        expect(llm.Sent[1].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
        expect(String(llm.Sent[1].messages[3].content)).toMatch(/^Invalid answer: JobFunctions must be/);
        expect(llm.Sent[0].temperature).toBeUndefined();
    });

    it('counts a second invalid answer as no answer (null), after exactly two calls', async () => {
        const llm = new ScriptedLLM(['nope', 'still nope']);
        expect(await GoldenLabelQualityRig.Label(labeler(llm), 'guide', 'Director of Sales', ALLOWED, zeroSpend(), 1)).toBeNull();
        expect(llm.Sent).toHaveLength(2);
    });

    it('stops on a failed call instead of scoring it as a disagreement', async () => {
        const llm = new ScriptedLLM([null]);
        await expect(GoldenLabelQualityRig.Label(labeler(llm), 'guide', 'Director of Sales', ALLOWED, zeroSpend(), 1)).rejects.toBeInstanceOf(LabelerCallError);
        expect(llm.Sent).toHaveLength(1);
    });

    it('refuses a call the budget no longer covers, before sending it', async () => {
        const llm = new ScriptedLLM(['{}']);
        const spend: LabelSpend = { ...zeroSpend(), Calls: 3, Cost: 0.009, LastCallCost: 0.003 };
        await expect(GoldenLabelQualityRig.Label(labeler(llm), 'guide', 'x', ALLOWED, spend, 0.01)).rejects.toBeInstanceOf(LabelBudgetExceededError);
        expect(llm.Sent).toHaveLength(0);
    });
});

describe('label-quality rig: budget ceiling and labeler order', () => {
    it('allows a call while spend plus the last call stays within the cap, and refuses once it would pass', () => {
        expect(() => GoldenLabelQualityRig.AssertWithinBudget({ ...zeroSpend(), Cost: 0.007, LastCallCost: 0.003 }, 0.01)).not.toThrow();
        expect(() => GoldenLabelQualityRig.AssertWithinBudget({ ...zeroSpend(), Cost: 0.0071, LastCallCost: 0.003 }, 0.01)).toThrow(LabelBudgetExceededError);
        // The first call has no estimate yet, so it is never refused (the documented one-call overshoot).
        expect(() => GoldenLabelQualityRig.AssertWithinBudget(zeroSpend(), 0.000001)).not.toThrow();
    });

    it('orders by PowerRank, then lower output price (unpriced last), then name', () => {
        const c = (Name: string, PowerRank: number, OutputPrice: number): LabelerCandidate => ({ Name, ModelID: Name, VendorID: 'v', APIName: Name, PowerRank, OutputPrice });
        const sorted = [c('Pro', 26, 12), c('Unpriced', 26, Number.POSITIVE_INFINITY), c('Flash', 26, 3.75), c('Old', 20, 0.5), c('Unpriced2', 26, Number.POSITIVE_INFINITY), c('Top', 27, 50)]
            .sort(GoldenLabelQualityRig.CompareCandidates).map((x) => x.Name);
        expect(sorted).toEqual(['Top', 'Flash', 'Pro', 'Unpriced', 'Unpriced2', 'Old']);
    });
});

describe('GoldenLabelQualityRig.SpecificationCasesOf', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'glq-spec-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('keeps the specification cases of the golden set being replaced, in order, so a re-run never drops them', () => {
        const path = join(dir, 'golden.json');
        const required = { ID: 'h01', Input: { CurrentJobTitle: 'asdf' }, Expected: { SeniorityLevel: ['Unknown'] }, ExpectAbstain: ['SeniorityLevel'], Required: true, LabelSource: 'specification' };
        const labelled = { ID: 'g01', Input: { CurrentJobTitle: 'Owner' }, Expected: { SeniorityLevel: ['C-Level'] }, LabelSource: 'model-consensus' };
        writeFileSync(path, JSON.stringify({ Cases: [labelled, required], LabelQuality: null }));
        expect(GoldenLabelQualityRig.SpecificationCasesOf(path)).toEqual([required]);
    });

    it('has none when the golden set does not exist yet', () => {
        expect(GoldenLabelQualityRig.SpecificationCasesOf(join(dir, 'missing.json'))).toEqual([]);
    });

    it('refuses a golden set whose specification case is malformed, rather than dropping it', () => {
        const path = join(dir, 'golden.json');
        writeFileSync(path, JSON.stringify({ Cases: [{ ID: 'h01', LabelSource: 'specification' }] }));
        expect(() => GoldenLabelQualityRig.SpecificationCasesOf(path)).toThrow(/h01/);
    });
});
