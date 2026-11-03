/**
 * Core isomorphic types for MemberJunction Diagnostic Bundles (`.mjdiag` / `.mjdiag.enc`).
 * Zero runtime dependencies on Node.js or DOM APIs so this module is safe in both
 * browser (`@memberjunction/ng-diagnostics`) and server (`@memberjunction/diagnostics-server`).
 */

export type DiagnosticScrubberProfile = 'Standard' | 'FullRaw';
export type DiagnosticScrubbingMode = DiagnosticScrubberProfile;

export type DiagnosticMode = 'flight-recorder' | 'active-recording' | 'server-session';

export type DiagnosticFidelity = 'Standard' | 'Elevated' | 'Verbose';

export interface DiagnosticEnvironmentInfo {
    mjVersion: string;
    gitCommit?: string;
    nodeVersion?: string;
    osPlatform?: string;
    osRelease?: string;
    osArch?: string;
    databasePlatform?: 'sqlserver' | 'postgresql' | string;
    databaseVersion?: string;
    browserUserAgent?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    devicePixelRatio?: number;
    timezone?: string;
    clockSkewMs?: number;
    featureFlags?: Record<string, boolean | string | number>;
}

export interface DiagnosticBreadcrumb {
    timestamp: string;
    type?: 'click' | 'route' | 'mutation' | 'error' | 'focus' | string;
    kind?: string;
    target: string;
    route?: string;
    detail?: string;
}

export interface DiagnosticReproInfo {
    url?: string;
    route?: string;
    userComment?: string;
    userNotes?: string;
    ReproductionSteps?: string[];
    breadcrumbs: DiagnosticBreadcrumb[];
}

export interface DiagnosticLogEntry {
    timestamp: string;
    severity: 'debug' | 'info' | 'warn' | 'error';
    source: 'client' | 'server';
    category?: string;
    message: string;
    traceId?: string;
    spanId?: string;
    errorStack?: string;
    stack?: string;
    data?: Record<string, unknown>;
}

export interface DiagnosticNetworkEntry {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
    operationKind: 'query' | 'mutation' | 'subscription' | 'batch' | 'unknown';
    startTimeUnixMs: number;
    durationMs: number;
    status: 'ok' | 'error';
    httpStatus?: number;
    retryCount: number;
    requestBytes: number;
    responseBytes: number;
    errorMessage?: string;
    errorMessages?: string[];
    variableKeys?: string[];
}

export type DiagnosticWaterfallEntry = DiagnosticNetworkEntry;

export interface DiagnosticTelemetryEntry {
    id: string;
    category: string;
    operation: string;
    startTimeUnixMs: number;
    durationMs?: number;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    params?: Record<string, unknown>;
    tags?: string[];
}

export interface DiagnosticServerSpanEntry {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    layer: 'http' | 'auth' | 'graphql' | 'resolver' | 'entity' | 'sql' | 'action' | 'agent' | 'custom';
    startTimeUnixMs: number;
    durationMs: number;
    status: 'ok' | 'error';
    errorMessage?: string;
    attributes?: Record<string, string | number | boolean>;
}

export type DiagnosticServerSpan = DiagnosticServerSpanEntry;

export interface DiagnosticSqlParameterDescriptor {
    name: string;
    sqlType: string;
    byteLength: number;
}

export interface DiagnosticSqlEntry {
    timestamp: string;
    traceId?: string;
    spanId?: string;
    sql: string;
    durationMs: number;
    rowCount?: number;
    errorMessage?: string;
    parameterTypes: DiagnosticSqlParameterDescriptor[];
    executionPlanXml?: string;
}

export interface DiagnosticServerHealthSnapshot {
    timestamp: string;
    uptimeSeconds: number;
    eventLoopLagP95Ms: number;
    eventLoopLagP99Ms?: number;
    memory: {
        rssBytes: number;
        heapTotalBytes: number;
        heapUsedBytes: number;
        externalBytes: number;
        arrayBuffersBytes?: number;
    };
    /** Measured pool counts; absent when the database provider exposes no pool. */
    databasePool?: {
        totalConnections: number;
        activeConnections: number;
        idleConnections: number;
        waitingRequests: number;
    };
    cacheStats: {
        enabled: boolean;
        entryCount: number;
        approxBytes?: number;
        hitCount?: number;
        missCount?: number;
    };
    startupSummary?: {
        totalStartupMs: number;
        phaseDurationsMs: Record<string, number>;
    };
}

export type DiagnosticServerHealth = DiagnosticServerHealthSnapshot;

export type DiagnosticFindingSeverity = 'info' | 'warning' | 'critical';

export type DiagnosticFindingCategory =
    | 'n_plus_one_sql'
    | 'slow_sql'
    | 'graphql_error_rate'
    | 'failed_entity_save'
    | 'memory_pressure'
    | 'db_pool_exhaustion'
    | 'clock_skew'
    | 'event_loop_stall'
    | 'websocket_reconnect_storm';

export interface DiagnosticFinding {
    id: string;
    severity: DiagnosticFindingSeverity;
    category: DiagnosticFindingCategory;
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
    recommendation: string;
    relatedTraceIds?: string[];
}

export interface DiagnosticRedactionSummary {
    credentialsScrubbedCount: number;
    sqlLiteralsNormalizedCount: number;
    customPatternsAppliedCount: number;
}

export interface DiagnosticManifestFileEntry {
    sha256: string;
    sizeBytes: number;
    entryCount?: number;
}

export interface DiagnosticBundleManifest {
    schemaVersion: '1.0';
    bundleId: string;
    sessionId?: string;
    createdAt: string;
    captureReason: string;
    scrubberProfile: DiagnosticScrubberProfile;
    redactionSummary: DiagnosticRedactionSummary;
    files: Record<string, DiagnosticManifestFileEntry>;
}

export interface DiagnosticBundleData {
    environment: DiagnosticEnvironmentInfo;
    repro: DiagnosticReproInfo;
    clientLogs: DiagnosticLogEntry[];
    clientWaterfall: DiagnosticNetworkEntry[];
    clientTelemetry: DiagnosticTelemetryEntry[];
    serverTraces: DiagnosticServerSpanEntry[];
    serverSql: DiagnosticSqlEntry[];
    serverLogs: DiagnosticLogEntry[];
    serverHealth?: DiagnosticServerHealthSnapshot;
    findings: DiagnosticFinding[];
    contrib?: Record<string, Record<string, unknown>>;
}

export const CANONICAL_MJDIAG_ROOT_FILES: ReadonlySet<string> = new Set([
    'manifest.json',
    'README.txt',
    'environment.json',
    'repro.json',
    'findings.json',
    'client/logs.ndjson',
    'client/waterfall.ndjson',
    'client/telemetry.ndjson',
    'server/traces.ndjson',
    'server/sql.ndjson',
    'server/logs.ndjson',
    'server/health.json',
]);

/**
 * Checks whether an archive entry path is permitted inside a `.mjdiag` bundle.
 * Rejects any path traversal (`..`), leading slashes, backslashes, or non-allowlisted paths.
 */
export function IsAllowedMjdiagEntryPath(entryPath: string): boolean {
    if (!entryPath || entryPath.length > 256) {
        return false;
    }
    if (entryPath.startsWith('/') || entryPath.includes('\\') || entryPath.includes('..') || entryPath.includes('\0')) {
        return false;
    }
    if (CANONICAL_MJDIAG_ROOT_FILES.has(entryPath)) {
        return true;
    }
    if (/^server\/plans\/[A-Za-z0-9_-]{1,64}\.sqlplan\.xml$/.test(entryPath)) {
        return true;
    }
    if (/^contrib\/[A-Za-z0-9._-]{1,64}\.json$/.test(entryPath)) {
        return true;
    }
    if (/^contributors\/[A-Za-z0-9._-]{1,64}\.json$/.test(entryPath)) {
        return true;
    }
    if (/^client\/screenshot\.[a-z0-9]{3,4}$/.test(entryPath)) {
        return true;
    }
    return false;
}

/**
 * Checks whether a contributor `SectionKey` can be written as `contrib/<SectionKey>.json`:
 * 1 to 64 characters from `A-Z a-z 0-9 . _ -`, with no `..` in the resulting path.
 */
export function IsValidContributorSectionKey(sectionKey: string): boolean {
    return (
        typeof sectionKey === 'string' &&
        /^[A-Za-z0-9._-]{1,64}$/.test(sectionKey) &&
        IsAllowedMjdiagEntryPath(`contrib/${sectionKey}.json`)
    );
}
