/**
 * golden-label-quality-rig.ts — the label-quality rig's logic, without side effects so it can be unit-tested; the
 * command line is `../golden-label-quality.ts`. Labels every golden case with labelers B (OpenAI) and C (Google) under
 * the written guide, adjudicates against labeler A, and writes the golden set with its label-quality record (carrying
 * over the set's unlabelled `specification` cases, after the labelled ones). No person
 * reviews labels: agreement, adjudication and exclusion are computed by GoldenLabelQualityCheck.Adjudicate, and the
 * golden-set driver re-checks the stored record before every evaluation.
 *
 * Budget (`--max-cost`): the spend across resumed runs. Before every call the rig refuses when the spend so far plus
 * the last call's cost (the estimate of the next one) would pass it. The estimate can be low by the difference between
 * two calls (the first call of a run is never refused, and B and C alternate), so the spend can pass the cap by at most
 * about one call.
 *
 * Checkpoint: every answer is saved to `<labels-audit.json>.partial.json` as soon as it arrives, so a run stopped by the
 * budget or a failed call loses no paid answer; the next run reuses the answers (and their spend) only when the
 * instructions, the labeler models AND the case inputs (labeler A's IDs and titles) are the ones they were given for.
 * A checkpoint made under anything else is refused, never mixed. It is deleted once the golden set is written.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { RunView } from '@memberjunction/core';
import { CleanJSON, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseLLM, ChatMessageRole, ChatParams, GetAIAPIKey, ModelUsage, type ChatMessage, type ChatResult } from '@memberjunction/ai';
// Side-effect imports: each registers its driver class with the ClassFactory under its DriverClass name.
import '@memberjunction/ai-gemini';
import '@memberjunction/ai-openai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GoldenLabelQualityCheck, type GoldenCase, type LabelerAnswer, type LabelerIdentity, type LabelledCase } from '@memberjunction/testing-engine';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RigUsageError } from '../../lib/rig-cli';

/** The pipeline outputs every labeler answers, in the order the golden set stores them. */
export const GOLDEN_LABEL_OUTPUTS = ['JobFunctions', 'SeniorityLevel'] as const;
export type GoldenLabelOutputName = typeof GOLDEN_LABEL_OUTPUTS[number];

/**
 * The vendors of labelers B and C, with the driver and API-key name each one uses: two model families (OpenAI GPT and
 * Google Gemini), so their agreement with labeler A is independent evidence.
 */
export const NEW_LABELERS = [
    { ID: 'B', Vendor: 'OpenAI', DriverClass: 'OpenAILLM' },
    { ID: 'C', Vendor: 'Google', DriverClass: 'GeminiLLM' },
] as const;
export type NewLabelerSpec = typeof NEW_LABELERS[number];

/** Labeler A's identity in the golden set's record: the independent blind labeler whose model was not recorded. */
export const LABELER_A_IDENTITY: LabelerIdentity = {
    ID: 'A', Vendor: 'independent blind labeler (model not recorded)', Model: 'not recorded', PromptSha256: null,
};

/** One case of labeler A's file. */
export interface LabelerACase { ID: string; Input: { CurrentJobTitle: string }; Expected: Record<GoldenLabelOutputName, string[]>; Labeler: 'A' }
/** Labeler A's file (`job-title-labeler-a.json`): the fixed labels every new labeler is compared with. */
export interface LabelerAFile {
    /** Where the labels came from and which copy of the titles this file is. */
    About: string;
    Cases: LabelerACase[];
}
/** One taxonomy row as the labelers see it. */
export interface TaxonomyRow { Name: string; Description: string | null; }
/** A new labeler: who it is, the driver that calls it, and the IDs its calls are priced under. */
export interface NewLabeler { Identity: LabelerIdentity; LLM: BaseLLM; APIName: string; ModelID: string; VendorID: string; }
/** A model a vendor serves that could label, with what the labeler order reads. */
export interface LabelerCandidate { Name: string; ModelID: string; VendorID: string; APIName: string; PowerRank: number; OutputPrice: number; }
/** What the labeler calls cost so far. */
export interface LabelSpend { Calls: number; PromptTokens: number; CompletionTokens: number; CacheReadTokens: number; Cost: number; LastCallCost: number; }
/** What a checkpoint's answers were given for; a checkpoint is reused only when all three match. */
export interface LabelCheckpointKey {
    InstructionsSha256: string;
    /** SHA-256 of labeler A's case IDs and inputs (the titles the answers are for). */
    CasesSha256: string;
    /** Labeler ID → model name, as selected when the answers were given. */
    Models: Record<string, string>;
}
/** The answers saved so far (`<audit>.partial.json`). */
export interface LabelCheckpoint extends LabelCheckpointKey {
    /** Case ID → labeler ID → that labeler's answer (null = no valid answer after the corrective retry). */
    Answers: Record<string, Record<string, LabelerAnswer>>;
    Spend: LabelSpend;
}
/** The parsed command line. */
export interface GoldenLabelRigArgs { LabelerAPath: string; GuidePath: string; OutPath: string; AuditPath: string; MaxCost: number; }

/** Stops the run, before the golden set is written, when the labeler calls would cost more than `--max-cost`. */
export class LabelBudgetExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LabelBudgetExceededError';
    }
}

/** A labeler call the provider did not answer; the run stops before the golden set is written, so a provider failure is never scored. */
export class LabelerCallError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LabelerCallError';
    }
}

/** A checkpoint that may not be reused: made for other instructions, labeler models or case inputs, or not a checkpoint. */
export class LabelCheckpointMismatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LabelCheckpointMismatchError';
    }
}

/** The label-quality rig: one run labels, adjudicates and writes the golden set. */
export class GoldenLabelQualityRig {
    /** Parses and checks the command line. @throws RigUsageError on a missing or invalid argument */
    public static ParseArgs(argv: string[]): GoldenLabelRigArgs {
        const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--max-cost');
        const [aPath, guidePath, outPath, auditPath] = positional;
        if (!aPath || !guidePath || !outPath || !auditPath) {
            throw new RigUsageError('four file paths are required');
        }
        const i = argv.indexOf('--max-cost');
        const maxCost = i >= 0 ? Number(argv[i + 1]) : Number.NaN;
        // A live run must have a ceiling: the labelers are frontier models priced per token.
        if (!Number.isFinite(maxCost) || maxCost <= 0) {
            throw new RigUsageError('--max-cost <USD> is required and must be a positive number');
        }
        return { LabelerAPath: aPath, GuidePath: guidePath, OutPath: outPath, AuditPath: auditPath, MaxCost: maxCost };
    }

    /**
     * Reads labeler A's file, checking its shape. `unknown` because the file is edited by hand; every member is checked
     * before it is used.
     * @throws Error naming the first member that does not have the expected shape
     */
    public static ReadLabelerAFile(path: string): LabelerAFile {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (!GoldenLabelQualityRig.IsLabelerAFile(parsed)) {
            throw new Error(`${path} is not a labeler A file: it needs About (text) and Cases[] with ID, Input.CurrentJobTitle, `
                + `Expected.{${GOLDEN_LABEL_OUTPUTS.join(', ')}} (arrays of text) and Labeler 'A'`);
        }
        return parsed;
    }

    /** Whether a parsed value is a labeler A file. `unknown` because it comes from JSON.parse. */
    public static IsLabelerAFile(v: unknown): v is LabelerAFile {
        if (typeof v !== 'object' || v === null || !('About' in v) || !('Cases' in v)) {
            return false;
        }
        return typeof v.About === 'string' && Array.isArray(v.Cases) && v.Cases.every((c: unknown) => GoldenLabelQualityRig.IsLabelerACase(c));
    }

    /** Whether a parsed value is one labeler A case. `unknown` because it comes from JSON.parse. */
    protected static IsLabelerACase(c: unknown): c is LabelerACase {
        if (typeof c !== 'object' || c === null || !('ID' in c) || !('Input' in c) || !('Expected' in c) || !('Labeler' in c)) {
            return false;
        }
        const input = c.Input;
        const expected = c.Expected;
        return typeof c.ID === 'string' && c.Labeler === 'A'
            && typeof input === 'object' && input !== null && 'CurrentJobTitle' in input && typeof input.CurrentJobTitle === 'string'
            && typeof expected === 'object' && expected !== null
            && GOLDEN_LABEL_OUTPUTS.every((o) => o in expected && GoldenLabelQualityRig.IsTextArray(new Map<string, unknown>(Object.entries(expected)).get(o)));
    }

    /** Whether a value is an array of text. `unknown` because it comes from JSON.parse. */
    protected static IsTextArray(v: unknown): v is string[] {
        return Array.isArray(v) && v.every((x) => typeof x === 'string');
    }

    /** The Active rows of a taxonomy entity, in its own order. @throws Error when the read fails */
    public static async LoadTaxonomy(ctx: IntegrationBootstrapContext, entity: string): Promise<TaxonomyRow[]> {
        const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<TaxonomyRow>({
            EntityName: entity, ExtraFilter: `Status='Active'`, OrderBy: 'Sequence', Fields: ['Name', 'Description'],
        }, ctx.User);
        if (!r.Success) {
            throw new Error(`${entity}: ${r.ErrorMessage}`);
        }
        return r.Results;
    }

    /**
     * Fails before any model call when labeler A names a label the taxonomy does not have (e.g. the taxonomy was not
     * pushed yet): the new labelers may only answer from the taxonomy, so such a case could never agree.
     * @throws Error naming every case and label outside the taxonomy
     */
    public static AssertLabelerAInTaxonomy(a: LabelerAFile, allowed: Record<GoldenLabelOutputName, string[]>): void {
        const problems: string[] = [];
        for (const k of a.Cases) {
            for (const o of GOLDEN_LABEL_OUTPUTS) {
                const labels = k.Expected[o] || [];
                if (labels.length === 0) {
                    problems.push(`${k.ID} has no ${o} label`);
                }
                for (const l of labels.filter((x) => !allowed[o].some((n) => n.toLowerCase() === x.toLowerCase()))) {
                    problems.push(`${k.ID} ${o} '${l}'`);
                }
            }
        }
        if (problems.length > 0) {
            throw new Error(`labeler A uses labels outside the Active taxonomy: ${problems.join('; ')}`);
        }
    }

    /**
     * The labeler of a vendor: the Active LLM with the highest PowerRank that the vendor serves (an Active inference
     * provider row with an API name and the vendor's driver). A PowerRank tie goes to the LOWER output price (the
     * model's active Realtime cost row for that vendor; a model without one sorts after every priced model), then to
     * the model name, so the choice is repeatable and, between equally ranked models, the cheaper one labels. The
     * driver is created through the ClassFactory by its DriverClass name, as MJ creates every LLM driver.
     * @throws Error when the vendor serves no such model, or its driver class is not registered
     */
    public static NewLabeler(spec: NewLabelerSpec, instructionsSha: string): NewLabeler {
        const engine = AIEngineBase.Instance;
        const candidates: LabelerCandidate[] = [];
        for (const mv of engine.ModelVendors) {
            const model = engine.Models.find((m) => UUIDsEqual(m.ID, mv.ModelID));
            if (mv.Vendor === spec.Vendor && mv.Type === 'Inference Provider' && mv.Status === 'Active' && mv.DriverClass === spec.DriverClass
                && mv.APIName && model?.IsActive && model.AIModelType === 'LLM') {
                candidates.push({ Name: model.Name, ModelID: model.ID, VendorID: mv.VendorID, APIName: mv.APIName,
                    PowerRank: model.PowerRank || 0, OutputPrice: GoldenLabelQualityRig.OutputPrice(model.ID, mv.VendorID) });
            }
        }
        const chosen = candidates.sort(GoldenLabelQualityRig.CompareCandidates)[0];
        if (!chosen) {
            throw new Error(`no Active LLM served by vendor ${spec.Vendor} through ${spec.DriverClass}`);
        }
        const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, spec.DriverClass, GetAIAPIKey(spec.DriverClass));
        if (!llm) {
            throw new Error(`driver class ${spec.DriverClass} is not registered`);
        }
        return {
            Identity: { ID: spec.ID, Vendor: spec.Vendor, Model: chosen.Name, PromptSha256: instructionsSha },
            LLM: llm, APIName: chosen.APIName, ModelID: chosen.ModelID, VendorID: chosen.VendorID,
        };
    }

    /** Labeler order: PowerRank descending, then output price ascending (unpriced last), then model name. */
    public static CompareCandidates(x: LabelerCandidate, y: LabelerCandidate): number {
        if (x.PowerRank !== y.PowerRank) {
            return y.PowerRank - x.PowerRank;
        }
        // Explicit comparison: Infinity − Infinity (two unpriced models) is NaN, which would leave the order undefined.
        if (x.OutputPrice !== y.OutputPrice) {
            return x.OutputPrice < y.OutputPrice ? -1 : 1;
        }
        return x.Name.localeCompare(y.Name);
    }

    /**
     * The model's output price for the vendor, in USD per million output tokens: MJ's own pricing of a fixed usage, so
     * cost rows priced per 1K, 100K or 1M tokens compare correctly. +Infinity when it cannot be priced.
     */
    public static OutputPrice(modelID: string, vendorID: string): number {
        const priced = AIEngineBase.Instance.CalculateModelCost(modelID, vendorID, new ModelUsage(0, 1_000_000));
        return priced && Number.isFinite(priced.cost) ? priced.cost : Number.POSITIVE_INFINITY;
    }

    /** The instructions every new labeler gets: the guide, the two taxonomies and the answer format. Nothing else. */
    public static BuildInstructions(guide: string, functions: TaxonomyRow[], levels: TaxonomyRow[]): string {
        const list = (r: TaxonomyRow[]): string => r.map((x) => `- ${x.Name}: ${x.Description || ''}`).join('\n');
        return [
            'You label one job title for a test set. Follow the labeling guide exactly.',
            guide,
            `JobFunctions (name: description):\n${list(functions)}`,
            `SeniorityLevel (name: description):\n${list(levels)}`,
            'Answer with JSON only: {"JobFunctions": [primary, alternates...], "SeniorityLevel": [primary, alternates...]}.',
            'Use only the names listed. Give an alternate only where the guide says a second label is defensible.',
        ].join('\n\n');
    }

    /** SHA-256 of labeler A's case IDs and inputs: what a checkpoint's answers were given for. */
    public static CasesInputSha256(a: LabelerAFile): string {
        return createHash('sha256').update(JSON.stringify(a.Cases.map((c) => [c.ID, c.Input]))).digest('hex');
    }

    /**
     * The labeler's answer, or null after one corrective retry (a second invalid answer counts as a disagreement).
     * Names are mapped to the taxonomy's own spelling.
     * @throws LabelBudgetExceededError before a call the budget no longer covers
     * @throws LabelerCallError when a call fails (the provider did not answer)
     */
    public static async Label(l: NewLabeler, instructions: string, title: string, allowed: Record<GoldenLabelOutputName, string[]>,
        spend: LabelSpend, maxCost: number): Promise<LabelerAnswer> {
        const messages: ChatMessage[] = [{ role: ChatMessageRole.system, content: instructions }, { role: ChatMessageRole.user, content: `Job title: ${title}` }];
        for (let attempt = 0; attempt < 2; attempt++) {
            GoldenLabelQualityRig.AssertWithinBudget(spend, maxCost);
            const params = new ChatParams();
            params.model = l.APIName;
            params.messages = [...messages];
            // No temperature: frontier reasoning models (e.g. GPT-6 Astra) accept only their default, and MJ has no metadata
            // saying which do. The labels are reproducible from the audit file, which stores every answer.
            params.responseFormat = 'JSON';
            const result = await l.LLM.ChatCompletion(params);
            GoldenLabelQualityRig.AddSpend(l, result, spend);
            // A failed call (bad credential, outage, rejected request) is not an answer: counting it as a disagreement
            // would record a label-quality failure that measures the provider, not the labels.
            if (!result.success) {
                throw new LabelerCallError(`labeler ${l.Identity.ID} (${l.Identity.Model}, ${l.Identity.Vendor}) call failed for '${title}': `
                    + `${result.errorMessage || result.statusText}; no golden set was written (answers so far are in the checkpoint)`);
            }
            const text = result.data.choices[0]?.message.content || '';
            const parsed = GoldenLabelQualityRig.ParseAnswer(text, allowed);
            if (parsed.Answer) {
                return parsed.Answer;
            }
            messages.push({ role: ChatMessageRole.assistant, content: text },
                { role: ChatMessageRole.user, content: `Invalid answer: ${parsed.Problems.join('; ')}. Answer again with JSON only.` });
        }
        return null;
    }

    /**
     * Parses one answer: per output, a non-empty array of names from that output's list. `unknown` because the text is
     * the model's untrusted output; every value is checked before it is used.
     */
    public static ParseAnswer(text: string, allowed: Record<GoldenLabelOutputName, string[]>): { Answer: LabelerAnswer; Problems: string[] } {
        let parsed: unknown;
        try {
            parsed = JSON.parse(CleanJSON(text) || '');
        } catch {
            return { Answer: null, Problems: ['the answer is not valid JSON'] };
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return { Answer: null, Problems: ['the answer is not a JSON object'] };
        }
        const fields = new Map<string, unknown>(Object.entries(parsed));
        const problems: string[] = [];
        const answer: Record<string, string[]> = {};
        for (const o of GOLDEN_LABEL_OUTPUTS) {
            const value = fields.get(o);
            const names = Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v : '')) : [];
            const mapped = names.map((n) => allowed[o].find((a) => a.toLowerCase() === n.trim().toLowerCase()));
            if (names.length === 0 || mapped.some((m) => m === undefined)) {
                problems.push(`${o} must be a non-empty array of names from the ${o} list (got ${JSON.stringify(value)})`);
            } else {
                answer[o] = mapped.filter((m): m is string => m !== undefined);
            }
        }
        return problems.length === 0 ? { Answer: answer, Problems: [] } : { Answer: null, Problems: problems };
    }

    /**
     * Adds one call's usage and its price (MJ's own pricing of the model and vendor) to the spend.
     * @throws Error when the call cannot be priced: an unknown cost is never counted as zero
     */
    public static AddSpend(l: NewLabeler, result: ChatResult, spend: LabelSpend): void {
        spend.Calls++;
        const usage = result.data?.usage;
        if (!usage) {
            // A failed call that reports no usage was not billed (the provider rejected it before generating).
            return;
        }
        spend.PromptTokens += usage.promptTokens || 0;
        spend.CompletionTokens += usage.completionTokens || 0;
        spend.CacheReadTokens += usage.cacheReadTokens || 0;
        const priced = AIEngineBase.Instance.CalculateModelCost(l.ModelID, l.VendorID, usage);
        if (!priced) {
            throw new Error(`the call to ${l.Identity.Model} (${l.Identity.Vendor}) could not be priced; stopping so the budget stays enforceable`);
        }
        spend.Cost += priced.cost;
        spend.LastCallCost = priced.cost;
    }

    /**
     * Refuses the next call when the spend so far plus the last call's cost (the estimate of the next one) would pass
     * the budget. A ceiling rather than a projection over the remaining calls: with prompt caching the first call of
     * each labeler costs several times the later ones, so an average-based projection refuses runs that fit. The
     * estimate can be low by the difference between two calls, so the spend can pass the cap by about one call.
     * @throws LabelBudgetExceededError naming the spend and the cap
     */
    public static AssertWithinBudget(spend: LabelSpend, maxCost: number): void {
        if (spend.Cost + spend.LastCallCost > maxCost) {
            throw new LabelBudgetExceededError(`labeler spend $${spend.Cost.toFixed(6)} after ${spend.Calls} calls plus the last call's `
                + `$${spend.LastCallCost.toFixed(6)} would pass --max-cost $${maxCost}; no golden set was written (answers so far are in the checkpoint)`);
        }
    }

    /**
     * The checkpoint to continue from: an empty one when there is none; the saved one, with its spend carried into
     * `spend`, when it was made for this key (instructions, labeler models and case inputs).
     * @throws LabelCheckpointMismatchError when the file is not a checkpoint or was made for another key: its answers
     * would belong to other instructions, models or titles
     */
    public static LoadCheckpoint(path: string, key: LabelCheckpointKey, spend: LabelSpend): LabelCheckpoint {
        if (!existsSync(path)) {
            return { ...key, Answers: {}, Spend: spend };
        }
        const saved: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (!GoldenLabelQualityRig.IsCheckpoint(saved)) {
            throw new LabelCheckpointMismatchError(`${path} is not a label checkpoint; delete it to start over`);
        }
        const differs = [
            saved.InstructionsSha256 !== key.InstructionsSha256 ? 'instructions' : '',
            JSON.stringify(saved.Models) !== JSON.stringify(key.Models) ? `labeler models (${JSON.stringify(saved.Models)})` : '',
            saved.CasesSha256 !== key.CasesSha256 ? 'case inputs (labeler A\'s IDs or titles)' : '',
        ].filter((d) => d !== '');
        if (differs.length > 0) {
            throw new LabelCheckpointMismatchError(`checkpoint ${path} was made for other ${differs.join(', ')}; delete it to start over`);
        }
        Object.assign(spend, saved.Spend);
        const reused = Object.values(saved.Answers).reduce((n, byLabeler) => n + Object.keys(byLabeler).length, 0);
        console.log(`resuming from ${path}: ${reused} answers reused, $${spend.Cost.toFixed(6)} already spent`);
        return { ...saved, Spend: spend };
    }

    /**
     * Whether a parsed value is a checkpoint: the key members, the answers map and the spend. `unknown` because it comes
     * from JSON.parse; the answers themselves are labeler output already checked when they were saved.
     */
    public static IsCheckpoint(v: unknown): v is LabelCheckpoint {
        if (typeof v !== 'object' || v === null || !('InstructionsSha256' in v) || !('CasesSha256' in v) || !('Models' in v)
            || !('Answers' in v) || !('Spend' in v)) {
            return false;
        }
        return typeof v.InstructionsSha256 === 'string' && typeof v.CasesSha256 === 'string'
            && typeof v.Models === 'object' && v.Models !== null && typeof v.Answers === 'object' && v.Answers !== null
            && typeof v.Spend === 'object' && v.Spend !== null && 'Cost' in v.Spend && typeof v.Spend.Cost === 'number';
    }

    /**
     * The `specification` cases (fixed by the guide's rule, never labelled) of the golden set at `path`, in order; empty
     * when the file does not exist. The rig rewrites the golden set from the labelled cases, so it carries these over.
     * @throws Error naming a specification case that lacks an ID, an input or its expected labels: dropping it silently
     * would remove a must-pass case from the gate
     */
    public static SpecificationCasesOf(path: string): GoldenCase[] {
        if (!existsSync(path)) {
            return [];
        }
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8')); // unknown: JSON from disk, checked below
        const all: unknown[] = typeof parsed === 'object' && parsed !== null && 'Cases' in parsed && Array.isArray(parsed.Cases) ? parsed.Cases : [];
        const specification = all.filter((c) => typeof c === 'object' && c !== null && 'LabelSource' in c && c.LabelSource === 'specification');
        return specification.map((c) => {
            if (!GoldenLabelQualityRig.IsGoldenCase(c)) {
                const id = typeof c === 'object' && c !== null && 'ID' in c ? String(c.ID) : '(no ID)';
                throw new Error(`${path}: specification case ${id} needs ID, Input and Expected`);
            }
            return c;
        });
    }

    /** Whether a parsed value is a golden case (ID, Input, Expected, LabelSource). `unknown` because it comes from JSON.parse. */
    protected static IsGoldenCase(c: unknown): c is GoldenCase {
        return typeof c === 'object' && c !== null && 'ID' in c && typeof c.ID === 'string' && 'Input' in c && typeof c.Input === 'object'
            && c.Input !== null && 'Expected' in c && typeof c.Expected === 'object' && c.Expected !== null && 'LabelSource' in c;
    }

    /** Labels, adjudicates and writes. @returns the rig's exit code */
    public static async Run(args: GoldenLabelRigArgs): Promise<number> {
        const a = GoldenLabelQualityRig.ReadLabelerAFile(args.LabelerAPath);
        const ctx = await BootstrapIntegrationServer();
        const spend: LabelSpend = { Calls: 0, PromptTokens: 0, CompletionTokens: 0, CacheReadTokens: 0, Cost: 0, LastCallCost: 0 };
        try {
            await AIEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
            const functions = await GoldenLabelQualityRig.LoadTaxonomy(ctx, 'MJ_BizApps_Common: Job Functions');
            const levels = await GoldenLabelQualityRig.LoadTaxonomy(ctx, 'MJ_BizApps_Common: Seniority Levels');
            const allowed: Record<GoldenLabelOutputName, string[]> = { JobFunctions: functions.map((f) => f.Name), SeniorityLevel: levels.map((l) => l.Name) };
            GoldenLabelQualityRig.AssertLabelerAInTaxonomy(a, allowed);
            const instructions = GoldenLabelQualityRig.BuildInstructions(readFileSync(args.GuidePath, 'utf8'), functions, levels);
            const sha = createHash('sha256').update(instructions).digest('hex');
            const labelers = NEW_LABELERS.map((s) => GoldenLabelQualityRig.NewLabeler(s, sha));
            console.log(JSON.stringify({ Labelers: labelers.map((l) => ({ ...l.Identity, APIName: l.APIName })), InstructionsSha256: sha }));
            const checkpointPath = `${args.AuditPath}.partial.json`;
            const checkpoint = GoldenLabelQualityRig.LoadCheckpoint(checkpointPath, {
                InstructionsSha256: sha, CasesSha256: GoldenLabelQualityRig.CasesInputSha256(a),
                Models: Object.fromEntries(labelers.map((l) => [l.Identity.ID, l.Identity.Model])),
            }, spend);
            const labelled = await GoldenLabelQualityRig.LabelAll(a, labelers, instructions, allowed, spend, args.MaxCost, checkpoint, checkpointPath);
            const identities: LabelerIdentity[] = [LABELER_A_IDENTITY, ...labelers.map((l) => l.Identity)];
            const { cases, labelQuality } = await GoldenLabelQualityCheck.Adjudicate(labelled, [...GOLDEN_LABEL_OUTPUTS], identities);
            // The specification cases are not labelled: they are carried over from the set being replaced, after the labelled ones
            const specification = GoldenLabelQualityRig.SpecificationCasesOf(args.OutPath);
            writeFileSync(args.OutPath, JSON.stringify({ Cases: [...cases, ...specification], LabelQuality: labelQuality }, null, 2) + '\n');
            writeFileSync(args.AuditPath, JSON.stringify({ InstructionsSha256: sha, Instructions: instructions, Labelers: identities,
                Labelled: labelled, Spend: spend }, null, 2) + '\n');
            rmSync(checkpointPath, { force: true });
            console.log(JSON.stringify({ Passed: labelQuality.Passed, Problems: labelQuality.Problems, PerOutput: labelQuality.PerOutput,
                Consensus: labelQuality.Consensus, Adjudicated: labelQuality.Adjudicated, Excluded: labelQuality.Excluded.map((e) => e.ID), Spend: spend }, null, 2));
            return labelQuality.Passed ? 0 : 1;
        } finally {
            console.error(`labeler spend: ${JSON.stringify(spend)}`);
            await ctx.ClosePool();
        }
    }

    /**
     * Every case labeled by every new labeler, in order; labeler A's answer is its fixed labels. An answer already in
     * the checkpoint is reused; every new answer is saved to the checkpoint before the next call.
     */
    public static async LabelAll(a: LabelerAFile, labelers: NewLabeler[], instructions: string, allowed: Record<GoldenLabelOutputName, string[]>,
        spend: LabelSpend, maxCost: number, checkpoint: LabelCheckpoint, checkpointPath: string): Promise<LabelledCase[]> {
        const labelled: LabelledCase[] = [];
        for (const k of a.Cases) {
            const answers = checkpoint.Answers[k.ID] || {};
            checkpoint.Answers[k.ID] = answers;
            for (const l of labelers) {
                if (!(l.Identity.ID in answers)) {
                    answers[l.Identity.ID] = await GoldenLabelQualityRig.Label(l, instructions, k.Input.CurrentJobTitle, allowed, spend, maxCost);
                    writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
                }
            }
            labelled.push({ ID: k.ID, Input: k.Input, A: k.Expected, B: answers['B'], C: answers['C'] });
        }
        return labelled;
    }
}
