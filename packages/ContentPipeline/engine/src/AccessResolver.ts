/**
 * @fileoverview Opening and reusing sessions for the sources a run touches.
 *
 * Three things live here, and all three are why Access is a framework concern rather than each
 * driver's problem:
 *
 * **Which driver.** Follows the pipeline's unified setting precedence:
 * Run `Configuration` (`Options`) → Content Source `Configuration` → Content Source Type `Configuration`.
 *
 * **Caching, per source AND per role.** An exchange that costs a round trip must not be paid per
 * record, so an artifact is held for the life of the run. It is keyed on the role as well as the
 * source because the same source read as two principals is two sessions; keying on the source alone
 * would hand one role's session to another. The promise is cached, not the result, so fifty records
 * arriving together wait on one exchange rather than starting fifty.
 *
 * **Credentials.** The role-to-credential mapping lives in the source's `Configuration`; the secret
 * itself lives in `MJ: Credentials` and is fetched through the credential engine. Nothing reads a
 * secret out of Configuration, out of a Record Process's Options or out of the environment.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { RegisterClass, UUIDMap } from '@memberjunction/global';
import {
    AccessArtifact,
    AccessProbeResult,
    AccessRequest,
    BaseAccessDriver,
    DEFAULT_ACCESS_ROLE,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver, ResolvedSourceConfiguration } from './ContentSourceConfigurationResolver.js';

/** The registered key of {@link CredentialAccessDriver}. */
export const CREDENTIAL_ACCESS_DRIVER = 'Credential';

/** How a source's Configuration names its access driver and maps roles to credentials. */
interface AccessConfiguration {
    /** Overrides the Content Source Type's driver for this one source. */
    AccessDriverKey?: string;
    /**
     * Role → the `MJ: Credentials` record to open that role's session with, by name or id.
     *
     * A mapping, never a secret. This is in Configuration rather than in ContentSourceParam rows
     * because those are documented as legacy.
     */
    AccessCredentials?: Record<string, string>;
}

/** A session held for the life of a run. */
interface CachedSession {
    Artifact: AccessArtifact;
    DriverKey: string;
}

/**
 * Reference {@link BaseAccessDriver} that turns a decrypted `MJ: Credentials` secret (`bearerToken`,
 * `token`, `accessToken`, `apiKey`, `headerName`/`headerValue`, or `headers`) into an {@link AccessArtifact}.
 */
@RegisterClass(BaseAccessDriver, CREDENTIAL_ACCESS_DRIVER)
export class CredentialAccessDriver extends BaseAccessDriver {
    public readonly Key = CREDENTIAL_ACCESS_DRIVER;

    public async Connect(request: AccessRequest): Promise<AccessArtifact> {
        const headers = this.buildHeaders(request);
        const queryParameters = this.buildQueryParameters(request);
        if (Object.keys(headers).length === 0 && Object.keys(queryParameters).length === 0) {
            throw new Error(
                `CredentialAccessDriver: no token, apiKey, or headers found in the resolved credential for Content Source '${request.ContentSourceID}' (role '${request.Role}')`,
            );
        }
        return {
            ...(Object.keys(headers).length > 0 ? { Headers: headers } : {}),
            ...(Object.keys(queryParameters).length > 0 ? { QueryParameters: queryParameters } : {}),
        };
    }

    private buildHeaders(request: AccessRequest): Record<string, string> {
        const headers: Record<string, string> = {};
        const rawHeaders = request.Secret.headers;
        if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
            for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
                if (typeof v === 'string' && v.length > 0) {
                    headers[k] = v;
                }
            }
        }
        const token = this.firstString(
            request.Secret.bearerToken,
            request.Secret.token,
            request.Secret.accessToken,
            request.Secret.access_token,
            request.Secret.apiKey,
            request.Secret.api_key,
            request.Secret.headerValue,
        );
        if (token) {
            const headerName =
                this.firstString(request.Secret.headerName, request.Parameters.HeaderName) ?? 'Authorization';
            headers[headerName] =
                headerName.toLowerCase() === 'authorization' && !/^[a-z]+\s+/i.test(token) ? `Bearer ${token}` : token;
        }
        return headers;
    }

    private buildQueryParameters(request: AccessRequest): Record<string, string> {
        const query: Record<string, string> = {};
        const paramName = this.firstString(request.Secret.queryParamName, request.Parameters.QueryParamName);
        const paramValue = this.firstString(request.Secret.queryParamValue);
        if (paramName && paramValue) {
            query[paramName] = paramValue;
        }
        return query;
    }

    private firstString(...candidates: unknown[]): string | null {
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim();
            }
        }
        return null;
    }
}

/**
 * Resolves and caches the sessions a run needs.
 *
 * One instance per run. Constructing a second one is not wrong, only wasteful — it opens its own
 * sessions rather than sharing.
 */
export class AccessResolver {
    private readonly sessions = new UUIDMap<Map<string, Promise<CachedSession>>>();

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
        private readonly configuration = new ContentSourceConfigurationResolver(provider, contextUser),
        private readonly runConfiguration: Readonly<Record<string, unknown>> = {},
    ) {}

    /**
     * The session artifact for a source, opening one if this run has not already.
     *
     * Returns null when the source needs no access driver at all, which is the ordinary case for a
     * public website or a local directory — not an error, and not something to warn about.
     */
    public async Artifact(
        contentSourceID: string,
        role: string = DEFAULT_ACCESS_ROLE,
        configuration?: ResolvedSourceConfiguration,
    ): Promise<AccessArtifact | null> {
        // A caller that has already resolved the source passes it in. Re-resolving would be a second
        // read of the same thing, and would make a stage that never needs a session pay for one.
        const resolved = configuration ?? (await this.configuration.Resolve(contentSourceID, this.contextUser));
        if (!this.driverKeyFor(resolved)) {
            return null;
        }
        const session = await this.session(contentSourceID, role, resolved);
        return session.Artifact;
    }

    /**
     * Check that a source can be reached, without running a stage.
     *
     * This exists so "can we get at it?" is answerable on its own — from an admin screen, from a
     * health check, from someone configuring a new source — rather than only by starting a pipeline
     * run and reading the failure out of a process run detail row.
     */
    public async Probe(contentSourceID: string, role: string = DEFAULT_ACCESS_ROLE): Promise<AccessProbeResult> {
        let resolved: ResolvedSourceConfiguration;
        try {
            resolved = await this.configuration.Resolve(contentSourceID, this.contextUser);
        } catch (error) {
            return { Success: false, Message: error instanceof Error ? error.message : String(error) };
        }
        if (!resolved.IsValid) {
            return {
                Success: false,
                Message: `Content Source is not configured correctly: ${resolved.Problems.map((p) => p.Message).join('; ')}`,
            };
        }
        const driverKey = this.driverKeyFor(resolved);
        if (!driverKey) {
            // Nothing to open is a pass: the source is reachable without a session.
            return { Success: true, Message: 'This source needs no access driver.' };
        }
        const driver = BaseAccessDriver.Resolve(driverKey);
        if (!driver) {
            return { Success: false, DriverKey: driverKey, Message: `Access driver '${driverKey}' is not registered.` };
        }
        try {
            return await driver.Probe(await this.request(contentSourceID, role, resolved));
        } catch (error) {
            return {
                Success: false,
                DriverKey: driverKey,
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Forget a source's sessions, so the next call opens fresh ones. */
    public Evict(contentSourceID: string): void {
        this.sessions.Delete(contentSourceID);
    }

    /** The cached session for a source and role, opening it at most once. */
    private session(
        contentSourceID: string,
        role: string,
        resolved: ResolvedSourceConfiguration,
    ): Promise<CachedSession> {
        let byRole = this.sessions.Get(contentSourceID);
        if (!byRole) {
            byRole = new Map<string, Promise<CachedSession>>();
            this.sessions.Set(contentSourceID, byRole);
        }
        const existing = byRole.get(role);
        // An artifact that has expired is not reused — renewing on expiry rather than on failure is
        // what stops a long run discovering its token died by getting a 401 on record four hundred.
        if (existing) {
            return existing.then((session) => {
                if (!this.expired(session.Artifact)) {
                    return session;
                }
                byRole.delete(role);
                return this.session(contentSourceID, role, resolved);
            });
        }
        const promise = this.open(contentSourceID, role, resolved).catch((error: unknown) => {
            // A failed exchange must not be cached, or one transient outage poisons the rest of the
            // run for this source.
            byRole.delete(role);
            throw error;
        });
        byRole.set(role, promise);
        return promise;
    }

    /** Open a session. */
    private async open(
        contentSourceID: string,
        role: string,
        resolved: ResolvedSourceConfiguration,
    ): Promise<CachedSession> {
        const driverKey = this.driverKeyFor(resolved);
        if (!driverKey) {
            throw new Error(`Content Source '${contentSourceID}' names no access driver`);
        }
        const driver = BaseAccessDriver.Resolve(driverKey);
        if (!driver) {
            throw new Error(
                `Access driver '${driverKey}' is not registered. Check that the package registering it has been loaded.`,
            );
        }
        const artifact = await driver.Connect(await this.request(contentSourceID, role, resolved));
        return { Artifact: artifact, DriverKey: driverKey };
    }

    /** Everything the driver is told, including the resolved secret. */
    private async request(contentSourceID: string, role: string, resolved: ResolvedSourceConfiguration): Promise<AccessRequest> {
        return {
            ContentSourceID: contentSourceID,
            URL: resolved.URL,
            Role: role,
            Secret: await this.secretFor(resolved, role),
            Parameters: resolved.Parameters,
            ContextUser: this.contextUser,
            Provider: this.provider,
            Signal: new AbortController().signal,
        };
    }

    /**
     * The secret for a role, from `MJ: Credentials`.
     *
     * The mapping says which credential; the credential engine says what it contains. A role with no
     * mapping gets an empty secret rather than an error — a driver may legitimately need none, and
     * one that does will say so far more clearly than a generic "no credential" would.
     */
    private async secretFor(
        resolved: ResolvedSourceConfiguration,
        role: string,
    ): Promise<Readonly<Record<string, unknown>>> {
        const runAccess = this.runConfiguration as AccessConfiguration;
        const sourceAccess = resolved.Configuration as AccessConfiguration;
        const settingsAccess = resolved.Settings as AccessConfiguration;
        const typeAccess = resolved.TypeConfiguration as AccessConfiguration;
        const reference =
            runAccess.AccessCredentials?.[role] ??
            sourceAccess.AccessCredentials?.[role] ??
            settingsAccess.AccessCredentials?.[role] ??
            typeAccess.AccessCredentials?.[role];
        if (!reference) {
            return {};
        }
        await CredentialEngine.Instance.Config(false, this.contextUser, this.provider);
        const byId = CredentialEngine.Instance.GetCredentialById(reference);
        const name = byId?.Name ?? reference;
        const secret = await CredentialEngine.Instance.GetCredential(name, {
            ...(byId ? { credentialId: byId.ID } : {}),
            contextUser: this.contextUser,
            subsystem: 'ContentPipeline.Access',
        });
        if (!secret) {
            throw new Error(
                `Credential '${reference}' for role '${role}' could not be resolved. The mapping lives in ` +
                    "the source's Configuration; the secret itself has to exist in MJ: Credentials.",
            );
        }
        // `values` is the decrypted material. Handing back the wrapper would give every driver the
        // credential entity as well, which is more than it needs and more than it should see.
        return secret.values;
    }

    /**
     * Unified precedence order:
     * Run `Configuration.AccessDriverKey` → Content Source `Configuration.AccessDriverKey` → Content Source Type `Configuration.AccessDriverKey`.
     */
    private driverKeyFor(resolved: ResolvedSourceConfiguration): string | null {
        const fromRun = (this.runConfiguration as AccessConfiguration).AccessDriverKey;
        if (typeof fromRun === 'string' && fromRun.length > 0) {
            return fromRun;
        }
        const own =
            (resolved.Configuration as AccessConfiguration).AccessDriverKey ??
            (resolved.Settings as AccessConfiguration).AccessDriverKey;
        if (typeof own === 'string' && own.length > 0) {
            return own;
        }
        const fromType = resolved.TypeConfiguration.AccessDriverKey;
        return typeof fromType === 'string' && fromType.length > 0 ? fromType : null;
    }

    /** Whether an artifact has passed its expiry. */
    private expired(artifact: AccessArtifact): boolean {
        return artifact.ExpiresAt instanceof Date && artifact.ExpiresAt.getTime() <= Date.now();
    }
}

void CredentialAccessDriver;
