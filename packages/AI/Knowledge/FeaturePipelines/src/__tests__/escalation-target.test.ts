import { describe, it, expect } from 'vitest';
import type { DataFeatureOutput, DataFeatureSpec } from '../spec/data-feature-spec.js';
import {
    FindEscalationTargetRowProblem,
    FindEscalationTargetSpecProblem,
    FindOutputByName,
    DescribeMissingOutput,
    SameTarget,
    DescribeTarget,
    type MinimalEscalationTargetRow,
} from '../spec/escalation-target.js';

describe('escalation-target validation', () => {
    const entityID = '11111111-2222-3333-4444-555555555555';

    function validRow(overrides: Partial<MinimalEscalationTargetRow> = {}): MinimalEscalationTargetRow {
        return {
            ID: 'target-1',
            Name: 'Target Pipeline',
            WorkType: 'Infer',
            Status: 'Active',
            EntityID: entityID,
            Entity: 'Contacts',
            PromptID: 'prompt-1',
            ...overrides,
        };
    }

    function outputs(): DataFeatureOutput[] {
        return [
            {
                Name: 'Seniority',
                Ref: '$.seniority',
                Target: { Mode: 'field', EntityFieldName: 'SeniorityLevel' },
            },
            {
                Name: 'IsVIP',
                Ref: '$.isVIP',
                Target: { Mode: 'field', EntityFieldName: 'IsVIP' },
            },
        ];
    }

    function llmSpec(overrides: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
        return {
            Name: 'LLM Target Pipeline',
            Description: 'LLM fallback',
            PromptID: 'prompt-1',
            Context: {},
            Outputs: outputs(),
            Caching: { Cacheable: false },
            ...overrides,
        };
    }

    describe('FindEscalationTargetRowProblem', () => {
        it('accepts an active Infer pipeline on the same entity', () => {
            expect(FindEscalationTargetRowProblem(validRow(), entityID)).toBeNull();
        });

        it('rejects a pipeline with non-Infer WorkType', () => {
            const row = validRow({ WorkType: 'Batch' });
            expect(FindEscalationTargetRowProblem(row, entityID)).toBe(
                "has WorkType 'Batch'; only an Infer Feature Pipeline can be escalated to"
            );
        });

        it('rejects a pipeline with non-Active Status', () => {
            const row = validRow({ Status: 'Draft' });
            expect(FindEscalationTargetRowProblem(row, entityID)).toBe(
                "is Draft; only an Active pipeline can be escalated to"
            );
        });

        it('rejects a pipeline on a different entity', () => {
            const row = validRow({
                EntityID: '99999999-9999-9999-9999-999999999999',
                Entity: 'Accounts',
            });
            expect(FindEscalationTargetRowProblem(row, entityID)).toBe(
                "is on entity 'Accounts' (99999999-9999-9999-9999-999999999999), not the Decision pipeline's entity (11111111-2222-3333-4444-555555555555)"
            );
        });

        it('rejects a pipeline with no PromptID, which the engine cannot build', () => {
            const expected = 'has no PromptID; an Infer pipeline needs a prompt to run';
            expect(FindEscalationTargetRowProblem(validRow({ PromptID: null }), entityID)).toBe(expected);
            expect(FindEscalationTargetRowProblem(validRow({ PromptID: '' }), entityID)).toBe(expected);
        });
    });

    describe('FindEscalationTargetSpecProblem', () => {
        it('accepts an LLM pipeline producing matching outputs', () => {
            expect(FindEscalationTargetSpecProblem(llmSpec(), outputs())).toBeNull();
        });

        it('accepts an LLM pipeline with explicit PipelineType llm', () => {
            expect(FindEscalationTargetSpecProblem(llmSpec({ PipelineType: 'llm' }), outputs())).toBeNull();
        });

        it('rejects a non-LLM PipelineType (e.g. Decision)', () => {
            const spec = llmSpec({ PipelineType: 'Decision' });
            expect(FindEscalationTargetSpecProblem(spec, outputs())).toBe(
                "is a 'Decision' pipeline; only an LLM pipeline can be escalated to"
            );
        });

        it('treats a target without a spec as producing no outputs', () => {
            expect(FindEscalationTargetSpecProblem(undefined, outputs())).toBe(
                "does not produce every output of the Decision pipeline: it has no output named 'Seniority'; it has no output named 'IsVIP'"
            );
        });

        it('matches output names case-insensitively', () => {
            const renamed = outputs().map((o) => ({ ...o, Name: o.Name.toUpperCase() }));
            expect(FindEscalationTargetSpecProblem(llmSpec({ Outputs: renamed }), outputs())).toBeNull();
        });

        it('rejects when target is missing an output', () => {
            const spec = llmSpec({ Outputs: [outputs()[0]] });
            expect(FindEscalationTargetSpecProblem(spec, outputs())).toBe(
                "does not produce every output of the Decision pipeline: it has no output named 'IsVIP'"
            );
        });

        it('rejects when target writes an output to a different field', () => {
            const modified = outputs();
            modified[0] = {
                ...modified[0],
                Target: { Mode: 'field', EntityFieldName: 'DifferentField' },
            };
            const spec = llmSpec({ Outputs: modified });
            expect(FindEscalationTargetSpecProblem(spec, outputs())).toBe(
                "does not produce every output of the Decision pipeline: its output 'Seniority' targets field 'DifferentField', not field 'SeniorityLevel'"
            );
        });

        it('rejects when target has a different mode for an output', () => {
            const modified = outputs();
            modified[1] = {
                ...modified[1],
                Target: { Mode: 'child', EntityName: 'VIPStatus' },
            };
            const spec = llmSpec({ Outputs: modified });
            expect(FindEscalationTargetSpecProblem(spec, outputs())).toBe(
                "does not produce every output of the Decision pipeline: its output 'IsVIP' targets mode 'child', not field 'IsVIP'"
            );
        });
    });

    describe('helpers', () => {
        it('FindOutputByName searches case-insensitively with trimming', () => {
            const list = outputs();
            expect(FindOutputByName(list, ' seniority ')).toEqual(list[0]);
            expect(FindOutputByName(list, 'ISVIP')).toEqual(list[1]);
            expect(FindOutputByName(list, 'NotFound')).toBeUndefined();
        });

        it('SameTarget compares modes and field names', () => {
            expect(SameTarget({ Mode: 'field', EntityFieldName: 'Col' }, { Mode: 'field', EntityFieldName: 'col' })).toBe(true);
            expect(SameTarget({ Mode: 'field', EntityFieldName: 'Col' }, { Mode: 'field', EntityFieldName: 'Other' })).toBe(false);
            expect(SameTarget({ Mode: 'field', EntityFieldName: 'Col' }, { Mode: 'tags', RootTagID: 'tag-1' })).toBe(false);
            expect(SameTarget(undefined, { Mode: 'field' })).toBe(false);
        });

        it('DescribeTarget formats target modes and field names', () => {
            expect(DescribeTarget({ Mode: 'field', EntityFieldName: 'Test' })).toBe("field 'Test'");
            expect(DescribeTarget({ Mode: 'tags', RootTagID: 'tag-1' })).toBe("mode 'tags'");
            expect(DescribeTarget(undefined)).toBe('nothing');
        });

        it('DescribeMissingOutput identifies missing and mismatched targets', () => {
            const list = outputs();
            expect(DescribeMissingOutput({ Name: 'Absent', Ref: '$', Target: { Mode: 'field' } }, list)).toBe("it has no output named 'Absent'");
            expect(DescribeMissingOutput({ Name: 'Seniority', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'Other' } }, list)).toBe(
                "its output 'Seniority' targets field 'SeniorityLevel', not field 'Other'"
            );
            expect(DescribeMissingOutput(list[0], list)).toBeNull();
        });
    });
});
