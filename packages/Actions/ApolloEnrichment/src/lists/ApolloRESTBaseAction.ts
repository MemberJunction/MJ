/**
 * Shared plumbing for the Apollo list and search actions.
 *
 * Each of these actions does the same three things before it does anything
 * interesting: resolve a key, build a client, and turn whatever went wrong into a
 * result object rather than an exception. That lives here so seven actions cannot
 * drift into seven different answers for "no credential configured".
 *
 * {@link CreateClient} is a protected seam purely so tests can substitute a fake
 * client. Nothing in this package may reach api.apollo.io from a test: a live call
 * would spend real credits, and the move surface would mutate a real Apollo
 * account's list membership with no undo.
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { IApolloRESTClient } from '../generic/apollo-lists.types.js';
import { ApolloRESTClient } from './ApolloRESTClient.js';
import { NO_APOLLO_KEY_MESSAGE, resolveApolloAPIKey, type ResolvedApolloKey } from './credentials.js';
import { getParam } from './params.js';

/** A resolved client plus how its key was found. */
export interface ResolvedApolloClient {
    client: IApolloRESTClient;
    key: ResolvedApolloKey;
}

export abstract class ApolloRESTBaseAction extends BaseAction {
    /**
     * Build the client. Overridden in tests; the only place `ApolloRESTClient` is
     * constructed in this surface.
     */
    protected CreateClient(apiKey: string): IApolloRESTClient {
        return new ApolloRESTClient(apiKey);
    }

    /**
     * Resolve the key and construct the client, or return the failure result to
     * hand straight back to the caller.
     *
     * `CompanyID` is optional here, unlike in the CDP actions this ports from,
     * because a single-tenant instance with `APOLLO_API_KEY` set has no company
     * to name. Supplying it switches on the per-company credential path.
     */
    protected async ResolveClient(
        params: RunActionParams,
    ): Promise<{ resolved: ResolvedApolloClient; error: null } | { resolved: null; error: ActionResultSimple }> {
        const companyID = getParam(params, 'CompanyID');
        let key: ResolvedApolloKey | null;
        try {
            key = await resolveApolloAPIKey(companyID, params.ContextUser);
        } catch (error) {
            // A credential that exists but is malformed — say so, rather than
            // falling back to a different workspace's key from the environment.
            return {
                resolved: null,
                error: {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: 'CONFIGURATION_ERROR',
                },
            };
        }
        if (!key) {
            return { resolved: null, error: { Success: false, Message: NO_APOLLO_KEY_MESSAGE, ResultCode: 'CREDENTIALS_NOT_FOUND' } };
        }
        return { resolved: { client: this.CreateClient(key.apiKey), key }, error: null };
    }

    /** A uniform missing-input failure. */
    protected MissingField(name: string, detail?: string): ActionResultSimple {
        return {
            Success: false,
            Message: `Missing required field: ${name}${detail ? ` (${detail})` : ''}`,
            ResultCode: 'MISSING_REQUIRED_FIELDS',
        };
    }

    /** A uniform validation failure. */
    protected Invalid(message: string): ActionResultSimple {
        return { Success: false, Message: message, ResultCode: 'VALIDATION_ERROR' };
    }
}
