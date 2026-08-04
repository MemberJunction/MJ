import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent, PageChangeEvent } from './pagination.component';

/**
 * DOM-level spec for `<mj-pagination>`. The component's whole reason to exist is
 * template gating + click wiring:
 *  - it renders nothing unless there is more than one page,
 *  - first/prev are disabled on page 1, next/last on the last page,
 *  - clicking a nav button emits a `PageChange` with the right StartRow.
 *
 * None of that is observable from the class alone — these assertions drive the
 * rendered buttons and read the emitted `@Output`.
 */
describe('PaginationComponent (DOM)', () => {
  function render(
    setup: (c: PaginationComponent) => void,
  ): { fixture: ComponentFixture<PaginationComponent>; host: HTMLElement } {
    const fixture = TestBed.createComponent(PaginationComponent);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  function buttonByTitle(host: HTMLElement, title: string): HTMLButtonElement {
    const btn = host.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
    if (!btn) throw new Error(`No pager button with title="${title}"`);
    return btn;
  }

  it('renders nothing when there is a single page of data', () => {
    const { host } = render((c) => {
      c.TotalRowCount = 50;
      c.PageSize = 100;
      c.PageNumber = 1;
    });
    expect(host.querySelector('.pagination')).toBeNull();
  });

  it('renders the pager and a "from-to of total" summary across multiple pages', () => {
    const { host } = render((c) => {
      c.TotalRowCount = 250;
      c.PageSize = 100;
      c.PageNumber = 2;
    });
    expect(host.querySelector('.pagination')).not.toBeNull();
    // DisplayFrom = 101, DisplayTo = 200, total 250 (formatted with the number pipe).
    expect(host.querySelector('.pager-summary')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '101-200 of 250',
    );
    expect(host.querySelector('.pager-page-info')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Page 2 of 3',
    );
  });

  it('disables first/prev on the first page and enables next/last', () => {
    const { host } = render((c) => {
      c.TotalRowCount = 250;
      c.PageSize = 100;
      c.PageNumber = 1;
    });
    expect(buttonByTitle(host, 'First page').disabled).toBe(true);
    expect(buttonByTitle(host, 'Previous page').disabled).toBe(true);
    expect(buttonByTitle(host, 'Next page').disabled).toBe(false);
    expect(buttonByTitle(host, 'Last page').disabled).toBe(false);
  });

  it('emits PageChange with the correct StartRow when Next is clicked', () => {
    const events: PageChangeEvent[] = [];
    const { fixture, host } = render((c) => {
      c.TotalRowCount = 250;
      c.PageSize = 100;
      c.PageNumber = 1;
    });
    fixture.componentInstance.PageChange.subscribe((e) => events.push(e));

    buttonByTitle(host, 'Next page').click();

    expect(events).toEqual([{ PageNumber: 2, PageSize: 100, StartRow: 100 }]);
  });

  it('does not emit when a disabled button is clicked', () => {
    const spy = vi.fn();
    const { fixture, host } = render((c) => {
      c.TotalRowCount = 250;
      c.PageSize = 100;
      c.PageNumber = 1;
    });
    fixture.componentInstance.PageChange.subscribe(spy);

    // Previous is disabled on page 1; clicking the disabled button must be a no-op.
    buttonByTitle(host, 'Previous page').click();

    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the loading spinner and disables navigation while IsLoading', () => {
    const { host } = render((c) => {
      c.TotalRowCount = 250;
      c.PageSize = 100;
      c.PageNumber = 2;
      c.IsLoading = true;
    });
    expect(host.querySelector('.pager-loading')).not.toBeNull();
    expect(buttonByTitle(host, 'Next page').disabled).toBe(true);
    expect(buttonByTitle(host, 'Previous page').disabled).toBe(true);
  });
});
