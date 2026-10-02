import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
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
        const heads = [...host.querySelectorAll('.matrix-head')].map(cell => cell.textContent?.trim());
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
