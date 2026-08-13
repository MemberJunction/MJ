import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskGraphDebugToolbarComponent } from './task-graph-debug-toolbar.component';

describe('TaskGraphDebugToolbarComponent', () => {
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
});
