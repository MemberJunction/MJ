/**
 * @fileoverview Thin GraphQL surface over task-graph submission.
 *
 * **`ExecuteTaskGraph` is gone (D12).** It awaited an entire multi-step workflow inside a single
 * long-lived GraphQL request, which meant a page reload lost the awaited promise, a server restart
 * orphaned every in-flight task, and no other channel could reach the substrate at all. Removing a
 * public mutation is formally a breaking external-surface change; it is accepted deliberately in
 * the open v6 window, and its sole known caller — the Explorer conversation client — is converted
 * to an observer in this same phase.
 *
 * What replaces it is deliberately boring: submit returns as soon as the graph is durable, and the
 * durable dispatcher executes it independently. Clients observe progress over the existing PubSub
 * plumbing instead of holding a request open.
 *
 * These resolvers stay thin on purpose — all logic lives in `@memberjunction/task-graph`, so the
 * same behavior is available to Slack, scheduled jobs, and headless callers that never touch
 * GraphQL.
 *
 * @module @memberjunction/server
 */
import { Arg, Ctx, Field, Mutation, ObjectType, Resolver } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { TaskGraphService, type TaskGraphSpec, type TaskGraphSubmitContext } from '@memberjunction/task-graph';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

@ObjectType()
export class SubmitTaskGraphResult {
    @Field()
    success: boolean;

    /** Handle for status, cancel and retry. Absent when submission was rejected. */
    @Field({ nullable: true })
    parentTaskId?: string;

    /** Populated on rejection with every validation failure, not just the first. */
    @Field({ nullable: true })
    errorMessage?: string;
}

@ObjectType()
export class TaskGraphActionResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;
}

@Resolver()
export class TaskOrchestrationResolver extends ResolverBase {
    /**
     * Validates and persists a task graph, returning immediately.
     *
     * The response means "this graph is durable and will run", not "this graph has run". That is
     * the whole point of the split: the caller is freed the moment the work is safe.
     */
    @Mutation(() => SubmitTaskGraphResult)
    async SubmitTaskGraph(
        @Arg('taskGraphJson') taskGraphJson: string,
        @Arg('environmentId') environmentId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('conversationDetailId', { nullable: true }) conversationDetailId?: string,
    ): Promise<SubmitTaskGraphResult> {
        await this.CheckAPIKeyScopeAuthorization('task:execute', undefined, userPayload);

        try {
            const spec = JSON.parse(taskGraphJson) as TaskGraphSpec;
            const context = this.buildContext(environmentId, conversationDetailId ?? null, userPayload, providers);
            const result = await new TaskGraphService().Submit(spec, context);
            return {
                success: result.Success,
                parentTaskId: result.ParentTaskID,
                errorMessage: result.ErrorMessage,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[SubmitTaskGraph] ${message}`);
            return { success: false, errorMessage: message };
        }
    }

    /** Cancels a graph and every task in it that has not already settled. */
    @Mutation(() => TaskGraphActionResult)
    async CancelTaskGraph(
        @Arg('parentTaskId') parentTaskId: string,
        @Arg('environmentId') environmentId: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<TaskGraphActionResult> {
        await this.CheckAPIKeyScopeAuthorization('task:execute', undefined, userPayload);
        try {
            const context = this.buildContext(environmentId, null, userPayload, providers);
            return { success: await new TaskGraphService().Cancel(parentTaskId, context) };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[CancelTaskGraph] ${message}`);
            return { success: false, errorMessage: message };
        }
    }

    /**
     * Returns a failed task to `Pending` so the dispatcher runs it again, and unblocks whatever it
     * had blocked — retrying a task while its dependents stay `Blocked` would leave the graph just
     * as stuck as before.
     */
    @Mutation(() => TaskGraphActionResult)
    async RetryTask(
        @Arg('taskId') taskId: string,
        @Arg('environmentId') environmentId: string,
        @Ctx() { userPayload, providers }: AppContext,
    ): Promise<TaskGraphActionResult> {
        await this.CheckAPIKeyScopeAuthorization('task:execute', undefined, userPayload);
        try {
            const context = this.buildContext(environmentId, null, userPayload, providers);
            return { success: await new TaskGraphService().Retry(taskId, context) };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[RetryTask] ${message}`);
            return { success: false, errorMessage: message };
        }
    }

    private buildContext(
        environmentId: string,
        conversationDetailId: string | null,
        userPayload: AppContext['userPayload'],
        providers: AppContext['providers'],
    ): TaskGraphSubmitContext {
        const user = UserCache.Users.find((u) => u.Email?.trim().toLowerCase() === userPayload.email?.trim().toLowerCase());
        if (!user) throw new Error(`Could not resolve the calling user (${userPayload.email}).`);
        return {
            EnvironmentID: environmentId,
            ConversationDetailID: conversationDetailId,
            ContextUser: user,
            Provider: providers[0].provider,
        };
    }
}
