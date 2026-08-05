/**
 * API-key resolution for the Apollo list and search actions.
 *
 * Two paths, in this order:
 *
 *   1. A `CompanyID` param → that company's active Apollo `MJ: Company Integrations`
 *      row → its `CredentialID` → the `apiKey` inside `MJ: Credentials.Values`.
 *      This is the multi-tenant path: several companies in one instance, each with
 *      its own Apollo workspace and its own key.
 *   2. `APOLLO_API_KEY` from the environment, which is what the enrichment actions
 *      in this package have always used. Single-tenant deployments keep working
 *      without any credential rows.
 *
 * `CompanyIntegration.APIKey` is deliberately NOT read, even though it exists and
 * looks like the obvious place. That column is not a decrypt-on-read field, so a
 * key written through metadata sync comes back as the literal ciphertext string
 * `$ENC$…`. Sending that to Apollo produces a 401 whose message says nothing about
 * encryption, and the failure looks exactly like a wrong key. `MJ: Credentials` is
 * the field that decrypts, so it is the only one used.
 *
 * Every write in this surface needs a MASTER Apollo key. That is not something
 * this code can detect ahead of time — a scoped key authenticates fine and then
 * 403s on the first PATCH — so the client turns that 403 into an explanation, and
 * the message below names the requirement up front.
 */
import { LogError, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntityType, MJCredentialEntity } from '@memberjunction/core-entities';
import { ApolloAPIKey } from '../config.js';

/** The integration name looked up on the CompanyIntegration row. */
export const APOLLO_INTEGRATION_NAME = 'Apollo';

/** The standard failure text when neither resolution path yields a key. */
export const NO_APOLLO_KEY_MESSAGE =
    `No Apollo API key could be resolved. Either link an active '${APOLLO_INTEGRATION_NAME}' ` +
    `MJ: Company Integrations row for the supplied CompanyID to an MJ: Credentials record whose Values ` +
    `contain { "apiKey": "…" }, or set the APOLLO_API_KEY environment variable. ` +
    `List reads and every write require a MASTER Apollo key — scoped keys return 403.`;

/** Where a resolved key came from, so an action can say so in its output. */
export interface ResolvedApolloKey {
    apiKey: string;
    source: 'credential' | 'environment';
    /** The CompanyIntegration row's id when resolved through a company; null otherwise. */
    companyIntegrationID: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pull the Apollo key out of a credential's `Values` JSON.
 *
 * Several key names are accepted because credential records get authored by hand
 * and the casing varies. A `Values` blob that will not parse throws rather than
 * falling through to the environment — a present-but-broken credential is a
 * configuration error worth surfacing, not a reason to silently use a different
 * workspace's key.
 */
export function extractApolloKey(values: string | null | undefined, credentialName: string): string | null {
    if (!values || values.trim().length === 0) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(values);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Apollo credential '${credentialName}' has a Values payload that is not valid JSON: ${msg}`);
    }
    if (!isRecord(parsed)) {
        throw new Error(`Apollo credential '${credentialName}' Values must be a JSON object containing an apiKey.`);
    }
    for (const key of ['apiKey', 'APIKey', 'api_key', 'ApiKey', 'masterApiKey']) {
        const candidate = parsed[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return null;
}

/**
 * Resolve the key for this run. `companyID` is optional: without it, only the
 * environment is consulted.
 *
 * Returns null rather than throwing when nothing is configured, so an action can
 * answer with `CREDENTIALS_NOT_FOUND` instead of a stack trace. A credential that
 * exists but is malformed does throw — see {@link extractApolloKey}.
 */
export async function resolveApolloAPIKey(
    companyID: string | null,
    contextUser: UserInfo | undefined,
): Promise<ResolvedApolloKey | null> {
    if (companyID) {
        const fromCredential = await resolveFromCompany(companyID, contextUser);
        if (fromCredential) return fromCredential;
    }
    const env = ApolloAPIKey.trim();
    if (env.length > 0) {
        return { apiKey: env, source: 'environment', companyIntegrationID: null };
    }
    return null;
}

async function resolveFromCompany(companyID: string, contextUser: UserInfo | undefined): Promise<ResolvedApolloKey | null> {
    const rv = new RunView();
    const result = await rv.RunView<MJCompanyIntegrationEntityType>(
        {
            EntityName: 'MJ: Company Integrations',
            // IsActive is nullable, so an unset flag must not exclude the row —
            // a company with one Apollo integration and a NULL IsActive is the
            // common shape after a hand-authored insert.
            ExtraFilter: `CompanyID = '${companyID}' AND Integration = '${APOLLO_INTEGRATION_NAME}' AND (IsActive IS NULL OR IsActive = 1)`,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) {
        LogError(`resolveApolloAPIKey: reading MJ: Company Integrations failed — ${result.ErrorMessage ?? 'unknown error'}`);
        return null;
    }
    const row = result.Results?.[0];
    if (!row) return null;
    if (!row.CredentialID) {
        LogError(
            `resolveApolloAPIKey: CompanyIntegration ${row.ID} has no CredentialID. ` +
            `The APIKey column is not read — it is not decrypt-on-read, so a synced value comes back as ciphertext. ` +
            `Link an MJ: Credentials record instead.`,
        );
        return null;
    }

    const md = new Metadata();
    const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
    const loaded = await credential.Load(row.CredentialID);
    if (!loaded) {
        LogError(`resolveApolloAPIKey: MJ: Credentials record ${row.CredentialID} could not be loaded.`);
        return null;
    }
    if (credential.IsActive === false) {
        LogError(`resolveApolloAPIKey: MJ: Credentials record '${credential.Name}' is inactive.`);
        return null;
    }
    const apiKey = extractApolloKey(credential.Values, credential.Name);
    if (!apiKey) {
        LogError(`resolveApolloAPIKey: MJ: Credentials record '${credential.Name}' contains no apiKey value.`);
        return null;
    }
    return { apiKey, source: 'credential', companyIntegrationID: row.ID };
}
