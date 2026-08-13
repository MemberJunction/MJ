import { describe, it, expect } from 'vitest';
import { MJWindowComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture, click } from '@memberjunction/ng-test-utils';
import { ResourceData } from '@memberjunction/core-entities';
import { DashboardItem } from '../../single-dashboard.component';
import { EditDashboardComponent } from './edit-dashboard.component';

/**
 * DOM coverage for <app-edit-dashboard> — the "Customize Dashboard" window: an Add-item button with
 * a toggle dropdown, and a tile per dashboard item (each with a remove button). ngOnInit builds the
 * internal `_items` from the `items` input synchronously (no data load), so a single render works.
 * The add-menu's items come from the SharedService singleton (out of scope); we assert the toggle +
 * panel visibility, not its contents. mj-window / mjButton are imported directly from ng-ui-components.
 */

// Real DashboardItem fixtures — ngOnInit copies these onto fresh DashboardItems via
// CreateDashboardItem, so sharing the array across tests can't leak mutations.
function makeItem(title: string, order: number, col: number): DashboardItem {
  const item = new DashboardItem();
  item.title = title;
  item.order = order;
  item.col = col;
  item.row = 1;
  item.rowSpan = 1;
  item.colSpan = 1;
  item.ResourceData = new ResourceData();
  return item;
}

const ITEMS: DashboardItem[] = [makeItem('Members Chart', 0, 1), makeItem('Revenue Table', 1, 2)];

const render = (items: DashboardItem[] = ITEMS) =>
  renderComponentFixture(EditDashboardComponent, {
    imports: [MJWindowComponent, MJButtonDirective],
    declarations: [EditDashboardComponent],
    inputs: { items },
  });

const addButton = (fixture: ReturnType<typeof render>) =>
  queryAll(fixture, 'button').find((b) => b.textContent?.includes('Add item')) as HTMLElement;

const footerButton = (fixture: ReturnType<typeof render>, label: string) =>
  queryAll(fixture, '.dialog-footer-actions button').find((b) => b.textContent?.includes(label)) as HTMLElement;

describe('EditDashboardComponent (DOM)', () => {
  it('renders the Customize Dashboard window with an Add item button', () => {
    const fixture = render();
    expect(fixture.nativeElement.textContent).toContain('Customize Dashboard');
    expect(addButton(fixture)).toBeTruthy();
  });

  it('renders one tile per dashboard item with its title', () => {
    const fixture = render();
    const tiles = queryAll(fixture, '.mj-tile-item');
    expect(tiles.length).toBe(2);
    const titles = queryAll(fixture, '.mj-tile-header-title').map((e) => e.textContent?.trim());
    expect(titles).toEqual(['Members Chart', 'Revenue Table']);
  });

  it('removes a tile when its remove button is clicked', () => {
    const fixture = render();
    expect(queryAll(fixture, '.mj-tile-item').length).toBe(2);
    (query(fixture, '.mj-tile-item .remove-item-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(queryAll(fixture, '.mj-tile-item').length).toBe(1);
  });

  // NOTE: the add-item dropdown panel's @for reads the SharedService SINGLETON's ResourceTypes
  // (app-bootstrap state, not injectable), so opening the panel isn't unit-testable here — that
  // toggle path is left to e2e. We assert the panel is closed by default (below) without opening it.
  it('does not show the add-item dropdown panel by default', () => {
    expect(query(render(), '.add-dropdown-panel')).toBeNull();
  });

  // Real mj-window title-bar X — exercises the (Close)="closeDialog()" template binding.
  it('emits onClose when the window close button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.onClose);
    click(fixture, '.mj-window-close');
    expect(closed.length).toBe(1);
  });

  // Footer Cancel — exercises the (click)="closeDialog()" template binding.
  it('emits onClose when the footer Cancel button is clicked', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.onClose);
    footerButton(fixture, 'Cancel').click();
    expect(closed.length).toBe(1);
  });

  // Footer Save — exercises the (click)="saveChanges()" template binding end-to-end,
  // including that a prior DOM removal is reflected in the emitted payload.
  it('emits onSave with the current items when the footer Save button is clicked', () => {
    const fixture = render();
    const saved = capture(fixture.componentInstance.onSave);
    (query(fixture, '.mj-tile-item .remove-item-btn') as HTMLElement).click();
    fixture.detectChanges();
    footerButton(fixture, 'Save').click();
    expect(saved.length).toBe(1);
    expect(saved[0].itemsChanged).toBe(true);
    expect(saved[0].items.map((i) => i.title)).toEqual(['Revenue Table']);
  });
});
