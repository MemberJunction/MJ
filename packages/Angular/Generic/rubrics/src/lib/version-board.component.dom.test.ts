import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RubricVersionBoardComponent, type RubricVersionCard } from './version-board.component';

const card: RubricVersionCard = {
    id: 'version-1',
    status: 'Published',
    label: '1.0.0',
    bump: 'Initial',
    threshold: '0.7',
    criteria: 3,
    gates: 1,
    bands: 'Good 0.5–1',
    summary: 'First publish.',
};

describe('RubricVersionBoardComponent (DOM)', () => {
    function render(cards: RubricVersionCard[]) {
        const fixture = TestBed.createComponent(RubricVersionBoardComponent);
        fixture.componentInstance.Cards = cards;
        fixture.detectChanges();
        return { fixture, host: fixture.nativeElement as HTMLElement };
    }

    it('says when the rubric has no versions', () => {
        const { host } = render([]);
        expect(host.textContent).toContain('no versions yet');
        expect(host.querySelector('article')).toBeNull();
    });

    it('shows the version facts without opening the row', () => {
        const { host } = render([card]);
        expect(host.querySelector('h3')?.textContent).toBe('1.0.0');
        expect(host.textContent).toContain('Published');
        expect(host.textContent).toContain('3 criteria');
        expect(host.textContent).toContain('1 gates');
        expect(host.textContent).toContain('Bands: Good 0.5–1');
        expect(host.textContent).toContain('First publish.');
    });

    it('emits the version id when Open is clicked', () => {
        const opened: string[] = [];
        const { fixture, host } = render([card]);
        fixture.componentInstance.Open.subscribe(id => opened.push(id));
        (host.querySelector('button') as HTMLButtonElement).click();
        expect(opened).toEqual(['version-1']);
    });
});
