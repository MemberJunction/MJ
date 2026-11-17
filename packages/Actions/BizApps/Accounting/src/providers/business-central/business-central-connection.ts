/**
 * Connection settings for Business Central connections created by MJ's Integrations connector
 * (`@memberjunction/connector-business-central`).
 *
 * The connector keeps its settings in two places: the CompanyIntegration's `Configuration` JSON
 * and the `Values` JSON of the MJ Credential that `CompanyIntegration.CredentialID` points at. It
 * merges them as `{ ...configuration, ...credentialValues }` and falls back to a few legacy
 * CompanyIntegration columns. This module reproduces that resolution so the accounting actions
 * reach the same tenant, environment and company the connector syncs from.
 */
import { OAuth2TokenManager } from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** Default Microsoft Entra ID authority used for the client-credentials token. */
export const BC_DEFAULT_AUTHORITY_HOST = 'https://login.microsoftonline.com';

/**
 * Entra ID authority hosts a connection may request a token from (#4928). The client secret is sent
 * to this host, so it is never taken from a value outside this list: public cloud, US Government,
 * and the two China (21Vianet) hosts.
 */
export const BC_ALLOWED_AUTHORITY_HOSTS: ReadonlyArray<string> = [
    'login.microsoftonline.com',
    'login.microsoftonline.us',
    'login.chinacloudapi.cn',
    'login.partner.microsoftonline.cn',
];

/** Default OAuth2 scope for the Business Central API. */
export const BC_DEFAULT_SCOPE = 'https://api.businesscentral.dynamics.com/.default';

/** Keys the connector reads each setting from, in priority order. */
export const BC_CONNECTOR_CONFIG_KEYS = {
    ClientId: ['ClientId', 'clientId', 'ClientID', 'client_id', 'azureClientId'],
    ClientSecret: ['ClientSecret', 'clientSecret', 'client_secret', 'azureClientSecret'],
    TenantId: ['TenantId', 'tenantId', 'TenantID', 'tenant_id', 'AzureTenantId', 'azureTenantId'],
    CompanyId: ['CompanyId', 'companyId', 'CompanyID', 'company_id', 'BusinessCentralCompanyId'],
    Environment: ['Environment', 'environment', 'EnvironmentName', 'environmentName'],
    AuthorityHost: ['AuthorityHost'],
    Scope: ['Scope'],
} as const;

/** A JSON object whose values have not been checked yet. */
export type JSONObject = Record<string, unknown>;

/** The CompanyIntegration columns connector-style resolution reads. */
export type BusinessCentralConnectionColumns = Pick<
    MJCompanyIntegrationEntity,
    'ID' | 'ClientID' | 'ClientSecret' | 'APIKey' | 'ExternalSystemID'
>;

/** Fully resolved settings for a connector-style Business Central connection. */
export interface BusinessCentralConnectorConfig {
    /** Entra ID application (client) ID. */
    ClientId: string;
    /** Entra ID client secret. */
    ClientSecret: string;
    /** Entra ID tenant (GUID or domain). */
    TenantId: string;
    /** Business Central company ID (GUID). */
    CompanyId: string;
    /** Business Central environment name, e.g. `production` or `AIDP_Next_UAT`. */
    Environment: string;
    /** Token authority host, without a trailing slash. */
    AuthorityHost: string;
    /** OAuth2 scope requested for the token. */
    Scope: string;
}

/**
 * Runtime check that a parsed JSON value is a plain object.
 */
export function IsJSONObject(value: unknown): value is JSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a JSON string that must hold an object.
 *
 * @param text - The JSON text; `null`, `undefined` or blank yields an empty object.
 * @param what - Describes the source, for the error message.
 * @throws Error when the text is not valid JSON or is not a JSON object.
 */
export function ParseJSONObject(text: string | null | undefined, what: string): JSONObject {
    if (!text || !text.trim()) {
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // The parser's message can quote the text around the bad token, and this text can hold a
        // secret (Credential Values, or a Configuration carrying ClientSecret), so it is not repeated.
        throw new Error(`${what} is not valid JSON.`);
    }
    if (!IsJSONObject(parsed)) {
        throw new Error(`${what} must be a JSON object.`);
    }
    return parsed;
}

/**
 * The first key in `keys` whose value in `source` is a non-empty string, trimmed.
 */
export function PickConfigString(source: JSONObject, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

/**
 * True when a CompanyIntegration's `Configuration` carries a tenant or environment setting, which
 * marks it as a connector-style connection even without a `CredentialID`.
 */
export function ConfigurationHasConnectorSettings(configuration: JSONObject): boolean {
    return PickConfigString(configuration, BC_CONNECTOR_CONFIG_KEYS.TenantId) !== undefined
        || PickConfigString(configuration, BC_CONNECTOR_CONFIG_KEYS.Environment) !== undefined;
}

function nonEmpty(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * Resolves a connector-style Business Central connection: `merged = { ...configuration,
 * ...credentialValues }`, each setting read from its keys in order, then the CompanyIntegration
 * column fallbacks (`ClientID`, `ClientSecret`, `APIKey` for the tenant). The environment has no
 * fallback and no default.
 *
 * Two settings are deliberately NOT read from the merged values:
 * - The BC company comes only from the connection's `ExternalSystemID` (#5824). A Credential is often
 *   shared by several connections, so a company stored on it would send every one of them to the
 *   same company. A `CompanyId` found in Credential or Configuration is logged when it differs and
 *   otherwise ignored.
 * - `AuthorityHost` comes only from the Credential, and only from {@link BC_ALLOWED_AUTHORITY_HOSTS}
 *   (#4928): the client secret is posted to it, so whoever can edit a connection's Configuration must
 *   not be able to redirect it.
 *
 * @param integration - The CompanyIntegration, for the column fallbacks and error messages.
 * @param configuration - The parsed `CompanyIntegration.Configuration`.
 * @param credentialValues - The parsed `Values` of the connection's MJ Credential (empty when none).
 * @throws Error naming the missing setting and the keys it may be stored under.
 */
export function ResolveBusinessCentralConnectorConfig(
    integration: BusinessCentralConnectionColumns,
    configuration: JSONObject,
    credentialValues: JSONObject
): BusinessCentralConnectorConfig {
    const merged: JSONObject = { ...configuration, ...credentialValues };
    const keys = BC_CONNECTOR_CONFIG_KEYS;
    const missing = (setting: string, settingKeys: readonly string[], column?: string): Error =>
        new Error(
            `Business Central ${setting} is not configured for CompanyIntegration ${integration.ID}. ` +
            `Set ${settingKeys.join(' / ')} in the connection's Credential or Configuration` +
            (column ? `, or the ${column} column.` : '.')
        );

    const clientId = PickConfigString(merged, keys.ClientId) ?? nonEmpty(integration.ClientID);
    if (!clientId) {
        throw missing('client ID', keys.ClientId, 'ClientID');
    }
    const clientSecret = PickConfigString(merged, keys.ClientSecret) ?? nonEmpty(integration.ClientSecret);
    if (!clientSecret) {
        throw missing('client secret', keys.ClientSecret, 'ClientSecret');
    }
    const tenantId = PickConfigString(merged, keys.TenantId) ?? nonEmpty(integration.APIKey);
    if (!tenantId) {
        throw missing('tenant ID', keys.TenantId, 'APIKey');
    }
    const companyId = nonEmpty(integration.ExternalSystemID);
    if (!companyId) {
        throw new Error(
            `CompanyIntegration ${integration.ID} has no Business Central company. ` +
            `Set the connection's ExternalSystemID to the BC company ID.`
        );
    }
    const storedCompanyId = PickConfigString(merged, keys.CompanyId);
    if (storedCompanyId && storedCompanyId.toLowerCase() !== companyId.toLowerCase()) {
        console.warn(
            `Business Central: CompanyIntegration ${integration.ID} carries CompanyId '${storedCompanyId}' in its ` +
            `Credential or Configuration; it is ignored. The connection posts to its ExternalSystemID '${companyId}'.`
        );
    }
    const environment = PickConfigString(merged, keys.Environment);
    if (!environment) {
        throw missing('environment', keys.Environment);
    }

    return {
        ClientId: clientId,
        ClientSecret: clientSecret,
        TenantId: tenantId,
        CompanyId: companyId,
        Environment: environment,
        AuthorityHost: ResolveBusinessCentralAuthorityHost(integration.ID, credentialValues),
        Scope: PickConfigString(merged, keys.Scope) ?? BC_DEFAULT_SCOPE,
    };
}

/**
 * The token authority for a connection: the Credential's `AuthorityHost` when set, else the public
 * cloud default. The host must be one of {@link BC_ALLOWED_AUTHORITY_HOSTS} over https.
 *
 * @throws Error when the Credential names a host outside the allow list.
 */
export function ResolveBusinessCentralAuthorityHost(companyIntegrationId: string, credentialValues: JSONObject): string {
    const raw = PickConfigString(credentialValues, BC_CONNECTOR_CONFIG_KEYS.AuthorityHost);
    if (!raw) {
        return BC_DEFAULT_AUTHORITY_HOST;
    }
    const trimmed = raw.replace(/\/+$/, '');
    let host: string | null = null;
    try {
        const url = new URL(trimmed);
        host = url.protocol === 'https:' && (url.pathname === '' || url.pathname === '/') ? url.hostname.toLowerCase() : null;
    } catch {
        host = null;
    }
    if (!host || !BC_ALLOWED_AUTHORITY_HOSTS.includes(host)) {
        throw new Error(
            `Business Central AuthorityHost '${raw}' on the Credential of CompanyIntegration ${companyIntegrationId} ` +
            `is not an allowed Microsoft Entra ID host (${BC_ALLOWED_AUTHORITY_HOSTS.join(', ')}).`
        );
    }
    return `https://${host}`;
}

/** The client-credentials token endpoint for a resolved connection. */
export function BusinessCentralTokenURL(config: Pick<BusinessCentralConnectorConfig, 'AuthorityHost' | 'TenantId'>): string {
    return `${config.AuthorityHost}/${encodeURIComponent(config.TenantId)}/oauth2/v2.0/token`;
}

interface CachedTokenManager {
    /** Token URL, client and scope the manager was minting for. */
    Fingerprint: string;
    Manager: OAuth2TokenManager;
}

/**
 * One token manager per CompanyIntegration. An `OAuth2TokenManager` caches a single token, so
 * sharing one across connections would hand one tenant's token to another. A manager is replaced
 * when the connection's token URL, client or scope changes.
 */
const tokenManagers = new Map<string, CachedTokenManager>();

/**
 * The token manager for a CompanyIntegration, created (or replaced) as needed.
 */
export function GetBusinessCentralTokenManager(
    companyIntegrationId: string,
    config: BusinessCentralConnectorConfig
): OAuth2TokenManager {
    const key = companyIntegrationId.toLowerCase();
    const fingerprint = `${BusinessCentralTokenURL(config)}|${config.ClientId}|${config.Scope}`;
    const cached = tokenManagers.get(key);
    if (cached && cached.Fingerprint === fingerprint) {
        return cached.Manager;
    }
    const manager = new OAuth2TokenManager();
    tokenManagers.set(key, { Fingerprint: fingerprint, Manager: manager });
    return manager;
}

/** Drops every cached token manager. For tests, and for callers that rotate credentials. */
export function ClearBusinessCentralTokenManagers(): void {
    tokenManagers.clear();
}
