import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricPublishDialogComponent } from './publish-dialog.component';
import { draft } from './dom-fixture';

describe('RubricPublishDialogComponent (DOM)', () => {
    function render(setup: (component: RubricPublishDialogComponent) => void) {
        const fixture = TestBed.createComponent(RubricPublishDialogComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return { fixture, host: fixture.nativeElement as HTMLElement };
    }

    it('explains a first publish and confirms without sending Initial as the bump', () => {
        const events: { bump: string | null; summary: string }[] = [];
        const { fixture, host } = render(component => { component.Draft = draft(); });
        fixture.componentInstance.Confirm.subscribe(event => events.push(event));
        expect(host.textContent).toContain('This is the first publish');
        (host.querySelector('button') as HTMLButtonElement).click();
        expect(events).toEqual([{ bump: null, summary: '' }]);
    });

    it('disables publish when the draft matches the base', () => {
        const events: unknown[] = [];
        const same = draft();
        const { fixture, host } = render(component => {
            component.Base = same;
            component.Draft = same;
        });
        fixture.componentInstance.Confirm.subscribe(event => events.push(event));
        const button = host.querySelector('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(host.textContent).toContain('nothing to publish');
        button.click();
        expect(events).toEqual([]);
    });

    it('emits the higher bump the author picked and the summary they typed', () => {
        const bumps: (string | null)[] = [];
        const summaries: string[] = [];
        const { fixture, host } = render(component => {
            component.Base = draft(1, null);
            component.Draft = draft(1, 'Clearer instructions');
        });
        fixture.componentInstance.RequestedBumpChange.subscribe(value => bumps.push(value));
        fixture.componentInstance.SummaryChange.subscribe(value => summaries.push(value));
        const select = host.querySelector('select') as HTMLSelectElement;
        select.value = 'Major';
        select.dispatchEvent(new Event('change'));
        const notes = host.querySelector('textarea') as HTMLTextAreaElement;
        notes.value = 'Scores still compare.';
        notes.dispatchEvent(new Event('input'));
        expect(bumps).toEqual(['Major']);
        expect(summaries).toEqual(['Scores still compare.']);
        expect(host.textContent).toContain('Instructions changed');
    });
});
