import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Int, InputType, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { VersionHistoryEngine } from '@memberjunction/version-history';
import { CreateLabelParams, CreateLabelProgressUpdate, VersionLabelScope } from '@memberjunction/version-history';
import { KeyValuePairInput } from '../generic/KeyValuePairInput.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

// =========================================================================
// GraphQL types
// =========================================================================

@ObjectType()
export class CaptureErrorOutput {
    @Field()
    EntityName: string;

    @Field()
    RecordID: string;

    @Field()
    ErrorMessage: string;
}

@ObjectType()
export class CreateLabelResultOutput {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    LabelID?: string;

    @Field({ nullable: true })
    LabelName?: string;

    @Field(() => Int, { nullable: true })
    ItemsCaptured?: number;

    @Field(() => Int, { nullable: true })
    SyntheticSnapshotsCreated?: number;

    @Field({ nullable: true })
    Error?: string;

    @Field(() => [CaptureErrorOutput], { nullable: true })
    CaptureErrors?: CaptureErrorOutput[];
}

@InputType()
export class CreateVersionLabelInput {
    @Field()
    Name: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    EntityName?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    RecordKeys?: KeyValuePairInput[];

    @Field({ nullable: true })
    ParentID?: string;

    @Field({ nullable: true })
    ExternalSystemID?: string;

    @Field(() => Boolean, { nullable: true })
    IncludeDependencies?: boolean;

    @Field(() => Int, { nullable: true })
    MaxDepth?: number;

    @Field(() => [String], { nullable: true })
    ExcludeEntities?: string[];
}

// =========================================================================
// Resolver
// =========================================================================

@Resolver()
export class VersionHistoryResolver extends ResolverBase {

    @Mutation(() => CreateLabelResultOutput)
    async CreateVersionLabel(
        @Arg('input') input: CreateVersionLabelInput,
        @Arg('sessionId', { nullable: true }) sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Ctx() context: AppContext
    ): Promise<CreateLabelResultOutput> {
        const contextUser = this.GetUserFromPayload(context.userPayload);
        if (!contextUser) {
            return { Success: false, Error: 'Unable to determine user context.' };
        }

        try {
            const engine = new VersionHistoryEngine();

            // Build CompositeKey from input key pairs if provided
            let recordKey: CompositeKey | undefined;
            if (input.RecordKeys && input.RecordKeys.length > 0) {
                recordKey = new CompositeKey(
                    input.RecordKeys.map(kv => ({
                        FieldName: kv.Key,
                        Value: kv.Value ?? ''
                    } as KeyValuePair))
                );
            }

            // Build progress callback that publishes to PubSub
            const resolvedSessionId = sessionId ?? context.userPayload.sessionId;
            const onProgress = this.buildProgressCallback(pubSub, resolvedSessionId);

            const params: CreateLabelParams = {
                Name: input.Name,
                Description: input.Description,
                Scope: (input.Scope as VersionLabelScope) ?? 'Record',
                EntityName: input.EntityName,
                RecordKey: recordKey,
                ParentID: input.ParentID,
                ExternalSystemID: input.ExternalSystemID,
                IncludeDependencies: input.IncludeDependencies,
                MaxDepth: input.MaxDepth,
                ExcludeEntities: input.ExcludeEntities,
                OnProgress: onProgress,
            };

            const result = await engine.CreateLabel(params, contextUser);

            LogStatus(`VersionHistory resolver: Label '${input.Name}' created with ${result.CaptureResult.ItemsCaptured} items.`);

            return {
                Success: result.CaptureResult.Success,
                LabelID: result.Label.ID,
                LabelName: result.Label.Name,
                ItemsCaptured: result.CaptureResult.ItemsCaptured,
                SyntheticSnapshotsCreated: result.CaptureResult.SyntheticSnapshotsCreated,
                CaptureErrors: result.CaptureResult.Errors.map(e => ({
                    EntityName: e.EntityName,
                    RecordID: e.RecordID,
                    ErrorMessage: e.ErrorMessage,
                })),
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`VersionHistory resolver: CreateLabel failed: ${msg}`);
            return { Success: false, Error: msg };
        }
    }

    /**
     * Build a progress callback that publishes CreateLabelProgress messages
     * to the PubSub system for real-time client consumption.
     */
    private buildProgressCallback(
        pubSub: PubSubEngine,
        sessionId: string
    ): (progress: CreateLabelProgressUpdate) => void {
        return (progress: CreateLabelProgressUpdate) => {
            pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                message: JSON.stringify({
                    resolver: 'VersionHistoryResolver',
                    type: 'CreateLabelProgress',
                    status: 'ok',
                    data: progress,
                }),
                sessionId,
            });
        };
    }
}
