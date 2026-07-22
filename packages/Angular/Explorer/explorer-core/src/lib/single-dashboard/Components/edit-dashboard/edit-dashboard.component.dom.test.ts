import { describe, it, expect } from 'vitest';
import { MJWindowComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { EditDashboardComponent } from './edit-dashboard.component';

/**
 * DOM coverage for <app-edit-dashboard> — the "Customize Dashboard" window: an Add-item button with
 * a toggle dropdown, and a tile per dashboard item (each with a remove button). ngOnInit builds the
 * internal `_items` from the `items` input synchronously (no data load), so a single render works.
 * The add-menu's items come from the SharedService singleton (out of scope); we assert the toggle +
 * panel visibility, not its contents. mj-window / mjButton are imported directly from ng-ui-components.
 */

// Plain stand-ins for DashboardItem — CreateDashboardItem copies these fields onto a real DashboardItem.
const ITEMS = [
  { title: 'Members Chart', order: 0, col: 1, row: 1, rowSpan: 1, colSpan: 1, ResourceData: {} },
  { title: 'Revenue Table', order: 1, col: 2, row: 1, rowSpan: 1, colSpan: 1, ResourceData: {} },
] as never;

const render = (items: unknown = ITEMS) =>
  renderComponentFixture(EditDashboardComponent, {
    imports: [MJWindowComponent, MJButtonDirective],
    declarations: [EditDashboardComponent],
    inputs: { items },
  });

const addButton = (fixture: ReturnType<typeof render>) =>
  queryAll(fixture, 'button').find((b) => b.textContent?.includes('Add item')) as HTMLElement;

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

  it('emits onClose when the window is closed', () => {
    const fixture = render();
    const closed = capture(fixture.componentInstance.onClose);
    fixture.componentInstance.closeDialog();
    expect(closed.length).toBe(1);
  });
});
