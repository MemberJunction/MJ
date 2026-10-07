/**
 * @fileoverview Opening and reusing sessions for the sources a run touches.
 *
 * Three things live here, and all three are why Access is a framework concern rather than each
 * driver's problem:
 *
 * **Which driver.** The Content Source Type says how its kind of source is reached; an individual
 * source may override it. That is the same shape as every other selection in the pipeline — the type
 * knows the general answer, the source knows its own exception.
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
import {
    AccessArtifact,
    AccessProbeResult,
    BaseAccessDriver,
    DEFAULT_ACCESS_ROLE,
} from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver, ResolvedSourceConfiguration } from './ContentSourceConfigurationResolver.js';

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
 * Resolves and caches the sessions a run needs.
 *
 * One instance per run. Constructing a second one is not wrong, only wasteful — it opens its own
 * sessions rather than sharing.
 */
export class AccessResolver {
    private readonly sessions = new Map<string, Promise<CachedSession>>();

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
        private readonly configuration = new ContentSourceConfigurationResolver(provider, contextUser),
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
        for (const key of [...this.sessions.keys()]) {
            if (key.startsWith(`${contentSourceID}\u0000`)) {
                this.sessions.delete(key);
            }
        }
    }

    /** The cached session for a source and role, opening it at most once. */
    private session(
        contentSourceID: string,
        role: string,
        resolved: ResolvedSourceConfiguration,
    ): Promise<CachedSession> {
        const key = `${contentSourceID}\u0000${role}`;
        const existing = this.sessions.get(key);
        // An artifact that has expired is not reused — renewing on expiry rather than on failure is
        // what stops a long run discovering its token died by getting a 401 on record four hundred.
        if (existing) {
            return existing.then((session) => {
                if (!this.expired(session.Artifact)) {
                    return session;
                }
                this.sessions.delete(key);
                return this.session(contentSourceID, role, resolved);
            });
        }
        const promise = this.open(contentSourceID, role, resolved).catch((error: unknown) => {
            // A failed exchange must not be cached, or one transient outage poisons the rest of the
            // run for this source.
            this.sessions.delete(key);
            throw error;
        });
        this.sessions.set(key, promise);
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
    private async request(contentSourceID: string, role: string, resolved: ResolvedSourceConfiguration) {
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
        const access = resolved.Configuration as AccessConfiguration;
        const reference = access.AccessCredentials?.[role];
        if (!reference) {
            return {};
        }
        await CredentialEngine.Instance.Config(false, this.contextUser, this.provider);
        const byId = CredentialEngine.Instance.getCredentialById(reference);
        const name = byId?.Name ?? reference;
        const secret = await CredentialEngine.Instance.getCredential(name, {
            ...(byId ? { credentialId: byId.ID } : {}),
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

    /** The source's own driver key, falling back to its type's. */
    private driverKeyFor(resolved: ResolvedSourceConfiguration): string | null {
        const own = (resolved.Configuration as AccessConfiguration).AccessDriverKey;
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
