/**
 * Automated Heuristic Findings Engine for MemberJunction Diagnostic Bundles.
 * Analyzes `DiagnosticBundleData` to surface actionable root-cause findings in `findings.json`.
 */

import { NormalizeSqlLiterals } from './scrubber.js';
import type { DiagnosticBundleData, DiagnosticFinding } from './types.js';

/**
 * Runs all diagnostic heuristics over a `DiagnosticBundleData` payload and returns sorted findings
 * (`critical` first, then `warning`, then `info`).
 */
export function AnalyzeDiagnosticBundleData(data: DiagnosticBundleData): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    // 1. N+1 SQL Query Detector (>= 5 structurally identical queries within the same traceId)
    const sqlByTraceAndNormalized = new Map<
        string,
        { traceId: string; normalizedSql: string; count: number; totalMs: number }
    >();
    for (const q of data.serverSql) {
        const traceId = q.traceId ?? 'uncorrelated';
        const normalized = NormalizeSqlLiterals(q.sql).replace(/\s+/g, ' ').trim();
        const key = `${traceId}::${normalized}`;
        const existing = sqlByTraceAndNormalized.get(key);
        if (existing) {
            existing.count++;
            existing.totalMs += q.durationMs;
        } else {
            sqlByTraceAndNormalized.set(key, { traceId, normalizedSql: normalized, count: 1, totalMs: q.durationMs });
        }
    }

    let nPlusOneIdx = 1;
    for (const group of sqlByTraceAndNormalized.values()) {
        if (group.count >= 5) {
            findings.push({
                id: `finding-n-plus-one-${nPlusOneIdx++}`,
                severity: group.count >= 15 || group.totalMs >= 1000 ? 'critical' : 'warning',
                category: 'n_plus_one_sql',
                title: `Suspected N+1 SQL pattern (${group.count} executions in trace ${group.traceId.slice(0, 8)})`,
                summary: `Identical SQL statement executed ${group.count} times totaling ${Math.round(group.totalMs)}ms within a single request trace.`,
                evidence: {
                    traceId: group.traceId,
                    executionCount: group.count,
                    totalDurationMs: Math.round(group.totalMs * 10) / 10,
                    sampleNormalizedSql: group.normalizedSql.slice(0, 300),
                },
                recommendation:
                    'Batch these lookups using RunViews (plural) or an IN (...) clause rather than issuing per-row queries inside a loop.',
                relatedTraceIds: group.traceId !== 'uncorrelated' ? [group.traceId] : [],
            });
        }
    }

    // 2. Slow SQL Queries (>= 500ms warning, >= 1000ms critical)
    const slowQueries = data.serverSql.filter((q) => q.durationMs >= 500).sort((a, b) => b.durationMs - a.durationMs);
    for (let i = 0; i < Math.min(slowQueries.length, 5); i++) {
        const q = slowQueries[i];
        findings.push({
            id: `finding-slow-sql-${i + 1}`,
            severity: q.durationMs >= 1000 ? 'critical' : 'warning',
            category: 'slow_sql',
            title: `Slow SQL query (${Math.round(q.durationMs)}ms)`,
            summary: `SQL statement took ${Math.round(q.durationMs)}ms and returned ${q.rowCount ?? 0} rows.`,
            evidence: {
                durationMs: q.durationMs,
                rowCount: q.rowCount ?? 0,
                sqlPreview: q.sql.slice(0, 300),
                traceId: q.traceId,
            },
            recommendation:
                'Inspect the query execution plan and verify appropriate indexing on filter/join predicates.',
            relatedTraceIds: q.traceId ? [q.traceId] : [],
        });
    }

    // 3. GraphQL Waterfall Error Rate
    const failedOps = data.clientWaterfall.filter((w) => w.status === 'error');
    if (failedOps.length > 0) {
        const errorRate = failedOps.length / Math.max(1, data.clientWaterfall.length);
        findings.push({
            id: 'finding-graphql-errors',
            severity: errorRate >= 0.25 || failedOps.length >= 3 ? 'critical' : 'warning',
            category: 'graphql_error_rate',
            title: `${failedOps.length} failed GraphQL operation(s) (${Math.round(errorRate * 100)}% error rate)`,
            summary: `Operations [${Array.from(new Set(failedOps.map((o) => o.operationName))).join(', ')}] returned errors.`,
            evidence: {
                failedCount: failedOps.length,
                totalCount: data.clientWaterfall.length,
                operations: failedOps.slice(0, 5).map((o) => ({
                    operationName: o.operationName,
                    durationMs: o.durationMs,
                    errorMessage: o.errorMessage,
                    traceId: o.traceId,
                })),
            },
            recommendation:
                'Correlate the failing traceId values in server/traces.ndjson and server/logs.ndjson to inspect resolver exceptions.',
            relatedTraceIds: Array.from(new Set(failedOps.map((o) => o.traceId))),
        });
    }

    // 4. Failed BaseEntity.Save Telemetry Events
    const failedSaves = data.clientTelemetry.filter(
        (t) =>
            (t.category === 'BaseEntity' || t.operation.includes('Save')) &&
            t.params &&
            t.params['Success'] === false
    );
    if (failedSaves.length > 0) {
        findings.push({
            id: 'finding-failed-entity-saves',
            severity: 'warning',
            category: 'failed_entity_save',
            title: `${failedSaves.length} failed BaseEntity.Save operation(s)`,
            summary: `Entity save failure(s) recorded on [${Array.from(new Set(failedSaves.map((s) => String(s.params?.['Entity'] ?? 'unknown')))).join(', ')}].`,
            evidence: {
                count: failedSaves.length,
                events: failedSaves.slice(0, 5).map((s) => ({
                    id: s.id,
                    entity: s.params?.['Entity'],
                    durationMs: s.durationMs,
                    traceId: s.traceId,
                })),
            },
            recommendation:
                'Check server validation rules, permissions, or database constraint errors for the corresponding traceId.',
            relatedTraceIds: failedSaves.map((s) => s.traceId).filter((id): id is string => Boolean(id)),
        });
    }

    // 5. Server Health Checks (Memory Pressure, DB Pool Exhaustion, Event Loop Stall)
    if (data.serverHealth) {
        const { memory, databasePool, eventLoopLagP95Ms } = data.serverHealth;
        if (memory.heapTotalBytes > 0) {
            const heapRatio = memory.heapUsedBytes / memory.heapTotalBytes;
            if (heapRatio >= 0.85) {
                findings.push({
                    id: 'finding-memory-pressure',
                    severity: heapRatio >= 0.92 ? 'critical' : 'warning',
                    category: 'memory_pressure',
                    title: `High V8 heap utilization (${Math.round(heapRatio * 100)}%)`,
                    summary: `Node.js heapUsed is ${Math.round(memory.heapUsedBytes / (1024 * 1024))} MiB of ${Math.round(memory.heapTotalBytes / (1024 * 1024))} MiB.`,
                    evidence: {
                        heapUsedBytes: memory.heapUsedBytes,
                        heapTotalBytes: memory.heapTotalBytes,
                        rssBytes: memory.rssBytes,
                        utilizationRatio: Math.round(heapRatio * 1000) / 1000,
                    },
                    recommendation:
                        'Check for unbounded in-memory caches, large RunView result sets without MaxRows, or raise --max-old-space-size.',
                });
            }
        }

        if (databasePool && databasePool.waitingRequests > 0) {
            findings.push({
                id: 'finding-db-pool-exhaustion',
                severity: databasePool.waitingRequests >= 3 ? 'critical' : 'warning',
                category: 'db_pool_exhaustion',
                title: `Database connection pool exhaustion (${databasePool.waitingRequests} waiting request(s))`,
                summary: `${databasePool.activeConnections}/${databasePool.totalConnections} connections active with ${databasePool.waitingRequests} queued callers.`,
                evidence: { ...databasePool },
                recommendation:
                    'Investigate long-running SQL transactions holding connections open or increase the database pool max size.',
            });
        }

        if (eventLoopLagP95Ms >= 100) {
            findings.push({
                id: 'finding-event-loop-stall',
                severity: eventLoopLagP95Ms >= 250 ? 'critical' : 'warning',
                category: 'event_loop_stall',
                title: `Node.js event loop lag (p95 = ${Math.round(eventLoopLagP95Ms)}ms)`,
                summary: `Server event loop p95 delay reached ${Math.round(eventLoopLagP95Ms)}ms.`,
                evidence: { eventLoopLagP95Ms },
                recommendation:
                    'Look for synchronous CPU-bound JSON serialization, large payload parsing, or synchronous crypto/compression on the main thread.',
            });
        }
    }

    // 6. Client/Server Clock Skew
    const clockSkewMs = data.environment.clockSkewMs;
    if (typeof clockSkewMs === 'number' && Math.abs(clockSkewMs) >= 1500) {
        findings.push({
            id: 'finding-clock-skew',
            severity: Math.abs(clockSkewMs) >= 10_000 ? 'warning' : 'info',
            category: 'clock_skew',
            title: `Client/server clock skew detected (${Math.round(clockSkewMs)}ms)`,
            summary: `Browser wall clock differs from MJAPI server clock by ${Math.round(clockSkewMs)}ms.`,
            evidence: { clockSkewMs },
            recommendation:
                'Use traceId/spanId correlation or monotonic offsets when aligning client and server events.',
        });
    }

    const severityRank: Record<DiagnosticFinding['severity'], number> = {
        critical: 0,
        warning: 1,
        info: 2,
    };
    findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    return findings;
}

export const AnalyzeDiagnosticFindings = AnalyzeDiagnosticBundleData;
