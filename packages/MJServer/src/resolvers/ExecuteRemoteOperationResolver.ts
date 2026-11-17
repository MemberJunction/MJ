import { Arg, Ctx, Field, ID, InputType, Mutation, ObjectType, PubSub, PubSubEngine, Resolver, Root, Subscription } from 'type-graphql';
import { IsValidUUID, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseRemotableOperation, RemoteOpInvokeMode, RemoteOpProgress } from '@memberjunction/core';
import { ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY, RemoteOperationEngineBase } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';
import { LoadSynthesizeArtifactFromSourcesOperation } from '../operations/SynthesizeArtifactFromSourcesServerOperation.js';
import { LoadArtifactComplianceAuditOperation } from '../operations/ArtifactComplianceAuditHelper.js';
import { LoadArtifactEvaluateAiFormulaOperation } from '../operations/ArtifactEvaluateAiFormulaServerOperation.js';
import { LoadArtifactGuestShareOperations } from '../operations/ArtifactGuestShareServerOperations.js';

LoadSynthesizeArtifactFromSourcesOperation();
LoadArtifactComplianceAuditOperation();
LoadArtifactEvaluateAiFormulaOperation();
LoadArtifactGuestShareOperations();

/** PubSub topic carrying RemoteOpProgress envelopes for attached over-the-wire callers (RO-3). */
const REMOTE_OP_PROGRESS_TOPIC = 'RemoteOperationProgress';

/** Input for the generic Remote Operation transport mutation. */
@InputType()
export class ExecuteRemoteOperationInput {
    @Field(() => String)
    operationKey: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    inputJSON: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String)
    invokeMode: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    /**
     * Optional client-generated channel id. When set (attached mode over the wire), the server publishes every
     * `RemoteOpProgress` the operation emits to the `RemoteOperationProgress` subscription filtered by this id,
     * so the caller's `onProgress` fires live while the operation runs. Omitted for sync / no-progress calls.
     */
    @Field(() => String, { nullable: true })
    progressChannelId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    /**
     * Optional structural contract fingerprint emitted by CodeGen (or supplied by the caller).
     * When provided, the server rejects requests whose fingerprint diverges from the server's
     * active operation contract with `ResultCode = 'CONTRACT_MISMATCH'`.
     */
    @Field(() => String, { nullable: true })
    contractFingerprint?: string;  // case-violation-ok-legacy-back-compat: matches camelCase GraphQL input field convention on ExecuteRemoteOperationInput
}

/** A single streamed progress envelope delivered over the `RemoteOperationProgress` subscription. */
@ObjectType()
export class RemoteOperationProgressNotification {
    @Field(() => String)
    ChannelId: string;

    /** JSON-serialized {@link RemoteOpProgress}. */
    @Field(() => String)
    ProgressJSON: string;
}

interface RemoteOperationProgressTopicPayload extends RemoteOperationProgressNotification {
    OwnerUserId: string;
}

interface ParsedRemoteOpResourceHint {
    ArtifactID?: string;
    artifactId?: string;
    CollectionID?: string;
    collectionId?: string;
    AgentHandle?: string;
    agentHandle?: string;
}

function extractRemoteOpResourceId(parsedInput: object | string | number | boolean | null, fallbackKey: string): string {
    if (parsedInput && typeof parsedInput === 'object') {
        const hint = parsedInput as ParsedRemoteOpResourceHint;
        const candidate = hint.ArtifactID ?? hint.artifactId ?? hint.CollectionID ?? hint.collectionId;
        if (typeof candidate === 'string' && IsValidUUID(candidate.trim())) {
            return candidate.trim();
        }
    }
    return fallbackKey;
}

/** Result of the generic Remote Operation transport mutation. */
@ObjectType()
export class ExecuteRemoteOperationResultType {
    @Field(() => Boolean)
    success: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    resultCode?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    outputJSON?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    handle?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

    @Field(() => String, { nullable: true })
    errorMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
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
        @Arg('input', () => ExecuteRemoteOperationInput) input: ExecuteRemoteOperationInput,
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

            let parsedInput: object | string | number | boolean | null;
            try {
                parsedInput = input.inputJSON ? (JSON.parse(input.inputJSON) as object | string | number | boolean | null) : {};
            } catch (e) {
                return fail('INVALID_INPUT_JSON', `Invalid input JSON: ${e instanceof Error ? e.message : String(e)}`);
            }

            // (1) System-user gate.
            if (opDecl?.RequiresSystemUser && !ctx.userPayload?.isSystemUser) {
                return fail('FORBIDDEN', `Operation '${key}' may only be invoked by the system user`);
            }
            // (2) Resolve the acting user (works for OAuth/JWT and API-key sessions alike).
            // Operations with DisallowMagicLinkScope=true (e.g. artifact ops) reject Magic Link sessions;
            // visitor-facing Open App operations opt in safely by leaving DisallowMagicLinkScope=false.
            const user = this.GetUserFromPayload(ctx.userPayload);
            if (!user) {
                return fail('NO_USER', 'Not authenticated');
            }
            if (opDecl?.DisallowMagicLinkScope && (user.IsMagicLinkAnonymous || user.MagicLinkScope)) {
                return fail('FORBIDDEN', `Magic Link sessions cannot invoke remote operation '${key}'.`);
            }

            const provider = GetReadWriteProvider(ctx.providers);

            // (3) API-key scope gate — consult operation's GetScopeResourceIds (e.g. collection-expanded sources)
            // when available, never falling back to a synthetic operation-key target when an operation overrides
            // GetScopeResourceIds and returns empty (`S4`).
            if (opDecl?.RequiredScope) {
                const overridesGetScopeIds =
                    opDecl.GetScopeResourceIds !== BaseRemotableOperation.prototype.GetScopeResourceIds;
                const declaredScopeIds = (await opDecl.GetScopeResourceIds(parsedInput, { provider, user }))
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0);
                if (overridesGetScopeIds && declaredScopeIds.length === 0) {
                    return fail(
                        'INVALID_INPUT',
                        `Operation '${key}' requires at least one valid target resource identifier.`,
                    );
                }
                const targets = declaredScopeIds.length > 0
                    ? declaredScopeIds
                    : [extractRemoteOpResourceId(parsedInput, key)];
                for (const targetResourceId of targets) {
                    await this.CheckAPIKeyScopeAuthorization(opDecl.RequiredScope, targetResourceId, ctx.userPayload);
                }
            }
            if (key === ARTIFACT_SYNTHESIZE_FROM_SOURCES_KEY && parsedInput && typeof parsedInput === 'object') {
                const hint = parsedInput as ParsedRemoteOpResourceHint;
                const agentHandle = (hint.AgentHandle ?? hint.agentHandle ?? '').trim();
                if (agentHandle) {
                    await this.CheckAPIKeyScopeAuthorization('agent:execute', agentHandle, ctx.userPayload);
                }
            }

            // (4) Metadata gate (defense-in-depth): honor the op's MJ: Remote Operations Status/approval, so a
            // registered-but-disabled (or unapproved AI) op is rejected even though its class is still in code.
            await RemoteOperationEngineBase.Instance.Config(false, user, provider);
            const invokability = RemoteOperationEngineBase.Instance.IsInvokable(key);
            if (!invokability.Invokable) {
                return fail(invokability.ResultCode ?? 'OPERATION_UNAVAILABLE', invokability.Reason ?? `Operation '${key}' is unavailable`);
            }

            // (5) Contract fingerprint gate: when the client sends a contractFingerprint, verify it against
            // the active server operation's ContractFingerprint (or metadata-derived fingerprint) so stale
            // client bundles fail loudly with CONTRACT_MISMATCH rather than mis-deserializing.
            const clientFingerprint = input.contractFingerprint?.trim();
            if (clientFingerprint) {
                const expectedFingerprint =
                    opDecl?.ContractFingerprint ?? RemoteOperationEngineBase.Instance.GetContractFingerprint(key);
                if (expectedFingerprint && clientFingerprint !== expectedFingerprint) {
                    return fail(
                        'CONTRACT_MISMATCH',
                        `Contract fingerprint mismatch for operation '${key}' (client='${clientFingerprint}', server='${expectedFingerprint}')`,
                    );
                }
            }

            // Attached over-the-wire (RO-3): forward each emitted RemoteOpProgress to the progress channel so a
            // remote caller's onProgress fires live. No-op when the caller didn't open a channel (sync calls).
            const onProgress = input.progressChannelId
                ? (p: RemoteOpProgress) => {
                      const envelope: RemoteOperationProgressTopicPayload = {
                          ChannelId: input.progressChannelId!,
                          OwnerUserId: user.ID,
                          ProgressJSON: JSON.stringify(p),
                      };
                      void pubSub.publish(REMOTE_OP_PROGRESS_TOPIC, envelope);
                  }
                : undefined;

            // Route through the per-request provider (server in-process path; runs the op's Authorize + InternalExecute).
            const result = await provider.RouteOperation(key, parsedInput, {
                user,
                mode: input.invokeMode as RemoteOpInvokeMode,
                onProgress,
                contractFingerprint: clientFingerprint,
                requestOrigin: ctx.RequestOrigin,
                clientIp: ctx.ClientIp,
                sessionId: ctx.userPayload?.sessionId,
                apiKeyHash: ctx.userPayload?.apiKeyHash,
            });

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
        filter: ({
            payload,
            args,
            context,
        }: {
            payload: RemoteOperationProgressTopicPayload;
            args: { channelId: string };
            context?: AppContext;
        }) => {
            if (payload.ChannelId !== args.channelId) {
                return false;
            }
            const subscriberUserId = context?.userPayload?.userRecord?.ID;
            return Boolean(subscriberUserId && payload.OwnerUserId && UUIDsEqual(payload.OwnerUserId, subscriberUserId));
        },
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
