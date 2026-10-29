/**
 * Host connection resolution for External Data Source drivers.
 *
 * A data source configured with `authMode: "host"` connects with the SQL Server login the host
 * process (MJAPI) already uses for its own database, instead of a stored credential record. The
 * host registers a resolver at startup; drivers ask for the connection info when they build a pool.
 * When no resolver is registered (or it fails), resolution returns undefined and the driver refuses
 * host mode.
 *
 * Host mode exists for one purpose: reading the archive seed's staging database (a backup restored on
 * the host's own server). Any user who can edit an External Data Source can set `authMode: "host"`, so a
 * driver refuses it for every database outside that purpose — see {@link IsHostModeDatabaseAllowed}.
 */

/** The host process's own SQL Server connection, as handed to drivers running in `host` auth mode. */
export interface HostSqlConnectionInfo {
    Server: string;
    Port?: number;
    User: string;
    Password: string;
    InstanceName?: string;
    Encrypt?: boolean;
    TrustServerCertificate?: boolean;
    /**
     * The host's own database (the MJ database). Host mode refuses a data source whose
     * `DefaultDatabase` names it, so a host-mode source can never read the host's own data.
     */
    Database?: string;
}

/** Returns the host's SQL Server connection info, or undefined when the host has none to offer. */
export type HostConnectionResolver = () => HostSqlConnectionInfo | undefined;

let hostConnectionResolver: HostConnectionResolver | undefined;

/** Registers (or, with undefined, clears) the resolver drivers use for `host` auth mode. */
export function SetHostConnectionResolver(resolver: HostConnectionResolver | undefined): void {
    hostConnectionResolver = resolver;
}

/**
 * Resolves the host's SQL Server connection info. Returns undefined when no resolver is registered
 * or when the resolver throws, so callers treat both as "host mode unavailable".
 */
export function ResolveHostConnection(): HostSqlConnectionInfo | undefined {
    if (!hostConnectionResolver) {
        return undefined;
    }
    try {
        return hostConnectionResolver();
    } catch {
        return undefined;
    }
}

/**
 * The name prefix of the archive seed's staging databases — the only databases `host` auth mode may
 * open. Compared case-insensitively.
 */
export const HOST_MODE_DATABASE_PREFIX = 'MJ_Staging_';

/**
 * True when `host` auth mode may open `database`: its name starts with {@link HOST_MODE_DATABASE_PREFIX}
 * (case-insensitively) and has something after the prefix. The host's login can read every database it
 * is a user of, so without this any External Data Source editor could read any of them through it.
 */
export function IsHostModeDatabaseAllowed(database: string): boolean {
    const name = database.trim();
    return name.length > HOST_MODE_DATABASE_PREFIX.length
        && name.toLowerCase().startsWith(HOST_MODE_DATABASE_PREFIX.toLowerCase());
}
