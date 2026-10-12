/**
 * payload-audit.test.ts — regression guard for reading the payload-guard audit trail off agent steps.
 *
 * base-agent persists each step's payload change as `OutputData.payloadChangeResult`, shaped by
 * PayloadManager's `PayloadChangeResultSummary` — camelCase keys (`payloadValidation`,
 * `upstreamMergeViolations`, `selfWriteViolations`, `warnings`). The harness used to hand-copy that
 * shape, and a repo-wide naming refactor renamed the copy's `payloadValidation`/`warnings` to
 * PascalCase. Nothing failed to compile — the copy was only ever applied to `JSON.parse` output — so
 * every read came back undefined and IT56 PG2/PG7 reported "the blocked op was not recorded" on runs
 * that had recorded it.
 *
 * The fixtures below are typed against the product's own `PayloadChangeResultSummary`, so a change
 * to what base-agent persists breaks this file at compile time instead of breaking a live run.
 */
import { describe, it, expect } from 'vitest';
import type { PayloadChangeResultSummary } from '@memberjunction/ai-agents';
import { ReadPayloadAudit, type AgentStepRow } from '../checks/_it-live-agent-harness';

const AT = '2026-09-29T19:41:00.000Z';

function stepWith(summary: PayloadChangeResultSummary | null, outputData?: string): AgentStepRow {
    return {
        ID: 'step-1',
        StepType: 'Sub-Agent',
        Status: 'Completed',
        TargetLogID: null,
        PayloadAtStart: null,
        PayloadAtEnd: null,
        OutputData: outputData ?? (summary ? JSON.stringify({ payloadChangeResult: summary, context: { success: true } }) : null),
        ErrorMessage: null,
        FinalPayloadValidationMessages: null,
    };
}

function summary(extra: Partial<PayloadChangeResultSummary>): PayloadChangeResultSummary {
    return {
        applied: { additions: 1, updates: 0, deletions: 0 },
        warnings: [],
        requiresFeedback: false,
        timestamp: AT,
        ...extra,
    };
}

describe('ReadPayloadAudit', () => {
    it('reads the upstream-merge violations base-agent records on a Sub-Agent step', () => {
        const step = stepWith(summary({
            payloadValidation: {
                upstreamMergeViolations: {
                    subAgentName: 'IT: Payload Child',
                    attemptedOperations: [{ path: 'secret.leak', operation: 'add', reason: 'not authorized', timestamp: AT }],
                    authorizedPaths: ['analysis.*'],
                    timestamp: AT,
                },
            },
        }));

        const audit = ReadPayloadAudit([step]);

        expect(audit.UpstreamAttempted.map((o) => o.path)).toEqual(['secret.leak']);
        expect(audit.SelfWriteDenied).toEqual([]);
    });

    it('reads the self-write denials base-agent records on a Prompt step', () => {
        const step = stepWith(summary({
            payloadValidation: {
                selfWriteViolations: {
                    deniedOperations: [{ path: 'config.b', operation: 'add', reason: "operation 'add' not allowed", timestamp: AT }],
                    timestamp: AT,
                },
            },
        }));

        const audit = ReadPayloadAudit([step]);

        expect(audit.SelfWriteDenied.map((o) => o.path)).toEqual(['config.b']);
        expect(audit.UpstreamAttempted).toEqual([]);
    });

    it('collects warnings across every step', () => {
        const audit = ReadPayloadAudit([
            stepWith(summary({ warnings: ["Operation denied: Cannot add 'sources'"] })),
            stepWith(summary({ warnings: ['second'] })),
        ]);

        expect(audit.Warnings).toEqual(["Operation denied: Cannot add 'sources'", 'second']);
    });

    it('treats steps with no payload change as contributing nothing', () => {
        const audit = ReadPayloadAudit([stepWith(null), stepWith(null, JSON.stringify({ context: { success: true } }))]);

        expect(audit).toEqual({ UpstreamAttempted: [], SelfWriteDenied: [], Warnings: [] });
    });
});
