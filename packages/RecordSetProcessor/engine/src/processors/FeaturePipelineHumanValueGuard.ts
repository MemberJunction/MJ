/**
 * @fileoverview The human-value guard of a Feature Pipeline's write-back: decides whether a target field's current
 * value was entered by a person, records it as a `Source='Human'` Feature Value, and retires that record when a run
 * that overwrites human values writes the field.
 * @module @memberjunction/record-set-processor
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import {
    FeatureValueCacheService, type DataFeatureOutput, type DataFeatureSpec, type FeatureValueRecordRef, type FeatureValueSource, type TypedFeatureValue,
} from '@memberjunction/feature-pipelines';
import type { HumanValueGuard, HumanValueQuestion } from '../writeBack';

/** What the guard needs to know about the run. */
export interface FeaturePipelineHumanValueGuardOptions {
    /** The pipeline (`MJ: Record Processes` ID) whose Feature Values are read and written. */
    RecordProcessID: string;
    /** The processed record's entity. */
    EntityID: string;
    /** The processed record. */
    Record: RecordRef;
    /** The run's context: its user and process run. Reads and writes use the write-back unit's provider instead. */
    Context: RecordProcessorContext;
    /** The pipeline's spec: which output writes which field. */
    Spec: DataFeatureSpec;
    /**
     * Each feature's latest Pipeline value from before this run's Feature Value write (`InferProcessor.PreviousFeatureValues`,
     * null for a feature the pipeline never wrote); undefined when this run wrote no Feature Value for the record. Read
     * when a question is asked: the write runs inside the write-back unit, after the guard is created.
     */
    PreviousValues: () => Readonly<Record<string, TypedFeatureValue | null>> | undefined;
}

/**
 * A target field's current value is human-owned when a Human Feature Value exists for it, when it differs from what
 * this pipeline last wrote, or when the pipeline never wrote it. A preserved value is recorded as the record's Human
 * Feature Value; a run that overwrites human values retires it.
 *
 * "What the pipeline last wrote" is the value this run's own Feature Value write replaced. That write runs inside the
 * write-back unit, so the Feature Values it reads are those of committed write-backs: a write-back that failed left
 * no Feature Value behind, and a concurrent run's uncommitted one is waited for (the read blocks on its row locks).
 * Feature Values are updated in place on their key, so once this run rewrote a key the earlier value is no longer in
 * the table; only when this run wrote nothing for the record is the table read, without this run's rows.
 */
export class FeaturePipelineHumanValueGuard implements HumanValueGuard {
    constructor(protected readonly Options: FeaturePipelineHumanValueGuardOptions) {}

    /** True when a person entered the field's current value (see the class comment); false for a field no output writes. */
    public async IsHumanOwned(question: HumanValueQuestion): Promise<boolean> {
        const output = this.OutputFor(question.FieldName);
        if (!output) {
            return false;
        }
        if (await this.LatestValue(output, 'Human', question.Provider)) {
            return true;
        }
        const last = await this.LastPipelineValue(output, question.Provider);
        if (!last) {
            return true;
        }
        const lastWritten = await question.Resolve(FeatureValueCacheService.NativeValueOf(last));
        return !question.Equals(question.CurrentValue, lastWritten);
    }

    /**
     * Records the preserved value as the record's Human Feature Value for the output that writes the field.
     * @param currentValue - the field's value; `unknown` for the reason `HumanValueQuestion` gives
     */
    public async RecordPreserved(fieldName: string, currentValue: unknown, provider: IMetadataProvider): Promise<void> {
        const output = this.OutputFor(fieldName);
        // A dry run persists nothing
        if (!output || this.Options.Context.DryRun === true) {
            return;
        }
        await FeatureValueCacheService.Instance.RecordHumanValue({
            ...this.RefOf(output, provider), Value: currentValue, ProcessRunID: this.Options.Context.processRunID || null,
        });
    }

    /** Retires the record's Human Feature Value for the output that writes the field; false when there was none or on a dry run. */
    public async RetireHumanValue(fieldName: string, provider: IMetadataProvider): Promise<boolean> {
        const output = this.OutputFor(fieldName);
        // A dry run persists nothing
        if (!output || this.Options.Context.DryRun === true) {
            return false;
        }
        return (await FeatureValueCacheService.Instance.RetireHumanValue(this.RefOf(output, provider))) > 0;
    }

    /** The spec output that writes this field (field targets only; names compared case-insensitively). */
    protected OutputFor(fieldName: string): DataFeatureOutput | undefined {
        const wanted = fieldName.toLowerCase();
        return this.Options.Spec.Outputs.find((o) => o.Target.Mode === 'field' && o.Target.EntityFieldName.toLowerCase() === wanted);
    }

    /** The record and feature an output's Feature Values are kept under, read and written on `provider`. */
    protected RefOf(output: DataFeatureOutput, provider: IMetadataProvider): FeatureValueRecordRef {
        return {
            RecordProcessID: this.Options.RecordProcessID, EntityID: this.Options.EntityID, RecordID: this.Options.Record.RecordID,
            FeatureName: output.Name, ContextUser: this.Options.Context.contextUser, Provider: provider,
        };
    }

    /** What the pipeline wrote for an output before the current run (see the class comment); null when it never did. */
    protected async LastPipelineValue(output: DataFeatureOutput, provider: IMetadataProvider): Promise<TypedFeatureValue | null> {
        const previous = this.Options.PreviousValues();
        if (previous && output.Name in previous) {
            return previous[output.Name];
        }
        return this.LatestValue(output, 'Pipeline', provider);
    }

    /** The record's latest value of an output from one source; the pipeline's own value excludes the current run. */
    protected async LatestValue(output: DataFeatureOutput, source: FeatureValueSource, provider: IMetadataProvider): Promise<TypedFeatureValue | null> {
        return FeatureValueCacheService.Instance.GetLatestValue({
            ...this.RefOf(output, provider), Source: source,
            ExcludeProcessRunID: source === 'Pipeline' ? this.Options.Context.processRunID || null : null,
        });
    }
}
