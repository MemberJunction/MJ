import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { RubricComparisonMatrixComponent } from './comparison-matrix.component';

describe('RubricComparisonMatrixComponent (DOM)', () => {
    function render(setup: (component: RubricComparisonMatrixComponent) => void): HTMLElement {
        const fixture = TestBed.createComponent(RubricComparisonMatrixComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('shows one column per evaluation, including AIPrompt and Agent', () => {
        const host = render(component => {
            component.Keys = ['clarity'];
            component.Columns = [
                { id: 'prompt', name: 'AI Prompt', evaluatorType: 'AIPrompt', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 1 }] },
                { id: 'agent', name: 'Agent', evaluatorType: 'Agent', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 0 }] },
            ];
        });
        const heads = Array.from(host.querySelectorAll('.matrix-head')).map(cell => cell.textContent?.trim());
        expect(heads).toEqual(['Criterion', 'AI Prompt', 'Agent']);
        expect(host.textContent).not.toContain('AI Evaluator');
        expect(host.querySelectorAll('.matrix-disagree')).toHaveLength(2);
        expect(host.textContent).toContain('AI mean 0.5');
        expect(host.textContent).toContain('Self mean');
    });

    it('shows a human score and its rationale', () => {
        const host = render(component => {
            component.Keys = ['clarity'];
            component.Columns = [{
                id: 'human',
                name: 'Ada',
                evaluatorType: 'Human',
                status: 'Submitted',
                scores: [{ key: 'clarity', normalizedScore: 1, rationale: 'The figure is right.' }],
            }];
        });
        expect(host.textContent).toContain('Ada');
        expect(host.textContent).toContain('1');
        expect(host.textContent).toContain('The figure is right.');
    });

    it('hides cohort figures and peer rationales while the viewer is still drafting', () => {
        const host = render(component => {
            component.Keys = ['clarity'];
            component.ViewerStatus = 'Draft';
            component.ViewerEvaluationId = 'mine';
            component.CohortMean = 0.4;
            component.Columns = [
                { id: 'mine', name: 'Me', evaluatorType: 'Human', status: 'Draft', scores: [{ key: 'clarity', normalizedScore: 1, rationale: 'My note.' }] },
                { id: 'peer', name: 'Ada', evaluatorType: 'Human', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 0, rationale: 'Peer note.' }] },
            ];
        });
        expect(host.textContent).toContain('My note.');
        expect(host.textContent).not.toContain('Peer note.');
        expect(host.textContent).not.toContain('Cohort mean');
        expect(host.textContent).not.toContain('Human mean');
    });

    it('leaves an unanswered criterion empty beside a scored one', () => {
        const host = render(component => {
            component.Keys = ['clarity', 'sourcing'];
            component.Columns = [{
                id: 'human',
                name: 'Ada',
                evaluatorType: 'Human',
                status: 'Submitted',
                scores: [{ key: 'clarity', normalizedScore: 0 }],
            }];
        });
        expect(host.textContent).toContain('sourcing');
        expect(host.textContent).toContain('0');
        expect(host.textContent).toContain('No score yet');
    });
});

/**
 * Loading the cohort. The scores are read by the IDs of the evaluations the viewer could read,
 * never through a subquery over the evaluations view: a subquery skips that entity's row filter,
 * and the server refuses one for a viewer whose read of evaluations is row-filtered.
 */
describe('RubricComparisonMatrixComponent loading', () => {
    /** A provider that records every view it runs and answers with the rows given per entity. */
    function provider(rows: Record<string, Record<string, unknown>[]>): { provider: IMetadataProvider; calls: RunViewParams[] } {
        const calls: RunViewParams[] = [];
        const runView = async (params: RunViewParams): Promise<RunViewResult> => {
            calls.push(params);
            return { Success: true, Results: rows[params.EntityName ?? ''] ?? [] } as RunViewResult;
        };
        const double = {
            CurrentUser: { ID: 'viewer-1' },
            RunView: runView,
            RunViews: (list: RunViewParams[]) => Promise.all(list.map(runView)),
        };
        return { provider: double as unknown as IMetadataProvider, calls };
    }

    function matrix(source: IMetadataProvider): RubricComparisonMatrixComponent {
        const component = TestBed.createComponent(RubricComparisonMatrixComponent).componentInstance;
        component.Provider = source;
        component.RubricId = 'rubric-1';
        component.Major = 2;
        component.SubjectEntityId = 'entity-1';
        return component;
    }

    it('reads the scores by the IDs of the evaluations it loaded, with no subquery', async () => {
        const { provider: source, calls } = provider({
            'MJ: Rubric Evaluations': [
                { ID: 'eval-1', EvaluatorType: 'Human', EvaluatorUser: 'Ada', Status: 'Submitted' },
                { ID: 'eval-2', EvaluatorType: 'AIPrompt', Status: 'Submitted' },
            ],
            'MJ: Rubric Evaluation Scores': [{ EvaluationID: 'eval-1', CriterionKey: 'clarity', NormalizedScore: 1 }],
        });
        const component = matrix(source);

        await component.ngOnChanges();

        expect(calls.map(call => call.EntityName)).toEqual(['MJ: Rubric Evaluations', 'MJ: Rubric Evaluation Scores']);
        expect(calls[1].ExtraFilter).toBe("IsComputed=0 AND EvaluationID IN ('eval-1','eval-2')");
        for (const call of calls) {
            expect(String(call.ExtraFilter)).not.toMatch(/SELECT/i);
        }
        expect(component.Shown.map(column => column.id)).toEqual(['eval-1', 'eval-2']);
        expect(component.Shown[0].scores.map(score => score.key)).toEqual(['clarity']);
    });

    it('does not read scores when the viewer can read no evaluation', async () => {
        const { provider: source, calls } = provider({});
        const component = matrix(source);

        await component.ngOnChanges();

        expect(calls.map(call => call.EntityName)).toEqual(['MJ: Rubric Evaluations']);
        expect(component.Shown).toEqual([]);
    });
});
