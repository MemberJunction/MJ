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
    UserTablePipeline,
    type RSUPipelineInput,
    type RSUPipelineResult,
    type RSUPipelineStep as RSUStep,
    type RSUPreviewResult as RSUPreview,
    type RSUStatus as RSUStatusType,
    type UserTableDefinition,
    type UserColumnDefinition,
} from '@memberjunction/schema-engine';

// ─── UDT Input Types ──────────────────────────────────────────────────

@InputType()
export class UDTColumnInputGQL {
    @Field(() => String, { description: 'Column display name (e.g., "Due Date")' })
    Name: string;

    @Field(() => String, { description: 'Logical type: string|integer|boolean|datetime|date|decimal|text|float|bigint' })
    Type: string;

    @Field(() => Boolean, { nullable: true, description: 'Whether the column allows null. Default: true.' })
    AllowEmpty?: boolean;

    @Field(() => Int, { nullable: true, description: 'Max length for string columns. Default: 255.' })
    MaxLength?: number;

    @Field(() => Int, { nullable: true, description: 'Precision for decimal columns.' })
    Precision?: number;

    @Field(() => Int, { nullable: true, description: 'Scale for decimal columns.' })
    Scale?: number;

    @Field(() => String, { nullable: true, description: 'Optional default value expression.' })
    DefaultValue?: string;

    @Field(() => String, { nullable: true, description: 'Column description.' })
    Description?: string;
}

@InputType()
export class CreateUserDefinedTableInputGQL {
    @Field(() => String, { description: 'Display name, e.g. "Project Milestones"' })
    DisplayName: string;

    @Field(() => String, { nullable: true, description: 'Human-readable description of the table.' })
    Description?: string;

    @Field(() => [UDTColumnInputGQL], { description: 'Column definitions.' })
    Columns: UDTColumnInputGQL[];

    @Field(() => Boolean, { nullable: true, description: 'Skip git commit/push step.' })
    SkipGitCommit?: boolean;

    @Field(() => Boolean, { nullable: true, description: 'Skip MJAPI restart.' })
    SkipRestart?: boolean;
}

// ─── UDT Output Types ─────────────────────────────────────────────────

@ObjectType()
export class UDTPreviewResultGQL {
    @Field(() => Boolean, { description: 'Whether the definition is valid and would execute.' })
    WouldExecute: boolean;

    @Field(() => String, { description: 'Generated SQL table name, e.g. "custom.UD_ProjectMilestones".' })
    TableName: string;

    @Field(() => String, { description: 'Generated MJ entity name, e.g. "User: Project Milestones".' })
    EntityName: string;

    @Field(() => String, { description: 'The migration SQL that would be executed.' })
    MigrationSQL: string;

    @Field(() => [String], { description: 'Validation errors, if any.' })
    ValidationErrors: string[];
}

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

    /**
     * Mutation: Preview a User Defined Table creation without executing.
     * Shows the generated SQL table name, entity name, migration SQL, and validation errors.
     * Requires system user authorization.
     */
    @Mutation(() => UDTPreviewResultGQL, {
        description: 'Preview User Defined Table creation — shows generated SQL and validation results without executing.',
    })
    @RequireSystemUser()
    PreviewUserDefinedTable(
        @Arg('input', () => CreateUserDefinedTableInputGQL) input: CreateUserDefinedTableInputGQL,
        @Ctx() _ctx: AppContext
    ): UDTPreviewResultGQL {
        const pipeline = new UserTablePipeline();
        const def = this.buildUserTableDefinition(input);
        const preview = pipeline.Preview(def);

        return {
            WouldExecute: preview.Valid,
            TableName: preview.SqlTableName,
            EntityName: preview.EntityName,
            MigrationSQL: preview.MigrationSQL,
            ValidationErrors: preview.ValidationErrors,
        };
    }

    /**
     * Mutation: Create a User Defined Table and run the full RSU pipeline.
     * Naming conventions: SQL table = custom.UD_{DisplayName}, entity = "User: {DisplayName}".
     * Requires system user authorization.
     */
    @Mutation(() => RSUPipelineResultGQL, {
        description: 'Create a User Defined Table and run the RSU pipeline (migrate → CodeGen → restart). Requires system user.',
    })
    @RequireSystemUser()
    async CreateUserDefinedTable(
        @Arg('input', () => CreateUserDefinedTableInputGQL) input: CreateUserDefinedTableInputGQL,
        @Ctx() _ctx: AppContext
    ): Promise<RSUPipelineResultGQL> {
        const pipeline = new UserTablePipeline();
        const def = this.buildUserTableDefinition(input);
        const result = await pipeline.CreateTable(def);

        if (!result.Success && result.ValidationErrors && result.ValidationErrors.length > 0) {
            return {
                Success: false,
                APIRestarted: false,
                GitCommitSuccess: false,
                Steps: [],
                ErrorMessage: result.ValidationErrors.join('; '),
            };
        }

        if (!result.PipelineResult) {
            return {
                Success: false,
                APIRestarted: false,
                GitCommitSuccess: false,
                Steps: [],
                ErrorMessage: result.ErrorMessage ?? 'Unknown error',
            };
        }

        const pr = result.PipelineResult;
        return {
            Success: pr.Success,
            BranchName: pr.BranchName,
            MigrationFilePath: pr.MigrationFilePath,
            EntitiesProcessed: pr.EntitiesProcessed,
            APIRestarted: pr.APIRestarted,
            GitCommitSuccess: pr.GitCommitSuccess,
            Steps: pr.Steps.map((s: RSUStep) => ({
                Name: s.Name,
                Status: s.Status,
                DurationMs: s.DurationMs,
                Message: s.Message,
            })),
            ErrorMessage: pr.ErrorMessage,
            ErrorStep: pr.ErrorStep,
        };
    }

    private buildUserTableDefinition(input: CreateUserDefinedTableInputGQL): UserTableDefinition {
        const columns: UserColumnDefinition[] = input.Columns.map(c => ({
            Name: c.Name,
            Type: c.Type as UserColumnDefinition['Type'],
            AllowEmpty: c.AllowEmpty,
            MaxLength: c.MaxLength,
            Precision: c.Precision,
            Scale: c.Scale,
            DefaultValue: c.DefaultValue ?? undefined,
            Description: c.Description ?? undefined,
        }));

        return {
            DisplayName: input.DisplayName,
            Description: input.Description ?? undefined,
            Columns: columns,
            SkipGitCommit: input.SkipGitCommit ?? undefined,
            SkipRestart: input.SkipRestart ?? undefined,
        };
    }
}

export default RSUResolver;
