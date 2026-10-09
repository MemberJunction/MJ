// The tools import @memberjunction/ng-dashboard-viewer, whose entry point loads partial-compiled Angular
// libraries. Load the JIT compiler first (same convention as the other node-env Angular suites).
import '@angular/compiler';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { ResolvedLayoutConfig } from 'golden-layout';
import { ExtractPanelsFromLayout, LayoutEditError, PANEL_PLACEMENTS, SimplifyLayout, type DashboardConfig, type DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
import { SOURCE_KINDS, type SourceSearchResult } from './dashboard-source-search';
import { BuildDashboardStudioTools, DASHBOARD_STUDIO_EDIT_TIMEOUT_MS, DescribePanelSource, type DashboardStudioHost } from './dashboard-studio-tools';
import type { DashboardTabToolResult } from './dashboard-tab-agent';

const VIEW = '6C975185-297C-420D-BD59-F5402AF35399';
const QUERY = '0EBDB415-EE18-46D4-B12E-03F3770921BA';

function panel(id: string, title: string, partTypeId = VIEW, config: Record<string, unknown> = { type: 'View', entityName: 'MJ: Users' }): DashboardPanel {
  return { id, title, partTypeId, config: { type: 'View', ...config } };
}
function component(p: DashboardPanel) {
  return { type: 'component', content: [], size: 1, sizeUnit: 'fr', title: p.title, componentType: 'dashboard-panel', componentState: p };
}
function stack(items: object[], size: number) {
  return { type: 'stack', content: items, size, sizeUnit: '%', activeItemIndex: 0 };
}
function layoutWith(root: object): ResolvedLayoutConfig {
  return { root, openPopouts: [], settings: {}, dimensions: {}, header: {}, resolved: true } as unknown as ResolvedLayoutConfig;
}
const users = () => panel('A', 'Users');
const orders = () => panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1' });
function twoAcross(): ResolvedLayoutConfig {
  return layoutWith({ type: 'row', content: [stack([component(users())], 32), stack([component(orders())], 68)], size: 1, sizeUnit: 'fr' });
}
function twoStacked(): ResolvedLayoutConfig {
  return layoutWith({ type: 'column', content: [stack([component(users())], 50), stack([component(orders())], 50)], size: 1, sizeUnit: 'fr' });
}
function ordersOnly(): ResolvedLayoutConfig {
  return layoutWith(stack([component(orders())], 100));
}
const customers = () => panel('C', 'Customers', VIEW, { type: 'View', entityName: 'MJ: Companies' });
function threeAcross(): ResolvedLayoutConfig {
  return layoutWith({ type: 'row', content: [stack([component(users())], 34), stack([component(orders())], 33), stack([component(customers())], 33)], size: 1, sizeUnit: 'fr' });
}
/** Users on the left; Orders above Customers on the right. */
function nested(): ResolvedLayoutConfig {
  const right = { type: 'column', content: [stack([component(orders())], 50), stack([component(customers())], 50)], size: 50, sizeUnit: '%' };
  return layoutWith({ type: 'row', content: [stack([component(users())], 50), right], size: 1, sizeUnit: 'fr' });
}
/** The panel ids in layout order, which is left to right across a row. */
function panelOrder(layout: ResolvedLayoutConfig | null): string[] {
  return ExtractPanelsFromLayout(layout).map(p => p.id);
}
/** The sizes, in percent, of a container's items, found from the root along `indexes`. */
function sizesAt(layout: ResolvedLayoutConfig | null, ...indexes: number[]): Array<number | undefined> {
  let node = SimplifyLayout(layout);
  for (const index of indexes) node = node?.children?.[index] ?? null;
  return node?.children?.map(child => child.sizePct) ?? [];
}
/** An ApplyLayout that shows the layout only after a timer, as a layout rebuild does. */
function slowApply(host: DashboardStudioHost & { config: DashboardConfig }) {
  return vi.fn().mockImplementation(async (layout: ResolvedLayoutConfig) => {
    await new Promise(resolve => setTimeout(resolve, 0));
    host.config.layout = layout;
  });
}
/** Makes ApplyLayout wait until the test calls the function this returns, then show the layout. */
function holdLayout(host: DashboardStudioHost & { config: DashboardConfig }): () => void {
  let release = (): void => undefined;
  host.ApplyLayout = vi.fn().mockImplementation(
    (layout: ResolvedLayoutConfig) =>
      new Promise<void>(resolve => {
        release = () => {
          host.config.layout = layout;
          resolve();
        };
      }),
  );
  return () => release();
}

function makeHost(overrides: Partial<DashboardStudioHost> = {}): DashboardStudioHost & { config: DashboardConfig } {
  const config: DashboardConfig = { layout: twoAcross(), settings: { theme: 'light', showHeaders: true, enablePopout: false, enableMaximize: true, enableDragDrop: true, enableResize: true } };
  const host = {
    config,
    Dashboard: () => ({ ID: 'd-1', Name: 'Sales', Description: null }),
    GetConfig: () => config,
    GetPartTypes: () => [{ ID: VIEW, Name: 'View', Icon: 'fa-solid fa-table' }, { ID: QUERY, Name: 'Query', Icon: 'fa-solid fa-database' }],
    IsEditing: () => true,
    CanEdit: () => true,
    HasUnsavedChanges: () => false,
    IsSaving: () => false,
    EnterEditMode: () => true,
    AddPanel: vi.fn().mockResolvedValue('panel-new'),
    RemovePanel: vi.fn().mockResolvedValue(undefined),
    UpdatePanelConfig: vi.fn().mockResolvedValue(undefined),
    ApplyLayout: vi.fn().mockImplementation(async (layout: ResolvedLayoutConfig) => { config.layout = layout; }),
    GetPanelPath: () => 'row/0 › tab 0',
    CaptureScreenshot: vi.fn().mockResolvedValue({ Base64: 'AAAA', MimeType: 'image/jpeg', Width: 1280, Height: 720 }),
    PanelBounds: () => [{ panelId: 'A', x: 0, y: 0, width: 400, height: 720 }, { panelId: 'B', x: 400, y: 0, width: 880, height: 720 }],
    IsVoiceSessionActive: () => false,
    SendVoiceFrame: vi.fn().mockReturnValue(true),
    Confirm: vi.fn().mockResolvedValue(true),
    SearchSources: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return host;
}
const tool = (host: DashboardStudioHost, name: string) => {
  const t = BuildDashboardStudioTools(host).find(x => x.Name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};
/** The tools of one BuildDashboardStudioTools call, by name, so they share one edit queue. */
function toolSet(host: DashboardStudioHost) {
  const tools = BuildDashboardStudioTools(host);
  return (name: string) => {
    const t = tools.find(x => x.Name === name);
    if (!t) throw new Error(`no tool ${name}`);
    return t;
  };
}
/** How many edits the tools asked the host to make. */
function editCalls(host: DashboardStudioHost): number {
  return [host.AddPanel, host.RemovePanel, host.UpdatePanelConfig, host.ApplyLayout].reduce((count, edit) => count + vi.mocked(edit).mock.calls.length, 0);
}

describe('DescribePanelSource', () => {
  it('reads a view, a query, an artifact and a url', () => {
    expect(DescribePanelSource({ type: 'View', viewId: 'v1' })).toEqual({ kind: 'view', id: 'v1', name: null });
    expect(DescribePanelSource({ type: 'View', entityName: 'MJ: Users' })).toEqual({ kind: 'entity', id: null, name: 'MJ: Users' });
    expect(DescribePanelSource({ type: 'Query', queryId: 'q1', queryName: 'Top' })).toEqual({ kind: 'query', id: 'q1', name: 'Top' });
    expect(DescribePanelSource({ type: 'Artifact', artifactId: 'a1' })).toEqual({ kind: 'artifact', id: 'a1', name: null });
    expect(DescribePanelSource({ type: 'WebURL', url: 'https://x' })).toEqual({ kind: 'url', id: null, name: 'https://x' });
  });
  it('takes the view over the entity and treats blank values as missing', () => {
    expect(DescribePanelSource({ type: 'View', viewId: 'v1', entityName: 'MJ: Users' })).toEqual({ kind: 'view', id: 'v1', name: null });
    expect(DescribePanelSource({ type: 'View', viewId: '  ', entityName: 'MJ: Users' })).toEqual({ kind: 'entity', id: null, name: 'MJ: Users' });
    expect(DescribePanelSource({ type: 'Query', queryName: 'Top' })).toEqual({ kind: 'query', id: null, name: 'Top' });
  });
  it('names another part type by its type', () => {
    expect(DescribePanelSource({ type: 'Chart', series: 3 })).toEqual({ kind: 'chart', id: null, name: null });
    expect(DescribePanelSource({ type: '' })).toEqual({ kind: 'unknown', id: null, name: null });
  });
});

describe('BuildDashboardStudioTools', () => {
  it('offers the studio tools with object parameter schemas', () => {
    const tools = BuildDashboardStudioTools(makeHost());
    expect(tools.map(t => t.Name)).toEqual(
      expect.arrayContaining([
        'GetDashboardState', 'AddPanel', 'RemovePanel', 'MovePanel', 'ResizePanel', 'UpdatePanelSettings',
        'GetDashboardScreenshot', 'RequestSaveDashboard', 'RequestPinToHome', 'SearchSources',
      ]),
    );
    expect(tools.map(t => t.Name)).not.toContain('RequestHomeTab');
    for (const t of tools) {
      expect(t.Description.length).toBeGreaterThan(0);
      expect(t.ParameterSchema['type']).toBe('object');
    }
  });
  it('offers every placement the layout editor takes, and end', () => {
    const schema = tool(makeHost(), 'MovePanel').ParameterSchema as { properties: { position: { properties: { placement: { enum: string[] } } } } };
    expect(schema.properties.position.properties.placement.enum).toEqual([...PANEL_PLACEMENTS, 'end']);
  });
  it('describes panel paths in the layout editor format', () => {
    expect(tool(makeHost(), 'GetDashboardState').Description).toContain('row/0 › column/1 › tab 0');
  });
});

describe('GetDashboardState', () => {
  it('lists panels with ids, part types, sources and paths, plus the layout', async () => {
    const r = await tool(makeHost(), 'GetDashboardState').Handler({});
    expect(r.Success).toBe(true);
    const data = r.Data as { dashboard: { id: string; isEditing: boolean }; panels: Array<{ id: string; partType: string; source: { kind: string }; path: string }>; layout: { kind: string } };
    expect(data.dashboard).toMatchObject({ id: 'd-1', name: 'Sales', isEditing: true, hasUnsavedChanges: false });
    expect(data.panels.map(p => [p.id, p.partType, p.source.kind])).toEqual([['A', 'View', 'entity'], ['B', 'Query', 'query']]);
    expect(data.panels[0].path).toBe('row/0 › tab 0');
    expect(data.layout.kind).toBe('row');
  });
  it('fails when no dashboard is open', async () => {
    const r = await tool(makeHost({ Dashboard: () => null, GetConfig: () => null }), 'GetDashboardState').Handler({});
    expect(r.Success).toBe(false);
  });
  it('gives each panel its title, config, path and size, and lists the part types', async () => {
    const r = await tool(makeHost(), 'GetDashboardState').Handler({});
    const data = r.Data as { panels: object[]; partTypes: string[]; dashboard: object };
    expect(data.panels).toEqual([
      expect.objectContaining({ id: 'A', title: 'Users', icon: null, config: { type: 'View', entityName: 'MJ: Users' }, path: 'row/0 › tab 0', size: { widthPct: 32, heightPct: null } }),
      expect.objectContaining({ id: 'B', title: 'Orders', source: { kind: 'query', id: 'q-1', name: null }, path: 'row/1 › tab 0', size: { widthPct: 68, heightPct: null } }),
    ]);
    expect(data.partTypes).toEqual(['View', 'Query']);
    expect(data.dashboard).toEqual({ id: 'd-1', name: 'Sales', description: null, isEditing: true, canEdit: true, hasUnsavedChanges: false });
  });
  it('gives a height for a panel in a column', async () => {
    const host = makeHost();
    host.config.layout = twoStacked();
    const data = (await tool(host, 'GetDashboardState').Handler({})).Data as { panels: Array<{ size: object }> };
    expect(data.panels.map(p => p.size)).toEqual([{ widthPct: null, heightPct: 50 }, { widthPct: null, heightPct: 50 }]);
  });
  it('names the part type from the config when the part type is not installed', async () => {
    const data = (await tool(makeHost({ GetPartTypes: () => [] }), 'GetDashboardState').Handler({})).Data as { panels: Array<{ partType: string }> };
    expect(data.panels.map(p => p.partType)).toEqual(['View', 'Query']);
  });
  it('reports a dashboard with no panels', async () => {
    const host = makeHost();
    host.config.layout = null;
    const r = await tool(host, 'GetDashboardState').Handler({});
    expect(r.Success).toBe(true);
    expect(r.Data).toMatchObject({ panels: [], layout: null });
  });
  it('fails while the dashboard configuration has not loaded', async () => {
    const r = await tool(makeHost({ GetConfig: () => null }), 'GetDashboardState').Handler({});
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('loading');
  });
  it('returns a failure instead of throwing when the host throws', async () => {
    const r = await tool(makeHost({ GetConfig: () => { throw new Error('The viewer is gone.'); } }), 'GetDashboardState').Handler({});
    expect(r).toEqual({ Success: false, ErrorMessage: 'The viewer is gone.' });
  });
});

describe('AddPanel', () => {
  it('validates the config, enters edit mode and adds with a position', async () => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'Query', config: { queryId: 'q-9' }, title: 'Revenue', position: { relativeTo: 'A', placement: 'right' } });
    expect(r).toEqual({ Success: true, Data: { panelId: 'panel-new', path: 'row/0 › tab 0' } });
    expect(enter).toHaveBeenCalled();
    expect(host.AddPanel).toHaveBeenCalledWith(QUERY, { type: 'Query', queryId: 'q-9' }, 'Revenue', undefined, { relativeTo: 'A', placement: 'right' });
  });
  it('rejects an unknown part type', async () => {
    const r = await tool(makeHost(), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'Chart', config: {}, title: 'x' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('View, Query, Artifact, WebURL');
  });
  it('rejects a bad config without touching the host', async () => {
    const host = makeHost();
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { displayMode: 'grid' }, title: 'x' });
    expect(r.Success).toBe(false);
    expect(host.AddPanel).not.toHaveBeenCalled();
  });
  it('fails when the user cannot edit', async () => {
    const r = await tool(makeHost({ IsEditing: () => false, CanEdit: () => false, EnterEditMode: () => false }), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('cannot edit');
  });
  it('fails while a save runs', async () => {
    const r = await tool(makeHost({ IsSaving: () => true }), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r.ErrorMessage).toContain('save');
  });
  it('adds at the end with a trimmed title and an icon, matching the part type name without regard to case', async () => {
    const host = makeHost();
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'query', config: { queryId: ' q-9 ' }, title: '  Revenue  ', icon: 'fa-solid fa-chart-line', position: { placement: 'end' } });
    expect(r.Success).toBe(true);
    expect(host.AddPanel).toHaveBeenCalledWith(QUERY, { type: 'Query', queryId: 'q-9' }, 'Revenue', 'fa-solid fa-chart-line', { placement: 'end' });
  });
  it('adds without a position', async () => {
    const host = makeHost();
    await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { viewId: 'v-1' }, title: 'Team' });
    expect(host.AddPanel).toHaveBeenCalledWith(VIEW, { type: 'View', viewId: 'v-1' }, 'Team', undefined, undefined);
  });
  it('fails for a part type the dashboard does not have', async () => {
    const host = makeHost();
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'WebURL', config: { url: 'https://example.com' }, title: 'Site' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('WebURL part type is not available');
    expect(r.ErrorMessage).toContain('Part types it can add: View, Query.');
    expect(host.AddPanel).not.toHaveBeenCalled();
  });
  it('says when the dashboard can add no part type', async () => {
    const r = await tool(makeHost({ GetPartTypes: () => [] }), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r.ErrorMessage).toBe('The View part type is not available in this dashboard. Part types it can add: (none).');
  });
  it('rejects a missing title', async () => {
    const r = await tool(makeHost(), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: '   ' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('title');
  });
  it('rejects a position it cannot place, without touching the host', async () => {
    const host = makeHost();
    const add = (position: unknown) => tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x', position });
    expect((await add('right of Users')).ErrorMessage).toContain('position must be an object');
    expect((await add({ placement: 'right' })).ErrorMessage).toContain('position.relativeTo is required for placement "right"');
    expect((await add({ relativeTo: 'Z', placement: 'below' })).ErrorMessage).toContain('position.relativeTo "Z" matches no panel id or title.');
    expect((await add({ relativeTo: 'A', placement: 'beside' })).ErrorMessage).toContain('left, right, above, below, tab, end');
    expect(host.AddPanel).not.toHaveBeenCalled();
  });
  it('checks the call before it enters edit mode', async () => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { displayMode: 'grid' }, title: 'x' });
    expect(r.Success).toBe(false);
    expect(enter).not.toHaveBeenCalled();
  });
  it('checks the call again when entering edit mode reloads the dashboard', async () => {
    const host = makeHost({ IsEditing: () => false });
    host.EnterEditMode = () => {
      host.config.layout = ordersOnly();
      return true;
    };
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'Query', config: { queryId: 'q-9' }, title: 'Revenue', position: { relativeTo: 'A', placement: 'right' } });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('position.relativeTo "A" matches no panel id or title. Panels: Orders (B).');
    expect(host.AddPanel).not.toHaveBeenCalled();
  });
  it('fails when the dashboard does not add the panel', async () => {
    const r = await tool(makeHost({ AddPanel: vi.fn().mockResolvedValue(null) }), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('did not add the panel');
  });
  it('reports a rejected add as a failed result with the error message', async () => {
    const params = { dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x', position: { relativeTo: 'A', placement: 'tab' } };
    const refused = await tool(makeHost({ AddPanel: vi.fn().mockRejectedValue(new LayoutEditError('Panel "A" is not in the layout.')) }), 'AddPanel').Handler(params);
    expect(refused.Success).toBe(false);
    expect(refused.ErrorMessage).toContain('Panel "A" is not in the layout.');
    const failed = await tool(makeHost({ AddPanel: vi.fn().mockRejectedValue(new Error('The layout did not rebuild')) }), 'AddPanel').Handler(params);
    expect(failed.Success).toBe(false);
    expect(failed.ErrorMessage).toContain('The layout did not rebuild.');
    expect(failed.ErrorMessage).toContain('GetDashboardState');
  });
  it('fails when the tab does not enter edit mode', async () => {
    const r = await tool(makeHost({ IsEditing: () => false, EnterEditMode: () => false }), 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('could not enter edit mode');
  });
  it('returns a failure instead of throwing when a host read throws', async () => {
    const host = makeHost({ GetPartTypes: () => { throw new Error('Part types are not loaded.'); } });
    const r = await tool(host, 'AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'x' });
    expect(r).toEqual({ Success: false, ErrorMessage: 'Part types are not loaded.' });
  });
});

describe('RemovePanel', () => {
  it('removes a known panel', async () => {
    const host = makeHost();
    const r = await tool(host, 'RemovePanel').Handler({ dashboardId: 'd-1', panelId: 'A' });
    expect(r).toEqual({ Success: true, Data: { removed: true, panelId: 'A' } });
    expect(host.RemovePanel).toHaveBeenCalledWith('A');
  });
  it('fails for an unknown panel and lists the known ones', async () => {
    const r = await tool(makeHost(), 'RemovePanel').Handler({ dashboardId: 'd-1', panelId: 'Z' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('panelId "Z" matches no panel id or title.');
    expect(r.ErrorMessage).toContain('Users (A)');
  });
  it('finds a panel by its title when no id matches', async () => {
    const host = makeHost();
    await tool(host, 'RemovePanel').Handler({ dashboardId: 'd-1', panelId: ' orders ' });
    expect(host.RemovePanel).toHaveBeenCalledWith('B');
  });
  it('fails for a title that more than one panel has', async () => {
    const host = makeHost();
    host.config.layout = layoutWith({ type: 'row', content: [stack([component(users())], 50), stack([component(panel('C', 'Users'))], 50)], size: 1, sizeUnit: 'fr' });
    const r = await tool(host, 'RemovePanel').Handler({ dashboardId: 'd-1', panelId: 'users' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('panelId "users" matches more than one panel title: Users (A), Users (C). Pass a panel id.');
    expect(host.RemovePanel).not.toHaveBeenCalled();
  });
  it('fails without a panel id', async () => {
    const r = await tool(makeHost(), 'RemovePanel').Handler({ dashboardId: 'd-1' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('panelId is required');
  });
});

describe('MovePanel', () => {
  it('applies the moved layout', async () => {
    const host = makeHost();
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'right' } });
    expect(r.Success).toBe(true);
    expect(host.ApplyLayout).toHaveBeenCalledTimes(1);
    const root = host.config.layout!.root as unknown as { content: Array<{ content: Array<{ componentState: { id: string } }> }> };
    expect(root.content.map(s => s.content[0].componentState.id)).toEqual(['B', 'A']);
  });
  it('rejects an invalid placement', async () => {
    const r = await tool(makeHost(), 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'diagonal' } });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('placement');
  });
  it('reports the path the dashboard gives the moved panel', async () => {
    const host = makeHost({ GetPanelPath: id => (id === 'A' ? 'row/1 › tab 0' : null) });
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } });
    expect(r).toEqual({ Success: true, Data: { moved: true, panelId: 'A', path: 'row/1 › tab 0' } });
  });
  it('refuses to place a panel relative to itself', async () => {
    const host = makeHost();
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'A', placement: 'tab' } });
    expect(r.ErrorMessage).toBe('A panel cannot be placed relative to itself.');
    expect(host.ApplyLayout).not.toHaveBeenCalled();
  });
  it('requires a position', async () => {
    const r = await tool(makeHost(), 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('position is required');
  });
  it('does not enter edit mode for a move it cannot make', async () => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'diagonal' } });
    expect(enter).not.toHaveBeenCalled();
  });
  it('reports a failed layout rebuild with the error message', async () => {
    const host = makeHost({ ApplyLayout: vi.fn().mockRejectedValue(new Error('The dashboard container has no size.')) });
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'below' } });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toBe('The dashboard container has no size. Call GetDashboardState to see the dashboard as it is now.');
  });
  it('names position.relativeTo when its title matches more than one panel', async () => {
    const host = makeHost();
    host.config.layout = layoutWith({ type: 'row', content: [stack([component(users())], 34), stack([component(orders())], 33), stack([component(panel('C', 'Orders'))], 33)], size: 1, sizeUnit: 'fr' });
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'orders', placement: 'below' } });
    expect(r.ErrorMessage).toBe('position.relativeTo "orders" matches more than one panel title: Orders (B), Orders (C). Pass a panel id.');
    expect(host.ApplyLayout).not.toHaveBeenCalled();
  });
  it('checks the move again when entering edit mode reloads the dashboard', async () => {
    const host = makeHost({ IsEditing: () => false });
    host.EnterEditMode = () => {
      host.config.layout = ordersOnly();
      return true;
    };
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'below' } });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('panelId "A" matches no panel id or title. Panels: Orders (B).');
    expect(host.ApplyLayout).not.toHaveBeenCalled();
  });
  it('builds the move on the layout that entering edit mode reloads', async () => {
    const host = makeHost({ IsEditing: () => false });
    host.EnterEditMode = () => {
      host.config.layout = threeAcross();
      return true;
    };
    const r = await tool(host, 'MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } });
    expect(r.Success).toBe(true);
    expect(panelOrder(host.config.layout)).toEqual(['B', 'C', 'A']);
  });
});

describe('ResizePanel', () => {
  it('applies the resized layout', async () => {
    const host = makeHost();
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 50 });
    expect(r.Success).toBe(true);
    const root = host.config.layout!.root as unknown as { content: Array<{ size: number }> };
    expect(root.content.map(s => s.size)).toEqual([50, 50]);
  });
  it('fails with neither width nor height', async () => {
    const r = await tool(makeHost(), 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A' });
    expect(r.Success).toBe(false);
  });
  it('reports the size the panel got, which the layout editor keeps within bounds', async () => {
    const r = await tool(makeHost(), 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 120 });
    expect(r).toEqual({ Success: true, Data: { resized: true, panelId: 'A', size: { widthPct: 95, heightPct: null } } });
  });
  it('sets a height in a column', async () => {
    const host = makeHost();
    host.config.layout = twoStacked();
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'B', heightPct: 30 });
    expect(r.Data).toEqual({ resized: true, panelId: 'B', size: { widthPct: null, heightPct: 30 } });
    const root = host.config.layout!.root as unknown as { content: Array<{ size: number }> };
    expect(root.content.map(s => s.size)).toEqual([70, 30]);
  });
  it('waits for the layout to apply, then reads the size back from the dashboard', async () => {
    const host = makeHost();
    let finish: (() => void) | undefined;
    host.ApplyLayout = vi.fn().mockImplementation(
      (layout: ResolvedLayoutConfig) =>
        new Promise<void>(resolve => {
          finish = () => {
            host.config.layout = layout;
            resolve();
          };
        }),
    );
    let settled = false;
    const pending = tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 40 }).then(result => {
      settled = true;
      return result;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    finish?.();
    expect(await pending).toEqual({ Success: true, Data: { resized: true, panelId: 'A', size: { widthPct: 40, heightPct: null } } });
  });
  it('fails, without touching the host, for a height the panel does not have', async () => {
    const host = makeHost();
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', heightPct: 50 });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('has no height to change');
    expect(host.ApplyLayout).not.toHaveBeenCalled();
  });
  it('rejects a size that is not a number', async () => {
    const r = await tool(makeHost(), 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: '50' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('widthPct must be a number');
  });
  it('sets the width and the height at once in a nested layout', async () => {
    const host = makeHost();
    host.config.layout = nested();
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'B', widthPct: 60, heightPct: 30 });
    expect(r).toEqual({ Success: true, Data: { resized: true, panelId: 'B', size: { widthPct: 60, heightPct: 30 } } });
    expect(sizesAt(host.config.layout)).toEqual([40, 60]);
    expect(sizesAt(host.config.layout, 1)).toEqual([30, 70]);
  });
  it('checks the resize again when entering edit mode reloads the dashboard', async () => {
    const host = makeHost({ IsEditing: () => false });
    host.EnterEditMode = () => {
      host.config.layout = twoStacked();
      return true;
    };
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 40 });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('has no width to change');
    expect(host.ApplyLayout).not.toHaveBeenCalled();
  });
  it('builds the resize on the layout that entering edit mode reloads', async () => {
    const host = makeHost({ IsEditing: () => false });
    host.EnterEditMode = () => {
      host.config.layout = threeAcross();
      return true;
    };
    const r = await tool(host, 'ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 50 });
    expect(r.Data).toEqual({ resized: true, panelId: 'A', size: { widthPct: 50, heightPct: null } });
    expect(sizesAt(host.config.layout)).toEqual([50, 25, 25]);
  });
});

describe('UpdatePanelSettings', () => {
  it('merges a config patch and validates the result', async () => {
    const host = makeHost();
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { autoRefreshSeconds: 60 }, title: 'Orders (live)' });
    expect(r.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('B', { type: 'Query', queryId: 'q-1', autoRefreshSeconds: 60 }, 'Orders (live)', undefined);
  });
  it('rejects an unknown key', async () => {
    const r = await tool(makeHost(), 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { colour: 'red' } });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('Query config has unknown keys: colour.');
    expect(r.ErrorMessage).not.toContain('current config');
  });
  it('changes the title and icon and keeps the config', async () => {
    const host = makeHost();
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'A', title: ' People ', icon: 'fa-solid fa-user' });
    expect(r).toEqual({ Success: true, Data: { updated: true, panelId: 'A' } });
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('A', { type: 'View', entityName: 'MJ: Users' }, 'People', 'fa-solid fa-user');
  });
  it('keeps the part type when the patch names another', async () => {
    const host = makeHost();
    await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { type: 'View', queryId: ' q-2 ' } });
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('B', { type: 'Query', queryId: 'q-2' }, undefined, undefined);
  });
  it('fails when there is nothing to change', async () => {
    const host = makeHost();
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'A', title: '' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('Pass config, title or icon');
    expect(host.UpdatePanelConfig).not.toHaveBeenCalled();
  });
  it('rejects a config that is not an object', async () => {
    const r = await tool(makeHost(), 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: 'fast' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('config must be an object');
  });
  it('changes only the title of a panel whose part type has no config rules', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('X', 'Chart', 'CHART-ID', { type: 'Chart', series: 3 }))], 100));
    const patched = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'X', config: { series: 4 } });
    expect(patched.Success).toBe(false);
    expect(patched.ErrorMessage).toContain('Chart');
    const renamed = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'X', title: 'Trend' });
    expect(renamed.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('X', { type: 'Chart', series: 3 }, 'Trend', undefined);
  });
  it('treats an empty config as no change to the config', async () => {
    const host = makeHost();
    const renamed = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'A', config: {}, title: 'People' });
    expect(renamed.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('A', { type: 'View', entityName: 'MJ: Users' }, 'People', undefined);
    const nothing = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'A', config: {} });
    expect(nothing.ErrorMessage).toContain('Pass config, title or icon');
    expect(host.UpdatePanelConfig).toHaveBeenCalledTimes(1);
  });
  it('renames a panel whose part type has no config rules when the config is empty', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('X', 'Chart', 'CHART-ID', { type: 'Chart', series: 3 }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'X', config: {}, title: 'Trend' });
    expect(r.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('X', { type: 'Chart', series: 3 }, 'Trend', undefined);
  });
  it('says the current config is invalid, and names the key, when a value the call did not send fails', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1', autoRefreshSeconds: 45 }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { showParameterControls: true } });
    expect(r).toEqual({
      Success: false,
      ErrorMessage:
        'The current config of panel "Orders" is invalid, in values this call did not send: Query config: autoRefreshSeconds must be one of ' +
        '0, 30, 60, 300, 600. Send a valid value or null (which removes the key) for autoRefreshSeconds, or change only the title or icon.',
    });
    expect(host.UpdatePanelConfig).not.toHaveBeenCalled();
  });
  it('names every stored key the part type does not allow', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1', colour: 'red', size: 2 }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { autoRefreshSeconds: 60 } });
    expect(r.ErrorMessage).toContain('The current config of panel "Orders" is invalid, in values this call did not send: Query config has unknown keys: colour.');
    expect(r.ErrorMessage).toContain('Query config has unknown keys: size.');
    expect(r.ErrorMessage).toContain('for colour and size, or change only the title or icon.');
  });
  it('removes the keys the patch sets to null before it checks the config', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1', colour: 'red', autoRefreshSeconds: 45 }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { colour: null, autoRefreshSeconds: null, showParameterControls: true } });
    expect(r.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('B', { type: 'Query', queryId: 'q-1', showParameterControls: true }, undefined, undefined);
  });
  it('accepts a valid value for the stored key that failed', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1', autoRefreshSeconds: 45 }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { autoRefreshSeconds: 60 } });
    expect(r.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('B', { type: 'Query', queryId: 'q-1', autoRefreshSeconds: 60 }, undefined, undefined);
  });
  it('still changes the title of a panel whose current config is invalid', async () => {
    const host = makeHost();
    host.config.layout = layoutWith(stack([component(panel('B', 'Orders', QUERY, { type: 'Query', queryId: 'q-1', colour: 'red' }))], 100));
    const r = await tool(host, 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', title: 'Open orders' });
    expect(r.Success).toBe(true);
    expect(host.UpdatePanelConfig).toHaveBeenCalledWith('B', { type: 'Query', queryId: 'q-1', colour: 'red' }, 'Open orders', undefined);
  });
  it('reports a missing source key as the call\'s problem', async () => {
    const r = await tool(makeHost(), 'UpdatePanelSettings').Handler({ dashboardId: 'd-1', panelId: 'B', config: { queryId: null } });
    expect(r.ErrorMessage).toBe('Query config needs queryId or queryName.');
  });
});

describe('every edit tool', () => {
  const edits: Array<[string, Record<string, unknown>]> = [
    ['AddPanel', { dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'People' }],
    ['RemovePanel', { dashboardId: 'd-1', panelId: 'A' }],
    ['MovePanel', { dashboardId: 'd-1', panelId: 'A', position: { relativeTo: 'B', placement: 'below' } }],
    ['ResizePanel', { dashboardId: 'd-1', panelId: 'A', widthPct: 40 }],
    ['UpdatePanelSettings', { dashboardId: 'd-1', panelId: 'A', title: 'People' }],
  ];

  it.each(edits)('%s enters edit mode, then makes one edit', async (name, params) => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, name).Handler(params);
    expect(r.Success).toBe(true);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(editCalls(host)).toBe(1);
  });
  it.each(edits)('%s does not enter edit mode again when the tab is editing', async (name, params) => {
    const host = makeHost();
    const enter = vi.spyOn(host, 'EnterEditMode');
    expect((await tool(host, name).Handler(params)).Success).toBe(true);
    expect(enter).not.toHaveBeenCalled();
  });
  it.each(edits)('%s changes nothing while a save runs', async (name, params) => {
    const host = makeHost({ IsEditing: () => false, IsSaving: () => true });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, name).Handler(params);
    expect(r).toEqual({ Success: false, ErrorMessage: 'A save is in progress. Try again when it finishes.' });
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
  it.each(edits)('%s changes nothing when the user cannot edit', async (name, params) => {
    const host = makeHost({ IsEditing: () => false, CanEdit: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, name).Handler(params);
    expect(r).toEqual({ Success: false, ErrorMessage: 'The user cannot edit this dashboard.' });
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
  it.each(edits)('%s fails when no dashboard is open', async (name, params) => {
    const host = makeHost({ Dashboard: () => null });
    const r = await tool(host, name).Handler(params);
    expect(r).toEqual({ Success: false, ErrorMessage: 'No Config dashboard is open in this tab.' });
    expect(editCalls(host)).toBe(0);
  });
  it.each(edits)('%s refuses a call for another dashboard before any other host call', async (name, params) => {
    const host = makeHost({ IsEditing: () => false });
    const reads = [vi.spyOn(host, 'GetConfig'), vi.spyOn(host, 'IsSaving'), vi.spyOn(host, 'CanEdit'), vi.spyOn(host, 'EnterEditMode')];
    const r = await tool(host, name).Handler({ ...params, dashboardId: 'd-2' });
    expect(r).toEqual({ Success: false, ErrorMessage: 'The open dashboard changed. Call GetDashboardState and use its dashboard.id.' });
    for (const read of reads) expect(read).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
  it.each(edits)('%s refuses a call without a dashboardId', async (name, params) => {
    const host = makeHost();
    const { dashboardId: _omitted, ...withoutId } = params;
    const r = await tool(host, name).Handler(withoutId);
    expect(r).toEqual({ Success: false, ErrorMessage: 'dashboardId is required: call GetDashboardState and pass its dashboard.id.' });
    expect(editCalls(host)).toBe(0);
  });
  it.each(edits)('%s matches the dashboard id without regard to case or outer spaces', async (name, params) => {
    const host = makeHost({ Dashboard: () => ({ ID: '6C975185-297C-420D-BD59-F5402AF35399', Name: 'Sales', Description: null }) });
    const r = await tool(host, name).Handler({ ...params, dashboardId: ' 6c975185-297c-420d-bd59-f5402af35399 ' });
    expect(r.Success).toBe(true);
    expect(editCalls(host)).toBe(1);
  });
  it.each(edits)('%s schema requires the dashboardId', (name) => {
    const schema = tool(makeHost(), name).ParameterSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties['dashboardId']).toEqual({ type: 'string', description: 'The dashboard.id from GetDashboardState.' });
    expect(schema.required).toContain('dashboardId');
    expect(tool(makeHost(), name).Description).toContain('Pass the dashboard.id from GetDashboardState as dashboardId');
  });

  const badCalls: Array<[string, Record<string, unknown>]> = [
    ['AddPanel', { dashboardId: 'd-1', partType: 'Chart', config: {}, title: 'x' }],
    ['RemovePanel', { dashboardId: 'd-1', panelId: 'Z' }],
    ['MovePanel', { dashboardId: 'd-1', panelId: 'Z', position: { placement: 'end' } }],
    ['ResizePanel', { dashboardId: 'd-1', panelId: 'A' }],
    ['UpdatePanelSettings', { dashboardId: 'd-1', panelId: 'A' }],
  ];
  it.each(badCalls)('%s reports a running save before it checks the call', async (name, params) => {
    const r = await tool(makeHost({ IsSaving: () => true }), name).Handler(params);
    expect(r).toEqual({ Success: false, ErrorMessage: 'A save is in progress. Try again when it finishes.' });
  });
  it.each(badCalls)('%s reports that the user cannot edit before it checks the call', async (name, params) => {
    const r = await tool(makeHost({ IsEditing: () => false, CanEdit: () => false }), name).Handler(params);
    expect(r).toEqual({ Success: false, ErrorMessage: 'The user cannot edit this dashboard.' });
  });
  it.each(badCalls)('%s checks the call before it enters edit mode', async (name, params) => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, name).Handler(params);
    expect(r.Success).toBe(false);
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
});

describe('the edit queue', () => {
  it('runs concurrent edits one at a time, so both moves land', async () => {
    const host = makeHost();
    host.config.layout = threeAcross();
    host.ApplyLayout = slowApply(host);
    const move = toolSet(host)('MovePanel');
    const [first, second] = await Promise.all([
      move.Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } }),
      move.Handler({ dashboardId: 'd-1', panelId: 'B', position: { placement: 'end' } }),
    ]);
    expect([first.Success, second.Success]).toEqual([true, true]);
    expect(panelOrder(host.config.layout)).toEqual(['C', 'A', 'B']);
  });
  it('checks an edit only after the edit before it has applied, across tools', async () => {
    const host = makeHost();
    host.config.layout = threeAcross();
    host.ApplyLayout = slowApply(host);
    const tools = toolSet(host);
    const [moved, resized] = await Promise.all([
      tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } }),
      tools('ResizePanel').Handler({ dashboardId: 'd-1', panelId: 'A', widthPct: 50 }),
    ]);
    expect([moved.Success, resized.Success]).toEqual([true, true]);
    expect(panelOrder(host.config.layout)).toEqual(['B', 'C', 'A']);
    expect(sizesAt(host.config.layout)).toEqual([25, 25, 50]);
  });
  it('starts the next edit after one that fails', async () => {
    const host = makeHost();
    host.config.layout = threeAcross();
    host.ApplyLayout = vi
      .fn()
      .mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        throw new Error('The layout did not rebuild.');
      })
      .mockImplementation(async (layout: ResolvedLayoutConfig) => {
        host.config.layout = layout;
      });
    const move = toolSet(host)('MovePanel');
    const [first, second] = await Promise.all([
      move.Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } }),
      move.Handler({ dashboardId: 'd-1', panelId: 'B', position: { placement: 'end' } }),
    ]);
    expect(first.Success).toBe(false);
    expect(second.Success).toBe(true);
    expect(panelOrder(host.config.layout)).toEqual(['A', 'C', 'B']);
  });
  it('reads the dashboard after the edits queued before the read', async () => {
    const host = makeHost();
    host.config.layout = threeAcross();
    host.ApplyLayout = slowApply(host);
    const tools = toolSet(host);
    const [moved, state] = await Promise.all([
      tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } }),
      tools('GetDashboardState').Handler({}),
    ]);
    expect(moved.Success).toBe(true);
    expect((state.Data as { panels: Array<{ id: string }> }).panels.map(p => p.id)).toEqual(['B', 'C', 'A']);
  });
  it('asks to save after an edit that arrived first has entered edit mode', async () => {
    let editing = false;
    const host = makeHost({
      IsEditing: () => editing,
      EnterEditMode: () => {
        editing = true;
        return true;
      },
    });
    const tools = toolSet(host);
    const [added, saved] = await Promise.all([
      tools('AddPanel').Handler({ dashboardId: 'd-1', partType: 'View', config: { entityName: 'MJ: Users' }, title: 'People' }),
      tools('RequestSaveDashboard').Handler({ dashboardId: 'd-1' }),
    ]);
    expect(added.Success).toBe(true);
    expect(saved).toEqual({ Success: true, Data: { requested: true, confirmed: true } });
    expect(host.Confirm).toHaveBeenCalledWith('save', { name: undefined, description: undefined });
  });

  it('refuses a queued edit when the open dashboard changed while it waited', async () => {
    const host = makeHost();
    let openId = 'd-1';
    host.Dashboard = () => ({ ID: openId, Name: 'Sales', Description: null });
    const release = holdLayout(host);
    const tools = toolSet(host);
    const first = tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } });
    const second = tools('RemovePanel').Handler({ dashboardId: 'd-1', panelId: 'B' });
    await new Promise(resolve => setTimeout(resolve, 0));
    openId = 'd-2';
    release();
    expect((await first).Success).toBe(true);
    expect(await second).toEqual({ Success: false, ErrorMessage: 'The open dashboard changed. Call GetDashboardState and use its dashboard.id.' });
    expect(host.RemovePanel).not.toHaveBeenCalled();
  });

  const waiting: Array<[string, Record<string, unknown>]> = [
    ['GetDashboardState', {}],
    ['GetDashboardScreenshot', {}],
    ['RequestSaveDashboard', { dashboardId: 'd-1' }],
    ['RequestPinToHome', { dashboardId: 'd-1' }],
    ['SearchSources', { query: 'rev' }],
  ];
  it.each(waiting)('%s waits for the edits queued before it', async (name, params) => {
    const host = makeHost();
    const release = holdLayout(host);
    const tools = toolSet(host);
    const move = tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } });
    let settled = false;
    const pending = tools(name).Handler(params).then(result => {
      settled = true;
      return result;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    release();
    expect((await move).Success).toBe(true);
    expect((await pending).Success).toBe(true);
  });

  describe('with a timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    it('fails an edit that does not finish in time, then starts the next edit', async () => {
      vi.useFakeTimers();
      const host = makeHost();
      host.config.layout = threeAcross();
      host.ApplyLayout = vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>(() => undefined))
        .mockImplementation(async (layout: ResolvedLayoutConfig) => {
          host.config.layout = layout;
        });
      const tools = toolSet(host);
      const first = tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } });
      const second = tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'B', position: { placement: 'end' } });
      const state = tools('GetDashboardState').Handler({});
      await vi.advanceTimersByTimeAsync(DASHBOARD_STUDIO_EDIT_TIMEOUT_MS - 1);
      expect(host.ApplyLayout).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await first).toEqual({
        Success: false,
        ErrorMessage: 'The edit did not finish within 30 seconds. It may still apply later. Call GetDashboardState to see the dashboard as it is now.',
      });
      expect(await second).toEqual({ Success: true, Data: { moved: true, panelId: 'B', path: 'row/0 › tab 0' } });
      expect(panelOrder(host.config.layout)).toEqual(['A', 'C', 'B']);
      expect(((await state).Data as { panels: Array<{ id: string }> }).panels.map(p => p.id)).toEqual(['A', 'C', 'B']);
    });
    it('clears the timer of an edit that finishes in time', async () => {
      vi.useFakeTimers();
      const host = makeHost();
      expect((await tool(host, 'RemovePanel').Handler({ dashboardId: 'd-1', panelId: 'A' })).Success).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    /** How the test settles an edit call after its timeout. */
    type LateEdit = { resolve: () => void; reject: (error: Error) => void };
    const timedOut: DashboardTabToolResult = {
      Success: false,
      ErrorMessage: 'The edit did not finish within 30 seconds. It may still apply later. Call GetDashboardState to see the dashboard as it is now.',
    };
    it.each([
      ['resolves', (late: LateEdit) => late.resolve()],
      ['rejects', (late: LateEdit) => late.reject(new Error('The layout did not rebuild.'))],
    ])('keeps the timeout failure when the late edit call %s after the next edit, and the next edit is unaffected', async (_settles, settleLate) => {
      vi.useFakeTimers();
      const host = makeHost();
      host.config.layout = threeAcross();
      let late: LateEdit = { resolve: () => undefined, reject: () => undefined };
      host.ApplyLayout = vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>((resolve, reject) => (late = { resolve, reject })))
        .mockImplementation(async (layout: ResolvedLayoutConfig) => {
          host.config.layout = layout;
        });
      const tools = toolSet(host);
      const firstResults: DashboardTabToolResult[] = [];
      const first = tools('MovePanel')
        .Handler({ dashboardId: 'd-1', panelId: 'A', position: { placement: 'end' } })
        .then(result => {
          firstResults.push(result);
          return result;
        });
      await vi.advanceTimersByTimeAsync(DASHBOARD_STUDIO_EDIT_TIMEOUT_MS);
      expect(await first).toEqual(timedOut);

      // The next edit runs to the end while the late call still runs.
      const second = await tools('MovePanel').Handler({ dashboardId: 'd-1', panelId: 'B', position: { placement: 'end' } });
      expect(second).toEqual({ Success: true, Data: { moved: true, panelId: 'B', path: 'row/0 › tab 0' } });
      expect(panelOrder(host.config.layout)).toEqual(['A', 'C', 'B']);

      settleLate(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(firstResults).toEqual([timedOut]);
      expect(panelOrder(host.config.layout)).toEqual(['A', 'C', 'B']);
      expect(host.ApplyLayout).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('GetDashboardScreenshot', () => {
  it('returns the image as media and the panel bounds scaled to the image', async () => {
    const host = makeHost();
    const r = await tool(host, 'GetDashboardScreenshot').Handler({});
    expect(r.Success).toBe(true);
    expect(r.Media).toEqual([{ MimeType: 'image/jpeg', Base64: 'AAAA', Width: 1280, Height: 720 }]);
    expect(r.Data).toMatchObject({ width: 1280, height: 720, panelBounds: [{ panelId: 'A', x: 0, y: 0, width: 400, height: 720 }, { panelId: 'B', x: 400 }] });
    expect(host.CaptureScreenshot).toHaveBeenCalledWith(1280);
  });
  it('also sends a voice frame when a voice session is active', async () => {
    const host = makeHost({ IsVoiceSessionActive: () => true });
    const r = await tool(host, 'GetDashboardScreenshot').Handler({ maxWidth: 800 });
    expect(host.SendVoiceFrame).toHaveBeenCalledWith('AAAA', 'image/jpeg');
    expect((r.Data as { sentToVoice: boolean }).sentToVoice).toBe(true);
  });
  it('fails with the capture error and a hint', async () => {
    const host = makeHost({ CaptureScreenshot: vi.fn().mockRejectedValue(new Error('Capture timed out after 5000 ms.')) });
    const r = await tool(host, 'GetDashboardScreenshot').Handler({});
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('timed out');
    expect(r.ErrorMessage).toContain('GetDashboardState');
  });
  it('scales the panel bounds from CSS pixels to image pixels', async () => {
    const PanelBounds = () => [{ panelId: 'A', x: 0, y: 96, width: 1024, height: 1344 }, { panelId: 'B', x: 1024, y: 96, width: 1536, height: 1344 }];
    const r = await tool(makeHost({ PanelBounds }), 'GetDashboardScreenshot').Handler({});
    expect((r.Data as { panelBounds: object[] }).panelBounds).toEqual([
      { panelId: 'A', x: 0, y: 48, width: 512, height: 672 },
      { panelId: 'B', x: 512, y: 48, width: 768, height: 672 },
    ]);
  });
  it('returns no bounds when no panel is shown', async () => {
    const r = await tool(makeHost({ PanelBounds: () => [] }), 'GetDashboardScreenshot').Handler({});
    expect(r.Data).toEqual({ width: 1280, height: 720, panelBounds: [], sentToVoice: false });
  });
  it('returns no bounds when the panels have no width on screen', async () => {
    const boundsFor = async (PanelBounds: DashboardStudioHost['PanelBounds']) => {
      const r = await tool(makeHost({ PanelBounds }), 'GetDashboardScreenshot').Handler({});
      return (r.Data as { panelBounds: object[] }).panelBounds;
    };
    expect(await boundsFor(() => [{ panelId: 'A', x: 0, y: 40, width: 0, height: 300 }, { panelId: 'B', x: 0, y: 340, width: 0, height: 300 }])).toEqual([]);
    expect(await boundsFor(() => [{ panelId: 'A', x: 0, y: 40, width: 0.5, height: 300 }])).toEqual([]);
  });
  it('passes a rounded maxWidth and refuses one that is not a positive number', async () => {
    const host = makeHost();
    await tool(host, 'GetDashboardScreenshot').Handler({ maxWidth: 800.4 });
    expect(host.CaptureScreenshot).toHaveBeenCalledWith(800);
    for (const maxWidth of [0, -5, 0.5, 'wide', Number.NaN]) {
      const r = await tool(host, 'GetDashboardScreenshot').Handler({ maxWidth });
      expect(r).toEqual({ Success: false, ErrorMessage: 'maxWidth must be a number of pixels, such as 1280.' });
    }
    expect(host.CaptureScreenshot).toHaveBeenCalledTimes(1);
  });
  it('fails without capturing when no dashboard is open or it is still loading', async () => {
    const none = makeHost({ Dashboard: () => null });
    expect(await tool(none, 'GetDashboardScreenshot').Handler({})).toEqual({ Success: false, ErrorMessage: 'No Config dashboard is open in this tab.' });
    const loading = makeHost({ GetConfig: () => null });
    expect((await tool(loading, 'GetDashboardScreenshot').Handler({})).ErrorMessage).toContain('loading');
    expect(none.CaptureScreenshot).not.toHaveBeenCalled();
    expect(loading.CaptureScreenshot).not.toHaveBeenCalled();
  });
  it('reports a capture failure that is not an Error', async () => {
    const r = await tool(makeHost({ CaptureScreenshot: vi.fn().mockRejectedValue('the canvas is tainted') }), 'GetDashboardScreenshot').Handler({});
    expect(r).toEqual({ Success: false, ErrorMessage: 'Screenshot failed: the canvas is tainted. Use GetDashboardState for the layout instead.' });
  });
  it('reports sentToVoice false when the voice session does not take the frame', async () => {
    const host = makeHost({ IsVoiceSessionActive: () => true, SendVoiceFrame: vi.fn().mockReturnValue(false) });
    const r = await tool(host, 'GetDashboardScreenshot').Handler({});
    expect(host.SendVoiceFrame).toHaveBeenCalledWith('AAAA', 'image/jpeg');
    expect(r.Success).toBe(true);
    expect(r.Data).toEqual({ width: 1280, height: 720, panelBounds: expect.any(Array), sentToVoice: false });
    expect(r.Media).toHaveLength(1);
  });
  it('still returns the image when the voice frame cannot be sent', async () => {
    const SendVoiceFrame = vi.fn(() => {
      throw new Error('The voice session closed.');
    });
    const r = await tool(makeHost({ IsVoiceSessionActive: () => true, SendVoiceFrame }), 'GetDashboardScreenshot').Handler({});
    expect(r.Success).toBe(true);
    expect(r.Data).toMatchObject({ sentToVoice: false, voiceFrameError: 'The voice session closed.' });
    expect(r.Media).toHaveLength(1);
  });
  it('sends no voice frame without a voice session, and changes nothing', async () => {
    const host = makeHost({ IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    const r = await tool(host, 'GetDashboardScreenshot').Handler({});
    expect((r.Data as { sentToVoice: boolean }).sentToVoice).toBe(false);
    expect(host.SendVoiceFrame).not.toHaveBeenCalled();
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
  it('names what the capture leaves blank', () => {
    const description = tool(makeHost(), 'GetDashboardScreenshot').Description;
    expect(description).toContain('WebURL');
    expect(description).toContain('cross-origin');
    expect(description).toContain('tab stack');
  });
});

describe('Request tools', () => {
  it('RequestSaveDashboard asks the user and reports their answer', async () => {
    const host = makeHost();
    const r = await tool(host, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1', name: 'Sales 2026' });
    expect(host.Confirm).toHaveBeenCalledWith('save', { name: 'Sales 2026', description: undefined });
    expect(r).toEqual({ Success: true, Data: { requested: true, confirmed: true } });
  });
  it('reports a decline as a failure the agent can relay', async () => {
    const host = makeHost({ Confirm: vi.fn().mockResolvedValue(false) });
    const r = await tool(host, 'RequestPinToHome').Handler({ dashboardId: 'd-1' });
    expect(r.Success).toBe(false);
    expect(r.ErrorMessage).toContain('declined');
  });
  it('RequestSaveDashboard fails when there is nothing to save', async () => {
    const r = await tool(makeHost({ IsEditing: () => false, HasUnsavedChanges: () => false }), 'RequestSaveDashboard').Handler({ dashboardId: 'd-1' });
    expect(r.Success).toBe(false);
  });

  it('RequestSaveDashboard trims the name and description and leaves out blank ones', async () => {
    const host = makeHost();
    await tool(host, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1', name: '  Q3 review  ', description: '   ' });
    expect(host.Confirm).toHaveBeenLastCalledWith('save', { name: 'Q3 review', description: undefined });
    await tool(host, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1', description: ' Revenue by region ' });
    expect(host.Confirm).toHaveBeenLastCalledWith('save', { name: undefined, description: 'Revenue by region' });
  });
  it('RequestSaveDashboard says that a blank name or description is ignored', () => {
    expect(tool(makeHost(), 'RequestSaveDashboard').Description).toContain('A blank name or description is ignored');
  });
  it('RequestSaveDashboard asks when there are unsaved changes', async () => {
    const host = makeHost({ IsEditing: () => false, HasUnsavedChanges: () => true });
    expect((await tool(host, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1' })).Success).toBe(true);
    expect(host.Confirm).toHaveBeenCalledWith('save', { name: undefined, description: undefined });
  });
  it('RequestSaveDashboard refuses a name that is not text, without asking', async () => {
    const host = makeHost();
    const r = await tool(host, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1', name: 42 });
    expect(r).toEqual({ Success: false, ErrorMessage: 'name must be a string.' });
    expect(host.Confirm).not.toHaveBeenCalled();
  });
  it('RequestSaveDashboard fails while a save runs or the dashboard loads, without asking', async () => {
    const saving = makeHost({ IsSaving: () => true });
    expect(await tool(saving, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1' })).toEqual({ Success: false, ErrorMessage: 'A save is in progress. Try again when it finishes.' });
    const loading = makeHost({ GetConfig: () => null });
    expect((await tool(loading, 'RequestSaveDashboard').Handler({ dashboardId: 'd-1' })).ErrorMessage).toContain('loading');
    expect(saving.Confirm).not.toHaveBeenCalled();
    expect(loading.Confirm).not.toHaveBeenCalled();
  });
  it('RequestPinToHome asks to pin the dashboard', async () => {
    const host = makeHost();
    const r = await tool(host, 'RequestPinToHome').Handler({ dashboardId: 'd-1' });
    expect(host.Confirm).toHaveBeenCalledWith('pin', {});
    expect(r).toEqual({ Success: true, Data: { requested: true, confirmed: true } });
  });

  const requests: Array<[string, Record<string, unknown>]> = [
    ['RequestSaveDashboard', { dashboardId: 'd-1' }],
    ['RequestPinToHome', { dashboardId: 'd-1' }],
  ];
  it.each(requests)('%s refuses a call for another dashboard, without asking', async (name, params) => {
    const host = makeHost({ HasUnsavedChanges: () => true });
    const r = await tool(host, name).Handler({ ...params, dashboardId: 'd-2' });
    expect(r).toEqual({ Success: false, ErrorMessage: 'The open dashboard changed. Call GetDashboardState and use its dashboard.id.' });
    expect(host.Confirm).not.toHaveBeenCalled();
  });
  it.each(requests)('%s refuses a call without a dashboardId, without asking', async (name, params) => {
    const host = makeHost({ HasUnsavedChanges: () => true });
    const { dashboardId: _omitted, ...withoutId } = params;
    const r = await tool(host, name).Handler(withoutId);
    expect(r).toEqual({ Success: false, ErrorMessage: 'dashboardId is required: call GetDashboardState and pass its dashboard.id.' });
    expect(host.Confirm).not.toHaveBeenCalled();
  });
  it.each(requests)('%s schema requires the dashboardId', (name) => {
    const t = tool(makeHost(), name);
    const schema = t.ParameterSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties['dashboardId']).toEqual({ type: 'string', description: 'The dashboard.id from GetDashboardState.' });
    expect(schema.required).toContain('dashboardId');
    expect(t.Description).toContain('Pass the dashboard.id from GetDashboardState as dashboardId');
  });
  it.each(requests)('%s fails without asking when no dashboard is open', async (name, params) => {
    const host = makeHost({ Dashboard: () => null });
    expect(await tool(host, name).Handler(params)).toEqual({ Success: false, ErrorMessage: 'No Config dashboard is open in this tab.' });
    expect(host.Confirm).not.toHaveBeenCalled();
  });
  it.each(requests)('%s reports a dialog that fails', async (name, params) => {
    const host = makeHost({ Confirm: vi.fn().mockRejectedValue(new Error('Another request is waiting for an answer.')) });
    expect(await tool(host, name).Handler(params)).toEqual({ Success: false, ErrorMessage: 'Another request is waiting for an answer.' });
  });
  it.each(requests)('%s only asks: it never edits the dashboard or enters edit mode', async (name, params) => {
    const host = makeHost({ IsEditing: () => false, HasUnsavedChanges: () => true });
    const enter = vi.spyOn(host, 'EnterEditMode');
    expect((await tool(host, name).Handler(params)).Success).toBe(true);
    expect(host.Confirm).toHaveBeenCalledTimes(1);
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
});

describe('SearchSources', () => {
  const found: SourceSearchResult[] = [
    { kind: 'query', id: 'q1', name: 'Revenue by Month', description: null, type: 'Sales', fitsDashboard: true, suggestedConfig: { type: 'Query', queryId: 'q1' } },
  ];
  it('passes query, kinds and a capped limit to the host', async () => {
    const host = makeHost();
    await tool(host, 'SearchSources').Handler({ query: 'rev', kinds: ['query', 'bogus'], limit: 500 });
    expect(host.SearchSources).toHaveBeenCalledWith('rev', ['query'], 50);
  });
  it('searches every kind, 20 of each, by default', async () => {
    const host = makeHost();
    await tool(host, 'SearchSources').Handler({ query: 'rev' });
    expect(host.SearchSources).toHaveBeenCalledWith('rev', ['artifact', 'view', 'query', 'entity'], 20);
  });
  it('returns the results and their count', async () => {
    const host = makeHost({ SearchSources: vi.fn().mockResolvedValue(found) });
    expect(await tool(host, 'SearchSources').Handler({ query: 'revenue' })).toEqual({ Success: true, Data: { count: 1, results: found } });
  });
  it('names the kinds it ignored', async () => {
    const host = makeHost({ SearchSources: vi.fn().mockResolvedValue(found) });
    const r = await tool(host, 'SearchSources').Handler({ query: 'revenue', kinds: ['query', 'bogus', 7] });
    expect(r).toEqual({ Success: true, Data: { count: 1, results: found, ignoredKinds: ['bogus', 7] } });
  });
  it('matches kinds without regard to case, in kind order, and searches every kind for an empty list', async () => {
    const host = makeHost();
    await tool(host, 'SearchSources').Handler({ query: 'rev', kinds: [' QUERY ', 'View', 'view'] });
    expect(host.SearchSources).toHaveBeenLastCalledWith('rev', ['view', 'query'], 20);
    await tool(host, 'SearchSources').Handler({ query: 'rev', kinds: [] });
    expect(host.SearchSources).toHaveBeenLastCalledWith('rev', [...SOURCE_KINDS], 20);
  });
  it('trims the query, and searches with an empty query when none is given', async () => {
    const host = makeHost();
    await tool(host, 'SearchSources').Handler({ query: '  monthly revenue ' });
    expect(host.SearchSources).toHaveBeenLastCalledWith('monthly revenue', [...SOURCE_KINDS], 20);
    await tool(host, 'SearchSources').Handler({});
    expect(host.SearchSources).toHaveBeenLastCalledWith('', [...SOURCE_KINDS], 20);
  });
  it('rounds the limit, and refuses one that is not a number of at least 1, without searching', async () => {
    const host = makeHost();
    await tool(host, 'SearchSources').Handler({ query: 'rev', limit: 7.4 });
    expect(host.SearchSources).toHaveBeenLastCalledWith('rev', [...SOURCE_KINDS], 7);
    for (const limit of [0, 0.4, -3, '10', Number.NaN]) {
      expect(await tool(host, 'SearchSources').Handler({ query: 'rev', limit })).toEqual({
        Success: false,
        ErrorMessage: 'limit must be a number of results per kind, such as 20 (at most 50).',
      });
    }
    expect(host.SearchSources).toHaveBeenCalledTimes(1);
  });
  it('refuses kinds that are not a list or that name no kind, without searching', async () => {
    const host = makeHost();
    expect(await tool(host, 'SearchSources').Handler({ query: 'rev', kinds: 'query' })).toEqual({
      Success: false,
      ErrorMessage: 'kinds must be a list of source kinds: artifact, view, query, entity.',
    });
    expect(await tool(host, 'SearchSources').Handler({ query: 'rev', kinds: ['views', 'queries'] })).toEqual({
      Success: false,
      ErrorMessage: 'kinds must contain one of artifact, view, query, entity.',
    });
    expect(host.SearchSources).not.toHaveBeenCalled();
  });
  it('refuses a query that is not text, without searching', async () => {
    const host = makeHost();
    expect(await tool(host, 'SearchSources').Handler({ query: 42 })).toEqual({
      Success: false,
      ErrorMessage: 'query must be text: a word or phrase from a name or description, or "" to list the first sources by name.',
    });
    expect(host.SearchSources).not.toHaveBeenCalled();
  });
  it('reports a search that fails', async () => {
    const host = makeHost({ SearchSources: vi.fn().mockRejectedValue(new Error('Queries are not loaded.')) });
    expect(await tool(host, 'SearchSources').Handler({ query: 'rev' })).toEqual({ Success: false, ErrorMessage: 'Queries are not loaded.' });
  });
  it('searches without an open dashboard, and changes nothing', async () => {
    const host = makeHost({ Dashboard: () => null, GetConfig: () => null, IsEditing: () => false });
    const enter = vi.spyOn(host, 'EnterEditMode');
    expect((await tool(host, 'SearchSources').Handler({ query: 'rev' })).Success).toBe(true);
    expect(enter).not.toHaveBeenCalled();
    expect(editCalls(host)).toBe(0);
  });
  it('offers the source kinds and says how a result goes into AddPanel', () => {
    const t = tool(makeHost(), 'SearchSources');
    const schema = t.ParameterSchema as { properties: { kinds: { items: { enum: string[] } } }; required: string[] };
    expect(schema.properties.kinds.items.enum).toEqual([...SOURCE_KINDS]);
    expect(schema.required).toEqual(['query']);
    expect(t.Description).toContain('suggestedConfig');
    expect(t.Description).toContain('fitsDashboard');
  });
});
