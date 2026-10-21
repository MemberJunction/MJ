/**
 * Gate stub: a Feature Pipeline driver that answers from a table instead of a model, so the gates measure the
 * pipeline machinery (keys, cache, validation, write-back, versions) deterministically. It keeps the driver contract:
 * BeforeBuildContext, then BuildPromptData, before answering.
 *
 * Server-only test content: it is registered by importing this module (the integration-test-suite barrel does), and a
 * Feature Pipeline Type row whose `DriverClass` is `FeaturePipelineGateStubDriver` selects it.
 */
import { BaseSingleton, GetValueAtPath, RegisterClass } from '@memberjunction/global';
import { BaseFeaturePipelineDriver, type FeaturePipelineComputeRequest, type FeaturePipelineComputeResult } from '@memberjunction/feature-pipelines-engine';
import { FeatureValueKey, LLM_FEATURE_PIPELINE_CAPABILITIES, type FeaturePipelineDriverCapabilities } from '@memberjunction/feature-pipelines';

/**
 * One stubbed model answer: the JSON object an LLM would return. Its values are `unknown` because their shape is the
 * pipeline's outputs (strings, numbers, arrays of child items); the driver contract's `RawResult` is `unknown` for the
 * same reason, and the processor validates the answer against the pipeline's constraints.
 */
export type StubAnswer = Record<string, unknown>;

/** Which table the stub answers from: the golden answers, or the degraded ones where a title has one. */
export type FeaturePipelineGateStubMode = 'golden' | 'degraded';

/** The stub's answer table and call log, shared by every driver instance the pipeline creates. */
export class FeaturePipelineGateStubTable extends BaseSingleton<FeaturePipelineGateStubTable> {
    /** The process-wide table. */
    public static get Instance(): FeaturePipelineGateStubTable {
        return super.getInstance<FeaturePipelineGateStubTable>();
    }

    protected constructor() {
        super();
    }

    /** The default record field holding the input: the job-title pipeline's. */
    public static readonly DEFAULT_INPUT_FIELD = 'CurrentJobTitle';

    /** Normalised input → answer. */
    public Answers = new Map<string, StubAnswer>();
    /** Normalised inputs answered wrongly in 'degraded' mode. */
    public Degraded = new Map<string, StubAnswer>();
    /** Which table answers. */
    public Mode: FeaturePipelineGateStubMode = 'golden';
    /** Answer for inputs with no table entry; undefined fails the record. */
    public Fallback: StubAnswer | undefined;
    /** The inputs the driver was asked about, in order. */
    public Calls: string[] = [];
    /** The record field holding the input. */
    public InputField = FeaturePipelineGateStubTable.DEFAULT_INPUT_FIELD;

    /** The table key of an input: the Feature Value key normalisation (case, NFC, whitespace). */
    public static KeyOf(input: string): string {
        return FeatureValueKey.NormalizeValue(input);
    }

    /** Forgets the calls (the answers stay). */
    public ResetCalls(): void {
        this.Calls = [];
    }

    /** Empties the table and restores the defaults. */
    public Clear(): void {
        this.Answers.clear();
        this.Degraded.clear();
        this.Fallback = undefined;
        this.InputField = FeaturePipelineGateStubTable.DEFAULT_INPUT_FIELD;
        this.Mode = 'golden';
        this.Calls = [];
    }

    /** The answer for one input in the current mode; undefined when there is none. */
    public AnswerFor(input: string): StubAnswer | undefined {
        const key = FeaturePipelineGateStubTable.KeyOf(input);
        return (this.Mode === 'degraded' ? this.Degraded.get(key) : undefined) || this.Answers.get(key) || this.Fallback;
    }
}

/** The driver: reads the input field from the prompt data the processor built and answers from the table. */
@RegisterClass(BaseFeaturePipelineDriver, 'FeaturePipelineGateStubDriver')
export class FeaturePipelineGateStubDriver extends BaseFeaturePipelineDriver {
    /** The LLM driver's capabilities: the stub stands in for a model answer, so it accepts what the LLM driver does. */
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return LLM_FEATURE_PIPELINE_CAPABILITIES;
    }

    /** Runs the two context hooks (the driver contract), logs the input, and answers from the table. */
    public async ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult> {
        const table = FeaturePipelineGateStubTable.Instance;
        await request.Hooks.BeforeBuildContext(request.Record, request.Context);
        const data = await request.Hooks.BuildPromptData(request.Record, request.Context);
        const raw = GetValueAtPath(data, `record.${table.InputField}`);
        const input = typeof raw === 'string' ? raw : '';
        table.Calls.push(input);
        const answer = table.AnswerFor(input);
        if (!answer) {
            return { Success: false, ErrorMessage: `FeaturePipelineGateStubDriver has no answer for '${input}'` };
        }
        // A copy: the processor may annotate the answer, and the table must stay as configured for the next record.
        return { Success: true, RawResult: structuredClone(answer) };
    }
}
