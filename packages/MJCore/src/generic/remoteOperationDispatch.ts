/**
 * @fileoverview In-process dispatch for Remote Operations — resolves a registered
 * {@link BaseRemotableOperation} by key and runs it on the server. Server providers
 * (`DatabaseProviderBase` and its subclasses) delegate their `InternalRouteOperation` here; the
 * client provider marshals over GraphQL instead.
 * @module @memberjunction/core
 */

import { MJGlobal } from "@memberjunction/global";
import { BaseRemotableOperation, RemoteOpServerContext } from "./baseRemotableOperation";
import { IMetadataProvider, RemoteOpInvokeOptions, RemoteOpResult } from "./interfaces";
import { UserInfo } from "./securityInfo";

/**
 * Resolves a Remote Operation by key from the ClassFactory and executes it in-process via
 * {@link BaseRemotableOperation.ExecuteServer}. Returns a structured failure (never throws) when the
 * operation is unknown or no acting user is available.
 *
 * @param operationKey - The stable registry key of the operation (e.g. `RecordProcess.GetRunStatus`).
 * @param input - The operation's typed input payload.
 * @param options - Invocation options (the acting `user` and optional `onProgress`).
 * @param provider - The provider to hand to the operation for data access.
 * @param fallbackUser - User to use when `options.user` is absent (typically the provider's `CurrentUser`).
 * @returns The operation result.
 */
export async function dispatchRemoteOperationInProcess<TInput = unknown, TOutput = unknown>(
    operationKey: string,
    input: TInput,
    options: RemoteOpInvokeOptions,
    provider: IMetadataProvider,
    fallbackUser?: UserInfo,
): Promise<RemoteOpResult<TOutput>> {
    // Check for an explicit registration first — ClassFactory.CreateInstance otherwise falls back to
    // the (abstract) base class, which would mis-report an unknown key as an execution error.
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, operationKey);
    const op = registration
        ? MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation<TInput, TOutput>>(BaseRemotableOperation, operationKey)
        : null;
    if (!op) {
        return {
            Success: false,
            ResultCode: 'UNKNOWN_OPERATION',
            ErrorMessage: `Remote operation '${operationKey}' is not registered`,
        };
    }

    const user = options.user ?? fallbackUser;
    if (!user) {
        return {
            Success: false,
            ResultCode: 'NO_USER',
            ErrorMessage: `No acting user available for operation '${operationKey}'`,
        };
    }

    const context: RemoteOpServerContext = {
        provider,
        user,
        emitProgress: (progress) => options.onProgress?.(progress),
        handle: undefined,
    };
    return op.ExecuteServer(input, context);
}
