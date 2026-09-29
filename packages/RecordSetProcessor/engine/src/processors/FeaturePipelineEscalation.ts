/**
 * @fileoverview Escalation for Decision Feature Pipelines (§3.6 rule 8, in bulk). A record the decision
 * model answers below the spec's `Escalation.BelowConfidence` floor is re-run through an LLM Feature
 * Pipeline, and that pipeline's answer replaces the decision's.
 *
 * {@link FeaturePipelineEscalator} loads and checks the escalation target once per run, and runs the
 * records that escalate through the target's normal batch path, in the target's own context. Each
 * pipeline caches only its own answers: the target's Dedup Cache holds the LLM answers, and the Decision
 * pipeline's holds only the answers its decision model gave with confidence. `InferProcessor` decides
 * which records escalate, and records their final answers in `MJ: Feature Values`.
 *
 * @module @memberjunction/record-set-processor
 */

import type { IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    IsLLMPipelineType,
    type DataFeatureOutput,
    type DataFeatureSpec,
    type OutputTarget,
    FindEscalationTargetRowProblem,
    FindEscalationTargetSpecProblem,
    FindOutputByName,
} from '@memberjunction/feature-pipelines';

/** A Decision pipeline's escalation settings (`DataFeatureSpec.Escalation`). */
export type FeaturePipelineEscalationSettings = NonNullable<DataFeatureSpec['Escalation']>;

/**
 * The processor an escalated record runs through. It is the escalation target's `InferProcessor`, built
 * from its `MJ: Record Processes` row exactly as `RecordProcessExecutor` builds any Infer pipeline.
 */
export interface EscalationTargetProcessor {
    /** The target pipeline's spec. */
    readonly Spec: DataFeatureSpec | undefined;
    /** The `MJ: AI Prompts` ID the target runs. */
    readonly PromptID: string;
    /** The hash that versions the target's output constraints. */
    readonly ConstraintHash: string;
    /** Whether the target writes `MJ: Feature Values` history. Off for an escalation target: the Decision pipeline records the final answer. */
    WritesHistory: boolean;
    /** The target's normal batch path: validation and violation policy apply exactly as when it runs on its own. */
    ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<Map<string, RecordResult>>;
}

/** Builds an Infer Feature Pipeline's processor from its `MJ: Record Processes` row. */
export type EscalationTargetBuilder = (pipeline: MJRecordProcessEntity, provider: IMetadataProvider) => EscalationTargetProcessor;

/** One output the decision model answered below the floor, or without a confidence. */
export interface BelowFloorOutput {
    /** The output's name. */
    OutputName: string;
    /** The decision model's confidence; absent when it returned none. */
    Confidence?: number;
}

/** A record to escalate, and the outputs that sent it. */
export interface EscalationRequest {
    /** The record. */
    Record: RecordRef;
    /** The outputs below the floor. Never empty. */
    BelowFloor: BelowFloorOutput[];
}

/** An escalated record's answer from the target pipeline, already validated by it. */
export interface EscalatedAnswer {
    /** The target's validated payload, shaped by the target's output Refs. */
    Payload: unknown;
    /** The target pipeline's outputs, so the payload can be read by output name. */
    TargetOutputs: DataFeatureOutput[];
    /** The `MJ: AI Prompts` ID of the target's prompt. */
    PromptID: string;
    /** The target's `MJ: AI Prompt Runs` row (from its cache, when its answer was cached). */
    AIPromptRunID?: string;
    /** The target's prompt version hash for the answer. */
    PromptVersionHash?: string;
    /** The target's constraint hash. */
    ConstraintHash: string;
    /** The target's own Dedup Cache entry for the answer, when the target caches. */
    FeatureValueCacheID?: string;
    /** For the history row's reasoning: that the record escalated, to which pipeline, and from what confidence. */
    Note: string;
}

/** Why an escalation failed. The message carries both reasons: why the record escalated, and why that failed. */
export interface EscalationFailure {
    /** Both reasons. */
    ErrorMessage: string;
    /** The target's failed `MJ: AI Prompt Runs` row, when there is one. */
    AIPromptRunID?: string;
}

/** The outcome of escalating one record. Narrow it with `'ErrorMessage' in outcome`. */
export type EscalationOutcome = EscalatedAnswer | EscalationFailure;

/** The loaded, checked escalation target. */
interface ResolvedEscalationTarget {
    Processor: EscalationTargetProcessor;
    ID: string;
    Name: string;
}

/**
 * Escalates a Decision pipeline's borderline records to an LLM Feature Pipeline. One instance serves one
 * processor instance, which is one run, so the target is loaded and checked once per run.
 */
export class FeaturePipelineEscalator {
    /** The target resolution, started on first use and shared by every record that escalates. */
    private targetResolution?: Promise<ResolvedEscalationTarget>;

    /**
     * @param settings - The Decision pipeline's `Escalation` settings.
     * @param decisionOutputs - The Decision pipeline's outputs: each one's confidence is checked, and the target must produce each one.
     * @param buildTarget - Builds the target's processor from its row, as `RecordProcessExecutor` does.
     */
    constructor(
        private readonly settings: FeaturePipelineEscalationSettings,
        private readonly decisionOutputs: DataFeatureOutput[],
        private readonly buildTarget: EscalationTargetBuilder,
    ) {}

    /** The `MJ: Record Processes` ID of the LLM pipeline records escalate to. */
    public get PipelineID(): string {
        return this.settings.PipelineID;
    }

    /** The confidence floor. */
    public get BelowConfidence(): number {
        return this.settings.BelowConfidence;
    }

    /**
     * The outputs whose confidence is below the floor, or missing. Any one of them escalates the whole
     * record; an empty list means the decision stands.
     */
    public BelowFloor(confidence: Record<string, number> | undefined): BelowFloorOutput[] {
        const below: BelowFloorOutput[] = [];
        for (const output of this.decisionOutputs) {
            const value = confidence?.[output.Name];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                below.push({ OutputName: output.Name });
            } else if (value < this.settings.BelowConfidence) {
                below.push({ OutputName: output.Name, Confidence: value });
            }
        }
        return below;
    }

    /**
     * Runs the records through the target together, through its normal batch path. Every request gets an
     * outcome. When the target cannot be loaded or used, every request fails, naming the pipeline and why.
     */
    public async Escalate(requests: EscalationRequest[], context: RecordProcessorContext): Promise<Map<string, EscalationOutcome>> {
        const outcomes = new Map<string, EscalationOutcome>();
        if (requests.length === 0) {
            return outcomes;
        }
        const resolution = await this.resolveTargetOrError(context, context.entityID ?? requests[0].Record.EntityID);
        if ('ErrorMessage' in resolution) {
            for (const request of requests) {
                outcomes.set(request.Record.RecordID, { ErrorMessage: `${this.escalationReason(request.BelowFloor)}; ${resolution.ErrorMessage}` });
            }
            return outcomes;
        }
        const results = await this.runTarget(resolution, requests, context);
        for (const request of requests) {
            outcomes.set(request.Record.RecordID, this.toOutcome(request, results.get(request.Record.RecordID), resolution));
        }
        return outcomes;
    }

    /** Why a record escalated, for its failure message. */
    private escalationReason(belowFloor: BelowFloorOutput[]): string {
        return `Decision confidence below ${this.settings.BelowConfidence} (${DescribeBelowFloor(belowFloor)})`;
    }

    /** Loads and checks the target once per instance; every later call shares the result, success or failure. */
    private async resolveTarget(context: RecordProcessorContext, entityID: string): Promise<ResolvedEscalationTarget> {
        this.targetResolution ??= this.loadTarget(context, entityID);
        return this.targetResolution;
    }

    /** Runs {@link resolveTarget}, turning a failure into the message each escalating record fails with. */
    private async resolveTargetOrError(
        context: RecordProcessorContext,
        entityID: string
    ): Promise<ResolvedEscalationTarget | { ErrorMessage: string }> {
        try {
            return await this.resolveTarget(context, entityID);
        } catch (e) {
            return { ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    /** Loads the target row, checks it, builds its processor and checks its spec. */
    private async loadTarget(context: RecordProcessorContext, entityID: string): Promise<ResolvedEscalationTarget> {
        const row = await this.loadTargetRow(context);
        const label = `Escalation pipeline '${row.Name}' (${row.ID})`;
        const rowProblem = FindEscalationTargetRowProblem(row, entityID);
        if (rowProblem) {
            throw new Error(`${label} ${rowProblem}.`);
        }
        const processor = this.buildTargetProcessor(row, context, label);
        const specProblem = FindEscalationTargetSpecProblem(processor.Spec, this.decisionOutputs);
        if (specProblem) {
            throw new Error(`${label} ${specProblem}.`);
        }
        // The Decision pipeline records each escalated record's final answer, so the target records none
        processor.WritesHistory = false;
        return { Processor: processor, ID: row.ID, Name: row.Name };
    }

    /** Loads the target's `MJ: Record Processes` row through the run's provider. */
    private async loadTargetRow(context: RecordProcessorContext): Promise<MJRecordProcessEntity> {
        const pipelineID = this.settings.PipelineID;
        const row = await context.provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', context.contextUser);
        const loaded = await row.Load(pipelineID);
        if (!loaded) {
            throw new Error(`Escalation pipeline '${pipelineID}' was not found in MJ: Record Processes.`);
        }
        return row;
    }

    /** Builds the target's processor, naming the pipeline when it cannot be built. */
    private buildTargetProcessor(row: MJRecordProcessEntity, context: RecordProcessorContext, label: string): EscalationTargetProcessor {
        try {
            return this.buildTarget(row, context.provider);
        } catch (e) {
            throw new Error(`${label} could not be built: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Runs the requests' records through the target's batch path, in the target's own context: the run's
     * context with `recordProcessID` set to the target pipeline, so the target's Dedup Cache lookups and
     * writes use its own entries. A thrown error fails each of the records.
     */
    private async runTarget(
        target: ResolvedEscalationTarget,
        requests: EscalationRequest[],
        context: RecordProcessorContext
    ): Promise<Map<string, RecordResult>> {
        const targetContext: RecordProcessorContext = { ...context, recordProcessID: target.ID };
        try {
            return await target.Processor.ProcessBatch(requests.map((r) => r.Record), targetContext);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return new Map(requests.map((r): [string, RecordResult] => [r.Record.RecordID, { Status: 'Failed', ErrorMessage: message }]));
        }
    }

    /** Turns the target's result for one record into its outcome. */
    private toOutcome(request: EscalationRequest, result: RecordResult | undefined, target: ResolvedEscalationTarget): EscalationOutcome {
        if (!result || result.Status !== 'Succeeded') {
            return {
                ErrorMessage: `${this.escalationReason(request.BelowFloor)}; escalation to LLM pipeline '${target.Name}' failed: ${result?.ErrorMessage ?? 'it returned no result'}`,
                AIPromptRunID: result?.AIPromptRunID,
            };
        }
        return {
            Payload: result.ResultPayload,
            TargetOutputs: target.Processor.Spec?.Outputs ?? [],
            PromptID: target.Processor.PromptID,
            AIPromptRunID: result.AIPromptRunID,
            PromptVersionHash: result.PromptVersionHash,
            ConstraintHash: target.Processor.ConstraintHash,
            FeatureValueCacheID: result.FeatureValueCacheID,
            Note: BuildEscalationNote(target.Name, this.settings.BelowConfidence, request.BelowFloor, result.ResultPayload),
        };
    }
}


/** The outputs below the floor, for a message: `Seniority 0.42, IsVIP none`. */
export function DescribeBelowFloor(belowFloor: BelowFloorOutput[]): string {
    return belowFloor
        .map((b) => `${b.OutputName} ${b.Confidence === undefined ? 'none' : Number(b.Confidence.toFixed(4))}`)
        .join(', ');
}

/**
 * The history note for an escalated record: that it escalated, to which pipeline, and from what
 * confidence. When the target's payload carries its own `reasoning`, it follows the note.
 */
export function BuildEscalationNote(pipelineName: string, floor: number, belowFloor: BelowFloorOutput[], targetPayload: unknown): string {
    const note = `Escalated to LLM pipeline '${pipelineName}': decision confidence below ${floor} (${DescribeBelowFloor(belowFloor)}).`;
    const reasoning = readReasoning(targetPayload);
    return reasoning ? `${note}\n\n${reasoning}` : note;
}

/** The `reasoning` a payload carries, when it is a non-empty string. */
function readReasoning(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null || !('reasoning' in payload)) {
        return undefined;
    }
    const reasoning: unknown = payload.reasoning;
    return typeof reasoning === 'string' && reasoning.trim().length > 0 ? reasoning : undefined;
}
