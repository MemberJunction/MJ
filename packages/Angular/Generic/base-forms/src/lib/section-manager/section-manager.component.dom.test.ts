import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { MjSectionManagerComponent, SectionManagerItem } from './section-manager.component';

/**
 * DOM-level spec for <mj-section-manager> — the slide-in drawer that reorders
 * form sections. Pure @Input/@Output component (no projected children, no data
 * access), so it renders via renderComponentFixture with `declarations`. It
 * computes OrderedSections in ngOnChanges, so autoDetect is on.
 */
const SECTIONS: SectionManagerItem[] = [
  { SectionKey: 'a', SectionName: 'Alpha', Variant: 'default', Icon: 'fa fa-a' },
  { SectionKey: 'b', SectionName: 'Bravo', Variant: 'related-entity', Icon: 'fa fa-b' },
  { SectionKey: 'c', SectionName: 'Charlie', Variant: 'inherited', Icon: 'fa fa-c' },
];

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(MjSectionManagerComponent, {
    declarations: [MjSectionManagerComponent],
    inputs,
    autoDetect: true,
  });
}

describe('MjSectionManagerComponent (DOM)', () => {
  it('renders nothing when not Visible (@if gate)', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: false });
    expect(query(f, '.mj-sm-overlay')).toBeNull();
  });

  it('renders the overlay + drawer when Visible', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    expect(query(f, '.mj-sm-overlay')).not.toBeNull();
    expect(query(f, '.mj-sm-drawer')).not.toBeNull();
    expect(text(f, '.mj-sm-title')).toContain('Manage Sections');
  });

  it('renders one row per section with its name and variant badge label', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const rows = queryAll(f, '.mj-sm-row');
    expect(rows.length).toBe(3);

    const names = queryAll(f, '.mj-sm-row-name').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const badges = queryAll(f, '.mj-sm-row-badge').map((e) => e.textContent?.trim());
    expect(badges).toEqual(['Fields', 'Related', 'Inherited']);
  });

  it('orders rows by SectionOrder, appending unlisted sections last', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: ['c', 'a'], Visible: true });
    const names = queryAll(f, '.mj-sm-row-name').map((e) => e.textContent?.trim());
    expect(names).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('disables the up arrow on the first row and the down arrow on the last row', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const rows = queryAll(f, '.mj-sm-row');
    const firstUp = rows[0].querySelector('.mj-sm-arrow') as HTMLButtonElement;
    const lastDown = rows[2].querySelectorAll('.mj-sm-arrow')[1] as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
    expect(lastDown.disabled).toBe(true);
  });

  it('emits SectionOrderChange with the swapped order when moving a row down', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const emitted = capture(f.componentInstance.SectionOrderChange);

    // second arrow button (down) on the first row
    const firstRowArrows = queryAll(f, '.mj-sm-row')[0].querySelectorAll('.mj-sm-arrow');
    (firstRowArrows[1] as HTMLButtonElement).click();

    expect(emitted).toEqual([['b', 'a', 'c']]);
  });

  it('emits Closed when the close button is clicked', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const closed = capture(f.componentInstance.Closed);
    click(f, '.mj-sm-close');
    expect(closed.length).toBe(1);
  });

  it('emits Closed when the overlay backdrop (not the drawer) is clicked', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const closed = capture(f.componentInstance.Closed);
    click(f, '.mj-sm-overlay');
    expect(closed.length).toBe(1);
  });

  it('emits ResetRequested when the reset button is clicked', () => {
    const f = render({ Sections: SECTIONS, SectionOrder: [], Visible: true });
    const reset = capture(f.componentInstance.ResetRequested);
    click(f, '.mj-sm-reset');
    expect(reset.length).toBe(1);
  });
});
