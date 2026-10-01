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

    it('keeps Human, AI, and Self columns when nobody has scored', () => {
        const host = render(component => { component.Keys = ['clarity']; });
        const heads = [...host.querySelectorAll('.matrix-head')].map(cell => cell.textContent?.trim());
        expect(heads).toEqual(['Criterion', 'Human', 'AI Evaluator', 'Agent Self-Check']);
        expect(host.textContent).toContain('No score yet');
        expect(host.textContent).toContain('Disabled');
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
