import { describe, it, expect } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { RenderComponentFixture, Query, QueryAll } from '@memberjunction/ng-test-utils';
import { DashboardLayoutPreviewComponent } from './dashboard-layout-preview.component';
import { DashboardLayoutPreviewNodeComponent } from './dashboard-layout-preview-node.component';
import type { DashboardLayoutPreviewNode } from './dashboard-layout-preview';

/** A tree a host already built: "Sales" above "Costs". */
const BUILT_TREE: DashboardLayoutPreviewNode = {
  Kind: 'column',
  Weight: 1,
  Children: [
    { Kind: 'panel', Weight: 0.5, Title: 'Sales', Icon: 'fa-solid fa-chart-line' },
    { Kind: 'panel', Weight: 0.5, Title: 'Costs', Icon: null },
  ],
};

/** A saved stack holding one dashboard panel, as the dashboard viewer saves it. */
function stack(title: string, icon: string, size: number, sizeUnit: '%' | 'fr' = '%') {
  return {
    type: 'stack',
    size,
    sizeUnit,
    activeItemIndex: 0,
    content: [
      { type: 'component', size: 1, sizeUnit: 'fr', title, componentType: 'dashboard-panel', componentState: { id: `p-${title}`, partTypeId: 'pt', title, icon, config: { type: 'View' } } },
    ],
  };
}

/** A saved dashboard configuration (UIConfigDetails) with this layout root. */
function saved(root: object): string {
  return JSON.stringify({ layout: { root, openPopouts: [], resolved: true }, settings: { theme: 'light' } });
}

/** "Applications" (32.3%) and "Users" (67.7%) side by side. */
const TWO_PANELS = saved({
  type: 'row',
  size: 1,
  sizeUnit: 'fr',
  content: [stack('Applications', 'fa-solid fa-table', 32.323232323232325), stack('Users', 'fa-solid fa-users', 67.67676767676768)],
});

/** "Revenue" on the left; "Deals" above "Churn" on the right. */
const NESTED = saved({
  type: 'row',
  size: 1,
  sizeUnit: 'fr',
  content: [
    stack('Revenue', 'fa-solid fa-chart-line', 40),
    { type: 'column', size: 60, sizeUnit: '%', content: [stack('Deals', 'fa-solid fa-database', 1, 'fr'), stack('Churn', 'fa-solid fa-table', 1, 'fr')] },
  ],
});

function render(UIConfigDetails: string | null, inputs: Record<string, unknown> = {}): ComponentFixture<DashboardLayoutPreviewComponent> {
  return RenderComponentFixture(DashboardLayoutPreviewComponent, {
    declarations: [DashboardLayoutPreviewComponent, DashboardLayoutPreviewNodeComponent],
    inputs: { UIConfigDetails, ...inputs },
  });
}

/** Renders the preview with only a tree the host built, as a dashboard card does. */
function renderTree(Preview: DashboardLayoutPreviewNode): ComponentFixture<DashboardLayoutPreviewComponent> {
  return RenderComponentFixture(DashboardLayoutPreviewComponent, {
    declarations: [DashboardLayoutPreviewComponent, DashboardLayoutPreviewNodeComponent],
    inputs: { Preview },
  });
}

const titles = (root: ComponentFixture<unknown> | Element): string[] =>
  (root instanceof Element ? Array.from(root.querySelectorAll('.dlp-panel')) : QueryAll(root, '.dlp-panel')).map(
    box => box.querySelector('.dlp-title')?.textContent?.trim() ?? '',
  );

describe('DashboardLayoutPreviewComponent (DOM)', () => {
  it('draws a box for each panel with its title and icon', () => {
    const f = render(TWO_PANELS);
    expect(titles(f)).toEqual(['Applications', 'Users']);
    expect(QueryAll(f, '.dlp-panel').map(box => box.querySelector('.dlp-icon i')?.className)).toEqual(['fa-solid fa-table', 'fa-solid fa-users']);
  });

  it("sizes each box by the panel's saved share of its row", () => {
    const f = render(TWO_PANELS);
    const panels = QueryAll(f, ':scope > mj-dashboard-layout-preview-node > mj-dashboard-layout-preview-node') as HTMLElement[];
    expect(panels.map(p => Number(p.style.flexGrow))).toEqual([expect.closeTo(0.3232, 4), expect.closeTo(0.6768, 4)]);
  });

  it('lays a row out side by side and a column top to bottom', () => {
    const f = render(NESTED);
    expect(Query(f, ':scope > mj-dashboard-layout-preview-node')?.classList.contains('dlp-row')).toBe(true);
    const columns = QueryAll(f, '.dlp-column');
    expect(columns.length).toBe(1);
    expect(titles(columns[0])).toEqual(['Deals', 'Churn']);
    expect(titles(f)).toEqual(['Revenue', 'Deals', 'Churn']);
  });

  it('is hidden from assistive technology, because the card already names the dashboard', () => {
    expect(render(TWO_PANELS).nativeElement.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['no configuration', null],
    ['the legacy tile format', '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}'],
  ])('draws nothing for %s', (_label, details) => {
    const f = render(details);
    expect(QueryAll(f, 'mj-dashboard-layout-preview-node')).toEqual([]);
  });

  it('draws the new layout when UIConfigDetails changes', () => {
    const f = render(TWO_PANELS);
    f.componentRef.setInput('UIConfigDetails', NESTED);
    f.detectChanges();
    expect(titles(f)).toEqual(['Revenue', 'Deals', 'Churn']);
  });

  it('draws a tree the host already built, given in Preview', () => {
    const f = renderTree(BUILT_TREE);
    expect(Query(f, ':scope > mj-dashboard-layout-preview-node')?.classList.contains('dlp-column')).toBe(true);
    expect(titles(f)).toEqual(['Sales', 'Costs']);
  });

  it('draws Preview rather than the parsed UIConfigDetails when it has both', () => {
    expect(titles(render(TWO_PANELS, { Preview: BUILT_TREE }))).toEqual(['Sales', 'Costs']);
  });

  it('renders only phrasing elements, so it is valid inside a button', () => {
    const f = render(NESTED);
    const tags = new Set(QueryAll(f, '*').map(el => el.tagName.toLowerCase()));
    expect([...tags].sort()).toEqual(['i', 'mj-dashboard-layout-preview-node', 'span']);
  });

  it('draws a panel without an icon with its title only', () => {
    const noIcon = saved({ type: 'stack', content: [{ type: 'component', componentState: { title: 'Plain' } }] });
    const f = render(noIcon);
    expect(titles(f)).toEqual(['Plain']);
    expect(Query(f, '.dlp-icon')).toBeNull();
  });
});
