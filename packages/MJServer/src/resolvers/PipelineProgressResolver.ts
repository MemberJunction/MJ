import { Resolver, Subscription, Root, ObjectType, Field, Float, Mutation, Arg, Ctx, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogStatus, LogError } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

const PIPELINE_PROGRESS_TOPIC = 'PIPELINE_PROGRESS';

/**
 * Stage of the knowledge pipeline.
 */
export type PipelineStageType = 'extract' | 'autotag' | 'vectorize' | 'complete' | 'error';

@ObjectType()
export class PipelineProgressNotification {
    @Field()
    PipelineRunID: string;

    @Field()
    Stage: string;

    @Field()
    TotalItems: number;

    @Field()
    ProcessedItems: number;

    @Field({ nullable: true })
    CurrentItem?: string;

    @Field(() => Float)
    ElapsedMs: number;

    @Field(() => Float, { nullable: true })
    EstimatedRemainingMs?: number;

    @Field(() => Float)
    PercentComplete: number;
}

@ObjectType()
export class PipelineStartResult {
    @Field()
    Success: boolean;

    @Field()
    PipelineRunID: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@Resolver()
export class PipelineProgressResolver extends ResolverBase {
    /**
     * Subscribe to pipeline progress notifications for a specific pipeline run.
     */
    @Subscription(() => PipelineProgressNotification, {
        topics: PIPELINE_PROGRESS_TOPIC,
        filter: ({ payload, args }: { payload: PipelineProgressNotification; args: { pipelineRunID: string } }) => {
            return payload.PipelineRunID === args.pipelineRunID;
        },
    })
    PipelineProgress(
        @Root() notification: PipelineProgressNotification,
        @Arg('pipelineRunID') _pipelineRunID: string
    ): PipelineProgressNotification {
        return notification;
    }

    /**
     * Publish a pipeline progress update. Called internally by the pipeline engine.
     */
    @Mutation(() => Boolean)
    async PublishPipelineProgress(
        @Arg('pipelineRunID') pipelineRunID: string,
        @Arg('stage') stage: string,
        @Arg('totalItems') totalItems: number,
        @Arg('processedItems') processedItems: number,
        @Arg('currentItem', { nullable: true }) currentItem: string | undefined,
        @Arg('elapsedMs', () => Float) elapsedMs: number,
        @Arg('estimatedRemainingMs', () => Float, { nullable: true }) estimatedRemainingMs: number | undefined,
        @PubSub() pubSub: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<boolean> {
        try {
            const percentComplete = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;

            const notification: PipelineProgressNotification = {
                PipelineRunID: pipelineRunID,
                Stage: stage,
                TotalItems: totalItems,
                ProcessedItems: processedItems,
                CurrentItem: currentItem,
                ElapsedMs: elapsedMs,
                EstimatedRemainingMs: estimatedRemainingMs,
                PercentComplete: percentComplete,
            };

            await pubSub.publish(PIPELINE_PROGRESS_TOPIC, notification);
            LogStatus(`PipelineProgress: ${stage} ${processedItems}/${totalItems} (${percentComplete}%)`);
            return true;
        } catch (error) {
            LogError(`PipelineProgressResolver.PublishPipelineProgress failed: ${error}`);
            return false;
        }
    }
}
