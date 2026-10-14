/**
 * API-key resolution for the People Data Labs client, in the same two steps as the Apollo package:
 *
 *   1. A `CompanyID` → that company's active `People Data Labs` `MJ: Company Integrations` row → its
 *      `CredentialID` → the `apiKey` inside `MJ: Credentials.Values`.
 *   2. `PDL_API_KEY` from the environment.
 *
 * `CompanyIntegration.APIKey` is never read: it is not decrypt-on-read, so a synced value comes back
 * as `$ENC$…` ciphertext and a 401 that looks like a wrong key. A credential that exists but is
 * malformed throws rather than falling through to the environment: a present-but-broken credential is
 * a configuration error, not a reason to use a different company's key.
 */
import { LogError, RunView, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntityType } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { PDLAPIKey } from './config.js';

/** The integration name looked up on the CompanyIntegration row. */
export const PDL_INTEGRATION_NAME = 'People Data Labs';

/** The standard failure text when neither resolution path yields a key. */
export const NO_PDL_KEY_MESSAGE =
    `No People Data Labs API key could be resolved. Either link an active '${PDL_INTEGRATION_NAME}' ` +
    `MJ: Company Integrations row for the supplied CompanyID to an MJ: Credentials record whose Values ` +
    `contain { "apiKey": "…" }, or set the PDL_API_KEY environment variable.`;

/** Where a resolved key came from, so an action can say so in its output. */
export interface ResolvedPDLKey {
    apiKey: string;
    source: 'credential' | 'environment';
    /** The CompanyIntegration row's id when resolved through a company; null otherwise. */
    companyIntegrationID: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pull the key out of a credential's `Values` JSON. Several key names are accepted because records are authored by hand. */
export function ExtractPDLKey(values: string | null | undefined, credentialName: string): string | null {
    if (!values || values.trim().length === 0) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(values);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`People Data Labs credential '${credentialName}' has a Values payload that is not valid JSON: ${msg}`);
    }
    if (!isRecord(parsed)) {
        throw new Error(`People Data Labs credential '${credentialName}' Values must be a JSON object containing an apiKey.`);
    }
    for (const key of ['apiKey', 'APIKey', 'api_key', 'ApiKey']) {
        const candidate = parsed[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
    }
    return null;
}

/**
 * Resolve the key for this run. Returns null when nothing is configured, so an action can answer
 * `CREDENTIALS_NOT_FOUND`; throws only for a malformed credential (see {@link ExtractPDLKey}).
 */
export async function ResolvePDLAPIKey(companyID: string | null, contextUser: UserInfo | undefined): Promise<ResolvedPDLKey | null> {
    if (companyID) {
        const fromCredential = await resolveFromCompany(companyID, contextUser);
        if (fromCredential) return fromCredential;
    }
    const env = PDLAPIKey.trim();
    if (env.length > 0) return { apiKey: env, source: 'environment', companyIntegrationID: null };
    return null;
}

/** Canonical 8-4-4-4-12 hex form. `CompanyID` is a uniqueidentifier, so anything else is not one. */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function resolveFromCompany(companyID: string, contextUser: UserInfo | undefined): Promise<ResolvedPDLKey | null> {
    // Validate rather than escape: the value goes into an ExtraFilter, and boolean logic such as
    // `x' OR '1'='1` would select another tenant's row. A UUID check admits nothing else.
    if (!UUID_PATTERN.test(companyID)) {
        LogError(`ResolvePDLAPIKey: CompanyID '${companyID}' is not a UUID; refusing to build a filter from it.`);
        return null;
    }
    const row = await loadCompanyIntegration(companyID, contextUser);
    if (!row) return null;
    if (!row.CredentialID) {
        LogError(`ResolvePDLAPIKey: CompanyIntegration ${row.ID} has no CredentialID. The APIKey column is not read; link an MJ: Credentials record instead.`);
        return null;
    }
    const apiKey = await resolveCredentialKey(row.CredentialID, contextUser);
    return apiKey ? { apiKey, source: 'credential', companyIntegrationID: row.ID } : null;
}

async function loadCompanyIntegration(companyID: string, contextUser: UserInfo | undefined): Promise<MJCompanyIntegrationEntityType | null> {
    const result = await new RunView().RunView<MJCompanyIntegrationEntityType>(
        {
            EntityName: 'MJ: Company Integrations',
            // IsActive is nullable; an unset flag must not exclude the row.
            ExtraFilter: `CompanyID = '${companyID}' AND Integration = '${PDL_INTEGRATION_NAME}' AND (IsActive IS NULL OR IsActive = 1)`,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) {
        LogError(`ResolvePDLAPIKey: reading MJ: Company Integrations failed — ${result.ErrorMessage ?? 'unknown error'}`);
        return null;
    }
    return result.Results?.[0] ?? null;
}

/** Through CredentialEngine, which audits the access, stamps LastUsedAt and validates the Values schema. */
async function resolveCredentialKey(credentialID: string, contextUser: UserInfo | undefined): Promise<string | null> {
    await CredentialEngine.Instance.Config(false, contextUser);
    const credential = CredentialEngine.Instance.Credentials.find((c) => c.ID.toLowerCase() === credentialID.toLowerCase());
    if (!credential) {
        LogError(`ResolvePDLAPIKey: MJ: Credentials record ${credentialID} could not be loaded.`);
        return null;
    }
    // The engine filters IsActive on its by-name path only; this resolves by id, so check it here.
    if (credential.IsActive === false) {
        LogError(`ResolvePDLAPIKey: MJ: Credentials record '${credential.Name}' is inactive.`);
        return null;
    }
    let values: Record<string, string> | undefined;
    try {
        const resolved = await CredentialEngine.Instance.GetCredential<Record<string, string>>(credential.Name, { credentialId: credentialID, contextUser, subsystem: 'PeopleDataLabs' });
        values = resolved.values;
    } catch (err) {
        LogError(`ResolvePDLAPIKey: MJ: Credentials record '${credential.Name}' could not be resolved — ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
    const apiKey = ExtractPDLKey(values ? JSON.stringify(values) : null, credential.Name);
    if (!apiKey) LogError(`ResolvePDLAPIKey: MJ: Credentials record '${credential.Name}' contains no apiKey value.`);
    return apiKey;
}
