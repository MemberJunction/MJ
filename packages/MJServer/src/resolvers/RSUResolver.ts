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
