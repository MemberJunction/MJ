import { describe, expect, it, vi } from 'vitest';
import type { DashboardUserPermissions } from '@memberjunction/core-entities';
import {
  BuildDashboardTabAgentContext,
  BuildDashboardTabAgentTools,
  DASHBOARD_TAB_AGENT_LIST_CAP,
  DashboardPanelSummary,
  DashboardTabAgentHost,
  DashboardTabDashboard,
  DashboardTabPanel,
  DashboardTabToolResult,
  ResolveToolDashboard,
  SummarizeDashboardPanels,
} from './dashboard-tab-agent';

const OPEN_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const OTHER_ID = 'A1B2C3D4-0000-4000-8000-000000000002';

function dashboard(id: string, name: string, extra: Partial<DashboardTabDashboard> = {}): DashboardTabDashboard {
  return {
    ID: id,
    Name: name,
    Type: 'Config',
    Description: null,
    User: 'Ana Ruiz',
    Category: null,
    CategoryID: null,
    UIConfigDetails: '',
    __mj_CreatedAt: new Date('2026-01-02T03:04:05.000Z'),
    __mj_UpdatedAt: new Date('2026-02-03T04:05:06.000Z'),
    ...extra,
  };
}

function panel(title: string, partTypeId: string, type: string, icon?: string): DashboardTabPanel {
  return { title, partTypeId, icon, config: { type } };
}

function permissions(overrides: Partial<DashboardUserPermissions> = {}): DashboardUserPermissions {
  return {
    DashboardID: OPEN_ID,
    CanRead: true,
    CanEdit: false,
    CanDelete: false,
    CanShare: false,
    IsOwner: false,
    PermissionSource: 'direct',
    ...overrides,
  };
}

const openDashboard = dashboard(OPEN_ID, 'Sales pipeline', { Description: 'Open deals', Category: 'Sales', CategoryID: 'CAT-1' });
const otherDashboard = dashboard(OTHER_ID, 'Support Queue');
const livePanels: DashboardPanelSummary[] = [{ Title: 'Revenue', PartTypeName: 'Query' }];
const savedPanels: DashboardPanelSummary[] = [{ Title: 'Open tickets', PartTypeName: 'View' }];

function host(overrides: Partial<DashboardTabAgentHost> = {}): DashboardTabAgentHost {
  return {
    CurrentDashboard: () => openDashboard,
    AccessibleDashboards: () => [openDashboard, otherDashboard],
    Panels: d => (d.ID === OPEN_ID ? livePanels : savedPanels),
    Permissions: () => permissions({ CanEdit: true, CanShare: true, IsOwner: true, PermissionSource: 'owner' }),
    ...overrides,
  };
}

async function runTool(tools: ReturnType<typeof BuildDashboardTabAgentTools>, name: string, params: Record<string, unknown> = {}): Promise<DashboardTabToolResult> {
  const tool = tools.find(t => t.Name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool.Handler(params);
}

describe('SummarizeDashboardPanels', () => {
  const partTypes = [{ ID: 'pt-query', Name: 'Query', Icon: 'fa-solid fa-database' }];

  it('names each panel\'s part type, matching the part type id without regard to case', () => {
    const summaries = SummarizeDashboardPanels([panel('Revenue', 'PT-QUERY', 'Query')], partTypes);
    expect(summaries).toEqual([{ Title: 'Revenue', PartTypeName: 'Query', Icon: 'fa-solid fa-database' }]);
  });

  it('prefers the panel\'s own icon over the part type icon', () => {
    const summaries = SummarizeDashboardPanels([panel('Revenue', 'pt-query', 'Query', 'fa-solid fa-coins')], partTypes);
    expect(summaries[0].Icon).toBe('fa-solid fa-coins');
  });

  it('falls back to the config type, then Unknown, and names untitled panels', () => {
    const summaries = SummarizeDashboardPanels(
      [panel('', 'pt-missing', 'WebURL'), { title: 'Bare', partTypeId: 'pt-missing', config: { type: '' } }],
      partTypes,
    );
    expect(summaries).toEqual([
      { Title: '(untitled panel)', PartTypeName: 'WebURL' },
      { Title: 'Bare', PartTypeName: 'Unknown' },
    ]);
  });
});

describe('BuildDashboardTabAgentContext', () => {
  it('reports the open dashboard, its panels and where it is placed', () => {
    const context = BuildDashboardTabAgentContext({
      Dashboard: openDashboard,
      IsEditing: false,
      CanEdit: true,
      Panels: livePanels,
      IsFavorite: true,
      IsHomeTab: false,
      IsPinnedToHome: true,
    });
    expect(context).toEqual({
      OpenedDashboardId: OPEN_ID,
      OpenedDashboardName: 'Sales pipeline',
      OpenedDashboardType: 'Config',
      OpenedDashboardIsEditing: false,
      OpenedDashboardCanEdit: true,
      OpenedDashboardPanelCount: 1,
      OpenedDashboardPanels: livePanels,
      IsFavorite: true,
      IsHomeTab: false,
      IsPinnedToHome: true,
    });
  });

  it('lists at most the cap of panels but counts all of them', () => {
    const many = Array.from({ length: DASHBOARD_TAB_AGENT_LIST_CAP + 5 }, (_, i) => ({ Title: `Panel ${i}`, PartTypeName: 'View' }));
    const context = BuildDashboardTabAgentContext({
      Dashboard: openDashboard, IsEditing: true, CanEdit: true, Panels: many, IsFavorite: false, IsHomeTab: false, IsPinnedToHome: false,
    });
    expect(context['OpenedDashboardPanelCount']).toBe(DASHBOARD_TAB_AGENT_LIST_CAP + 5);
    expect(context['OpenedDashboardPanels']).toHaveLength(DASHBOARD_TAB_AGENT_LIST_CAP);
  });
});

describe('ResolveToolDashboard', () => {
  const accessible = [openDashboard, otherDashboard];

  it('uses the open dashboard when no dashboard is named', () => {
    expect(ResolveToolDashboard(undefined, openDashboard, accessible)).toEqual({ ok: true, dashboard: openDashboard });
    expect(ResolveToolDashboard('   ', openDashboard, accessible)).toEqual({ ok: true, dashboard: openDashboard });
  });

  it('asks for a dashboard when none is named and none is open', () => {
    const lookup = ResolveToolDashboard(undefined, null, accessible);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.result.ErrorMessage).toContain('No dashboard is open');
  });

  it('finds a dashboard by ID, ignoring case', () => {
    expect(ResolveToolDashboard(OTHER_ID.toLowerCase(), openDashboard, accessible)).toEqual({ ok: true, dashboard: otherDashboard });
  });

  it('finds a dashboard by name, ignoring case', () => {
    expect(ResolveToolDashboard('support queue', openDashboard, accessible)).toEqual({ ok: true, dashboard: otherDashboard });
  });

  it('lists the available dashboards when nothing matches', () => {
    const lookup = ResolveToolDashboard('Marketing', openDashboard, accessible);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.result.Success).toBe(false);
      expect(lookup.result.ErrorMessage).toContain('"Marketing"');
      expect(lookup.result.ErrorMessage).toContain('Sales pipeline, Support Queue');
    }
  });

  it('lists at most the cap of names in the error', () => {
    const many = Array.from({ length: DASHBOARD_TAB_AGENT_LIST_CAP + 3 }, (_, i) => dashboard(`id-${i}`, `Board ${i}`));
    const lookup = ResolveToolDashboard('nope', null, many);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.result.ErrorMessage).toContain(`Board ${DASHBOARD_TAB_AGENT_LIST_CAP - 1}`);
      expect(lookup.result.ErrorMessage).not.toContain(`Board ${DASHBOARD_TAB_AGENT_LIST_CAP},`);
    }
  });
});

describe('BuildDashboardTabAgentTools', () => {
  it('offers only the two read-only tools', () => {
    const names = BuildDashboardTabAgentTools(host()).map(t => t.Name);
    expect(names).toEqual(['GetDashboardPanels', 'GetDashboardDetail']);
    for (const name of names) {
      expect(name).not.toMatch(/save|delete|remove|share|edit|create|add|pin|favorite|move|update|set/i);
    }
  });

  it('GetDashboardPanels lists the open dashboard\'s panels by default', async () => {
    const result = await runTool(BuildDashboardTabAgentTools(host()), 'GetDashboardPanels');
    expect(result).toEqual({
      Success: true,
      Data: { DashboardId: OPEN_ID, DashboardName: 'Sales pipeline', PanelCount: 1, Panels: livePanels },
    });
  });

  it('GetDashboardPanels lists another dashboard\'s panels when one is named', async () => {
    const result = await runTool(BuildDashboardTabAgentTools(host()), 'GetDashboardPanels', { dashboardId: 'Support Queue' });
    expect(result.Data).toEqual({ DashboardId: OTHER_ID, DashboardName: 'Support Queue', PanelCount: 1, Panels: savedPanels });
  });

  it('GetDashboardDetail reports owner, category, dates, type and the user\'s access', async () => {
    const result = await runTool(BuildDashboardTabAgentTools(host()), 'GetDashboardDetail');
    expect(result).toEqual({
      Success: true,
      Data: {
        DashboardId: OPEN_ID,
        DashboardName: 'Sales pipeline',
        Description: 'Open deals',
        Type: 'Config',
        Owner: 'Ana Ruiz',
        CategoryName: 'Sales',
        CategoryId: 'CAT-1',
        CreatedAt: '2026-01-02T03:04:05.000Z',
        UpdatedAt: '2026-02-03T04:05:06.000Z',
        Access: { CanRead: true, CanEdit: true, CanDelete: false, CanShare: true, IsOwner: true, PermissionSource: 'owner' },
      },
    });
  });

  it('GetDashboardDetail asks the host for the named dashboard\'s access', async () => {
    const permissionsFor = vi.fn((id: string) => permissions({ DashboardID: id }));
    const result = await runTool(BuildDashboardTabAgentTools(host({ Permissions: permissionsFor })), 'GetDashboardDetail', { dashboardId: OTHER_ID });
    expect(permissionsFor).toHaveBeenCalledWith(OTHER_ID);
    expect(result.Data?.['DashboardName']).toBe('Support Queue');
  });

  it('returns a failure the agent can act on when the dashboard is unknown', async () => {
    const result = await runTool(BuildDashboardTabAgentTools(host()), 'GetDashboardDetail', { dashboardId: 'Marketing' });
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Available dashboards include');
  });

  it('returns a failure instead of throwing when a read fails', async () => {
    const failing = host({ Panels: () => { throw new Error('layout unreadable'); } });
    const result = await runTool(BuildDashboardTabAgentTools(failing), 'GetDashboardPanels');
    expect(result).toEqual({ Success: false, ErrorMessage: 'layout unreadable' });
  });

  it('reports dates it cannot read as null', async () => {
    const undated = dashboard(OPEN_ID, 'Undated', { __mj_CreatedAt: new Date('not a date') });
    const result = await runTool(BuildDashboardTabAgentTools(host({ CurrentDashboard: () => undated })), 'GetDashboardDetail');
    expect(result.Data?.['CreatedAt']).toBeNull();
  });
});
