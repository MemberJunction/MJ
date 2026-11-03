/**
 * Perfetto Trace Event Format (`chrome://tracing` / `ui.perfetto.dev`) and
 * OpenTelemetry OTLP/JSON (`ExportTraceServiceRequest`) exporters for `.mjdiag` bundles.
 */

import type { DiagnosticBundleData } from './types.js';

export interface PerfettoTraceEvent {
    name: string;
    cat: string;
    ph: 'X' | 'I';
    ts: number; // microseconds
    dur?: number; // microseconds
    pid: number;
    tid: number;
    args?: Record<string, unknown>;
}

export interface PerfettoTraceDocument {
    traceEvents: PerfettoTraceEvent[];
    displayTimeUnit: 'ms';
}

const CLIENT_PID = 1;
const SERVER_PID = 2;

const LAYER_TID: Record<string, number> = {
    waterfall: 10,
    telemetry: 11,
    http: 20,
    auth: 21,
    graphql: 22,
    resolver: 23,
    entity: 24,
    sql: 25,
    action: 26,
    agent: 27,
    custom: 28,
};

/**
 * Converts a `DiagnosticBundleData` payload into a Perfetto / Chrome Trace Event document.
 */
export function ExportToPerfettoTrace(data: DiagnosticBundleData): PerfettoTraceDocument {
    const traceEvents: PerfettoTraceEvent[] = [];

    for (const wf of data.clientWaterfall) {
        traceEvents.push({
            name: `${wf.operationKind.toUpperCase()} ${wf.operationName}`,
            cat: 'client.graphql',
            ph: 'X',
            ts: Math.round(wf.startTimeUnixMs * 1000),
            dur: Math.max(1, Math.round(wf.durationMs * 1000)),
            pid: CLIENT_PID,
            tid: LAYER_TID.waterfall,
            args: {
                traceId: wf.traceId,
                spanId: wf.spanId,
                status: wf.status,
                requestBytes: wf.requestBytes,
                responseBytes: wf.responseBytes,
                retryCount: wf.retryCount,
                errorMessage: wf.errorMessage,
            },
        });
    }

    for (const s of data.serverTraces) {
        traceEvents.push({
            name: s.name,
            cat: `server.${s.layer}`,
            ph: 'X',
            ts: Math.round(s.startTimeUnixMs * 1000),
            dur: Math.max(1, Math.round(s.durationMs * 1000)),
            pid: SERVER_PID,
            tid: LAYER_TID[s.layer] ?? LAYER_TID.custom,
            args: {
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId,
                status: s.status,
                errorMessage: s.errorMessage,
                ...s.attributes,
            },
        });
    }

    for (const t of data.clientTelemetry) {
        if (t.durationMs !== undefined) {
            traceEvents.push({
                name: `${t.category}:${t.operation}`,
                cat: 'client.telemetry',
                ph: 'X',
                ts: Math.round(t.startTimeUnixMs * 1000),
                dur: Math.max(1, Math.round(t.durationMs * 1000)),
                pid: CLIENT_PID,
                tid: LAYER_TID.telemetry,
                args: {
                    id: t.id,
                    traceId: t.traceId,
                    spanId: t.spanId,
                    params: t.params,
                },
            });
        }
    }

    traceEvents.sort((a, b) => a.ts - b.ts);
    return {
        traceEvents,
        displayTimeUnit: 'ms',
    };
}

export interface OtlpAttributeValue {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
}

export interface OtlpKeyValue {
    key: string;
    value: OtlpAttributeValue;
}

export interface OtlpSpan {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    kind: number;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: OtlpKeyValue[];
    status: { code: number; message?: string };
}

export interface OtlpTraceExportDocument {
    resourceSpans: Array<{
        resource: { attributes: OtlpKeyValue[] };
        scopeSpans: Array<{
            scope: { name: string; version: string };
            spans: OtlpSpan[];
        }>;
    }>;
}

function toOtlpKeyValues(attrs: Record<string, unknown> | undefined): OtlpKeyValue[] {
    if (!attrs) return [];
    const out: OtlpKeyValue[] = [];
    for (const [key, val] of Object.entries(attrs)) {
        if (typeof val === 'string') {
            out.push({ key, value: { stringValue: val } });
        } else if (typeof val === 'boolean') {
            out.push({ key, value: { boolValue: val } });
        } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                out.push({ key, value: { intValue: String(val) } });
            } else {
                out.push({ key, value: { doubleValue: val } });
            }
        }
    }
    return out;
}

function msToUnixNanoString(ms: number): string {
    const wholeMs = BigInt(Math.max(0, Math.floor(ms)));
    const fracNs = BigInt(Math.max(0, Math.round((ms - Math.floor(ms)) * 1_000_000)));
    return (wholeMs * 1_000_000n + fracNs).toString();
}

/**
 * Converts a `DiagnosticBundleData` payload into an OpenTelemetry OTLP/JSON `ExportTraceServiceRequest` document.
 */
export function ExportToOtlpJson(data: DiagnosticBundleData): OtlpTraceExportDocument {
    const spans: OtlpSpan[] = [];

    for (const wf of data.clientWaterfall) {
        spans.push({
            traceId: wf.traceId.padEnd(32, '0').slice(0, 32),
            spanId: wf.spanId.padEnd(16, '0').slice(0, 16),
            ...(wf.parentSpanId ? { parentSpanId: wf.parentSpanId.padEnd(16, '0').slice(0, 16) } : {}),
            name: `GraphQL ${wf.operationKind} ${wf.operationName}`,
            kind: 3, // SPAN_KIND_CLIENT
            startTimeUnixNano: msToUnixNanoString(wf.startTimeUnixMs),
            endTimeUnixNano: msToUnixNanoString(wf.startTimeUnixMs + wf.durationMs),
            attributes: toOtlpKeyValues({
                'mj.source': 'client',
                'graphql.operation.name': wf.operationName,
                'graphql.operation.type': wf.operationKind,
                'http.request_content_length': wf.requestBytes,
                'http.response_content_length': wf.responseBytes,
                'mj.retry_count': wf.retryCount,
            }),
            status: {
                code: wf.status === 'error' ? 2 : 1,
                ...(wf.errorMessage ? { message: wf.errorMessage } : {}),
            },
        });
    }

    for (const s of data.serverTraces) {
        spans.push({
            traceId: s.traceId.padEnd(32, '0').slice(0, 32),
            spanId: s.spanId.padEnd(16, '0').slice(0, 16),
            ...(s.parentSpanId ? { parentSpanId: s.parentSpanId.padEnd(16, '0').slice(0, 16) } : {}),
            name: s.name,
            kind: s.layer === 'http' || s.layer === 'graphql' ? 2 : 1,
            startTimeUnixNano: msToUnixNanoString(s.startTimeUnixMs),
            endTimeUnixNano: msToUnixNanoString(s.startTimeUnixMs + s.durationMs),
            attributes: toOtlpKeyValues({
                'mj.source': 'server',
                'mj.layer': s.layer,
                ...s.attributes,
            }),
            status: {
                code: s.status === 'error' ? 2 : 1,
                ...(s.errorMessage ? { message: s.errorMessage } : {}),
            },
        });
    }

    return {
        resourceSpans: [
            {
                resource: {
                    attributes: toOtlpKeyValues({
                        'service.name': 'memberjunction',
                        'service.version': data.environment.mjVersion,
                    }),
                },
                scopeSpans: [
                    {
                        scope: { name: '@memberjunction/diagnostics', version: '1.0.0' },
                        spans,
                    },
                ],
            },
        ],
    };
}
