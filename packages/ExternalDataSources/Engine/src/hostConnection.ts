/**
 * Host connection resolution for External Data Source drivers.
 *
 * A data source configured with `authMode: "host"` connects with the SQL Server login the host
 * process (MJAPI) already uses for its own database, instead of a stored credential record. The
 * host registers a resolver at startup; drivers ask for the connection info when they build a pool.
 * When no resolver is registered (or it fails), resolution returns undefined and the driver refuses
 * host mode.
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
