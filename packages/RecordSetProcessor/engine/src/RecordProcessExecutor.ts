/**
 * @fileoverview Turns a `MJ: Record Processes` definition into a concrete RecordSetProcessor run:
 * builds the source from its Scope, the processor from its Work (+ output-mapping write-back), and
 * executes. Shared by the on-demand (RunNow) operation, the scheduled-job driver, and on-change.
 * @module @memberjunction/record-set-processor
 */

import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, SafeJSONParse, type FieldRuleSet } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    ArraySource,
    FilterSource,
    IRecordProcessor,
    IRecordSetSource,
    IProcessRunTracker,
    ListSource,
    ProcessRunResult,
    ProgressInfo,
    RecordProcessorBuildContext,
    RecordProcessorRegistry,
    TriggeredByValue,
    ViewSource,
} from '@memberjunction/record-set-processor-base';
// The Remote Operation base + its scope-override type are now CodeGen-emitted into @memberjunction/core-entities.
import { type RecordProcessScopeOverride } from '@memberjunction/core-entities';
import { RecordSetProcessor } from './RecordSetProcessor';
import { ActionRecordProcessor } from './processors/ActionRecordProcessor';
import { AgentRecordProcessor } from './processors/AgentRecordProcessor';
import { FieldRulesProcessor } from './processors/FieldRulesProcessor';
import { WriteBackProcessor } from './processors/WriteBackProcessor';
import { OutputMappingConfig, RunProvenance } from './writeBack';

/** Options for executing a Record Process. */
export interface RunRecordProcessOptions {
    /** The acting user. */
    ContextUser: UserInfo;
    /** The owning provider (defaults to the active provider). */
    Provider?: IMetadataProvider;
    /** What triggered the run (default `OnDemand`). */
    TriggeredBy?: TriggeredByValue;
    /** Process a single record (the on-change / on-demand single-record case) instead of the scope. */
    SingleRecordID?: string;
    /**
     * Runtime scope override (selected rows / a view / a list / a filter), used instead of the stored
     * Scope. This is how a grid/list UI runs a process against exactly what the user is looking at.
     */
    Scope?: RecordProcessScopeOverride;
    /**
     * Compute-only: produce each record's result and the write-back preview WITHOUT writing (see
     * {@link RecordProcessExecutor.BuildProcessor} for what each work type does). Powers the preview step of the
     * bulk-update UX.
     */
    DryRun?: boolean;
    /** Dry runs preview at most this many records when no scope or single record is given and the processor declares a default sample size. */
    DryRunSampleSize?: number;
    /** FK to the owning `ScheduledJobRun` when launched by the scheduler (links the Process Run back). */
    ScheduledJobRunID?: string;
    /** Optional timestamp of the previous run, used for 'UpdatedAt' watermark strategy. */
    LastRunAt?: Date | null;
    /** Progress callback. */
    OnProgress?: (progress: ProgressInfo) => void;
    /** The tracker to record this run with. Defaults to the work type's registered tracker, else `GenericProcessRunTracker`. */
    Tracker?: IProcessRunTracker;
    /** Overwrite values a person entered, and retire their Human values (default false). */
    OverwriteHumanValues?: boolean;
    /**
     * Whether the run skips records its watermark says are unchanged (default: the Record Process's `SkipUnchanged`).
     * A version backfill passes false; it still refreshes the watermarks of the records it processes.
     */
    SkipUnchanged?: boolean;
}

/** Builds and runs a RecordSetProcessor pass from a Record Process definition. */
export class RecordProcessExecutor {
    /** Loads the Record Process by ID and runs it. */
    public async RunByID(recordProcessID: string, options: RunRecordProcessOptions): Promise<ProcessRunResult> {
        const provider = options.Provider ?? Metadata.Provider;
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', options.ContextUser);
        const loaded = await rp.Load(recordProcessID);
        if (!loaded) {
            throw new Error(`Record Process '${recordProcessID}' not found`);
        }
        return this.Run(rp, options);
    }

    /** Runs an already-loaded Record Process. */
    public async Run(rp: MJRecordProcessEntity, options: RunRecordProcessOptions): Promise<ProcessRunResult> {
        const provider = options.Provider ?? Metadata.Provider;
        // `??`: false is a deliberate override of the Record Process's setting
        const skipUnchanged = options.SkipUnchanged ?? rp.SkipUnchanged;
        let lastRunAt = options.LastRunAt;
        if (!lastRunAt && skipUnchanged && rp.WatermarkStrategy === 'UpdatedAt') {
            try {
                const rv = RunView.FromMetadataProvider(provider);
                const lastRunRes = await rv.RunView<{ StartedAt?: Date }>({
                    EntityName: 'MJ: Process Runs',
                    ExtraFilter: `RecordProcessID = '${EscapeSQLString(rp.ID)}' AND Status = 'Completed'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                }, options.ContextUser);
                if (lastRunRes.Success && lastRunRes.Results && lastRunRes.Results.length > 0) {
                    lastRunAt = lastRunRes.Results[0].StartedAt ?? null;
                }
            } catch (err) {
                LogError(`RecordProcessExecutor: failed to query last run for RecordProcess '${rp.ID}': ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        // Resolved here, not at each call site, so scheduled and on-change runs get the same tracker as manual ones.
        const tracker = options.Tracker ?? this.resolveTracker(rp, options.DryRun, provider);
        const processor = this.BuildProcessor(rp, options.DryRun, provider, tracker);
        return RecordSetProcessor.Instance.Process({
            Source: this.BuildSource(rp, provider, options.SingleRecordID, options.Scope),
            Processor: processor,
            Tracker: tracker,
            ContextUser: options.ContextUser,
            Provider: provider,
            DryRun: options.DryRun,
            MaxRecords: this.DryRunMaxRecords(rp, options, processor),
            RecordProcessID: rp.ID,
            ScheduledJobRunID: options.ScheduledJobRunID,
            EntityID: rp.EntityID,
            TriggeredBy: options.TriggeredBy ?? 'OnDemand',
            BatchSize: rp.BatchSize ?? undefined,
            MaxConcurrency: rp.MaxConcurrency ?? undefined,
            SkipUnchanged: skipUnchanged,
            WatermarkStrategy: rp.WatermarkStrategy ?? 'Checksum',
            LastRunAt: lastRunAt,
            OnProgress: options.OnProgress,
            OverwriteHumanValues: options.OverwriteHumanValues,
            Configuration: { recordProcessName: rp.Name, workType: rp.WorkType, scopeType: rp.ScopeType },
        });
    }

    /** The tracker a work type's processor is paired with, if it registered one. */
    private resolveTracker(rp: MJRecordProcessEntity, dryRun?: boolean, provider?: IMetadataProvider): IProcessRunTracker | undefined {
        return RecordProcessorRegistry.Instance.ResolveTracker({
            WorkType: rp.WorkType,
            Configuration: rp.Configuration,
            InputMapping: rp.InputMapping,
            OutputMapping: rp.OutputMapping,
            EntityID: rp.EntityID,
            RecordProcessID: rp.ID,
            RecordProcessName: rp.Name,
            DryRun: dryRun,
            Provider: provider,
            RecordProcess: rp,
        });
    }

    /**
     * The record cap of a dry run over the stored scope (`DryRunSampleSize`, else `processor?.DefaultDryRunSampleSize`);
     * undefined for a real run, a processor without a default sample size, or a caller-chosen scope or record.
     */
    protected DryRunMaxRecords(_rp: MJRecordProcessEntity, options: RunRecordProcessOptions, processor?: IRecordProcessor): number | undefined {
        if (options.DryRun !== true || options.Scope || options.SingleRecordID) {
            return undefined;
        }
        return options.DryRunSampleSize || processor?.DefaultDryRunSampleSize;
    }

    /** Builds the record-set source from a single-record override, a runtime scope override, or the process's stored Scope. */
    public BuildSource(rp: MJRecordProcessEntity, provider: IMetadataProvider, singleRecordID?: string, scope?: RecordProcessScopeOverride): IRecordSetSource {
        if (singleRecordID) {
            return new ArraySource([{ EntityID: rp.EntityID, RecordID: singleRecordID }], rp.EntityID, 'SingleRecord');
        }
        if (scope) {
            return this.buildSourceFromScope(rp, provider, scope);
        }
        switch (rp.ScopeType) {
            case 'View':
                if (!rp.ScopeViewID) {
                    throw new Error(`Record Process '${rp.Name}': ScopeType=View requires ScopeViewID`);
                }
                return new ViewSource(rp.ScopeViewID);
            case 'List':
                if (!rp.ScopeListID) {
                    throw new Error(`Record Process '${rp.Name}': ScopeType=List requires ScopeListID`);
                }
                return new ListSource(rp.ScopeListID);
            case 'Filter': {
                const entity = provider.EntityByID(rp.EntityID);
                if (!entity) {
                    throw new Error(`Record Process '${rp.Name}': entity '${rp.EntityID}' not found in metadata`);
                }
                return new FilterSource(entity.Name, rp.ScopeFilter ?? undefined);
            }
            case 'SingleRecord':
                throw new Error(`Record Process '${rp.Name}': ScopeType=SingleRecord requires a record ID (pass SingleRecordID)`);
            default:
                throw new Error(`Record Process '${rp.Name}': unsupported ScopeType '${rp.ScopeType}'`);
        }
    }

    /** @deprecated Use {@link BuildSource}. */
    public buildSource(rp: MJRecordProcessEntity, provider: IMetadataProvider, singleRecordID?: string, scope?: RecordProcessScopeOverride): IRecordSetSource {
        return this.BuildSource(rp, provider, singleRecordID, scope);
    }

    /** Resolves a runtime scope override (UI invocation: selection / view / list / filter) to a source. */
    private buildSourceFromScope(rp: MJRecordProcessEntity, provider: IMetadataProvider, scope: RecordProcessScopeOverride): IRecordSetSource {
        switch (scope.Kind) {
            case 'records':
                return new ArraySource(scope.RecordIDs.map((id) => ({ EntityID: rp.EntityID, RecordID: id })), rp.EntityID, 'Array');
            case 'view':
                return new ViewSource(scope.ViewID);
            case 'list':
                return new ListSource(scope.ListID);
            case 'filter': {
                const entity = provider.EntityByID(rp.EntityID);
                if (!entity) {
                    throw new Error(`Record Process '${rp.Name}': entity '${rp.EntityID}' not found in metadata`);
                }
                return new FilterSource(entity.Name, scope.Filter);
            }
        }
    }

    /**
     * Builds the processor from the process's Work. `FieldRules` reads its rule set from `Configuration`
     * and writes itself (honoring `dryRun`); `Action` and `Agent` build their built-in processors; other work
     * types (including `Infer` and `'ML Model'`) resolve through {@link RecordProcessorRegistry}, then wrap
     * with output-mapping write-back when configured.
     */
    public BuildProcessor(
        rp: MJRecordProcessEntity,
        dryRun?: boolean,
        provider?: IMetadataProvider,
        tracker?: IProcessRunTracker,
    ): IRecordProcessor {
        if (rp.WorkType === 'FieldRules') {
            const ruleSet = rp.Configuration ? SafeJSONParse<FieldRuleSet>(rp.Configuration) : undefined;
            if (!ruleSet || !Array.isArray(ruleSet.Rules)) {
                throw new Error(`Record Process '${rp.Name}': WorkType=FieldRules requires a FieldRuleSet (with a Rules array) in Configuration`);
            }
            // FieldRules owns its own write / dry-run preview — no output-mapping write-back wrapper.
            return new FieldRulesProcessor({ RuleSet: ruleSet, DryRun: dryRun });
        }

        // unparseable mapping JSON (SafeJSONParse answers null) falls back to the default mapping, as an absent one does
        const inputMapping = (rp.InputMapping ? SafeJSONParse<Record<string, string>>(rp.InputMapping) : null) || undefined;
        let base: IRecordProcessor;
        if (rp.WorkType === 'Action') {
            if (!rp.ActionID) {
                throw new Error(`Record Process '${rp.Name}': WorkType=Action requires ActionID`);
            }
            base = new ActionRecordProcessor(rp.ActionID, inputMapping);
        } else if (rp.WorkType === 'Agent') {
            if (!rp.AgentID) {
                throw new Error(`Record Process '${rp.Name}': WorkType=Agent requires AgentID`);
            }
            base = new AgentRecordProcessor(rp.AgentID, inputMapping);
        } else {
            // Consult the pluggable registry. This open seam lets external packages (e.g.
            // FeaturePipelinesEngine's 'Infer' and Predictive Studio's 'ML Model' scoring) register
            // a processor factory for their own work type WITHOUT this package depending on them.
            base = this.resolveFromRegistry(rp, dryRun, provider, tracker);
        }

        const rawOutputMapping = rp.OutputMapping ? SafeJSONParse<OutputMappingConfig>(rp.OutputMapping) ?? undefined : undefined;
        const prepared = base.PrepareOutputMapping?.(rawOutputMapping as Record<string, unknown> | undefined);
        const outputMapping = (prepared?.OutputMapping as OutputMappingConfig | undefined) ?? rawOutputMapping;

        const hasMappedWrites = !!outputMapping &&
            !!(outputMapping.fields ||
                outputMapping.childRecord ||
                (outputMapping.childRecords && outputMapping.childRecords.length > 0) ||
                (outputMapping.tags && outputMapping.tags.length > 0));
        const hasUnmappedWrites = prepared?.HasUnmappedWrites === true;
        if (hasMappedWrites || hasUnmappedWrites) {
            const run: RunProvenance = {
                RecordProcessID: rp.ID,
                PromptID: rp.PromptID ?? undefined,
            };
            const mapping: OutputMappingConfig = outputMapping ?? {};
            return new WriteBackProcessor(base, mapping, dryRun, run);
        }
        return base;
    }

    /** @deprecated Use {@link BuildProcessor}. */
    public buildProcessor(rp: MJRecordProcessEntity, dryRun?: boolean, provider?: IMetadataProvider): IRecordProcessor {
        return this.BuildProcessor(rp, dryRun, provider);
    }

    /**
     * Resolves a processor for a work type the built-in switch doesn't handle by consulting the
     * {@link RecordProcessorRegistry}. External packages register a factory keyed by their work-type
     * string; the factory builds (and closes over its own injected deps for) the processor from the
     * per-run context. Throws the same "unsupported WorkType" error as before when nothing is registered,
     * so behavior is unchanged for genuinely-unknown work types.
     */
    private resolveFromRegistry(
        rp: MJRecordProcessEntity,
        dryRun?: boolean,
        provider?: IMetadataProvider,
        tracker?: IProcessRunTracker,
    ): IRecordProcessor {
        const context: RecordProcessorBuildContext = {
            WorkType: rp.WorkType,
            Configuration: rp.Configuration,
            InputMapping: rp.InputMapping,
            OutputMapping: rp.OutputMapping,
            EntityID: rp.EntityID,
            RecordProcessID: rp.ID,
            RecordProcessName: rp.Name,
            DryRun: dryRun,
            Provider: provider,
            Tracker: tracker,
            RecordProcess: rp,
        };
        const resolved = RecordProcessorRegistry.Instance.Resolve(context);
        if (!resolved) {
            throw new Error(`Record Process '${rp.Name}': unsupported WorkType '${rp.WorkType}'`);
        }
        return resolved;
    }
}
