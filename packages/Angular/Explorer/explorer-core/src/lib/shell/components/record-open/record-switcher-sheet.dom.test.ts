import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { RecordSwitcherSheetComponent, RecordSwitcherEntry } from './record-switcher-sheet.component';

/**
 * DOM coverage for the mobile record switcher sheet: rows with entity icon /
 * title / origin subtitle, active highlight, and the two intents (activate
 * on row tap, close on ✕ — close must NOT also activate).
 *
 * Fake timers: the underlying mj-bottom-sheet opens via nested rAFs (jsdom
 * implements rAF as setTimeout).
 */

function entry(overrides: Partial<RecordSwitcherEntry> = {}): RecordSwitcherEntry {
  return {
    TabId: 't1',
    Title: 'AssociationDemo',
    Icon: 'fa-solid fa-puzzle-piece',
    Color: 'rgb(92, 107, 192)',
    OriginLabel: 'Data Explorer › Data',
    IsActive: false,
    ...overrides
  };
}

describe('RecordSwitcherSheetComponent (DOM)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(entries: RecordSwitcherEntry[], visible = true) {
    const fixture = renderComponentFixture(RecordSwitcherSheetComponent, {
      imports: [RecordSwitcherSheetComponent],
      autoDetect: true
    });
    fixture.componentRef.setInput('Entries', entries);
    fixture.componentRef.setInput('Visible', visible);
    fixture.detectChanges();
    vi.advanceTimersByTime(50); // flush the sheet's open rAFs
    fixture.detectChanges();
    return fixture;
  }

  it('renders one row per entry with title and origin subtitle', () => {
    const fixture = render([
      entry({ TabId: 't1', Title: 'AssociationDemo', OriginLabel: 'Data Explorer › Data' }),
      entry({ TabId: 't2', Title: 'Promote ML Model', OriginLabel: 'Actions › Explorer' })
    ]);
    const rows = fixture.nativeElement.querySelectorAll('.switcher-row');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.switcher-row-title')?.textContent?.trim()).toBe('AssociationDemo');
    expect(rows[0].querySelector('.switcher-row-origin')?.textContent?.trim()).toBe('Data Explorer › Data');
    expect(rows[1].querySelector('.switcher-row-origin')?.textContent?.trim()).toBe('Actions › Explorer');
  });

  it('omits the origin subtitle when unknown and tints the icon with the app color', () => {
    const fixture = render([entry({ OriginLabel: null })]);
    expect(query(fixture, '.switcher-row-origin')).toBeNull();
    const icon = query(fixture, '.switcher-row-icon') as HTMLElement;
    expect(icon.style.color).toBe('rgb(92, 107, 192)');
    expect(icon.querySelector('i')?.className).toContain('fa-puzzle-piece');
  });

  it('highlights the active row and marks it aria-current', () => {
    const fixture = render([
      entry({ TabId: 't1', IsActive: false }),
      entry({ TabId: 't2', Title: 'Active One', IsActive: true })
    ]);
    const rows = fixture.nativeElement.querySelectorAll('.switcher-row');
    expect(rows[0].classList.contains('switcher-row--active')).toBe(false);
    expect(rows[1].classList.contains('switcher-row--active')).toBe(true);
    expect(rows[1].querySelector('.switcher-row-main')?.getAttribute('aria-current')).toBe('true');
  });

  it('row tap emits ActivateRequested with the tab id', () => {
    const fixture = render([entry({ TabId: 't42' })]);
    const activated: string[] = [];
    fixture.componentInstance.ActivateRequested.subscribe(id => activated.push(id));
    (query(fixture, '.switcher-row-main') as HTMLButtonElement).click();
    expect(activated).toEqual(['t42']);
  });

  it('✕ emits CloseRequested with the tab id and does NOT activate', () => {
    const fixture = render([entry({ TabId: 't42', Title: 'Widget A' })]);
    const activated: string[] = [];
    const closed: string[] = [];
    fixture.componentInstance.ActivateRequested.subscribe(id => activated.push(id));
    fixture.componentInstance.CloseRequested.subscribe(id => closed.push(id));
    const closeBtn = query(fixture, '.switcher-row-close') as HTMLButtonElement;
    expect(closeBtn.getAttribute('aria-label')).toBe('Close Widget A');
    closeBtn.click();
    expect(closed).toEqual(['t42']);
    expect(activated).toEqual([]);
  });

  it('renders no rows (sheet only) when entries are empty', () => {
    const fixture = render([]);
    expect(fixture.nativeElement.querySelectorAll('.switcher-row').length).toBe(0);
  });

  it('forwards sheet dismissal as VisibleChange(false)', () => {
    const fixture = render([entry()]);
    const changes: boolean[] = [];
    fixture.componentInstance.VisibleChange.subscribe(v => changes.push(v));
    (query(fixture, '.mj-bottom-sheet-scrim') as HTMLElement).click();
    fixture.detectChanges();
    expect(changes).toEqual([false]);
    expect(fixture.componentInstance.Visible).toBe(false);
  });
});
