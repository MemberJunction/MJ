/**
 * @fileoverview Turns a `MJ: Record Processes` definition into a concrete RecordSetProcessor run:
 * builds the source from its Scope, the processor from its Work (+ output-mapping write-back), and
 * executes. Shared by the on-demand (RunNow) operation, the scheduled-job driver, and on-change.
 * @module @memberjunction/record-set-processor
 */

import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    ArraySource,
    FilterSource,
    IRecordProcessor,
    IRecordSetSource,
    ListSource,
    ProcessRunResult,
    ProgressInfo,
    TriggeredByValue,
    ViewSource,
} from '@memberjunction/record-set-processor-base';
import { RecordSetProcessor } from './RecordSetProcessor';
import { ActionRecordProcessor } from './processors/ActionRecordProcessor';
import { AgentRecordProcessor } from './processors/AgentRecordProcessor';
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
            source: this.buildSource(rp, provider, options.singleRecordID),
            processor: this.buildProcessor(rp),
            contextUser: options.contextUser,
            provider,
            recordProcessID: rp.ID,
            entityID: rp.EntityID,
            triggeredBy: options.triggeredBy ?? 'OnDemand',
            batchSize: rp.BatchSize ?? undefined,
            maxConcurrency: rp.MaxConcurrency ?? undefined,
            onProgress: options.onProgress,
            configuration: { recordProcessName: rp.Name, workType: rp.WorkType, scopeType: rp.ScopeType },
        });
    }

    /** Builds the record-set source from the process's Scope (or a single-record override). */
    public buildSource(rp: MJRecordProcessEntity, provider: IMetadataProvider, singleRecordID?: string): IRecordSetSource {
        if (singleRecordID) {
            return new ArraySource([{ EntityID: rp.EntityID, RecordID: singleRecordID }], rp.EntityID, 'SingleRecord');
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

    /** Builds the processor from the process's Work, wrapping with output-mapping write-back when configured. */
    public buildProcessor(rp: MJRecordProcessEntity): IRecordProcessor {
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
        } else {
            throw new Error(`Record Process '${rp.Name}': unsupported WorkType '${rp.WorkType}'`);
        }

        const outputMapping = rp.OutputMapping ? SafeJSONParse<OutputMappingConfig>(rp.OutputMapping) : undefined;
        if (outputMapping && (outputMapping.fields || outputMapping.childRecord)) {
            return new WriteBackProcessor(base, outputMapping);
        }
        return base;
    }
}
