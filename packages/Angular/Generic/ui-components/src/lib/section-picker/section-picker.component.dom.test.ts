import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, click } from '@memberjunction/ng-test-utils';
import { MJSectionPickerComponent, SectionPickerItem, SectionPickerGroup } from './section-picker.component';
import { MJBottomSheetComponent } from '../bottom-sheet/bottom-sheet.component';

/**
 * DOM spec for <mj-section-picker> — the phone replacement for a section rail, tab strip or
 * icon rail: one full-width button naming the current section that opens a searchable
 * "Sections" bottom sheet listing every section (first-class items, then headed groups).
 * The sheet's open/close is transition-driven under jsdom, so the sheet body is forced to
 * render by setting the child sheet's `IsRendered` directly, the same way the sheet's own
 * spec does.
 */
describe('MJSectionPickerComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<MJSectionPickerComponent>>;

  const items: SectionPickerItem[] = [
    { Key: 'details', Title: 'Details', Icon: 'fa-solid fa-circle-info' },
    { Key: 'fields', Title: 'Fields', Icon: 'fa-solid fa-table-columns', Count: 81 },
    { Key: 'security', Title: 'Security', Icon: 'fa-solid fa-shield-halved', Count: 3, ErrorCount: 1 },
  ];
  const groups: SectionPickerGroup[] = [
    { Title: 'More', Items: [
      { Key: 'lineage', Title: 'Lineage', Icon: 'fa-solid fa-diagram-project' },
      { Key: 'history', Title: 'History', Icon: 'fa-solid fa-clock-rotate-left', DirtyCount: 2 },
    ] },
  ];

  const render = (inputs: Record<string, unknown> = {}): Fix =>
    renderComponentFixture(MJSectionPickerComponent, {
      inputs: { Items: items, Groups: groups, ActiveKey: 'fields', ...inputs },
    });

  /** Force the sheet body to exist so its rows can be asserted. */
  const openSheet = (f: Fix): void => {
    f.componentInstance.OpenSheet();
    const sheet = f.debugElement.query(By.directive(MJBottomSheetComponent)).componentInstance as MJBottomSheetComponent;
    sheet.IsRendered = true;
    f.detectChanges();
  };

  /** Press a key in the sheet's search box; returns the dispatched event so its default can be checked. */
  const pressInSearch = (f: Fix, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const input = query(f, '.mj-section-sheet-search') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(event);
    f.detectChanges();
    return event;
  };

  const rows = (f: Fix): HTMLElement[] => queryAll(f, '.mj-section-sheet-item') as HTMLElement[];
  /** A row's label and badges, space-joined (textContent runs adjacent spans together). */
  const rowText = (r: HTMLElement): string =>
    Array.from(r.children).map((c) => c.textContent?.trim() ?? '').filter((t) => t !== '').join(' ');

  it('renders one button naming the active section with its icon and count', () => {
    const f = render();
    const btn = query(f, 'button.mj-section-picker') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(text(f, '.mj-section-picker-title')).toBe('Fields');
    expect(query(f, '.mj-section-picker > i.fa-table-columns')).not.toBeNull();
    expect(text(f, '.mj-section-picker .mj-section-picker-count')).toBe('81');
    expect(attr(f, 'button.mj-section-picker', 'aria-haspopup')).toBe('dialog');
    expect(attr(f, 'button.mj-section-picker', 'aria-label')).toBe('Change section — Fields');
  });

  it('names the active section\'s status in the button\'s accessible name, which replaces its content', () => {
    expect(attr(render({ ActiveKey: 'security' }), 'button.mj-section-picker', 'aria-label')).toBe('Change section — Security, 1 error');
    expect(attr(render({ ActiveKey: 'history' }), 'button.mj-section-picker', 'aria-label')).toBe('Change section — History, 2 unsaved changes');
  });

  it('orders a sheet row\'s indicators like the button: unsaved dot, then error or warning, then count', () => {
    const f = render({ Groups: [{ Title: 'More', Items: [{ Key: 'x', Title: 'X', Count: 4, ErrorCount: 1, DirtyCount: 1 }] }] });
    openSheet(f);
    const row = query(f, '.mj-section-sheet-item[data-key="x"]') as HTMLElement;
    expect(Array.from(row.children).map((c) => c.className.split(' ')[0])).toEqual([
      'mj-section-sheet-label', 'mj-section-picker-dirty', 'mj-section-picker-error', 'mj-section-picker-count',
    ]);
  });

  it('shows the active section error and dirty indicators on the button', () => {
    const f = render({ ActiveKey: 'security' });
    expect(text(f, '.mj-section-picker .mj-section-picker-error')).toBe('1');
    const g = render({ ActiveKey: 'history' });
    expect(query(g, '.mj-section-picker .mj-section-picker-dirty')).not.toBeNull();
  });

  it('falls back to the first item when ActiveKey matches nothing', () => {
    const f = render({ ActiveKey: 'nope' });
    expect(text(f, '.mj-section-picker-title')).toBe('Details');
  });

  it('opens the sheet on click and lists first-class items, then each group under its heading', () => {
    const f = render();
    expect(f.componentInstance.SheetOpen).toBe(false);
    click(f, 'button.mj-section-picker');
    expect(f.componentInstance.SheetOpen).toBe(true);
    openSheet(f);
    expect(rows(f).map(rowText)).toEqual(['Details', 'Fields 81', 'Security 1 3', 'Lineage', 'History']);
    expect(text(f, '.mj-section-sheet-heading')).toBe('More');
    expect(hasClass(f, '.mj-section-sheet-item[data-key="fields"]', 'is-active')).toBe(true);
    expect(attr(f, '.mj-section-sheet-item[data-key="fields"]', 'aria-current')).toBe('page');
  });

  it('selecting a row emits ActiveKeyChange, closes the sheet and clears the search', () => {
    const f = render();
    const emitted: string[] = [];
    f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
    openSheet(f);
    f.componentInstance.OnSearch('lin');
    f.detectChanges();
    expect(rows(f).map(rowText)).toEqual(['Lineage']);
    click(f, '.mj-section-sheet-item[data-key="lineage"]');
    expect(emitted).toEqual(['lineage']);
    expect(f.componentInstance.SheetOpen).toBe(false);
    expect(f.componentInstance.Query).toBe('');
  });

  it('search filters both lists and hides a group whose items all drop out', () => {
    const f = render();
    openSheet(f);
    f.componentInstance.OnSearch('s');
    f.detectChanges();
    expect(rows(f).map(rowText)).toEqual(['Details', 'Fields 81', 'Security 1 3', 'History']);
    f.componentInstance.OnSearch('fie');
    f.detectChanges();
    expect(rows(f).length).toBe(1);
    expect(query(f, '.mj-section-sheet-heading')).toBeNull();
    f.componentInstance.OnSearch('zzz');
    f.detectChanges();
    expect(rows(f).length).toBe(0);
    expect(text(f, '.mj-section-sheet-empty')).toBe('No sections match.');
  });

  it('every tap target on the sheet is at least 44px tall by its inline style contract', () => {
    const f = render();
    openSheet(f);
    expect(query(f, '.mj-section-sheet-search')).not.toBeNull();
    expect(attr(f, '.mj-section-sheet-search', 'aria-label')).toBe('Search sections');
  });

  it('a sheet dismissed by the user closes without emitting', () => {
    const f = render();
    const emitted: string[] = [];
    f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
    openSheet(f);
    f.componentInstance.OnSheetVisibleChange(false);
    expect(f.componentInstance.SheetOpen).toBe(false);
    expect(emitted).toEqual([]);
  });
  describe('Enter in the search box', () => {
    it('opens the first match once a search is typed', () => {
      const f = render();
      const emitted: string[] = [];
      f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
      openSheet(f);
      f.componentInstance.OnSearch('s');
      f.detectChanges();
      const event = pressInSearch(f, 'Enter');
      expect(event.defaultPrevented).toBe(true);
      expect(emitted).toEqual(['details']);
      expect(f.componentInstance.SheetOpen).toBe(false);
    });

    it('reaches a group item when no first-class item matches', () => {
      const f = render();
      const emitted: string[] = [];
      f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
      openSheet(f);
      f.componentInstance.OnSearch('hist');
      f.detectChanges();
      pressInSearch(f, 'Enter');
      expect(emitted).toEqual(['history']);
    });

    it('highlights the row Enter will open, only while a search is typed', () => {
      const f = render();
      openSheet(f);
      expect(queryAll(f, '.mj-section-sheet-item.is-first-match').length).toBe(0);
      f.componentInstance.OnSearch('lin');
      f.detectChanges();
      const marked = queryAll(f, '.mj-section-sheet-item.is-first-match') as HTMLElement[];
      expect(marked.map((r) => r.getAttribute('data-key'))).toEqual(['lineage']);
    });

    it('tells screen readers what Enter does', () => {
      const f = render();
      openSheet(f);
      const id = attr(f, '.mj-section-sheet-search', 'aria-describedby');
      expect(id).toBeTruthy();
      expect(f.nativeElement.querySelector(`[id="${id}"]`)?.textContent?.trim()).toBe('Enter opens the first match.');
    });

    it('does nothing with an empty search or no matches, and still blocks the default', () => {
      const f = render();
      const emitted: string[] = [];
      f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
      openSheet(f);
      expect(pressInSearch(f, 'Enter').defaultPrevented).toBe(true);
      f.componentInstance.OnSearch('zzz');
      f.detectChanges();
      expect(pressInSearch(f, 'Enter').defaultPrevented).toBe(true);
      expect(emitted).toEqual([]);
      expect(f.componentInstance.SheetOpen).toBe(true);
    });

    it('empties the search box after a pick, even when Enter lands before a render', () => {
      // A fast typist, a paste or a hardware keyboard can press Enter before change detection has
      // rendered the typed query, so the [value] binding never saw it and resetting Query to ''
      // alone would leave the old text in the box for the next open.
      const f = render();
      openSheet(f);
      const input = query(f, '.mj-section-sheet-search') as HTMLInputElement;
      input.value = 'hist';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      pressInSearch(f, 'Enter');
      expect(f.componentInstance.Query).toBe('');
      expect(input.value).toBe('');
    });

    it('empties the search box when the sheet is dismissed before a render', () => {
      const f = render();
      openSheet(f);
      const input = query(f, '.mj-section-sheet-search') as HTMLInputElement;
      input.value = 'lin';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      f.componentInstance.OnSheetVisibleChange(false);
      f.detectChanges();
      expect(input.value).toBe('');
    });

    it('ignores Enter that confirms an IME composition', () => {
      const f = render();
      const emitted: string[] = [];
      f.componentInstance.ActiveKeyChange.subscribe((k) => emitted.push(k));
      openSheet(f);
      f.componentInstance.OnSearch('s');
      f.detectChanges();
      pressInSearch(f, 'Enter', { isComposing: true });
      expect(emitted).toEqual([]);
    });
  });
});

/**
 * The sheet renders in place, so inside a host form the search box sits in that `<form>`. Enter in a
 * text box clicks the form's first submit button (implicit submission), even a hidden one. The
 * picker must never let that happen: on Actions it was Regenerate, which saves with no confirm.
 */
@Component({
  standalone: true,
  imports: [MJSectionPickerComponent],
  template: `
    <form (submit)="Submitted = Submitted + 1; $event.preventDefault()">
      <button class="form-first-button" (click)="Clicked = Clicked + 1">Regenerate</button>
      <mj-section-picker [Items]="Items" ActiveKey="details"></mj-section-picker>
    </form>
  `,
})
class PickerInFormHostComponent {
  public Items: SectionPickerItem[] = [
    { Key: 'details', Title: 'Details' },
    { Key: 'params', Title: 'Params' },
  ];
  public Clicked = 0;
  public Submitted = 0;
}

describe('MJSectionPickerComponent inside a <form>', () => {
  const setup = () => {
    const f = TestBed.createComponent(PickerInFormHostComponent);
    f.detectChanges();
    const picker = f.debugElement.query(By.directive(MJSectionPickerComponent)).componentInstance as MJSectionPickerComponent;
    picker.OpenSheet();
    const sheet = f.debugElement.query(By.directive(MJBottomSheetComponent)).componentInstance as MJBottomSheetComponent;
    sheet.IsRendered = true;
    f.detectChanges();
    const input = f.nativeElement.querySelector('.mj-section-sheet-search') as HTMLInputElement;
    return { f, picker, input };
  };

  const pressEnter = (input: HTMLInputElement): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
  };

  it('Enter in the search box with no search does not click or submit the host form', () => {
    const { f, input } = setup();
    expect(input.closest('form')).not.toBeNull();
    expect(pressEnter(input).defaultPrevented).toBe(true);
    f.detectChanges();
    expect(f.componentInstance.Clicked).toBe(0);
    expect(f.componentInstance.Submitted).toBe(0);
  });

  it('Enter with a search picks the section instead of clicking the form button', () => {
    const { f, picker, input } = setup();
    const emitted: string[] = [];
    picker.ActiveKeyChange.subscribe((k) => emitted.push(k));
    picker.OnSearch('par');
    f.detectChanges();
    expect(pressEnter(input).defaultPrevented).toBe(true);
    expect(emitted).toEqual(['params']);
    expect(f.componentInstance.Clicked).toBe(0);
    expect(f.componentInstance.Submitted).toBe(0);
  });
});
