import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { MJActionCategoryEntity } from '@memberjunction/core-entities';
import { ActionBreadcrumbComponent } from './action-breadcrumb.component';

/**
 * DOM coverage for <mj-action-breadcrumb> — a category breadcrumb built (in ngOnChanges) from the
 * selected category id + the Categories list. It always starts with a root "All Actions" crumb;
 * non-last crumbs are clickable buttons that emit CategorySelect, the last is the current (static)
 * crumb. No DI/async; setInput triggers ngOnChanges → single render.
 */

const cat = (over: Partial<Record<string, unknown>>) => ({ ID: '', Name: '', ParentID: null, ...over }) as unknown as MJActionCategoryEntity;

const render = (SelectedCategoryId: string, Categories: MJActionCategoryEntity[] = []) =>
  renderComponentFixture(ActionBreadcrumbComponent, {
    declarations: [ActionBreadcrumbComponent],
    inputs: { SelectedCategoryId, Categories },
  });

describe('ActionBreadcrumbComponent (DOM)', () => {
  it('shows a single, non-clickable current crumb ("All Actions") at the root', () => {
    const fixture = render('all');
    const crumbs = queryAll(fixture, '.breadcrumb-item');
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].classList.contains('current')).toBe(true);
    expect(crumbs[0].textContent).toContain('All Actions');
    expect(query(fixture, 'button.breadcrumb-item')).toBeNull();
  });

  it('builds a root → category trail with the selected category as the current crumb', () => {
    const fixture = render('c1', [cat({ ID: 'c1', Name: 'Reports' })]);
    // Root is now a clickable button; the selected category is the current crumb.
    expect(query(fixture, 'button.breadcrumb-item')).not.toBeNull();
    const current = query(fixture, '.breadcrumb-item.current');
    expect(current?.textContent).toContain('Reports');
  });

  it('emits CategorySelect with the crumb id when a breadcrumb button is clicked', () => {
    const fixture = render('c1', [cat({ ID: 'c1', Name: 'Reports' })]);
    const selected = capture(fixture.componentInstance.CategorySelect);
    (query(fixture, 'button.breadcrumb-item') as HTMLElement).click();
    expect(selected).toEqual(['all']); // the root crumb's id
  });
});
