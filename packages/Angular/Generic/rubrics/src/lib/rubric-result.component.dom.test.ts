import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricResultComponent } from './rubric-result.component';
import { draft, passedResult } from './dom-fixture';

describe('RubricResultComponent (DOM)', () => {
    function render(setup: (component: RubricResultComponent) => void): HTMLElement {
        const fixture = TestBed.createComponent(RubricResultComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('renders no score until a result is supplied', () => {
        const host = render(() => undefined);
        expect(host.querySelector('.cockpit')).toBeNull();
    });

    it('shows the display score, the band, and that the gate was met', () => {
        const host = render(component => {
            component.Version = draft();
            component.Result = passedResult();
        });
        expect(host.querySelector('h2')?.textContent).toBe('Passed');
        expect(host.textContent).toContain('100');
        expect(host.textContent).toContain('Band Good');
        expect(host.textContent).toContain('Gate met');
    });

    it('names the criterion and shows the saved rationale', () => {
        const host = render(component => {
            component.Version = draft();
            component.Result = passedResult();
            component.Answers = [{ criterionId: 'clarity', rationale: 'Easy to follow.' }];
        });
        expect(host.textContent).toContain('Clarity');
        expect(host.textContent).toContain('Weight 1');
        expect(host.textContent).toContain('Meets');
        expect(host.textContent).toContain('Easy to follow.');
        expect(host.querySelector('.rubric-bar')?.getAttribute('style')).toContain('100%');
    });

    it('says the gate was not met when the result failed it', () => {
        const result = passedResult();
        result.gateFailed = true;
        result.outcome = 'Failed';
        const host = render(component => {
            component.Version = draft();
            component.Result = result;
        });
        expect(host.textContent).toContain('Gate not met');
        expect(host.querySelector('.fact-gate')).not.toBeNull();
    });
});
