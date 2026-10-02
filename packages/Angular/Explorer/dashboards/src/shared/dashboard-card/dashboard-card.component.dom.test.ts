import { describe, it, expect, vi } from 'vitest';
import { RenderComponentFixture, Query, QueryAll, Text, Click, Capture } from '@memberjunction/ng-test-utils';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardLayoutPreviewComponent, DashboardLayoutPreviewNodeComponent } from '@memberjunction/ng-dashboard-viewer';
import { DashboardCardComponent } from './dashboard-card.component';

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

const DASH = {
  ID: 'd1',
  Name: 'Sales pipeline',
  Description: 'Open opportunities by stage',
  Type: 'Config',
  User: 'Ana Ruiz',
  Thumbnail: null,
  UIConfigDetails: '{}',
} as unknown as MJDashboardEntity;

/** A copy of DASH with other values, as a new object. */
const dashboard = (values: Partial<Pick<MJDashboardEntity, 'Type' | 'Thumbnail' | 'UIConfigDetails'>>) =>
  ({ ...(DASH as unknown as Record<string, unknown>), ...values }) as unknown as MJDashboardEntity;

const render = (inputs: Record<string, unknown> = {}) =>
  RenderComponentFixture(DashboardCardComponent, {
    declarations: [DashboardCardComponent, DashboardLayoutPreviewComponent, DashboardLayoutPreviewNodeComponent],
    inputs: { Dashboard: DASH, IsFavorite: false, ShowCategory: true, CategoryPath: 'Sales › Pipeline', ...inputs },
  });

/** What the picture area shows: the image, the layout miniature, or the gauge icon. */
function picture(f: ReturnType<typeof render>): 'image' | 'layout' | 'icon' | 'none' {
  if (Query(f, '.dc-thumb img')) return 'image';
  if (Query(f, '.dc-thumb mj-dashboard-layout-preview')) return 'layout';
  if (Query(f, '.dc-thumb > i.fa-gauge-high')) return 'icon';
  return 'none';
}

describe('DashboardCardComponent (DOM)', () => {
  it('renders name, description and category', () => {
    const f = render();
    expect(Text(f, '.dc-name')).toBe('Sales pipeline');
    expect(Text(f, '.dc-desc')).toBe('Open opportunities by stage');
    expect(Text(f, '.dc-category')).toBe('Sales › Pipeline');
  });

  it('shows the icon block when there is no thumbnail', () => {
    const f = render();
    expect(Query(f, '.dc-thumb img')).toBeNull();
    expect(Query(f, '.dc-thumb i')).not.toBeNull();
  });

  describe('picture', () => {
    it("shows the dashboard's screenshot when it has a Thumbnail, even with a saved layout", () => {
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
      ['no saved layout (a new dashboard)', '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}'],
      ['a saved layout with no panels', JSON.stringify({ layout: { root: { type: 'row', content: [] } }, settings: {} })],
    ])('shows the gauge icon when there is no Thumbnail and %s', (_label, details) => {
      expect(picture(render({ Dashboard: dashboard({ UIConfigDetails: details }) }))).toBe('icon');
    });

    it('shows the gauge icon for a Code dashboard, even when its configuration holds a layout', () => {
      expect(picture(render({ Dashboard: dashboard({ Type: 'Code', UIConfigDetails: SAVED_LAYOUT }) }))).toBe('icon');
    });

    it('draws the miniature once the same dashboard object gets a saved layout', () => {
      const shown = dashboard({});
      const f = render({ Dashboard: shown });
      expect(picture(f)).toBe('icon');

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

    it("keeps the picture inside the button that opens the dashboard, so a click on it opens the dashboard", () => {
      const f = render({ Dashboard: dashboard({ UIConfigDetails: SAVED_LAYOUT }) });
      const opened = Capture(f.componentInstance.Open);
      Click(f, '.dc-thumb mj-dashboard-layout-preview');
      expect(opened.map(d => d.ID)).toEqual(['d1']);
    });
  });

  it('emits Open with the dashboard when the title is clicked', () => {
    const f = render();
    const opened = Capture(f.componentInstance.Open);
    Click(f, '.dc-name');
    expect(opened).toEqual([DASH]);
  });

  it('emits ToggleFavorite when the star is clicked and reflects the state', () => {
    const f = render({ IsFavorite: true });
    const toggled = Capture(f.componentInstance.ToggleFavorite);
    expect(Query(f, '.dc-star')?.getAttribute('aria-pressed')).toBe('true');
    Click(f, '.dc-star');
    expect(toggled).toEqual([DASH]);
  });

  it('names the dashboard in the star label, so each card star reads differently', () => {
    expect(Query(render(), '.dc-star')?.getAttribute('aria-label')).toBe('Favorite Sales pipeline');
  });

  it('hides the category when ShowCategory is false', () => {
    expect(Query(render({ ShowCategory: false }), '.dc-category')).toBeNull();
  });
});
