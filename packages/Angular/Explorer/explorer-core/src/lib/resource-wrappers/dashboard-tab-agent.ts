/**
 * @fileoverview Agent context and client tools for a Config dashboard open in a dashboard tab.
 * Pure functions: the tab supplies its state and reads through {@link DashboardTabAgentHost}.
 * Tool handlers never throw; a bad parameter or a failed read returns a failure result.
 *
 * 🔒 SAFETY BOUNDARY: the tab gives the AI agent ONLY read-only tools — GetDashboardPanels and
 * GetDashboardDetail. Editing, saving, deleting, sharing, favoriting, pinning and Home tab changes
 * are intentionally NOT exposed; the user does them from the tab's toolbar. Do NOT add a mutating
 * tool here without revisiting this boundary.
 */
import type { DashboardUserPermissions, MJDashboardEntity, MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import type { DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
import { UUIDsEqual } from '@memberjunction/global';

/** The most panels, or dashboard names, that one context field or error message lists. */
export const DASHBOARD_TAB_AGENT_LIST_CAP = 25;

/** The dashboard fields the agent helpers read. */
export type DashboardTabDashboard = Pick<
  MJDashboardEntity,
  'ID' | 'Name' | 'Type' | 'Description' | 'User' | 'Category' | 'CategoryID' | 'UIConfigDetails' | '__mj_CreatedAt' | '__mj_UpdatedAt'
>;

/** The panel fields a panel summary reads. */
export type DashboardTabPanel = Pick<DashboardPanel, 'title' | 'icon' | 'partTypeId' | 'config'>;

/** The part type fields a panel summary reads. */
export type DashboardTabPartType = Pick<MJDashboardPartTypeEntity, 'ID' | 'Name' | 'Icon'>;

/** One panel of a dashboard, as the agent sees it. */
export interface DashboardPanelSummary {
  Title: string;
  /** The part type name, for example View, Query or WebURL. */
  PartTypeName: string;
  Icon?: string;
}

/** The tab state that the agent context reports. */
export interface DashboardTabAgentState {
  Dashboard: Pick<MJDashboardEntity, 'ID' | 'Name' | 'Type'>;
  IsEditing: boolean;
  CanEdit: boolean;
  Panels: readonly DashboardPanelSummary[];
  IsFavorite: boolean;
  IsHomeTab: boolean;
  IsPinnedToHome: boolean;
}

/** The result of a tab tool: data on success, else a message the agent can act on. */
export interface DashboardTabToolResult {
  Success: boolean;
  ErrorMessage?: string;
  Data?: Record<string, unknown>;
}

/** A client tool, in the shape `NavigationService.SetAgentClientTools` takes. */
export interface DashboardTabAgentTool {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<DashboardTabToolResult>;
}

/** The reads the tab tools make from the tab. */
export interface DashboardTabAgentHost {
  /** The dashboard open in the tab, or null when none is loaded. */
  CurrentDashboard(): DashboardTabDashboard | null;
  /** The dashboards the user can read. */
  AccessibleDashboards(): readonly DashboardTabDashboard[];
  /** The panels of a dashboard: the live layout for the open one, the saved layout for others. */
  Panels(dashboard: DashboardTabDashboard): DashboardPanelSummary[];
  /** The user's access to a dashboard. */
  Permissions(dashboardId: string): DashboardUserPermissions;
}

/** The dashboard a tool works on, or the failure to return to the agent. */
export type DashboardToolLookup =
  | { ok: true; dashboard: DashboardTabDashboard }  // case-violation-ok-legacy-back-compat: matches the { ok, result } failure shape of the agent-tool validators (ValidateStringParam)
  | { ok: false; result: DashboardTabToolResult };  // case-violation-ok-legacy-back-compat: matches the { ok, result } failure shape of the agent-tool validators (ValidateStringParam)

const DASHBOARD_PARAMETER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    dashboardId: { type: 'string', description: 'Optional dashboard ID or name. Defaults to the dashboard open in this tab.' },
  },
};

/**
 * Summaries of the given panels. The part type name comes from `partTypes` (matched on the panel's
 * part type ID), else from the panel's config type.
 */
export function SummarizeDashboardPanels(
  panels: readonly DashboardTabPanel[],
  partTypes: readonly DashboardTabPartType[],
): DashboardPanelSummary[] {
  return panels.map(panel => {
    const partType = partTypes.find(pt => UUIDsEqual(pt.ID, panel.partTypeId));
    const summary: DashboardPanelSummary = {
      Title: panel.title || '(untitled panel)',
      PartTypeName: partType?.Name || panel.config?.type || 'Unknown',
    };
    const icon = panel.icon || partType?.Icon;
    if (icon) {
      summary.Icon = icon;
    }
    return summary;
  });
}

/** The agent context for the tab. Lists at most {@link DASHBOARD_TAB_AGENT_LIST_CAP} panels; the count covers all. */
export function BuildDashboardTabAgentContext(state: DashboardTabAgentState): Record<string, unknown> {
  return {
    OpenedDashboardId: state.Dashboard.ID,
    OpenedDashboardName: state.Dashboard.Name,
    OpenedDashboardType: state.Dashboard.Type,
    OpenedDashboardIsEditing: state.IsEditing,
    OpenedDashboardCanEdit: state.CanEdit,
    OpenedDashboardPanelCount: state.Panels.length,
    OpenedDashboardPanels: state.Panels.slice(0, DASHBOARD_TAB_AGENT_LIST_CAP),
    IsFavorite: state.IsFavorite,
    IsHomeTab: state.IsHomeTab,
    IsPinnedToHome: state.IsPinnedToHome,
  };
}

/**
 * The dashboard a tool names: an exact ID match first, then a name match that ignores case.
 * With no name or ID, the dashboard open in the tab.
 */
export function ResolveToolDashboard(
  raw: unknown,
  current: DashboardTabDashboard | null,
  accessible: readonly DashboardTabDashboard[],
): DashboardToolLookup {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return current
      ? { ok: true, dashboard: current }
      : { ok: false, result: { Success: false, ErrorMessage: 'No dashboard is open. Pass a dashboard ID or name.' } };
  }
  const lowered = value.toLowerCase();
  const match = accessible.find(d => UUIDsEqual(d.ID, value)) ?? accessible.find(d => (d.Name ?? '').toLowerCase() === lowered);
  if (match) {
    return { ok: true, dashboard: match };
  }
  const available = accessible.slice(0, DASHBOARD_TAB_AGENT_LIST_CAP).map(d => d.Name || '(untitled)').join(', ') || '(none)';
  return {
    ok: false,
    result: { Success: false, ErrorMessage: `No accessible dashboard named or identified by "${value}". Available dashboards include: ${available}.` },
  };
}

/** The tab's read-only client tools. */
export function BuildDashboardTabAgentTools(host: DashboardTabAgentHost): DashboardTabAgentTool[] {
  return [
    {
      Name: 'GetDashboardPanels',
      Description: 'List the panels on a dashboard: each panel\'s title, part type and icon. Defaults to the dashboard open in this tab; pass a dashboard ID or name to inspect another dashboard the user can read. Read-only.',
      ParameterSchema: DASHBOARD_PARAMETER_SCHEMA,
      Handler: async params => runTool(host, params, dashboard => panelsData(host, dashboard)),
    },
    {
      Name: 'GetDashboardDetail',
      Description: 'Get detail about a dashboard: description, type, owner, category, created and updated dates, and the user\'s access (CanRead/CanEdit/CanDelete/CanShare, IsOwner). Defaults to the dashboard open in this tab; pass a dashboard ID or name for another dashboard the user can read. Read-only.',
      ParameterSchema: DASHBOARD_PARAMETER_SCHEMA,
      Handler: async params => runTool(host, params, dashboard => detailData(host, dashboard)),
    },
  ];
}

/** Resolves the tool's dashboard and builds its data. Returns a failure instead of throwing. */
function runTool(
  host: DashboardTabAgentHost,
  params: Record<string, unknown>,
  read: (dashboard: DashboardTabDashboard) => Record<string, unknown>,
): DashboardTabToolResult {
  try {
    const lookup = ResolveToolDashboard(params['dashboardId'], host.CurrentDashboard(), host.AccessibleDashboards());
    return lookup.ok ? { Success: true, Data: read(lookup.dashboard) } : lookup.result;
  } catch (error) {
    return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
  }
}

function panelsData(host: DashboardTabAgentHost, dashboard: DashboardTabDashboard): Record<string, unknown> {
  const panels = host.Panels(dashboard);
  return { DashboardId: dashboard.ID, DashboardName: dashboard.Name, PanelCount: panels.length, Panels: panels };
}

function detailData(host: DashboardTabAgentHost, dashboard: DashboardTabDashboard): Record<string, unknown> {
  const access = host.Permissions(dashboard.ID);
  return {
    DashboardId: dashboard.ID,
    DashboardName: dashboard.Name,
    Description: dashboard.Description ?? null,
    Type: dashboard.Type,
    Owner: dashboard.User ?? null,
    CategoryName: dashboard.Category ?? null,
    CategoryId: dashboard.CategoryID ?? null,
    CreatedAt: toIsoOrNull(dashboard.__mj_CreatedAt),
    UpdatedAt: toIsoOrNull(dashboard.__mj_UpdatedAt),
    Access: {
      CanRead: access.CanRead,
      CanEdit: access.CanEdit,
      CanDelete: access.CanDelete,
      CanShare: access.CanShare,
      IsOwner: access.IsOwner,
      PermissionSource: access.PermissionSource,
    },
  };
}

/** The date as an ISO string, or null when it is missing or invalid. */
function toIsoOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
