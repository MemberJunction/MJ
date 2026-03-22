/**
 * RSUResolver — GraphQL API for the Runtime Schema Update pipeline.
 *
 * Exposes:
 *   - Query: RuntimeSchemaUpdateStatus — current RSU system status
 *   - Mutation: RunRuntimeSchemaUpdate — execute the full RSU pipeline
 *   - Mutation: PreviewRuntimeSchemaUpdate — dry-run preview
 *
 * All mutations require system user authorization.
 */
import {
    Arg,
    Ctx,
    Field,
    InputType,
    Mutation,
    ObjectType,
    Query,
    Resolver,
    Int,
} from 'type-graphql';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import {
    RuntimeSchemaManager,
    type RSUPipelineInput,
} from '@memberjunction/schema-engine';

// ─── RSU Input Types ─────────────────────────────────────────────────

@InputType()
export class RSUMetadataFileInput {
    @Field(() => String)
    Path: string;

    @Field(() => String)
    Content: string;
}

@InputType()
export class RSUPipelineInputGQL {
    @Field(() => String, { description: 'The migration SQL to execute' })
    MigrationSQL: string;

    @Field(() => String, { description: 'Descriptive name for this schema change' })
    Description: string;

    @Field(() => [String], { description: 'Tables being created or modified' })
    AffectedTables: string[];

    @Field(() => String, { nullable: true, description: 'additionalSchemaInfo JSON for soft FKs' })
    AdditionalSchemaInfo?: string;

    @Field(() => [RSUMetadataFileInput], { nullable: true, description: 'Metadata JSON files for mj-sync' })
    MetadataFiles?: RSUMetadataFileInput[];

    @Field(() => Boolean, { nullable: true, description: 'Skip git commit/push step' })
    SkipGitCommit?: boolean;

    @Field(() => Boolean, { nullable: true, description: 'Skip MJAPI restart' })
    SkipRestart?: boolean;
}

// ─── Output Types ────────────────────────────────────────────────────

@ObjectType()
export class RSUPipelineStepGQL {
    @Field(() => String)
    Name: string;

    @Field(() => String)
    Status: string;

    @Field(() => Int)
    DurationMs: number;

    @Field(() => String)
    Message: string;
}

@ObjectType()
export class RSUPipelineResultGQL {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => String, { nullable: true })
    BranchName?: string;

    @Field(() => String, { nullable: true })
    MigrationFilePath?: string;

    @Field(() => Int, { nullable: true })
    EntitiesProcessed?: number;

    @Field(() => Boolean)
    APIRestarted: boolean;

    @Field(() => Boolean)
    GitCommitSuccess: boolean;

    @Field(() => [RSUPipelineStepGQL])
    Steps: RSUPipelineStepGQL[];

    @Field(() => String, { nullable: true })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true })
    ErrorStep?: string;
}

@ObjectType()
export class RSUPipelineBatchResultGQL {
    @Field(() => [RSUPipelineResultGQL])
    Results: RSUPipelineResultGQL[];

    @Field(() => Int)
    SuccessCount: number;

    @Field(() => Int)
    FailureCount: number;

    @Field(() => Int)
    TotalCount: number;
}

@ObjectType()
export class RSUPreviewResultGQL {
    @Field(() => String)
    MigrationSQL: string;

    @Field(() => [String])
    AffectedTables: string[];

    @Field(() => [String])
    ValidationErrors: string[];

    @Field(() => Boolean)
    WouldExecute: boolean;
}

@ObjectType()
export class RSUStatusGQL {
    @Field(() => Boolean)
    Enabled: boolean;

    @Field(() => Boolean)
    Running: boolean;

    @Field(() => Boolean)
    OutOfSync: boolean;

    @Field(() => Date, { nullable: true })
    OutOfSyncSince?: Date | null;

    @Field(() => Date, { nullable: true })
    LastRunAt?: Date | null;

    @Field(() => String, { nullable: true })
    LastRunResult?: string | null;
}

@ObjectType()
export class RSUQueueStatusGQL {
    @Field(() => Int)
    PendingCount: number;

    @Field(() => Boolean)
    IsCycleRunning: boolean;
}

// ─── Resolver ────────────────────────────────────────────────────────

@Resolver()
export class RSUResolver {
    /**
     * Query: Get current RSU system status.
     * Available to any authenticated user (status is informational).
     */
    @Query(() => RSUStatusGQL, { description: 'Returns the current Runtime Schema Update status' })
    RuntimeSchemaUpdateStatus(): RSUStatusGQL {
        const rsm = RuntimeSchemaManager.Instance;
        const status = rsm.GetStatus();
        return {
            Enabled: status.Enabled,
            Running: status.Running,
            OutOfSync: status.OutOfSync,
            OutOfSyncSince: status.OutOfSyncSince,
            LastRunAt: status.LastRunAt,
            LastRunResult: status.LastRunResult,
        };
    }

    /**
     * Query: Get RSU CodeGen queue status.
     * Shows how many requests are pending and whether a cycle is running.
     */
    @Query(() => RSUQueueStatusGQL, { description: 'Returns the RSU pipeline status' })
    RuntimeSchemaUpdateQueueStatus(): RSUQueueStatusGQL {
        const rsm = RuntimeSchemaManager.Instance;
        return {
            PendingCount: 0, // Batching is explicit via RunPipelineBatch — no implicit queue
            IsCycleRunning: rsm.IsRunning,
        };
    }

    /**
     * Mutation: Execute the full RSU pipeline.
     * Requires system user authorization.
     */
    @Mutation(() => RSUPipelineResultGQL, {
        description: 'Execute the Runtime Schema Update pipeline. Requires system user.',
    })
    @RequireSystemUser()
    async RunRuntimeSchemaUpdate(
        @Arg('input', () => RSUPipelineInputGQL) input: RSUPipelineInputGQL,
        @Ctx() _ctx: AppContext
    ): Promise<RSUPipelineResultGQL> {
        const rsm = RuntimeSchemaManager.Instance;

        const pipelineInput: RSUPipelineInput = {
            MigrationSQL: input.MigrationSQL,
            Description: input.Description,
            AffectedTables: input.AffectedTables,
            AdditionalSchemaInfo: input.AdditionalSchemaInfo ?? undefined,
            MetadataFiles: input.MetadataFiles?.map(mf => ({ Path: mf.Path, Content: mf.Content })),
            SkipGitCommit: input.SkipGitCommit ?? undefined,
            SkipRestart: input.SkipRestart ?? undefined,
        };

        const result = await rsm.RunPipeline(pipelineInput);

        return {
            Success: result.Success,
            BranchName: result.BranchName,
            MigrationFilePath: result.MigrationFilePath,
            EntitiesProcessed: result.EntitiesProcessed,
            APIRestarted: result.APIRestarted,
            GitCommitSuccess: result.GitCommitSuccess,
            Steps: result.Steps.map(s => ({
                Name: s.Name,
                Status: s.Status,
                DurationMs: s.DurationMs,
                Message: s.Message,
            })),
            ErrorMessage: result.ErrorMessage,
            ErrorStep: result.ErrorStep,
        };
    }

    /**
     * Mutation: Execute the RSU pipeline for a batch of inputs.
     * All migrations execute under one lock, then one CodeGen/compile/restart/git.
     * Per-item migration results + shared post-migration result.
     */
    @Mutation(() => RSUPipelineBatchResultGQL, {
        description: 'Execute Runtime Schema Update for a batch of inputs. Requires system user.',
    })
    @RequireSystemUser()
    async RunRuntimeSchemaUpdateBatch(
        @Arg('inputs', () => [RSUPipelineInputGQL]) inputs: RSUPipelineInputGQL[],
        @Ctx() _ctx: AppContext
    ): Promise<RSUPipelineBatchResultGQL> {
        const rsm = RuntimeSchemaManager.Instance;

        const pipelineInputs: RSUPipelineInput[] = inputs.map(input => ({
            MigrationSQL: input.MigrationSQL,
            Description: input.Description,
            AffectedTables: input.AffectedTables,
            AdditionalSchemaInfo: input.AdditionalSchemaInfo ?? undefined,
            MetadataFiles: input.MetadataFiles?.map(mf => ({ Path: mf.Path, Content: mf.Content })),
            SkipGitCommit: input.SkipGitCommit ?? undefined,
            SkipRestart: input.SkipRestart ?? undefined,
        }));

        const batchResult = await rsm.RunPipelineBatch(pipelineInputs);

        return {
            Results: batchResult.Results.map(result => ({
                Success: result.Success,
                BranchName: result.BranchName,
                MigrationFilePath: result.MigrationFilePath,
                EntitiesProcessed: result.EntitiesProcessed,
                APIRestarted: result.APIRestarted,
                GitCommitSuccess: result.GitCommitSuccess,
                Steps: result.Steps.map(s => ({
                    Name: s.Name,
                    Status: s.Status,
                    DurationMs: s.DurationMs,
                    Message: s.Message,
                })),
                ErrorMessage: result.ErrorMessage,
                ErrorStep: result.ErrorStep,
            })),
            SuccessCount: batchResult.SuccessCount,
            FailureCount: batchResult.FailureCount,
            TotalCount: batchResult.TotalCount,
        };
    }

    /**
     * Mutation: Preview mode — validate SQL and return what would happen.
     * Requires system user authorization.
     */
    @Mutation(() => RSUPreviewResultGQL, {
        description: 'Preview Runtime Schema Update without executing. Requires system user.',
    })
    @RequireSystemUser()
    PreviewRuntimeSchemaUpdate(
        @Arg('input', () => RSUPipelineInputGQL) input: RSUPipelineInputGQL,
        @Ctx() _ctx: AppContext
    ): RSUPreviewResultGQL {
        const rsm = RuntimeSchemaManager.Instance;

        const pipelineInput: RSUPipelineInput = {
            MigrationSQL: input.MigrationSQL,
            Description: input.Description,
            AffectedTables: input.AffectedTables,
        };

        const preview = rsm.Preview(pipelineInput);

        return {
            MigrationSQL: preview.MigrationSQL,
            AffectedTables: preview.AffectedTables,
            ValidationErrors: preview.ValidationErrors,
            WouldExecute: preview.WouldExecute,
        };
    }
}

export default RSUResolver;
