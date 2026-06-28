/**
 * @fileoverview Turns a `MJ: Record Processes` definition into a concrete RecordSetProcessor run:
 * builds the source from its Scope, the processor from its Work (+ output-mapping write-back), and
 * executes. Shared by the on-demand (RunNow) operation, the scheduled-job driver, and on-change.
 * @module @memberjunction/record-set-processor
 */

import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { SafeJSONParse, type FieldRuleSet } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    ArraySource,
    FilterSource,
    IRecordProcessor,
    IRecordSetSource,
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
import { InferProcessor } from './processors/InferProcessor';
import { FieldRulesProcessor } from './processors/FieldRulesProcessor';
import { WriteBackProcessor } from './processors/WriteBackProcessor';
import { OutputMappingConfig } from './writeBack';

/** Options for executing a Record Process. */
export interface RunRecordProcessOptions {
    /** The acting user. */
    contextUser: UserInfo;
    /** The owning provider (defaults to the active provider). */
    provider?: IMetadataProvider;
    /** What triggered the run (default `OnDemand`). */
    triggeredBy?: TriggeredByValue;
    /** Process a single record (the on-change / on-demand single-record case) instead of the scope. */
    singleRecordID?: string;
    /**
     * Runtime scope override (selected rows / a view / a list / a filter), used instead of the stored
     * Scope. This is how a grid/list UI runs a process against exactly what the user is looking at.
     */
    scope?: RecordProcessScopeOverride;
    /**
     * Compute-only: for work types that support it (currently `FieldRules`), produce the per-record diff
     * WITHOUT writing. Powers the preview step of the bulk-update UX.
     */
    dryRun?: boolean;
    /** FK to the owning `ScheduledJobRun` when launched by the scheduler (links the Process Run back). */
    scheduledJobRunID?: string;
    /** Progress callback. */
    onProgress?: (progress: ProgressInfo) => void;
}

/** Builds and runs a RecordSetProcessor pass from a Record Process definition. */
export class RecordProcessExecutor {
    /** Loads the Record Process by ID and runs it. */
    public async RunByID(recordProcessID: string, options: RunRecordProcessOptions): Promise<ProcessRunResult> {
        const provider = options.provider ?? Metadata.Provider;
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', options.contextUser);
        const loaded = await rp.Load(recordProcessID);
        if (!loaded) {
            throw new Error(`Record Process '${recordProcessID}' not found`);
        }
        return this.Run(rp, options);
    }

    /** Runs an already-loaded Record Process. */
    public async Run(rp: MJRecordProcessEntity, options: RunRecordProcessOptions): Promise<ProcessRunResult> {
        const provider = options.provider ?? Metadata.Provider;
        return RecordSetProcessor.Instance.Process({
            source: this.buildSource(rp, provider, options.singleRecordID, options.scope),
            processor: this.buildProcessor(rp, options.dryRun),
            contextUser: options.contextUser,
            provider,
            dryRun: options.dryRun,
            recordProcessID: rp.ID,
            scheduledJobRunID: options.scheduledJobRunID,
            entityID: rp.EntityID,
            triggeredBy: options.triggeredBy ?? 'OnDemand',
            batchSize: rp.BatchSize ?? undefined,
            maxConcurrency: rp.MaxConcurrency ?? undefined,
            onProgress: options.onProgress,
            configuration: { recordProcessName: rp.Name, workType: rp.WorkType, scopeType: rp.ScopeType },
        });
    }

    /** Builds the record-set source from a single-record override, a runtime scope override, or the process's stored Scope. */
    public buildSource(rp: MJRecordProcessEntity, provider: IMetadataProvider, singleRecordID?: string, scope?: RecordProcessScopeOverride): IRecordSetSource {
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
                throw new Error(`Record Process '${rp.Name}': ScopeType=SingleRecord requires a record ID (pass singleRecordID)`);
            default:
                throw new Error(`Record Process '${rp.Name}': unsupported ScopeType '${rp.ScopeType}'`);
        }
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
     * and writes itself (honoring `dryRun`); the other work types build a base processor wrapped with
     * output-mapping write-back when configured. The write-back wrapper also honors `dryRun` — on a
     * dry-run the inner work runs but the mapping only previews (nothing is saved), so EVERY work type's
     * dry-run is side-effect-free, not just FieldRules.
     */
    public buildProcessor(rp: MJRecordProcessEntity, dryRun?: boolean): IRecordProcessor {
        if (rp.WorkType === 'FieldRules') {
            const ruleSet = rp.Configuration ? SafeJSONParse<FieldRuleSet>(rp.Configuration) : undefined;
            if (!ruleSet || !Array.isArray(ruleSet.Rules)) {
                throw new Error(`Record Process '${rp.Name}': WorkType=FieldRules requires a FieldRuleSet (with a Rules array) in Configuration`);
            }
            // FieldRules owns its own write / dry-run preview — no output-mapping write-back wrapper.
            return new FieldRulesProcessor({ RuleSet: ruleSet, DryRun: dryRun });
        }

        const inputMapping = rp.InputMapping ? SafeJSONParse(rp.InputMapping) : undefined;
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
        } else if (rp.WorkType === 'Infer') {
            if (!rp.PromptID) {
                throw new Error(`Record Process '${rp.Name}': WorkType=Infer requires PromptID`);
            }
            base = new InferProcessor(rp.PromptID, inputMapping);
        } else {
            // Not a built-in work type — consult the pluggable registry. This is the open seam that
            // lets external packages (e.g. Predictive Studio's 'ML Model' scoring) register a processor
            // factory for their own work type WITHOUT this package depending on them.
            base = this.resolveFromRegistry(rp, dryRun);
        }

        const outputMapping = rp.OutputMapping ? SafeJSONParse<OutputMappingConfig>(rp.OutputMapping) : undefined;
        if (outputMapping && (outputMapping.fields || outputMapping.childRecord)) {
            return new WriteBackProcessor(base, outputMapping, dryRun);
        }
        return base;
    }

    /**
     * Resolves a processor for a work type the built-in switch doesn't handle by consulting the
     * {@link RecordProcessorRegistry}. External packages register a factory keyed by their work-type
     * string; the factory builds (and closes over its own injected deps for) the processor from the
     * per-run context. Throws the same "unsupported WorkType" error as before when nothing is registered,
     * so behavior is unchanged for genuinely-unknown work types.
     */
    private resolveFromRegistry(rp: MJRecordProcessEntity, dryRun?: boolean): IRecordProcessor {
        const context: RecordProcessorBuildContext = {
            WorkType: rp.WorkType,
            Configuration: rp.Configuration,
            InputMapping: rp.InputMapping,
            OutputMapping: rp.OutputMapping,
            EntityID: rp.EntityID,
            RecordProcessID: rp.ID,
            RecordProcessName: rp.Name,
            DryRun: dryRun,
            RecordProcess: rp,
        };
        const resolved = RecordProcessorRegistry.Instance.Resolve(context);
        if (!resolved) {
            throw new Error(`Record Process '${rp.Name}': unsupported WorkType '${rp.WorkType}'`);
        }
        return resolved;
    }
}
