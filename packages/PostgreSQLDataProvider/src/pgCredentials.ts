import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { PgSslVerifiesServer, type PgSslConfig } from './pgSsl.js';

/**
 * How a PostgreSQL login proves who it is:
 * - `password`: a fixed password from config (the default).
 * - anything else: the key a {@link BasePgCredentialProvider} subclass is registered under, which
 *   supplies a short-lived token used as the password. MJ ships `azure-entra` (Microsoft Entra ID,
 *   for Azure Database for PostgreSQL and Azure HorizonDB) and `aws-rds-iam` (RDS and Aurora IAM
 *   authentication), each in its own optional package.
 */
export type PgAuthMode = 'password' | 'azure-entra' | 'aws-rds-iam' | (string & {});

/** What a credential provider needs to know about the login it is fetching a token for. */
export interface PgCredentialRequest {
    Host: string;
    Port: number;
    User: string;
    Database: string;
}

/**
 * Supplies the password for new PostgreSQL connections. node-postgres calls a pool's `password`
 * function for every new physical connection, so a token provider is asked each time a connection
 * opens, and caches the token until shortly before it expires.
 *
 * Register a subclass with `@RegisterClass(BasePgCredentialProvider, '<mode>')`, and select it with
 * `PG_AUTH_MODE=<mode>`.
 */
export abstract class BasePgCredentialProvider {
    /** Returns the password (or token) for a new connection. */
    public abstract GetPassword(request: PgCredentialRequest): Promise<string>;

    /**
     * Whether this mode's secret may only travel over TLS that verifies the server. Token modes
     * always do: a token must never cross plain TCP or an unverified connection.
     * {@link BuildPgPasswordSource} enforces it.
     */
    public get RequiresTls(): boolean {
        return true;
    }
}

/** A cached token and when to stop using it. */
interface CachedToken {
    Token: string;
    RefreshAfter: number;
}

/**
 * Base class for token providers: caches one token per login and fetches a new one when the
 * cached one is within {@link RefreshMarginMs} of expiring. Concurrent callers share one fetch.
 */
export abstract class CachingPgCredentialProvider extends BasePgCredentialProvider {
    private readonly cache = new Map<string, CachedToken>();
    private readonly inFlight = new Map<string, Promise<string>>();

    /** How long before a token's expiry to stop using it. Default 5 minutes. */
    protected get RefreshMarginMs(): number {
        return 5 * 60 * 1000;
    }

    /** Fetches a new token, and when it expires (epoch milliseconds). */
    protected abstract FetchToken(request: PgCredentialRequest): Promise<{ Token: string; ExpiresAt: number }>;

    public async GetPassword(request: PgCredentialRequest): Promise<string> {
        const key = `${request.User}@${request.Host}:${request.Port}`;
        const cached = this.cache.get(key);
        if (cached && Date.now() < cached.RefreshAfter) {
            return cached.Token;
        }
        const pending = this.inFlight.get(key);
        if (pending) {
            return pending;
        }
        const fetch = this.fetchAndCache(key, request).finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, fetch);
        return fetch;
    }

    private async fetchAndCache(key: string, request: PgCredentialRequest): Promise<string> {
        const { Token, ExpiresAt } = await this.FetchToken(request);
        this.cache.set(key, { Token, RefreshAfter: ExpiresAt - this.RefreshMarginMs });
        return Token;
    }
}

/** The fixed-password mode: returns the configured password. */
export class StaticPasswordProvider extends BasePgCredentialProvider {
    public constructor(private readonly password: string) {
        super();
    }

    public async GetPassword(): Promise<string> {
        return this.password;
    }

    public override get RequiresTls(): boolean {
        return false;
    }
}

/** Resolves the credential provider for a PostgreSQL auth mode, once per mode per process. */
export class PgCredentialProviders extends BaseSingleton<PgCredentialProviders> {
    private readonly providers = new Map<string, BasePgCredentialProvider>();

    /** Use {@link PgCredentialProviders.Instance}. */
    public constructor() {
        super();
    }

    public static get Instance(): PgCredentialProviders {
        return PgCredentialProviders.getInstance<PgCredentialProviders>();
    }

    /**
     * The provider registered for a token mode. Throws when none is: usually the package that
     * provides it (`@memberjunction/pg-auth-azure`, `@memberjunction/pg-auth-aws`) is not loaded.
     */
    public Get(mode: PgAuthMode): BasePgCredentialProvider {
        const existing = this.providers.get(mode);
        if (existing) {
            return existing;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BasePgCredentialProvider>(BasePgCredentialProvider, mode);
        if (!result.Resolved || !result.Instance || result.Instance.constructor === BasePgCredentialProvider) {
            throw new Error(
                `PG_AUTH_MODE is "${mode}", but no PostgreSQL credential provider is registered under that key. ` +
                `Install and import the package that provides it (for example @memberjunction/pg-auth-azure for "azure-entra").`
            );
        }
        this.providers.set(mode, result.Instance);
        return result.Instance;
    }
}

/** Reads the auth mode: `PG_AUTH_MODE`, then the config setting, then `password`. */
export function ResolvePgAuthMode(configured?: string, env: NodeJS.ProcessEnv = process.env): PgAuthMode {
    const fromEnv = env.PG_AUTH_MODE?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return configured?.trim() || 'password';
}

/**
 * Throws unless a token login's connection verifies the server. A token mode sends a bearer token
 * as the password, so it may only travel over TLS that checks the server certificate
 * (`verify-ca` or `verify-full`): plain TCP exposes it on the wire, and `require` hands it to
 * whoever answers. `password` mode is not checked here; its TLS is the deployment's choice.
 *
 * {@link BuildPgPasswordSource} and `PGConnectionManager` call this, so every PostgreSQL connection
 * path that carries a token is held to it; callers do not repeat the check.
 */
export function AssertPgTokenTransport(mode: PgAuthMode, ssl: PgSslConfig): void {
    if (mode === 'password' || PgSslVerifiesServer(ssl)) {
        return;
    }
    throw new Error(
        `PG_AUTH_MODE is "${mode}", which sends a token as the password, but PostgreSQL TLS does not verify the server. ` +
        `Refusing to send the token. Set PG_SSL_MODE (or the ssl setting) to verify-ca or verify-full.`
    );
}

/**
 * Returns the password source for a login: `undefined` for `password` mode (use the configured
 * password), else a function node-postgres calls for each new physical connection, so a token is
 * fetched (or taken from the provider's cache) every time a connection opens.
 *
 * `ssl` is the TLS the connection will use. A provider whose {@link BasePgCredentialProvider.RequiresTls}
 * is true (every token provider) refuses one that does not verify the server; see
 * {@link AssertPgTokenTransport}.
 */
export function BuildPgPasswordSource(mode: PgAuthMode, request: PgCredentialRequest, ssl: PgSslConfig): (() => Promise<string>) | undefined {
    if (mode === 'password') {
        return undefined;
    }
    const provider = PgCredentialProviders.Instance.Get(mode);
    if (provider.RequiresTls) {
        AssertPgTokenTransport(mode, ssl);
    }
    return () => provider.GetPassword(request);
}
