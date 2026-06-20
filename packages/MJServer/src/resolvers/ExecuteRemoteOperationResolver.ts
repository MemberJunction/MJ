import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Resolver } from 'type-graphql';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation, RemoteOpInvokeMode } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext } from '../types.js';
import { GetReadWriteProvider } from '../util.js';

/** Input for the generic Remote Operation transport mutation. */
@InputType()
export class ExecuteRemoteOperationInput {
    @Field()
    operationKey: string;

    @Field()
    inputJSON: string;

    @Field()
    invokeMode: string;
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

            let parsedInput: unknown;
            try {
                parsedInput = input.inputJSON ? JSON.parse(input.inputJSON) : {};
            } catch (e) {
                return fail('INVALID_INPUT_JSON', `Invalid input JSON: ${e instanceof Error ? e.message : String(e)}`);
            }

            // Route through the per-request provider (server in-process path; runs the op's Authorize + InternalExecute).
            const provider = GetReadWriteProvider(ctx.providers);
            const result = await provider.RouteOperation(key, parsedInput, { user, mode: input.invokeMode as RemoteOpInvokeMode });

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
}

/** Builds a failed result. */
function fail(resultCode: string, errorMessage: string): ExecuteRemoteOperationResultType {
    return { success: false, resultCode, errorMessage };
}
