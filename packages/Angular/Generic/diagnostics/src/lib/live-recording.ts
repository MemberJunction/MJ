import { IMetadataProvider, RemoteOpResult } from '@memberjunction/core';
import { DiagnosticsStartSessionInput } from '@memberjunction/core-entities';
import { DiagnosticNetworkEntry } from '@memberjunction/diagnostics';
import { GraphQLDataProvider, NetworkDiagnosticObservation } from '@memberjunction/graphql-dataprovider';

/** Request header that names the server diagnostic session a request belongs to. */
export const DIAGNOSTIC_SESSION_HEADER = 'x-mj-diagnostic-session';

/** Response header the server sets when a session asks this browser to upload its capture. */
export const DIAGNOSTIC_TRIGGER_HEADER = 'x-mj-diagnostic-trigger';

/** Authorization that lets a user start server diagnostic sessions. */
export const RUN_DIAGNOSTIC_SESSIONS_AUTHORIZATION = 'Diagnostics: Run Sessions';

/**
 * True when the provider's current user may start server sessions: an Owner, or a holder of
 * `Diagnostics: Run Sessions`. The server checks the same rule again.
 */
export function UserCanRunDiagnosticSessions(provider: IMetadataProvider): boolean {
    const user = provider.CurrentUser;
    if (!user) return false;
    if (user.Type?.trim().toLowerCase() === 'owner') return true;
    const target = RUN_DIAGNOSTIC_SESSIONS_AUTHORIZATION.toLowerCase();
    const auth = (provider.Authorizations ?? []).find((a) => a.Name?.trim().toLowerCase() === target);
    return auth ? auth.UserCanExecute(user) : false;
}

/** The browser session ID the provider sends as `x-session-id`, when it is a GraphQL provider. */
export function BrowserSessionIdOf(provider: IMetadataProvider): string | undefined {
    return provider instanceof GraphQLDataProvider ? provider.sessionId || undefined : undefined;
}

/** Scope for a session that captures only the current user in this browser session. */
export function SelfSessionScope(provider: IMetadataProvider): DiagnosticsStartSessionInput['Scope'] {
    const userId = provider.CurrentUser?.ID;
    const browserSessionId = BrowserSessionIdOf(provider);
    const userIds = userId ? [userId] : [];
    return browserSessionId ? { userIds, browserSessionId } : { userIds };
}

/** Sets or removes the `x-mj-diagnostic-session` header on a GraphQL provider's requests. */
export function SetDiagnosticSessionHeader(provider: IMetadataProvider, sessionId: string | null): void {
    if (!(provider instanceof GraphQLDataProvider)) return;
    if (sessionId) {
        provider.SetDynamicHeader(DIAGNOSTIC_SESSION_HEADER, sessionId);
    } else {
        provider.RemoveDynamicHeader(DIAGNOSTIC_SESSION_HEADER);
    }
}

/** Maps a GraphQL network observation to a waterfall entry. */
export function ToNetworkEntry(observation: NetworkDiagnosticObservation): DiagnosticNetworkEntry {
    return {
        traceId: observation.traceId,
        spanId: observation.spanId,
        operationName: observation.operationName,
        operationKind: observation.operationKind,
        startTimeUnixMs: observation.timestamp - observation.durationMs,
        durationMs: observation.durationMs,
        status: observation.succeeded ? 'ok' : 'error',
        retryCount: observation.retryCount,
        requestBytes: observation.requestBytes,
        responseBytes: observation.responseBytes,
        errorMessage: observation.errorMessage,
        variableKeys: observation.variableKeys,
    };
}

/** Shown when the server refuses an upload that has no session because self-service recording is off. */
export const SELF_SERVICE_OFF_MESSAGE =
    'Self-service recording is turned off on this server. Ask an administrator to start a diagnostic session, or download the snapshot instead.';

/** The message for a failed `UploadClientCapture`; a refused upload without a session gets {@link SELF_SERVICE_OFF_MESSAGE}. */
export function UploadFailureMessage(result: RemoteOpResult<unknown>, sessionId: string | undefined): string {
    if (!sessionId && result.ResultCode === 'FORBIDDEN') {
        return SELF_SERVICE_OFF_MESSAGE;
    }
    return result.ErrorMessage ?? 'Failed to upload client diagnostic capture';
}
