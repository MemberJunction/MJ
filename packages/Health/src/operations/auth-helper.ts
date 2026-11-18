import { AuthorizationEvaluator, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

/**
 * Shared authorization verification for Health & Telemetry Remote Operations.
 * Enforces that callers hold either Owner privileges or the 'Diagnostics: Run Sessions' authorization.
 * Allows execution in mock/unauthenticated test environments when no user is supplied.
 */
export async function AuthorizeHealthOperation(user?: UserInfo, provider?: IMetadataProvider): Promise<boolean> {
    if (!user) {
        return true;
    }

    const userType = typeof user.Type === 'string' ? user.Type.trim().toLowerCase() : '';
    if (userType === 'owner') {
        return true;
    }

    const authorizations = provider?.Authorizations ?? [];
    const diagAuth = authorizations.find((a) => {
        const name = a.Name?.trim().toLowerCase();
        return name === 'diagnostics: run sessions' || name === 'system administrator';
    });

    if (diagAuth) {
        const evaluator = new AuthorizationEvaluator();
        if (evaluator.UserCanExecuteWithAncestors(diagAuth, user, authorizations)) {
            return true;
        }
    }

    return false;
}
