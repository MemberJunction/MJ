import { describe, it, expect } from 'vitest';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { DeleteItemComponent } from './delete-item.component';

/**
 * DOM coverage for <app-delete-item-dialog> — a small confirm-delete dialog. No services/data/async:
 * a single synchronous render. It's a module-declared component whose template uses the standalone
 * mj-dialog / mj-dialog-actions / mjButton from ng-ui-components, so those are imported directly
 * (no need to pull the heavy single-dashboard module in).
 */

const ITEM = { title: 'Sales Widget' } as never;

const render = (dashboardItem: unknown = ITEM) =>
  renderComponentFixture(DeleteItemComponent, {
    imports: [MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
    declarations: [DeleteItemComponent],
    inputs: { dashboardItem },
  });

const buttonByText = (fixture: ReturnType<typeof render>, label: string) =>
  queryAll(fixture, 'button').find((b) => b.textContent?.includes(label)) as HTMLElement;

describe('DeleteItemComponent (DOM)', () => {
  it('renders the confirmation prompt with the item title', () => {
    const fixture = render();
    const prompt = query(fixture, 'p');
    expect(prompt?.textContent).toContain('Are you sure you want to delete');
    expect(prompt?.textContent).toContain('Sales Widget');
  });

  it('renders Yes and No action buttons', () => {
    const fixture = render();
    expect(buttonByText(fixture, 'Yes')).toBeTruthy();
    expect(buttonByText(fixture, 'No')).toBeTruthy();
  });

  it('emits removeDashboardItem (with the item) and onClose when Yes is clicked', () => {
    const fixture = render();
    const removed = capture(fixture.componentInstance.removeDashboardItem);
    const closed = capture(fixture.componentInstance.onClose);
    buttonByText(fixture, 'Yes').click();
    expect(removed).toEqual([ITEM]);
    expect(closed.length).toBe(1);
  });

  it('emits only onClose (not removeDashboardItem) when No is clicked', () => {
    const fixture = render();
    const removed = capture(fixture.componentInstance.removeDashboardItem);
    const closed = capture(fixture.componentInstance.onClose);
    buttonByText(fixture, 'No').click();
    expect(closed.length).toBe(1);
    expect(removed.length).toBe(0);
  });

  it('does not emit removeDashboardItem when the item is null (guarded)', () => {
    const fixture = render(null);
    const removed = capture(fixture.componentInstance.removeDashboardItem);
    const closed = capture(fixture.componentInstance.onClose);
    buttonByText(fixture, 'Yes').click();
    expect(removed.length).toBe(0);
    expect(closed.length).toBe(1);
  });
});
