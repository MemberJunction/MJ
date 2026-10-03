import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricVersionDiffComponent } from './version-diff.component';
import { Draft } from './dom-fixture';

describe('RubricVersionDiffComponent (DOM)', () => {
    function render(setup: (component: RubricVersionDiffComponent) => void): HTMLElement {
        const fixture = TestBed.createComponent(RubricVersionDiffComponent);
        setup(fixture.componentInstance);
        fixture.detectChanges();
        return fixture.nativeElement as HTMLElement;
    }

    it('names the draft when there is no published base', () => {
        const host = render(component => { component.Draft = Draft(); });
        expect(host.querySelector('h2')?.textContent).toContain('This version');
        expect(host.textContent).toContain('Weight 1');
        expect(host.querySelectorAll('.diff-side').length).toBe(1);
    });

    it('shows both weights and says the weight changed', () => {
        const host = render(component => {
            component.Base = { ...Draft(1), majorVersion: 1, minorVersion: 0, patchVersion: 0 };
            component.Draft = Draft(2);
        });
        expect(host.textContent).toContain('Weight 1');
        expect(host.textContent).toContain('Weight 2');
        expect(host.querySelector('.mark')?.textContent).toContain('The weight changed');
    });

    it('shows version, group, band-range, and added-band rows', () => {
        const base = Draft();
        base.passThreshold = 0.5;
        base.nodes = [
            { id: 'quality', key: 'quality', name: 'Quality', nodeType: 'Group', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
            { ...base.nodes[0], parentId: 'quality' },
        ];
        const next = Draft();
        next.passThreshold = 0.8;
        next.nodes = [
            { id: 'quality', key: 'quality', name: 'Quality', nodeType: 'Group', weight: 2, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0 },
            { ...next.nodes[0], parentId: 'quality' },
        ];
        next.bands = [
            { ...next.bands[0], maxScore: 0.8 },
            { id: 'ok', label: 'Okay', minScore: 0, maxScore: 0.4, displayTone: 'Warning', sequence: 1 },
        ];
        const host = render(component => {
            component.Base = base;
            component.Draft = next;
        });
        expect(host.querySelector('[aria-label="Version"]')?.textContent).toContain('The pass threshold changed');
        expect(host.querySelector('[aria-label="Group"]')?.textContent).toContain('Group: Quality');
        expect(host.querySelector('[aria-label="Group"]')?.textContent).toContain('The weight changed');
        expect(host.querySelector('[aria-label="Band range"]')?.textContent).toContain('The band range changed');
        expect(host.querySelector('[aria-label="Added band"]')?.textContent).toContain('Okay');
        expect(host.querySelector('[aria-label="Added band"]')?.textContent).toContain('Added in draft');
    });

    it('says a band that is only on the base was removed', () => {
        const base = Draft();
        const next = Draft();
        next.bands = [];
        const host = render(component => {
            component.Base = base;
            component.Draft = next;
        });
        expect(host.textContent).toContain('Removed in draft');
        expect(host.textContent).toContain('Good is not on the draft');
    });
});
