import { readFileSync } from 'node:fs';
import type pg from 'pg';

/**
 * How a PostgreSQL client should use TLS, with libpq's `sslmode` meanings:
 * - `disable`: plain TCP.
 * - `require`: TLS, without checking the server certificate.
 * - `verify-ca`: TLS, and the certificate must chain to a trusted CA. The host name is not checked.
 * - `verify-full`: TLS, a trusted chain, and a certificate that names the host. The safe choice for
 *   anything reached over a network.
 *
 * libpq's `allow` and `prefer` modes are not offered: node-postgres cannot fall back to plain TCP
 * after a failed handshake, so they would mean `disable` or `require` in disguise.
 */
export type PgSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

/** The modes {@link ResolvePgSslMode} accepts, in order of increasing strictness. */
export const PG_SSL_MODES: readonly PgSslMode[] = Object.freeze(['disable', 'require', 'verify-ca', 'verify-full']);

/** TLS settings for a PostgreSQL connection, from config. Environment variables override them. */
export interface PgSslSettings {
    /** The TLS mode. When unset, see {@link DefaultPgSslMode}. Overridden by `PG_SSL_MODE`. */
    Mode?: PgSslMode;
    /**
     * Path to a PEM bundle of trusted CA certificates, for servers whose certificate is not signed
     * by a CA in Node's default trust store. Overridden by `PG_SSL_CA_FILE`.
     */
    CAFile?: string;
    /**
     * The name to check the server certificate against, when it differs from the host connected
     * to (a Private Link alias, an SSH tunnel, a proxy). Overridden by `PG_SSL_SERVERNAME`.
     */
    ServerName?: string;
}

/** The value node-postgres takes for `ssl` in a pool or client config. */
export type PgSslConfig = pg.ConnectionConfig['ssl'];

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal']);

/**
 * Whether a host is on this machine or reached by a bare container/service name (`postgres`,
 * `db`): those default to plain TCP, which is what a local Postgres or a docker-compose service
 * offers. Anything with a domain, or any IP other than loopback, is treated as remote.
 */
export function IsLocalPgHost(host: string | undefined | null): boolean {
    const h = (host ?? '').trim().toLowerCase();
    if (h.length === 0 || LOOPBACK_HOSTS.has(h) || h.startsWith('127.')) {
        return true;
    }
    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
    const isIPv6 = h.includes(':');
    return !isIPv4 && !isIPv6 && !h.includes('.');
}

/** `disable` for a local host (see {@link IsLocalPgHost}), `verify-full` for everything else. */
export function DefaultPgSslMode(host: string | undefined | null): PgSslMode {
    return IsLocalPgHost(host) ? 'disable' : 'verify-full';
}

/** Parses a TLS mode, case-insensitively. Throws on anything else, naming the accepted values. */
export function ParsePgSslMode(value: string, source: string): PgSslMode {
    const mode = value.trim().toLowerCase() as PgSslMode;
    if (!PG_SSL_MODES.includes(mode)) {
        throw new Error(`${source} is "${value}"; expected one of ${PG_SSL_MODES.join(', ')}.`);
    }
    return mode;
}

/** The TLS mode to use: `PG_SSL_MODE`, then the config setting, then the host default. */
export function ResolvePgSslMode(host: string | undefined | null, settings?: PgSslSettings, env: NodeJS.ProcessEnv = process.env): PgSslMode {
    if (env.PG_SSL_MODE && env.PG_SSL_MODE.trim().length > 0) {
        return ParsePgSslMode(env.PG_SSL_MODE, 'PG_SSL_MODE');
    }
    if (settings?.Mode) {
        return ParsePgSslMode(settings.Mode, 'The PostgreSQL TLS mode setting');
    }
    return DefaultPgSslMode(host);
}

/**
 * Builds the node-postgres `ssl` value for a host, from {@link PgSslSettings} and the `PG_SSL_*`
 * environment variables. Every PostgreSQL client MJ opens should get its `ssl` from here, so that
 * one setting governs them all.
 *
 * @param readFile - Reads the CA bundle; injectable for tests.
 */
export function BuildPgSslConfig(
    host: string | undefined | null,
    settings?: PgSslSettings,
    env: NodeJS.ProcessEnv = process.env,
    readFile: (path: string) => string = (path) => readFileSync(path, 'utf8')
): PgSslConfig {
    const mode = ResolvePgSslMode(host, settings, env);
    if (mode === 'disable') {
        return false;
    }
    if (mode === 'require') {
        return { rejectUnauthorized: false };
    }
    const caFile = nonEmpty(env.PG_SSL_CA_FILE) ?? nonEmpty(settings?.CAFile);
    const serverName = nonEmpty(env.PG_SSL_SERVERNAME) ?? nonEmpty(settings?.ServerName);
    const ssl: Exclude<PgSslConfig, boolean | undefined> = { rejectUnauthorized: true };
    if (caFile) {
        ssl.ca = readCABundle(caFile, readFile);
    }
    if (serverName) {
        ssl.servername = serverName;
    }
    if (mode === 'verify-ca') {
        // Trusted chain, any host name: what libpq's verify-ca means.
        ssl.checkServerIdentity = () => undefined;
    }
    return ssl;
}

/** Whether an `ssl` value checks the server certificate. `false` for plain TCP and `require`. */
export function PgSslVerifiesServer(ssl: PgSslConfig): boolean {
    return typeof ssl === 'object' && ssl !== null && ssl.rejectUnauthorized !== false;
}

/** A one-line description of an `ssl` value, for startup logs. Never includes certificate text. */
export function DescribePgSsl(ssl: PgSslConfig): string {
    if (!ssl) {
        return 'TLS off';
    }
    if (!PgSslVerifiesServer(ssl)) {
        return 'TLS on, server certificate NOT verified';
    }
    const custom = typeof ssl === 'object' && ssl.ca ? ' (custom CA bundle)' : '';
    const hostCheck = typeof ssl === 'object' && ssl.checkServerIdentity ? ', host name not checked' : '';
    return `TLS on, server certificate verified${custom}${hostCheck}`;
}

function readCABundle(path: string, readFile: (path: string) => string): string {
    try {
        return readFile(path);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Could not read the PostgreSQL CA bundle at "${path}" (PG_SSL_CA_FILE): ${reason}`);
    }
}

function nonEmpty(value: string | undefined): string | undefined {
    return value && value.trim().length > 0 ? value.trim() : undefined;
}
