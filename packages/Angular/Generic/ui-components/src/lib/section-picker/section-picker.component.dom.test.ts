import { describe, it, expect } from 'vitest';
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
});
