import { hostname } from 'os';
import { randomUUID } from 'crypto';

/**
 * Stable, per-process identity for this server node, used to anchor
 * {@link import('@memberjunction/core-entities').MJAIAgentSessionEntity} rows to the
 * instance that currently owns their in-memory sockets.
 *
 * The shape is `${hostname}:${pid}:${bootId}` where:
 * - `hostname` and `pid` locate the OS process,
 * - `bootId` is a UUID generated **once** at module load, so two different boots of the
 *   *same* host (a crash/redeploy that reuses pid, or a long-lived host that restarts the
 *   process) produce **distinct** identities.
 *
 * This last property is what lets {@link import('./SessionJanitor').SessionJanitor} tell a
 * live session owned by *this* boot apart from an orphan left by a *previous* boot of the
 * same host: only the latter has a `HostInstanceID` that starts with `${hostname}:` but
 * carries a different `bootId`.
 */
const BOOT_ID = randomUUID();

/** Resolved host name captured once at load (cheap; avoids repeated syscalls). */
const HOST_NAME = hostname();

/** The full, immutable host-instance identity string for this process. */
const HOST_INSTANCE_ID = `${HOST_NAME}:${process.pid}:${BOOT_ID}`;

/**
 * Returns this process's stable host-instance identity (`hostname:pid:bootId`).
 * Stamped into `AIAgentSession.HostInstanceID` at session create and read back by the
 * janitor for own-host orphan recovery.
 */
export function GetHostInstanceID(): string {
    return HOST_INSTANCE_ID;
}

/**
 * Returns the host-name prefix (`hostname:`) used to match *any* session previously hosted
 * by this OS host, regardless of which boot created it. The janitor uses this to find rows
 * that belong to this host but to a *different* (older) boot — i.e. crash/redeploy orphans.
 */
export function GetHostNamePrefix(): string {
    return `${HOST_NAME}:`;
}

/**
 * Returns the UUID generated once at process start. Exposed primarily for diagnostics and
 * tests; the janitor compares against the full {@link GetHostInstanceID} rather than this
 * value directly.
 */
export function GetBootID(): string {
    return BOOT_ID;
}
