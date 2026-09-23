/**
 * @file CloneRecordProcessor.ts
 * Implements IRecordProcessor for WorkType = 'Clone'.
 * Allows batch record cloning driven by Record Process runs.
 * @see plans/record-cloning/README.md §11.3, §13.1
 */

import { IRecordProcessor, RecordProcessorContext, RecordProcessorRegistry, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import { CloneEdgePolicy, CloneRequestOptions, RecordCloneRequest } from '@memberjunction/record-cloning-base';
import { ClonePlanner } from './ClonePlanner';
import { CloneExecutor } from './CloneExecutor';

export interface CloneRecordProcessorConfig {
    EntityName?: string;
    Options?: CloneRequestOptions;
    EdgeOverrides?: Array<{ RelationshipID: string; Policy: CloneEdgePolicy }>;
    FieldOverrides?: Record<string, unknown>;
    DryRun?: boolean;
}

export class CloneRecordProcessor implements IRecordProcessor {
    private _config: CloneRecordProcessorConfig;

    public constructor(config?: CloneRecordProcessorConfig) {
        this._config = config ?? {};
    }

    public async ProcessRecord(
        record: RecordRef,
        context: RecordProcessorContext
    ): Promise<RecordResult> {
        const provider = context.provider;
        const user = context.contextUser;
        const entityInfo =
            provider.Entities.find((e) => e.ID === record.EntityID) ||
            (this._config.EntityName ? provider.EntityByName(this._config.EntityName) : null);

        if (!entityInfo) {
            return {
                Status: 'Failed',
                ErrorMessage: `Entity with ID '${record.EntityID}' not found in metadata.`,
            };
        }

        const planner = new ClonePlanner({ Provider: provider });
        const executor = new CloneExecutor({ Provider: provider });

        const pkFieldName = entityInfo.FirstPrimaryKey?.Name || 'ID';
        const request: RecordCloneRequest = {
            EntityName: entityInfo.Name,
            SourceRecordKey: { [pkFieldName]: record.RecordID },
            Options: this._config.Options,
            EdgeOverrides: this._config.EdgeOverrides,
            FieldOverrides: this._config.FieldOverrides,
        };

        const plan = await planner.Plan(request, user);

        if (this._config.DryRun) {
            return {
                Status: plan.Blocked ? 'Failed' : 'Succeeded',
                ResultPayload: {
                    DryRun: true,
                    PlanHash: plan.PlanHash,
                    RootTargetKey: plan.RootTargetKey,
                    NodesCount: plan.Nodes.length,
                    EdgesCount: plan.Edges.length,
                    Blocked: plan.Blocked,
                    Warnings: plan.Warnings,
                },
                ErrorMessage: plan.Blocked
                    ? plan.Warnings.map((w) => w.Message).join('; ')
                    : undefined,
            };
        }

        if (plan.Blocked) {
            return {
                Status: 'Failed',
                ResultPayload: {
                    Blocked: true,
                    Warnings: plan.Warnings,
                },
                ErrorMessage: plan.Warnings.map((w) => w.Message).join('; '),
            };
        }

        const result = await executor.Execute(plan, user);
        return {
            Status: result.Success ? 'Succeeded' : 'Failed',
            ResultPayload: {
                DryRun: false,
                CloneLogID: result.CloneLogID,
                NewRecordID: result.RootRecordKey,
                RecordsCloned: result.RecordsCloned,
                Warnings: result.Warnings,
            },
            ErrorMessage: result.ErrorMessage,
        };
    }
}

/**
 * Registers the CloneRecordProcessor into RecordProcessorRegistry.
 */
export function RegisterCloneRecordProcessor(): void {
    RecordProcessorRegistry.Instance.Register('Clone', (context) => {
        let parsedConfig: CloneRecordProcessorConfig = {};
        if (context.Configuration) {
            try {
                parsedConfig = JSON.parse(context.Configuration);
            } catch {
                // Ignore parse errors, fall back to empty config
            }
        }
        return new CloneRecordProcessor(parsedConfig);
    });
}
