import { Arg, Ctx, Field, ID, InputType, Mutation, ObjectType, PubSub, PubSubEngine, Resolver, Root, Subscription } from 'type-graphql';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation, RemoteOpInvokeMode, RemoteOpProgress } from '@memberjunction/core';
import { RemoteOperationEngineBase } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';

/** PubSub topic carrying RemoteOpProgress envelopes for attached over-the-wire callers (RO-3). */
const REMOTE_OP_PROGRESS_TOPIC = 'RemoteOperationProgress';

/** Input for the generic Remote Operation transport mutation. */
@InputType()
export class ExecuteRemoteOperationInput {
    @Field()
    operationKey: string;

    @Field()
    inputJSON: string;

    @Field()
    invokeMode: string;

    /**
     * Optional client-generated channel id. When set (attached mode over the wire), the server publishes every
     * `RemoteOpProgress` the operation emits to the `RemoteOperationProgress` subscription filtered by this id,
     * so the caller's `onProgress` fires live while the operation runs. Omitted for sync / no-progress calls.
     */
    @Field(() => String, { nullable: true })
    progressChannelId?: string;
}

/** A single streamed progress envelope delivered over the `RemoteOperationProgress` subscription. */
@ObjectType()
export class RemoteOperationProgressNotification {
    @Field()
    ChannelId: string;

    /** JSON-serialized {@link RemoteOpProgress}. */
    @Field()
    ProgressJSON: string;
}

/** Result of the generic Remote Operation transport mutation. */
@ObjectType()
export class ExecuteRemoteOperationResultType {
    @Field(() => Boolean)
    success: boolean;

    @Field(() => String, { nullable: true })
    resultCode?: string;

    @Field(() => String, { nullable: true })
    outputJSON?: string;

    @Field(() => String, { nullable: true })
    handle?: string;

    @Field(() => String, { nullable: true })
    errorMessage?: string;
}

/**
 * The single generic server entry point for Remote Operations. Resolves the operation by key,
 * applies the framework authorization gates (API-key scope, system-user, then the operation's own
 * `Authorize`), and routes the operation through the per-request provider — which executes it
 * in-process. Only registered, active operations are reachable, so the public `RouteOperation`
 * power-tool is safe by construction.
 */
@Resolver()
export class ExecuteRemoteOperationResolver extends ResolverBase {
    @Mutation(() => ExecuteRemoteOperationResultType)
    async ExecuteRemoteOperation(
        @Arg('input') input: ExecuteRemoteOperationInput,
        @Ctx() ctx: AppContext,
        @PubSub() pubSub: PubSubEngine,
    ): Promise<ExecuteRemoteOperationResultType> {
        try {
            const key = input.operationKey?.trim();
            if (!key) {
                return fail('INVALID_OPERATION_KEY', 'operationKey is required');
            }

            // Resolve the operation's declaration so we can apply its scope / system-user gates.
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, key);
            if (!registration) {
                return fail('UNKNOWN_OPERATION', `Remote operation '${key}' is not registered`);
            }
            const opDecl = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(BaseRemotableOperation, key);

            // (1) API-key scope gate — a no-op for interactive OAuth/JWT users.
            if (opDecl?.RequiredScope) {
                await this.CheckAPIKeyScopeAuthorization(opDecl.RequiredScope, key, ctx.userPayload);
            }
            // (2) System-user gate.
            if (opDecl?.RequiresSystemUser && !ctx.userPayload.isSystemUser) {
                return fail('FORBIDDEN', `Operation '${key}' may only be invoked by the system user`);
            }
            // (3) Resolve the acting user (works for OAuth/JWT and API-key sessions alike).
            const user = this.GetUserFromPayload(ctx.userPayload);
            if (!user) {
                return fail('NO_USER', 'Not authenticated');
            }

            // (4) Metadata gate (defense-in-depth): honor the op's MJ: Remote Operations Status/approval, so a
            // registered-but-disabled (or unapproved AI) op is rejected even though its class is still in code.
            const provider = GetReadWriteProvider(ctx.providers);
            await RemoteOperationEngineBase.Instance.Config(false, user, provider);
            const invokability = RemoteOperationEngineBase.Instance.IsInvokable(key);
            if (!invokability.Invokable) {
                return fail(invokability.ResultCode ?? 'OPERATION_UNAVAILABLE', invokability.Reason ?? `Operation '${key}' is unavailable`);
            }

            let parsedInput: unknown;
            try {
                parsedInput = input.inputJSON ? JSON.parse(input.inputJSON) : {};
            } catch (e) {
                return fail('INVALID_INPUT_JSON', `Invalid input JSON: ${e instanceof Error ? e.message : String(e)}`);
            }

            // Attached over-the-wire (RO-3): forward each emitted RemoteOpProgress to the progress channel so a
            // remote caller's onProgress fires live. No-op when the caller didn't open a channel (sync calls).
            const onProgress = input.progressChannelId
                ? (p: RemoteOpProgress) => {
                      void pubSub.publish(REMOTE_OP_PROGRESS_TOPIC, { ChannelId: input.progressChannelId!, ProgressJSON: JSON.stringify(p) });
                  }
                : undefined;

            // Route through the per-request provider (server in-process path; runs the op's Authorize + InternalExecute).
            const result = await provider.RouteOperation(key, parsedInput, { user, mode: input.invokeMode as RemoteOpInvokeMode, onProgress });

            return {
                success: result.Success,
                resultCode: result.ResultCode,
                outputJSON: result.Output !== undefined ? JSON.stringify(result.Output) : undefined,
                handle: result.Handle,
                errorMessage: result.ErrorMessage,
            };
        } catch (e) {
            return fail('ERROR', e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Subscription the client opens (with a self-generated `channelId`) immediately before calling
     * `ExecuteRemoteOperation` with the same id in `progressChannelId`. The server publishes one event per
     * `RemoteOpProgress` the operation emits; filtered by `channelId` so concurrent calls never interleave.
     */
    @Subscription(() => RemoteOperationProgressNotification, {
        topics: REMOTE_OP_PROGRESS_TOPIC,
        filter: ({ payload, args }: { payload: RemoteOperationProgressNotification; args: { channelId: string } }) => payload.ChannelId === args.channelId,
    })
    RemoteOperationProgress(
        @Root() notification: RemoteOperationProgressNotification,
        @Arg('channelId', () => ID) _channelId: string,
    ): RemoteOperationProgressNotification {
        return notification;
    }
}

/** Builds a failed result. */
function fail(resultCode: string, errorMessage: string): ExecuteRemoteOperationResultType {
    return { success: false, resultCode, errorMessage };
}
