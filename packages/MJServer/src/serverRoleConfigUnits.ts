/**
 * Supported MJServer horizontal scaling roles (`MJ_SERVER_ROLE`).
 * - `'all'` (default): Monolithic mode — serves HTTP/GraphQL/WebSocket traffic AND runs all background worker loops.
 * - `'api'`: Stateless API/WebSocket edge — serves HTTP/GraphQL/WebSocket traffic ONLY; skips background schedulers,
 *   queue dispatchers, and janitors so event-loop responsiveness is isolated from heavy background jobs.
 * - `'worker'`: Background worker replica — runs `ScheduledJobsService`, `IntegrationSyncWorkerService`,
 *   `StartTaskGraphDispatcher`, `StartWorkQueueHost`, `SessionJanitor`, and orphan reconcilers while keeping
 *   only lightweight healthcheck/metrics HTTP endpoints active.
 */
export type ServerRole = 'all' | 'api' | 'worker';

const VALID_SERVER_ROLES: ReadonlySet<string> = new Set<ServerRole>(['all', 'api', 'worker']);

/**
 * Resolves the server role from `MJ_SERVER_ROLE` or `mj.config.cjs`'s `serverRole`.
 * Defaults to `'all'` when unset or blank. Throws on unrecognized values so deployment typos
 * fail fast at startup instead of silently running the wrong workload profile.
 */
export function ResolveServerRole(rawValue?: string | null): ServerRole {
    const trimmed = rawValue?.trim().toLowerCase();
    if (!trimmed) {
        return 'all';
    }
    if (VALID_SERVER_ROLES.has(trimmed)) {
        return trimmed as ServerRole;
    }
    throw new Error(
        `Invalid MJ_SERVER_ROLE "${rawValue}". Expected one of: 'all', 'api', 'worker'.`
    );
}

/**
 * Returns `true` when this server instance should start background worker loops
 * (`ScheduledJobsService`, `IntegrationSyncWorkerService`, `StartTaskGraphDispatcher`,
 * `StartWorkQueueHost`, `SessionJanitor`, `StartBridgeOrphanReconciliation`, and
 * `OrphanDetailReconciler`).
 */
export function ShouldRunBackgroundWorkers(role: ServerRole): boolean {
    return role === 'all' || role === 'worker';
}

/**
 * Returns `true` when this server instance is designated to serve interactive
 * API / GraphQL / WebSocket client traffic.
 */
export function ShouldServeInteractiveTraffic(role: ServerRole): boolean {
    return role === 'all' || role === 'api';
}
