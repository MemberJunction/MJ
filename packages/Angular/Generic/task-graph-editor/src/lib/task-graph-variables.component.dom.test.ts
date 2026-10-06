import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphVariablesComponent } from './task-graph-variables.component';

/**
 * DOM spec for `<mj-task-graph-variables>`.
 *
 * Paint only. What a class test cannot see: the empty prompt, Input/Output scope
 * headings, and that clicking a scope head actually collapses the tree (aria-expanded).
 */
describe('TaskGraphVariablesComponent (DOM)', () => {
    function render(): ComponentFixture<TaskGraphVariablesComponent> {
        TestBed.configureTestingModule({ imports: [TaskGraphVariablesComponent] });
        return TestBed.createComponent(TaskGraphVariablesComponent);
    }

    const host = (f: ComponentFixture<TaskGraphVariablesComponent>) => f.nativeElement as HTMLElement;

    it('asks the operator to pick a step when there is nothing to inspect', () => {
        const f = render();
        f.detectChanges();
        expect(host(f).querySelector('.vars-empty')).toBeTruthy();
        expect(host(f).textContent).toContain('Select a step to inspect its input and output.');
        expect(host(f).querySelector('.vars-scope')).toBeNull();
    });

    it('renders Input and Output scopes from the payloads', () => {
        const f = render();
        f.componentRef.setInput('InputPayload', JSON.stringify({ ticker: 'NVDA' }));
        f.componentRef.setInput('OutputPayload', JSON.stringify({ stockPrice: 224.35 }));
        f.detectChanges();
        expect(host(f).querySelector('.vars-empty')).toBeNull();
        expect(host(f).textContent).toContain('Input');
        expect(host(f).textContent).toContain('ticker');
        expect(host(f).textContent).toContain('NVDA');
        expect(host(f).textContent).toContain('Output');
        expect(host(f).textContent).toContain('stockPrice');
    });

    it('collapses a scope on click so the tree is not permanently open', () => {
        const f = render();
        f.componentRef.setInput('InputPayload', JSON.stringify({ ticker: 'NVDA' }));
        f.detectChanges();
        const head = host(f).querySelector('.vars-scope-head') as HTMLButtonElement;
        expect(head).toBeTruthy();
        expect(head.getAttribute('aria-expanded')).toBe('true');
        expect(host(f).textContent).toContain('ticker');
        head.click();
        f.detectChanges();
        expect(head.getAttribute('aria-expanded')).toBe('false');
        expect(host(f).textContent).not.toContain('ticker');
    });
});
