import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphDebugToolbarComponent } from './task-graph-debug-toolbar.component';

/**
 * DOM spec for `<mj-task-graph-debug-toolbar>`.
 *
 * The bar is intent-only: Continue / Over / Into / Pause / Stop must render from
 * Paused/Settled and emit Resume / Step / StepWave / Pause / Cancel. Class tests
 * cannot see which aria-label is on the screen.
 */
describe('TaskGraphDebugToolbarComponent (DOM)', () => {
    let fixture: ComponentFixture<TaskGraphDebugToolbarComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({ imports: [TaskGraphDebugToolbarComponent] }).compileComponents();
        fixture = TestBed.createComponent(TaskGraphDebugToolbarComponent);
    });

    const host = () => fixture.nativeElement as HTMLElement;

    it('shows Pause when running, and Continue + Step when paused', () => {
        fixture.componentRef.setInput('Paused', false);
        fixture.detectChanges();
        expect(host().querySelector('[aria-label="Pause"]')).toBeTruthy();
        expect(host().querySelector('[aria-label="Continue"]')).toBeNull();
        expect(host().textContent).not.toContain('Resume');

        fixture.componentRef.setInput('Paused', true);
        fixture.detectChanges();
        expect(host().querySelector('[aria-label="Continue"]')).toBeTruthy();
        expect(host().querySelector('[aria-label="Step over"]')).toBeTruthy();
        expect(host().querySelector('[aria-label="Step into"]')).toBeTruthy();
        expect(host().querySelector('[aria-label="Pause"]')).toBeNull();
        expect(host().textContent).toContain('Paused');
        expect(host().textContent).toContain('Over');
        expect(host().textContent).toContain('Into');
    });

    it('shows Finished and hides Play/Step when the run has settled', () => {
        fixture.componentRef.setInput('Paused', true);
        fixture.componentRef.setInput('Settled', true);
        fixture.detectChanges();
        expect(host().textContent).toContain('Finished');
        expect(host().querySelector('[aria-label="Continue"]')).toBeNull();
        expect(host().querySelector('[aria-label="Step over"]')).toBeNull();
    });

    it('emits intent only — Continue clicks do not call a transport', () => {
        fixture.componentRef.setInput('Paused', true);
        fixture.detectChanges();
        const events: string[] = [];
        fixture.componentInstance.Resume.subscribe(() => events.push('resume'));
        host().querySelector<HTMLButtonElement>('[aria-label="Continue"]')?.click();
        expect(events).toEqual(['resume']);
    });

    it('emits Step, StepWave, and Cancel from the matching buttons', () => {
        fixture.componentRef.setInput('Paused', true);
        fixture.detectChanges();
        const events: string[] = [];
        fixture.componentInstance.Step.subscribe(() => events.push('step'));
        fixture.componentInstance.StepWave.subscribe(() => events.push('wave'));
        fixture.componentInstance.Cancel.subscribe(() => events.push('cancel'));
        host().querySelector<HTMLButtonElement>('[aria-label="Step over"]')?.click();
        host().querySelector<HTMLButtonElement>('[aria-label="Step into"]')?.click();
        host().querySelector<HTMLButtonElement>('[aria-label="Stop"]')?.click();
        expect(events).toEqual(['step', 'wave', 'cancel']);
    });

    it('emits Pause while the graph is running', () => {
        fixture.componentRef.setInput('Paused', false);
        fixture.detectChanges();
        const events: string[] = [];
        fixture.componentInstance.Pause.subscribe(() => events.push('pause'));
        host().querySelector<HTMLButtonElement>('[aria-label="Pause"]')?.click();
        expect(events).toEqual(['pause']);
    });
});
