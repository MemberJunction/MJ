import { describe, it, expect, vi } from 'vitest';
import { RenderComponentFixture, Query, QueryAll, Text, Click, Capture } from '@memberjunction/ng-test-utils';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardCardComponent } from './dashboard-card.component';
import { DashboardLayoutPreviewComponent } from '../layout-preview/dashboard-layout-preview.component';
import { DashboardLayoutPreviewNodeComponent } from '../layout-preview/dashboard-layout-preview-node.component';

/**
 * DOM coverage for <mj-dashboard-card>: the picture (screenshot, layout miniature, "Not set up yet"
 * or icon), the meta row (owner, Shared marker, category, last update), the buttons, and the events
 * the host gets. The card is presentational, so every test sets inputs and reads outputs.
 */

/** A saved layout (UIConfigDetails) with "Pipeline" and "Owners" side by side, as the dashboard viewer saves it. */
const SAVED_LAYOUT = JSON.stringify({
  layout: {
    root: {
      type: 'row',
      content: ['Pipeline', 'Owners'].map(title => ({
        type: 'stack',
        size: 50,
        sizeUnit: '%',
        activeItemIndex: 0,
        content: [{ type: 'component', title, componentState: { id: `p-${title}`, partTypeId: 'pt', title, icon: 'fa-solid fa-table', config: { type: 'View' } } }],
      })),
    },
  },
  settings: { theme: 'light' },
});

const THUMBNAIL = 'data:image/jpeg;base64,c2NyZWVuc2hvdA==';

/** A Config dashboard with no parts yet. `User` is the owner's user name, an e-mail, which the card never shows. */
const DASH = {
  ID: 'd1',
  Name: 'Sales pipeline',
  Description: 'Open opportunities by stage',
  Type: 'Config',
  User: 'ana.ruiz@example.com',
  Thumbnail: null,
  UIConfigDetails: '{}',
} as unknown as MJDashboardEntity;

/** A copy of DASH with other values, as a new object. */
const dashboard = (values: Partial<Pick<MJDashboardEntity, 'Type' | 'Thumbnail' | 'UIConfigDetails' | '__mj_UpdatedAt'>>) =>
  ({ ...(DASH as unknown as Record<string, unknown>), ...values }) as unknown as MJDashboardEntity;

const render = (inputs: Record<string, unknown> = {}) =>
  RenderComponentFixture(DashboardCardComponent, {
    declarations: [DashboardCardComponent, DashboardLayoutPreviewComponent, DashboardLayoutPreviewNodeComponent],
    inputs: { Dashboard: DASH, IsFavorite: false, CategoryPath: 'Sales › Pipeline', ...inputs },
  });

/** What the picture area shows. */
function picture(f: ReturnType<typeof render>): 'image' | 'layout' | 'not-set-up' | 'icon' | 'none' {
  if (Query(f, '.dc-thumb img')) return 'image';
  if (Query(f, '.dc-thumb mj-dashboard-layout-preview')) return 'layout';
  if (Query(f, '.dc-thumb .dc-not-set-up')) return 'not-set-up';
  if (Query(f, '.dc-thumb .dc-icon-tile i.fa-gauge-high')) return 'icon';
  return 'none';
}

/** Sets one input of a rendered card and renders it again. */
function setInput(f: ReturnType<typeof render>, name: string, value: unknown): void {
  f.componentRef.setInput(name, value);
  f.detectChanges();
}

/** Dispatches a bubbling mouse event of the given type on the first element matching the selector. */
function mouse(f: ReturnType<typeof render>, selector: string, type: 'click' | 'dblclick', keys: MouseEventInit = {}): void {
  const target = Query(f, selector);
  if (!target) throw new Error(`no element matched "${selector}"`);
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...keys }));
}

describe('DashboardCardComponent (DOM)', () => {
  it('renders name, description and category', () => {
    const f = render();
    expect(Text(f, '.dc-name')).toBe('Sales pipeline');
    expect(Text(f, '.dc-desc')).toBe('Open opportunities by stage');
    expect(Text(f, '.dc-category')).toBe('Sales › Pipeline');
  });

  it('shows no type chip', () => {
    const f = render();
    expect(Query(f, '.dc-type')).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Config');
  });

  describe('picture', () => {
    it("shows the dashboard's screenshot when it has a Thumbnail and a saved layout", () => {
      const f = render({ Dashboard: dashboard({ Thumbnail: THUMBNAIL, UIConfigDetails: SAVED_LAYOUT }) });
      expect(picture(f)).toBe('image');
      expect(Query(f, '.dc-thumb img')?.getAttribute('src')).toBe(THUMBNAIL);
    });

    it('draws a miniature of the saved panel layout when there is no Thumbnail', () => {
      const f = render({ Dashboard: dashboard({ UIConfigDetails: SAVED_LAYOUT }) });
      expect(picture(f)).toBe('layout');
      expect(QueryAll(f, '.dc-thumb .dlp-title').map(t => t.textContent?.trim())).toEqual(['Pipeline', 'Owners']);
    });

    it.each([
      ['no saved configuration', '{}'],
      ['a new dashboard (layout null)', JSON.stringify({ layout: null, settings: { theme: 'light' } })],
      ['the legacy tile format', '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}'],
      ['a layout with no panels', JSON.stringify({ layout: { root: { type: 'row', content: [] } }, settings: {} })],
    ])('shows "Not set up yet" with the placeholder icon for %s', (_label, details) => {
      const f = render({ Dashboard: dashboard({ UIConfigDetails: details }) });
      expect(picture(f)).toBe('not-set-up');
      expect(Text(f, '.dc-not-set-up')).toBe('Not set up yet');
      expect(Query(f, '.dc-thumb .dc-icon-tile i.fa-gauge-high')).not.toBeNull();
    });

    it('shows "Not set up yet" instead of an old screenshot when the dashboard has no parts', () => {
      const f = render({ Dashboard: dashboard({ Thumbnail: THUMBNAIL, UIConfigDetails: '{"layout":null}' }) });
      expect(picture(f)).toBe('not-set-up');
    });

    it('shows the gauge icon, without "Not set up yet", for a Code dashboard, even when its configuration holds a layout', () => {
      const f = render({ Dashboard: dashboard({ Type: 'Code', UIConfigDetails: SAVED_LAYOUT }) });
      expect(picture(f)).toBe('icon');
      expect(Query(f, '.dc-not-set-up')).toBeNull();
    });

    it("shows a Code dashboard's screenshot", () => {
      expect(picture(render({ Dashboard: dashboard({ Type: 'Code', Thumbnail: THUMBNAIL, UIConfigDetails: '{}' }) }))).toBe('image');
    });

    it('draws the miniature once the same dashboard object gets a saved layout', () => {
      const shown = dashboard({});
      const f = render({ Dashboard: shown });
      expect(picture(f)).toBe('not-set-up');

      // A save elsewhere changes the cached dashboard in place, and the host page checks its view again.
      (shown as unknown as { UIConfigDetails: string }).UIConfigDetails = SAVED_LAYOUT;
      f.componentRef.changeDetectorRef.markForCheck();
      f.detectChanges();

      expect(picture(f)).toBe('layout');
    });

    it('parses the saved layout once: the preview draws the tree the card built', () => {
      const parse = vi.spyOn(JSON, 'parse');
      const f = render({ Dashboard: dashboard({ UIConfigDetails: SAVED_LAYOUT }) });
      expect(picture(f)).toBe('layout');
      expect(parse.mock.calls.filter(([text]) => text === SAVED_LAYOUT)).toHaveLength(1);
    });

    it('counts a click on the picture as a click on the card', () => {
      const f = render({ Dashboard: dashboard({ UIConfigDetails: SAVED_LAYOUT }) });
      const clicks = Capture(f.componentInstance.CardClick);
      Click(f, '.dc-thumb mj-dashboard-layout-preview');
      expect(clicks.map(c => c.Dashboard.ID)).toEqual(['d1']);
    });
  });

  describe('meta row', () => {
    it('shows the owner it is given, and none for null, never the User field', () => {
      const f = render({ OwnerLabel: 'You' });
      expect(Text(f, '.dc-owner')).toBe('You');

      setInput(f, 'OwnerLabel', null);
      expect(Query(f, '.dc-owner')).toBeNull();
      expect((f.nativeElement as HTMLElement).textContent).not.toContain('ana.ruiz@example.com');
    });

    it('marks a dashboard shared with the user', () => {
      const f = render({ IsShared: true });
      expect(Text(f, '.dc-shared')).toBe('Shared');

      setInput(f, 'IsShared', false);
      expect(Query(f, '.dc-shared')).toBeNull();
    });

    it('hides the category when CategoryPath is null', () => {
      expect(Query(render({ CategoryPath: null }), '.dc-category')).toBeNull();
    });

    it('shows when the dashboard was last updated, and nothing without a date', () => {
      const f = render({ Dashboard: dashboard({ __mj_UpdatedAt: new Date() }) });
      expect(Text(f, '.dc-updated')).toBe('Today');

      setInput(f, 'Dashboard', DASH);
      expect(Query(f, '.dc-updated')).toBeNull();
    });
  });

  describe('events', () => {
    it('reports a click on the name as one card click', () => {
      const f = render();
      const clicks = Capture(f.componentInstance.CardClick);
      Click(f, '.dc-name');
      expect(clicks.map(c => c.Dashboard)).toEqual([DASH]);
    });

    it('reports a card click with its mouse event, and a star click only as ToggleFavorite', () => {
      const f = render();
      const clicks = Capture(f.componentInstance.CardClick);
      const toggles = Capture(f.componentInstance.ToggleFavorite);
      mouse(f, '.dc-card', 'click', { ctrlKey: true });
      Click(f, '.dc-star');
      expect(clicks).toHaveLength(1);
      expect(clicks[0].MouseEvent.ctrlKey).toBe(true);
      expect(toggles).toEqual([DASH]);
    });

    it('reports a double-click on the card with its mouse event', () => {
      const f = render();
      const doubleClicks = Capture(f.componentInstance.CardDoubleClick);
      mouse(f, '.dc-card', 'dblclick', { shiftKey: true });
      expect(doubleClicks.map(c => [c.Dashboard, c.MouseEvent.shiftKey])).toEqual([[DASH, true]]);
    });

    it('does not report a double-click on a card button or the checkbox as a double-click on the card', () => {
      const f = render({ CanEdit: true, CanDelete: true, Selectable: true });
      const doubleClicks = Capture(f.componentInstance.CardDoubleClick);
      for (const selector of ['.dc-star', '.dc-edit', '.dc-delete', '.dc-select input']) {
        mouse(f, selector, 'dblclick');
      }
      expect(doubleClicks).toEqual([]);
    });

    it('emits ToggleFavorite when the star is clicked and reflects the state', () => {
      const f = render({ IsFavorite: true });
      const toggled = Capture(f.componentInstance.ToggleFavorite);
      expect(Query(f, '.dc-star')?.getAttribute('aria-pressed')).toBe('true');
      expect(Query(f, '.dc-star.on i.fa-solid.fa-star')).not.toBeNull();
      Click(f, '.dc-star');
      expect(toggled).toEqual([DASH]);
    });

    it('names the dashboard in the star label, so each card star reads differently', () => {
      expect(Query(render(), '.dc-star')?.getAttribute('aria-label')).toBe('Favorite Sales pipeline');
    });

    it('hides the star when ShowFavorite is false', () => {
      expect(Query(render({ ShowFavorite: false }), '.dc-star')).toBeNull();
    });

    it('offers Edit only with the edit right, without opening the card', () => {
      const f = render({ CanEdit: true, CanDelete: false });
      const clicks = Capture(f.componentInstance.CardClick);
      const edits = Capture(f.componentInstance.Edit);
      expect(Query(f, '.dc-delete')).toBeNull();
      Click(f, '.dc-edit');
      expect(edits).toEqual([DASH]);
      expect(clicks).toEqual([]);
    });

    it('offers Delete only with the delete right, without opening the card', () => {
      const f = render({ CanEdit: false, CanDelete: true });
      const clicks = Capture(f.componentInstance.CardClick);
      const deletes = Capture(f.componentInstance.Delete);
      expect(Query(f, '.dc-edit')).toBeNull();
      Click(f, '.dc-delete');
      expect(deletes).toEqual([DASH]);
      expect(clicks).toEqual([]);
    });

    it('names the dashboard in the Edit and Delete labels', () => {
      const f = render({ CanEdit: true, CanDelete: true });
      expect(Query(f, '.dc-edit')?.getAttribute('aria-label')).toBe('Edit Sales pipeline');
      expect(Query(f, '.dc-delete')?.getAttribute('aria-label')).toBe('Delete Sales pipeline');
    });

    it('shows a checkbox in selection mode that toggles the selection without opening', () => {
      const f = render({ Selectable: true, Selected: true });
      const toggles = Capture(f.componentInstance.SelectionToggle);
      const clicks = Capture(f.componentInstance.CardClick);
      const box = Query(f, '.dc-select input') as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(Query(f, '.dc-card.selected')).not.toBeNull();
      box.click();
      expect(toggles).toEqual([DASH]);
      expect(clicks).toEqual([]);
    });

    it('shows no checkbox outside selection mode', () => {
      const f = render();
      expect(Query(f, '.dc-select')).toBeNull();
      expect(Query(f, '.dc-card.selected')).toBeNull();
    });
  });

  it('marks the search text in the name and the description', () => {
    const f = render({ HighlightQuery: 'pipe' });
    expect(Query(f, '.dc-name mark')?.textContent).toBe('pipe');

    setInput(f, 'HighlightQuery', 'stage');
    expect(Query(f, '.dc-desc mark')?.textContent).toBe('stage');
    expect(Query(f, '.dc-name mark')).toBeNull();
  });
});
