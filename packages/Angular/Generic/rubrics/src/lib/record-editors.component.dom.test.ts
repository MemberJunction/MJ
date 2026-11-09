import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricCriterionEditorComponent } from './record-editors.component';

describe('RubricCriterionEditorComponent (DOM)', () => {
    function render(setup: (component: RubricCriterionEditorComponent) => void) {
        const fixture = TestBed.createComponent(RubricCriterionEditorComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return { fixture, host: fixture.nativeElement as HTMLElement };
    }

    it('shows the weight share and emits a new weight', () => {
        const weights: number[] = [];
        const { fixture, host } = render(component => {
            component.Weight = 1;
            component.Share = 40;
        });
        fixture.componentInstance.WeightChange.subscribe(value => weights.push(value));
        expect(host.textContent).toContain('40%');
        const input = host.querySelector('input[type="number"]') as HTMLInputElement;
        input.value = '2';
        input.dispatchEvent(new Event('change'));
        expect(weights).toEqual([2]);
    });

    it('emits the chosen parent', () => {
        const parents: (string | null)[] = [];
        const { fixture, host } = render(component => {
            component.Parents = [{ id: 'group', name: 'Quality' }];
        });
        fixture.componentInstance.ParentIdChange.subscribe(value => parents.push(value));
        const select = host.querySelector('select') as HTMLSelectElement;
        select.value = 'group';
        select.dispatchEvent(new Event('change'));
        expect(parents).toEqual(['group']);
    });

    it('shows the gate minimum only while the gate is on', () => {
        const off = render(component => { component.IsGate = false; });
        expect(off.host.querySelector('.gate-min')).toBeNull();
        off.fixture.destroy();
        const on = render(component => {
            component.IsGate = true;
            component.GateMinimumScore = 0.6;
        });
        expect(on.host.querySelector('.gate-min')).not.toBeNull();
        expect((on.host.querySelector('.gate-min input') as HTMLInputElement).value).toBe('0.6');
    });

    it('emits the anchor text for the selected scale level', () => {
        const anchors: { descriptor: string }[][] = [];
        const { fixture, host } = render(component => {
            component.ScaleId = 'scale';
            component.Scales = [{ id: 'scale', name: 'Meets', levels: [{ id: 'high', label: 'High' }] }];
        });
        fixture.componentInstance.AnchorsChange.subscribe(value => anchors.push(value));
        const input = host.querySelector('.anchor input') as HTMLInputElement;
        input.value = 'Easy to follow';
        input.dispatchEvent(new Event('change'));
        expect(anchors[0][0].descriptor).toBe('Easy to follow');
    });
});
