/**
 * read-steps.test.ts — ReadSteps returns every step's start payload.
 *
 * A step whose start payload equals an earlier step's end payload stores `PayloadAtStart = NULL` and
 * points at that step with `PayloadAtStartSourceStepID`. ReadSteps must select the pointer and fill
 * the start from it; otherwise checks that compare start and end payloads (PG8) read an empty start.
 */
import { describe, it, expect, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ReadSteps, type AgentStepRow } from '../checks/_it-live-agent-harness';

const RUN_ID = '0C5D2A61-3E4F-4B7A-9C8D-1E2F3A4B5C6D';
const SOURCE_ID = 'A1B2C3D4-0000-4000-8000-000000000001';

function step(id: string, start: string | null, sourceId: string | null, end: string | null): AgentStepRow {
    return {
        ID: id,
        StepType: 'Prompt',
        Status: 'Completed',
        TargetID: null,
        TargetLogID: null,
        PayloadAtStart: start,
        PayloadAtStartSourceStepID: sourceId,
        PayloadAtEnd: end,
        OutputData: null,
        ErrorMessage: null,
        FinalPayloadValidationMessages: null,
    };
}

/** The row a SELECT of `fields` returns: only those columns, or every column when none are named. */
function selectFields(row: AgentStepRow, fields: string[] | undefined): Record<string, string | null> {
    const columns: Record<string, string | null> = { ...row };
    if (!fields) {
        return columns;
    }
    return Object.fromEntries(fields.map((field): [string, string | null] => [field, columns[field] ?? null]));
}

/** Answers every RunView the way the database would for these stored rows. */
function answerLikeTheDatabase(stored: AgentStepRow[]): void {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
        const rows = stored.map((row) => selectFields(row, params.Fields));
        const result: RunViewResult<Record<string, string | null>> = {
            Success: true,
            Results: rows,
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 0,
            ErrorMessage: '',
        };
        return result;
    });
}

describe('ReadSteps', () => {
    it('fills a pointing step from the end payload of the step it points at', async () => {
        answerLikeTheDatabase([
            step(SOURCE_ID, '{"turn":0}', null, '{"turn":1}'),
            // Pointer in lower case: the match must not depend on UUID casing.
            step('A1B2C3D4-0000-4000-8000-000000000002', null, SOURCE_ID.toLowerCase(), '{"turn":2}'),
            step('A1B2C3D4-0000-4000-8000-000000000003', null, null, null),
        ]);

        const steps = await ReadSteps({} as IMetadataProvider, {} as UserInfo, RUN_ID);

        expect(steps.map((s) => s.PayloadAtStart)).toEqual(['{"turn":0}', '{"turn":1}', null]);
        expect(steps[1].PayloadAtStartSourceStepID).toBe(SOURCE_ID.toLowerCase());
    });

    it('returns the TargetID of each step, the child agent ID on a Sub-Agent step', async () => {
        const childAgentId = 'C0FFEE00-0000-4000-8000-000000000009';
        answerLikeTheDatabase([
            { ...step(SOURCE_ID, '{}', null, '{}'), StepType: 'Sub-Agent', TargetID: childAgentId, TargetLogID: 'child-run-1' },
        ]);

        const steps = await ReadSteps({} as IMetadataProvider, {} as UserInfo, RUN_ID);

        expect(steps[0].TargetID).toBe(childAgentId);
    });
});
