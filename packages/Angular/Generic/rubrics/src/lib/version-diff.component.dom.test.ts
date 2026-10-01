import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricVersionDiffComponent } from './version-diff.component';
import { draft } from './dom-fixture';

describe('RubricVersionDiffComponent (DOM)', () => {
    function render(setup: (component: RubricVersionDiffComponent) => void): HTMLElement {
        const fixture = TestBed.createComponent(RubricVersionDiffComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('names the draft when there is no published base', () => {
        const host = render(component => { component.Draft = draft(); });
        expect(host.querySelector('h2')?.textContent).toContain('This version');
        expect(host.textContent).toContain('Weight 1');
        expect(host.querySelectorAll('.diff-side').length).toBe(1);
    });

    it('shows both weights and says the weight changed', () => {
        const host = render(component => {
            component.Base = { ...draft(1), majorVersion: 1, minorVersion: 0, patchVersion: 0 };
            component.Draft = draft(2);
        });
        expect(host.textContent).toContain('Weight 1');
        expect(host.textContent).toContain('Weight 2');
        expect(host.querySelector('.mark')?.textContent).toContain('The weight changed');
    });

    it('says a band that is only on the base was removed', () => {
        const base = draft();
        const next = draft();
        next.bands = [];
        const host = render(component => {
            component.Base = base;
            component.Draft = next;
        });
        expect(host.textContent).toContain('Removed in draft');
        expect(host.textContent).toContain('Good is not on the draft');
    });
});
