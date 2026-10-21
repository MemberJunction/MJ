/**
 * @fileoverview Client tools that let an agent read and change the Config dashboard open in a
 * dashboard tab: its state and a screenshot of it, its panels and layout, the sources a panel can show,
 * and requests to the user to save it or pin it to Home. Pure functions over {@link DashboardStudioHost}:
 * the tab supplies the state, applies the edits, searches the sources and asks the user.
 *
 * 🔒 BOUNDARY: the edit tools change the open dashboard in memory only and never save it. The Request*
 * tools never save or pin: they ask the user in a confirm dialog, and the tab does what the user confirms.
 * The edit and Request* tools act only when their `dashboardId` is the open dashboard's id. Tool handlers
 * never throw: a bad parameter, a refused edit or a failed host call returns `{ Success: false, ErrorMessage }`.
 */
import type { ResolvedLayoutConfig } from 'golden-layout';
import type { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  DescribePath,
  ExtractPanelsFromLayout,
  FindPanelPath,
  LayoutEditError,
  MovePanel,
  PANEL_PLACEMENTS,
  ResizePanel,
  SimplifyLayout,
  type DashboardConfig,
  type DashboardPanel,
  type LayoutPathStep,
  type PanelConfig,
  type PanelPosition,
  type SimplifiedLayoutNode,
} from '@memberjunction/ng-dashboard-viewer';
import type { ElementCapture } from '@memberjunction/ng-shared';
import { DASHBOARD_TAB_AGENT_LIST_CAP, type DashboardTabAgentTool, type DashboardTabToolResult } from './dashboard-tab-agent';
import { DASHBOARD_PART_TYPE_NAMES, DescribePartConfigs, MergePartConfig, ValidatePartConfig, type DashboardPartTypeName } from './dashboard-part-config';
import { SOURCE_KINDS, type SourceKind, type SourceSearchResult } from './dashboard-source-search';

/**
 * The reads and edits the studio tools make on the dashboard tab, and the requests they put to the user.
 * The tab implements it.
 *
 * How the tools use it, and what they need from it:
 * - The tools make at most one edit call at a time, unless an edit call does not settle within
 *   DASHBOARD_STUDIO_EDIT_TIMEOUT_MS; then the next edit starts while the late call may still run and
 *   overwrite it. The edit tools from one BuildDashboardStudioTools call share a queue: each reads the
 *   dashboard, checks its call and awaits its one edit call (AddPanel, RemovePanel, UpdatePanelConfig or
 *   ApplyLayout) only after the previous edit tool has finished. The next edit is checked against
 *   GetConfig(), so an edit call resolves only once GetConfig() shows its change.
 * - An edit call must settle within DASHBOARD_STUDIO_EDIT_TIMEOUT_MS (30 seconds). When it does not, the tool
 *   tells the agent that the edit did not finish in time, and the next edit starts.
 * - The tools that do not edit (the reads, the screenshot, the requests and the search) start after the
 *   edits queued before them have finished or timed out.
 * - An edit that cannot be applied rejects with an Error that says why; it never drops a change
 *   silently. The tools return the rejection to the agent as a failed result with that message.
 * - The tools never save or pin. Confirm asks the user, and the tab does what the user confirms.
 */
export interface DashboardStudioHost {
  /** The Config dashboard open in the tab, or null when none is loaded. */
  Dashboard(): { ID: string; Name: string; Description: string | null } | null;
  /** The dashboard configuration as the tab shows it now, with every panel in its layout. Null before it loads. */
  GetConfig(): DashboardConfig | null;
  /** The part types the dashboard can show. */
  GetPartTypes(): readonly Pick<MJDashboardPartTypeEntity, 'ID' | 'Name' | 'Icon'>[];
  /** True while the tab is in edit mode. */
  IsEditing(): boolean;
  /** True when the user may edit the dashboard. */
  CanEdit(): boolean;
  /** True when the dashboard has changes that are not saved. */
  HasUnsavedChanges(): boolean;
  /** True while a Save runs. */
  IsSaving(): boolean;
  /**
   * Puts the tab in edit mode when the user can edit. Returns whether the tab is editing afterwards.
   * Entering edit mode can reload the saved dashboard when it was saved elsewhere since it loaded.
   */
  EnterEditMode(): boolean;
  /**
   * Adds a panel and resolves with its id, or null when the dashboard did not add it. With a position,
   * the panel goes there; without one, it joins the first tab stack.
   */
  AddPanel(partTypeId: string, config: PanelConfig, title: string, icon: string | undefined, position: PanelPosition | undefined): Promise<string | null>;
  /** Removes a panel. */
  RemovePanel(panelId: string): Promise<void>;
  /** Gives a panel a new config, and a new title and icon when they are given. */
  UpdatePanelConfig(panelId: string, config: PanelConfig, title?: string, icon?: string): Promise<void>;
  /**
   * Shows a layout built with the layout editor functions and marks the dashboard changed. Resolves only
   * after GetConfig() returns the new layout; rejects when the rebuild fails.
   */
  ApplyLayout(layout: ResolvedLayoutConfig): Promise<void>;
  /** The panel's address in the layout, for example `row/0 › column/1 › tab 0`, or null when it is not in the layout. */
  GetPanelPath(panelId: string): string | null;
  /**
   * A JPEG of the dashboard as the tab shows it, at most `maxWidth` pixels wide. Rejects with an Error that
   * says why when the capture fails or takes too long.
   */
  CaptureScreenshot(maxWidth: number): Promise<ElementCapture>;
  /**
   * The box of each panel the tab shows, in CSS pixels relative to the top left corner of the element that
   * CaptureScreenshot captures. A panel that is not shown, such as one in a hidden tab, is left out.
   */
  PanelBounds(): Array<{ panelId: string; x: number; y: number; width: number; height: number }>;
  /** True while a voice session runs. */
  IsVoiceSessionActive(): boolean;
  /**
   * Sends an image to the running voice session as a video frame. `base64` has no data URL prefix. Returns
   * true when the voice session took the frame, and false when it did not.
   */
  SendVoiceFrame(base64: string, mimeType: string): boolean;
  /**
   * Opens a confirm dialog and resolves with the user's answer. `kind` picks the text, and `detail` gives the
   * name and description a save would apply. When the user confirms, the tab does what was asked as the
   * user's own action and then resolves true. Rejects with an Error that says why when it cannot ask, for
   * example while another request waits for an answer, or when the confirmed action fails.
   */
  Confirm(kind: 'save' | 'pin', detail: { name?: string; description?: string }): Promise<boolean>;
  /**
   * The sources the user may show in a panel that match `query`: up to `limit` of each kind in `kinds`, in
   * SOURCE_KINDS order, best match first. The user's access rules apply: artifacts the user can read, the
   * user's own and shared views, queries the user can run, and entities the user can read. Rejects with an
   * Error that says why when a list cannot be read.
   */
  SearchSources(query: string, kinds: readonly SourceKind[], limit: number): Promise<SourceSearchResult[]>;
}

/** How long, in milliseconds, the edit queue waits for one edit before it reports that the edit did not finish and starts the next edit. */
export const DASHBOARD_STUDIO_EDIT_TIMEOUT_MS = 30_000;

const NO_DASHBOARD = 'No Config dashboard is open in this tab.';
const DASHBOARD_CHANGED = 'The open dashboard changed. Call GetDashboardState and use its dashboard.id.';
const DASHBOARD_ID_REQUIRED = 'dashboardId is required: call GetDashboardState and pass its dashboard.id.';
const SAVE_IN_PROGRESS = 'A save is in progress. Try again when it finishes.';
const READ_STATE_HINT = 'Call GetDashboardState to see the dashboard as it is now.';
const EDIT_TIMED_OUT = `The edit did not finish within ${DASHBOARD_STUDIO_EDIT_TIMEOUT_MS / 1000} seconds. It may still apply later. ${READ_STATE_HINT}`;
const DASHBOARD_ID_NOTE = 'Pass the dashboard.id from GetDashboardState as dashboardId; the call fails when another dashboard is open.';
const EDIT_NOTE = `It changes the open dashboard in memory only, entering edit mode first if needed; only the user can save. ${DASHBOARD_ID_NOTE}`;
const DASHBOARD_ID_SCHEMA = { type: 'string', description: 'The dashboard.id from GetDashboardState.' };
const PANEL_ID_SCHEMA = { type: 'string', description: 'The panel id from GetDashboardState.' };
/** The screenshot width ceiling, in pixels, when the agent gives none. */
const SCREENSHOT_MAX_WIDTH = 1280;
/** The results of each kind SearchSources gives when the agent sets no limit. */
const SEARCH_LIMIT_DEFAULT = 20;
/** The most results of each kind SearchSources gives. */
const SEARCH_LIMIT_MAX = 50;

/** What a panel shows, read from its config: the kind of source, and its id or name when the config has them. */
export function DescribePanelSource(config: PanelConfig): { kind: string; id: string | null; name: string | null } {
  const text = (key: string): string | null => {
    const value = config[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  switch (config.type) {
    case 'View': {
      const viewId = text('viewId');
      return viewId ? { kind: 'view', id: viewId, name: null } : { kind: 'entity', id: null, name: text('entityName') };
    }
    case 'Query':
      return { kind: 'query', id: text('queryId'), name: text('queryName') };
    case 'Artifact':
      return { kind: 'artifact', id: text('artifactId'), name: null };
    case 'WebURL':
      return { kind: 'url', id: null, name: text('url') };
    default:
      return { kind: text('type')?.toLowerCase() ?? 'unknown', id: null, name: null };
  }
}

/**
 * The studio tools: GetDashboardState reads the open dashboard; AddPanel, RemovePanel, MovePanel,
 * ResizePanel and UpdatePanelSettings change its panels and layout in memory; GetDashboardScreenshot
 * captures it; RequestSaveDashboard and RequestPinToHome ask the user to save it or pin it to Home; and
 * SearchSources finds the sources a panel can show. The tools of one call share a queue: it runs their
 * edits one at a time, and the other tools start after the edits queued before them. So a tab registers
 * one set of tools and keeps it.
 */
export function BuildDashboardStudioTools(host: DashboardStudioHost): DashboardTabAgentTool[] {
  const edits = createEditQueue();
  return [
    getDashboardStateTool(host, edits),
    addPanelTool(host, edits),
    removePanelTool(host, edits),
    movePanelTool(host, edits),
    resizePanelTool(host, edits),
    updatePanelSettingsTool(host, edits),
    getDashboardScreenshotTool(host, edits),
    requestSaveDashboardTool(host, edits),
    requestPinToHomeTool(host, edits),
    searchSourcesTool(host, edits),
  ];
}

// ── tools ───────────────────────────────────────────────────────────────────

function getDashboardStateTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'GetDashboardState',
    Description:
      'Reads the dashboard open in this tab: its name, description and edit state (isEditing, canEdit, hasUnsavedChanges); every panel ' +
      'with its id, title, icon, part type, source (view, entity, query, artifact or url), config, path and size; the layout tree; and ' +
      'the part types it can add. A path is the panel\'s address in the layout, for example row/0 › column/1 › tab 0. A size gives the ' +
      'panel\'s share in percent of the nearest row (widthPct) and column (heightPct) it shares with other panels, or null where it has ' +
      'none. Call this before changing anything, and after a change fails. The edit and Request tools take its dashboard.id as ' +
      'dashboardId. Read-only.',
    ParameterSchema: { type: 'object', properties: {} },
    Handler: async () => runAfterEdits(edits, () => readState(host)),
  };
}

function addPanelTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'AddPanel',
    Description:
      `Adds a panel to the open dashboard. ${EDIT_NOTE} Pass the part type, its config without "type", and a title. Config keys by ` +
      `part type: ${DescribePartConfigs()}. Use SearchSources to find ids. position is optional: { relativeTo: <panel id>, placement: ` +
      'left|right|above|below } puts the panel beside another panel, placement tab adds it to that panel\'s tab stack, and ' +
      '{ placement: "end" } adds it at the right end of the layout; without a position the panel joins the first tab stack. ' +
      'Returns the new panel\'s id and path.',
    ParameterSchema: {
      type: 'object',
      properties: {
        dashboardId: DASHBOARD_ID_SCHEMA,
        partType: { type: 'string', enum: [...DASHBOARD_PART_TYPE_NAMES] },
        config: { type: 'object', description: 'The part config without "type".' },
        title: { type: 'string', description: 'The panel title.' },
        icon: { type: 'string', description: 'Optional Font Awesome classes, for example "fa-solid fa-chart-line".' },
        position: positionSchema('Optional. Where the panel goes.'),
      },
      required: ['dashboardId', 'partType', 'config', 'title'],
    },
    Handler: async params =>
      runEdit(edits, host, params, () => checkAddPanel(host, params), async add => {
        const panelId = await host.AddPanel(add.partTypeId, add.config, add.title, add.icon, add.position);
        if (!panelId) return fail(`The dashboard did not add the panel. ${READ_STATE_HINT}`);
        return { Success: true, Data: { panelId, path: host.GetPanelPath(panelId) } };
      }),
  };
}

function removePanelTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'RemovePanel',
    Description: `Removes a panel from the open dashboard. ${EDIT_NOTE} Pass the panel id from GetDashboardState.`,
    ParameterSchema: {
      type: 'object',
      properties: { dashboardId: DASHBOARD_ID_SCHEMA, panelId: PANEL_ID_SCHEMA },
      required: ['dashboardId', 'panelId'],
    },
    Handler: async params =>
      runEdit(edits, host, params, () => readPanel(params['panelId'], livePanels(host)), async panel => {
        await host.RemovePanel(panel.id);
        return { Success: true, Data: { removed: true, panelId: panel.id } };
      }),
  };
}

function movePanelTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'MovePanel',
    Description:
      'Moves a panel beside another panel (left, right, above or below), into another panel\'s tab stack (tab), or to the right end ' +
      `of the layout (end). ${EDIT_NOTE} The rows and columns the panel leaves and joins can share their space evenly afterwards; ` +
      'adjust sizes with ResizePanel. Returns the panel\'s new path.',
    ParameterSchema: {
      type: 'object',
      properties: { dashboardId: DASHBOARD_ID_SCHEMA, panelId: PANEL_ID_SCHEMA, position: positionSchema('Where the panel goes.') },
      required: ['dashboardId', 'panelId', 'position'],
    },
    Handler: async params =>
      runEdit(edits, host, params, () => checkMovePanel(host, params), async move => {
        await host.ApplyLayout(move.layout);
        return { Success: true, Data: { moved: true, panelId: move.panelId, path: host.GetPanelPath(move.panelId) } };
      }),
  };
}

function resizePanelTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'ResizePanel',
    Description:
      'Sets a panel\'s width as a share of its row (widthPct) or its height as a share of its column (heightPct), in percent; pass ' +
      `either or both. ${EDIT_NOTE} The size applies to the nearest row or column the panel shares with other panels, and the other ` +
      'items there share the rest in proportion. A size stays between 5 and 95 and leaves every other item at least 5, so the panel ' +
      'can get a different size than asked; the result gives the size it got.',
    ParameterSchema: {
      type: 'object',
      properties: {
        dashboardId: DASHBOARD_ID_SCHEMA,
        panelId: PANEL_ID_SCHEMA,
        widthPct: { type: 'number', description: 'The panel\'s share of its row, in percent (5 to 95).' },
        heightPct: { type: 'number', description: 'The panel\'s share of its column, in percent (5 to 95).' },
      },
      required: ['dashboardId', 'panelId'],
    },
    Handler: async params =>
      runEdit(edits, host, params, () => checkResizePanel(host, params), async resize => {
        await host.ApplyLayout(resize.layout);
        const size = readPanelSize(host.GetConfig()?.layout ?? null, resize.panelId);
        return { Success: true, Data: { resized: true, panelId: resize.panelId, size } };
      }),
  };
}

function updatePanelSettingsTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'UpdatePanelSettings',
    Description:
      `Changes a panel's config, title or icon. ${EDIT_NOTE} config is a patch with only the keys to change: it is merged over the ` +
      'current config and checked again, and the part type cannot change. A key set to null is removed, and an empty config changes ' +
      `only the title or icon. Config keys by part type: ${DescribePartConfigs()}.`,
    ParameterSchema: {
      type: 'object',
      properties: {
        dashboardId: DASHBOARD_ID_SCHEMA,
        panelId: PANEL_ID_SCHEMA,
        config: { type: 'object', description: 'Only the config keys to change. null removes a key.' },
        title: { type: 'string', description: 'A new title.' },
        icon: { type: 'string', description: 'New Font Awesome classes.' },
      },
      required: ['dashboardId', 'panelId'],
    },
    Handler: async params =>
      runEdit(edits, host, params, () => checkPanelSettings(host, params), async change => {
        await host.UpdatePanelConfig(change.panelId, change.config, change.title, change.icon);
        return { Success: true, Data: { updated: true, panelId: change.panelId } };
      }),
  };
}

function getDashboardScreenshotTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'GetDashboardScreenshot',
    Description:
      'A JPEG of the dashboard as the user sees it, with each panel\'s bounds in image pixels. Use it only when a request depends on ' +
      'how things look (crowded, empty, colours, overlap). Iframe panels (WebURL) and some cross-origin images render blank in the ' +
      'capture, and only the shown tab of each tab stack is in it; that is a capture limit, not an empty panel. In a voice session ' +
      'the image also goes to the voice model as a video frame; sentToVoice says whether the voice session took it. Prefer ' +
      'GetDashboardState for structure. Read-only.',
    ParameterSchema: {
      type: 'object',
      properties: { maxWidth: { type: 'number', description: `Image width ceiling in pixels. Default ${SCREENSHOT_MAX_WIDTH}.` } },
    },
    Handler: async params => runAfterEdits(edits, () => takeScreenshot(host, params)),
  };
}

function requestSaveDashboardTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'RequestSaveDashboard',
    Description:
      'Asks the user to save the open dashboard with a confirm dialog. The tool never saves by itself. An optional new name and ' +
      'description are shown in the dialog, and the save applies them. A blank name or description is ignored, so the current ' +
      `one stays. ${DASHBOARD_ID_NOTE}`,
    ParameterSchema: {
      type: 'object',
      properties: {
        dashboardId: DASHBOARD_ID_SCHEMA,
        name: { type: 'string', description: 'Optional. A new name to save the dashboard with. A blank name is ignored.' },
        description: { type: 'string', description: 'Optional. A new description to save the dashboard with. A blank description is ignored.' },
      },
      required: ['dashboardId'],
    },
    Handler: async params => runAfterEdits(edits, () => requestSave(host, params)),
  };
}

function requestPinToHomeTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'RequestPinToHome',
    Description:
      'Asks the user to pin the open dashboard to their Home app as a card, with a confirm dialog. The tool never pins by itself. ' +
      DASHBOARD_ID_NOTE,
    ParameterSchema: { type: 'object', properties: { dashboardId: DASHBOARD_ID_SCHEMA }, required: ['dashboardId'] },
    Handler: async params =>
      runAfterEdits(edits, async () => {
        const wrong = wrongDashboard(host, params['dashboardId']);
        if (wrong) return wrong;
        return confirmResult(await host.Confirm('pin', {}));
      }),
  };
}

function searchSourcesTool(host: DashboardStudioHost, edits: EditQueue): DashboardTabAgentTool {
  return {
    Name: 'SearchSources',
    Description:
      'Finds the artifacts, saved views, queries and entities the user can show in a dashboard panel, by a word or phrase in their ' +
      'name or description. Results come grouped by kind (artifact, view, query, entity), best match first: an exact name, then a ' +
      'name that starts with the query, then a name that contains it, then a description that contains it. Each result has a ' +
      'suggestedConfig for AddPanel: its type is the partType, and its other keys are the config. An entity result is a View ' +
      'panel of all the entity\'s records. fitsDashboard is false for an artifact type that does not suit a panel, such as code, ' +
      'files and images; add one only when the user asks for that artifact. Read-only.',
    ParameterSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A word or phrase to find in names and descriptions, ignoring case. "" lists the first sources by name.' },
        kinds: { type: 'array', items: { type: 'string', enum: [...SOURCE_KINDS] }, description: 'The kinds to search. Default (missing or empty): every kind.' },
        limit: { type: 'number', description: `The most results of each kind: ${SEARCH_LIMIT_DEFAULT} by default, ${SEARCH_LIMIT_MAX} at most.` },
      },
      required: ['query'],
    },
    Handler: async params => runAfterEdits(edits, () => searchSources(host, params)),
  };
}

/** The JSON schema of a panel position. */
function positionSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description: `${description} { relativeTo: <panel id>, placement: left|right|above|below|tab } or { placement: "end" }.`,
    properties: {
      relativeTo: { type: 'string', description: 'The id of the panel to place this one beside. Not used with placement "end".' },
      placement: { type: 'string', enum: [...PANEL_PLACEMENTS, 'end'] },
    },
    required: ['placement'],
  };
}

// ── running a tool ──────────────────────────────────────────────────────────

/** A failure to return to the agent instead of a checked tool input. */
type Refusal = { ok: false; result: DashboardTabToolResult }; // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators

/** A checked tool input, or the failure to return to the agent. */
type Check<T> = { ok: true; value: T } | Refusal; // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators

/**
 * Runs edits one at a time, in the order they arrive. An edit that does not settle within
 * DASHBOARD_STUDIO_EDIT_TIMEOUT_MS gives a failure, and the next edit starts.
 */
interface EditQueue {
  /** Starts `edit` once every edit queued before it has finished or timed out, and settles with its result. */
  enqueue(edit: () => Promise<DashboardTabToolResult>): Promise<DashboardTabToolResult>;
  /** Resolves once every edit queued so far has finished or timed out. Never rejects. */
  whenIdle(): Promise<void>;
}

function fail(message: string): DashboardTabToolResult {
  return { Success: false, ErrorMessage: message };
}

function refuse(message: string): Refusal {
  return { ok: false, result: fail(message) };
}

/** Runs a tool body and returns its result, or a failure with the message of anything it throws. */
async function run(body: () => DashboardTabToolResult | Promise<DashboardTabToolResult>): Promise<DashboardTabToolResult> {
  try {
    return await body();
  } catch (error) {
    return fail(errorText(error));
  }
}

/**
 * A queue that starts each edit after the previous one has settled, whether it succeeded or failed, or
 * has timed out, so every edit reads and changes the dashboard as the edit before it left it.
 */
function createEditQueue(): EditQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue: edit => {
      const result = tail.then(() => withEditTimeout(edit()));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    whenIdle: () => tail,
  };
}

/**
 * Settles like the running edit, or with a failure when the edit has not settled within
 * DASHBOARD_STUDIO_EDIT_TIMEOUT_MS. A rejected edit gives a failure with its message. An edit that timed
 * out keeps running, and its result is dropped.
 */
function withEditTimeout(running: Promise<DashboardTabToolResult>): Promise<DashboardTabToolResult> {
  return new Promise<DashboardTabToolResult>(resolve => {
    const timer = setTimeout(() => resolve(fail(EDIT_TIMED_OUT)), DASHBOARD_STUDIO_EDIT_TIMEOUT_MS);
    running.then(
      result => {
        clearTimeout(timer);
        resolve(result);
      },
      error => {
        clearTimeout(timer);
        resolve(fail(errorText(error)));
      },
    );
  });
}

/**
 * Runs a tool that does not edit once the edits queued before it have finished, so it sees what they
 * changed. It does not hold the queue: an edit that arrives later can start while it runs.
 */
function runAfterEdits(edits: EditQueue, body: () => DashboardTabToolResult | Promise<DashboardTabToolResult>): Promise<DashboardTabToolResult> {
  return run(async () => {
    await edits.whenIdle();
    return body();
  });
}

/**
 * Runs an edit tool in the edit queue, so it starts after the previous edit has finished or timed out. It
 * fails, before reading the rest of the call, when the call's `dashboardId` is not the open dashboard's
 * (see wrongDashboard) or the tab cannot take an edit (see editRefusal). Then `check` reads the call and
 * the dashboard and changes nothing, so a bad call leaves even the edit mode as it was. Then the tab
 * enters edit mode if it is not editing, and `check` runs again, because entering edit mode can reload
 * the saved dashboard. `apply` makes the edit by awaiting the host. A failure of the edit is returned
 * with its message, and an edit that does not finish within DASHBOARD_STUDIO_EDIT_TIMEOUT_MS gives a
 * failure that says so.
 */
function runEdit<T>(
  edits: EditQueue,
  host: DashboardStudioHost,
  params: Record<string, unknown>,
  check: () => Check<T>,
  apply: (input: T) => Promise<DashboardTabToolResult>,
): Promise<DashboardTabToolResult> {
  return edits.enqueue(() =>
    run(async () => {
      const refusal = wrongDashboard(host, params['dashboardId']) ?? editRefusal(host);
      if (refusal) return refusal;
      const first = check();
      if (!first.ok) return first.result;
      const wasEditing = host.IsEditing();
      if (!wasEditing && !host.EnterEditMode()) return fail('The dashboard could not enter edit mode.');
      const checked = wasEditing ? first : check();
      if (!checked.ok) return checked.result;
      try {
        return await apply(checked.value);
      } catch (error) {
        return fail(`${asSentence(errorText(error))} ${READ_STATE_HINT}`);
      }
    }),
  );
}

/**
 * Why a call cannot act on the open dashboard: none is open, the call gives no dashboardId, or its
 * dashboardId is another dashboard's, such as the one the tab showed when the agent read the state. Null
 * when the call names the open dashboard.
 */
function wrongDashboard(host: DashboardStudioHost, raw: unknown): DashboardTabToolResult | null {
  const dashboard = host.Dashboard();
  if (!dashboard) return fail(NO_DASHBOARD);
  if (typeof raw !== 'string' || !raw.trim()) return fail(DASHBOARD_ID_REQUIRED);
  return UUIDsEqual(raw, dashboard.ID) ? null : fail(DASHBOARD_CHANGED);
}

/**
 * Why the tab cannot take an edit now: no dashboard is open or it is still loading, a save runs, or the
 * tab is not editing and the user cannot edit. Null when the edit can go ahead.
 */
function editRefusal(host: DashboardStudioHost): DashboardTabToolResult | null {
  const open = openDashboard(host);
  if (!open.ok) return open.result;
  if (host.IsSaving()) return fail(SAVE_IN_PROGRESS);
  return host.IsEditing() || host.CanEdit() ? null : fail('The user cannot edit this dashboard.');
}

/** The open Config dashboard and its configuration, or a refusal when none is open or it has not loaded. */
function openDashboard(host: DashboardStudioHost): Check<OpenDashboard> {
  const dashboard = host.Dashboard();
  if (!dashboard) return refuse(NO_DASHBOARD);
  const config = host.GetConfig();
  return config ? { ok: true, value: { dashboard, config } } : refuse('The dashboard is still loading. Try again in a moment.');
}

/** The message of a thrown value, or a stand-in when it has none. Never throws. */
function errorText(error: unknown): string {
  try {
    const text = error instanceof Error ? error.message : String(error);
    if (typeof text === 'string' && text.trim()) return text.trim();
  } catch {
    // A thrown value that cannot be turned into text gets the stand-in below.
  }
  return 'The dashboard reported an error without a message.';
}

/** The text with a full stop at the end, unless it already ends a sentence. */
function asSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

// ── reading the dashboard ───────────────────────────────────────────────────

/** The open dashboard and the configuration the tab shows. */
interface OpenDashboard {
  dashboard: NonNullable<ReturnType<DashboardStudioHost['Dashboard']>>;
  config: DashboardConfig;
}

/** A panel's share, in whole percent, of the nearest row (width) and column (height) it shares with other items. */
interface PanelSize {
  widthPct: number | null;
  heightPct: number | null;
}

function readState(host: DashboardStudioHost): DashboardTabToolResult {
  const open = openDashboard(host);
  if (!open.ok) return open.result;
  const { dashboard, config } = open.value;
  const partTypes = host.GetPartTypes();
  const tree = SimplifyLayout(config.layout);
  const panels = ExtractPanelsFromLayout(config.layout).map(panel => {
    const path = FindPanelPath(config.layout, panel.id);
    return {
      id: panel.id,
      title: panel.title,
      icon: panel.icon ?? null,
      partType: partTypes.find(pt => UUIDsEqual(pt.ID, panel.partTypeId))?.Name || panel.config.type || 'Unknown',
      source: DescribePanelSource(panel.config),
      config: panel.config,
      path: path ? DescribePath(path) : null,
      size: sizeOnPath(tree, path),
    };
  });
  return {
    Success: true,
    Data: {
      dashboard: {
        id: dashboard.ID,
        name: dashboard.Name,
        description: dashboard.Description,
        isEditing: host.IsEditing(),
        canEdit: host.CanEdit(),
        hasUnsavedChanges: host.HasUnsavedChanges(),
      },
      panels,
      layout: tree,
      partTypes: partTypes.map(pt => pt.Name),
    },
  };
}

/** The panels in the layout the tab shows now. */
function livePanels(host: DashboardStudioHost): DashboardPanel[] {
  return ExtractPanelsFromLayout(host.GetConfig()?.layout ?? null);
}

/** The panel's size in the layout. */
function readPanelSize(layout: ResolvedLayoutConfig | null, panelId: string): PanelSize {
  return sizeOnPath(SimplifyLayout(layout), FindPanelPath(layout, panelId));
}

/**
 * The size of the panel at the end of `path`, read from the simplified layout: the share of the item on
 * the path in the nearest row, and in the nearest column, that holds more than one item. The layout
 * editor resizes the same row and column. A share is null when there is no such row or column.
 */
function sizeOnPath(tree: SimplifiedLayoutNode | null, path: LayoutPathStep[] | null): PanelSize {
  const size: PanelSize = { widthPct: null, heightPct: null };
  let node = tree;
  for (const step of path ?? []) {
    const children = node?.children ?? [];
    const child = children[step.index] ?? null;
    if (node && (node.kind === 'row' || node.kind === 'column') && children.length > 1) {
      size[node.kind === 'row' ? 'widthPct' : 'heightPct'] = child?.sizePct ?? null;
    }
    node = child;
  }
  return size;
}

// ── the screenshot ──────────────────────────────────────────────────────────

/** A panel's box: in CSS pixels as the host gives it, or in image pixels in the tool result. */
type PanelBox = ReturnType<DashboardStudioHost['PanelBounds']>[number];

/** Captures the dashboard, gives the panel bounds in image pixels, and sends the image to a running voice session. */
async function takeScreenshot(host: DashboardStudioHost, params: Record<string, unknown>): Promise<DashboardTabToolResult> {
  const open = openDashboard(host);
  if (!open.ok) return open.result;
  const maxWidth = readMaxWidth(params['maxWidth']);
  if (!maxWidth.ok) return maxWidth.result;
  const image = await captureScreenshot(host, maxWidth.value);
  if (!image.ok) return image.result;
  const capture = image.value;
  const panelBounds = boundsInImage(host.PanelBounds(), capture.Width);
  return {
    Success: true,
    Data: { width: capture.Width, height: capture.Height, panelBounds, ...sendToVoice(host, capture) },
    Media: [{ MimeType: capture.MimeType, Base64: capture.Base64, Width: capture.Width, Height: capture.Height }],
  };
}

/** The screenshot, or a refusal that gives the reason the capture failed. */
async function captureScreenshot(host: DashboardStudioHost, maxWidth: number): Promise<Check<ElementCapture>> {
  try {
    return { ok: true, value: await host.CaptureScreenshot(maxWidth) };
  } catch (error) {
    return refuse(`Screenshot failed: ${asSentence(errorText(error))} Use GetDashboardState for the layout instead.`);
  }
}

/**
 * The panel bounds in image pixels. The host gives them in CSS pixels relative to the captured element,
 * which the panels fill from side to side, so the scale is the image width over the right edge of the
 * rightmost panel. With no panels, or a right edge under 1 CSS pixel (the panels have no size on screen),
 * the bounds cannot be scaled and none are given.
 */
function boundsInImage(bounds: readonly PanelBox[], imageWidth: number): PanelBox[] {
  const rightEdge = Math.max(...bounds.map(b => b.x + b.width));
  if (!Number.isFinite(rightEdge) || rightEdge < 1) return [];
  const scale = imageWidth / rightEdge;
  return bounds.map(b => ({
    panelId: b.panelId,
    x: Math.round(b.x * scale),
    y: Math.round(b.y * scale),
    width: Math.round(b.width * scale),
    height: Math.round(b.height * scale),
  }));
}

/**
 * Sends the screenshot to the running voice session as a video frame. `sentToVoice` says whether the voice
 * session took it; a send that throws is reported in `voiceFrameError` and does not fail the screenshot.
 */
function sendToVoice(host: DashboardStudioHost, capture: ElementCapture): { sentToVoice: boolean; voiceFrameError?: string } {
  if (!host.IsVoiceSessionActive()) return { sentToVoice: false };
  try {
    return { sentToVoice: host.SendVoiceFrame(capture.Base64, capture.MimeType) === true };
  } catch (error) {
    return { sentToVoice: false, voiceFrameError: errorText(error) };
  }
}

// ── requests to the user ────────────────────────────────────────────────────

/** Asks the user to save the open dashboard, with the new name and description the agent gives. */
async function requestSave(host: DashboardStudioHost, params: Record<string, unknown>): Promise<DashboardTabToolResult> {
  const wrong = wrongDashboard(host, params['dashboardId']);
  if (wrong) return wrong;
  const open = openDashboard(host);
  if (!open.ok) return open.result;
  if (host.IsSaving()) return fail(SAVE_IN_PROGRESS);
  if (!host.IsEditing() && !host.HasUnsavedChanges()) return fail('There is nothing to save: the dashboard is not being edited.');
  const name = readOptionalText(params['name'], 'name');
  if (!name.ok) return name.result;
  const description = readOptionalText(params['description'], 'description');
  if (!description.ok) return description.result;
  return confirmResult(await host.Confirm('save', { name: name.value, description: description.value }));
}

/** The result of a Request* tool for the user's answer. A decline is a failure the agent relays without retrying. */
function confirmResult(confirmed: boolean): DashboardTabToolResult {
  return confirmed
    ? { Success: true, Data: { requested: true, confirmed: true } }
    : fail('The user declined. Do not retry unless they ask again.');
}

// ── searching sources ───────────────────────────────────────────────────────

/** Searches the sources a panel can show with the agent's query, kinds and limit. Data names the kinds it ignored. */
async function searchSources(host: DashboardStudioHost, params: Record<string, unknown>): Promise<DashboardTabToolResult> {
  const query = readSearchQuery(params['query']);
  if (!query.ok) return query.result;
  const kinds = readSourceKinds(params['kinds']);
  if (!kinds.ok) return kinds.result;
  const limit = readSearchLimit(params['limit']);
  if (!limit.ok) return limit.result;
  const results = await host.SearchSources(query.value, kinds.value.kinds, limit.value);
  const ignored = kinds.value.ignored;
  return { Success: true, Data: { count: results.length, results, ...(ignored.length > 0 ? { ignoredKinds: ignored } : {}) } };
}

// ── checking edit calls ─────────────────────────────────────────────────────

/** A checked AddPanel call. */
interface PanelToAdd {
  partTypeId: string;
  config: PanelConfig;
  title: string;
  icon: string | undefined;
  position: PanelPosition | undefined;
}

/** A layout edit made by the layout editor, ready to apply. */
interface LayoutChange {
  panelId: string;
  layout: ResolvedLayoutConfig;
}

/** A checked UpdatePanelSettings call. */
interface PanelSettingsChange {
  panelId: string;
  config: PanelConfig;
  title: string | undefined;
  icon: string | undefined;
}

/** A config key that the part type's rules reject, with the validator's reason. */
interface KeyProblem {
  key: string;
  reason: string;
}

function checkAddPanel(host: DashboardStudioHost, params: Record<string, unknown>): Check<PanelToAdd> {
  const partTypeName = readPartTypeName(params['partType']);
  if (!partTypeName.ok) return partTypeName;
  const name = partTypeName.value;
  const partTypes = host.GetPartTypes();
  const partType = partTypes.find(pt => namesMatch(pt.Name, name));
  if (!partType) return refuse(`The ${name} part type is not available in this dashboard. Part types it can add: ${listAddablePartTypes(partTypes)}.`);
  const config = ValidatePartConfig(name, params['config']);
  if (!config.ok) return refuse(config.error);
  const title = readText(params['title'], 'title');
  if (!title.ok) return title;
  const icon = readOptionalText(params['icon'], 'icon');
  if (!icon.ok) return icon;
  const position = readPosition(params['position'], livePanels(host), null);
  if (!position.ok) return position;
  return { ok: true, value: { partTypeId: partType.ID, config: config.config, title: title.value, icon: icon.value, position: position.value } };
}

function checkMovePanel(host: DashboardStudioHost, params: Record<string, unknown>): Check<LayoutChange> {
  const layout = host.GetConfig()?.layout ?? null;
  const panels = ExtractPanelsFromLayout(layout);
  const panel = readPanel(params['panelId'], panels);
  if (!panel.ok) return panel;
  const panelId = panel.value.id;
  const position = readPosition(params['position'], panels, panelId);
  if (!position.ok) return position;
  const target = position.value;
  if (!target) return refuse('position is required: { relativeTo: <panel id>, placement: left|right|above|below|tab } or { placement: "end" }.');
  return editLayout(panelId, () => MovePanel(layout, panelId, target));
}

function checkResizePanel(host: DashboardStudioHost, params: Record<string, unknown>): Check<LayoutChange> {
  const layout = host.GetConfig()?.layout ?? null;
  const panel = readPanel(params['panelId'], ExtractPanelsFromLayout(layout));
  if (!panel.ok) return panel;
  const panelId = panel.value.id;
  const widthPct = readPercent(params['widthPct'], 'widthPct');
  if (!widthPct.ok) return widthPct;
  const heightPct = readPercent(params['heightPct'], 'heightPct');
  if (!heightPct.ok) return heightPct;
  if (widthPct.value === undefined && heightPct.value === undefined) return refuse('Pass widthPct, heightPct or both.');
  const size = { widthPct: widthPct.value, heightPct: heightPct.value };
  return editLayout(panelId, () => ResizePanel(layout, panelId, size));
}

function checkPanelSettings(host: DashboardStudioHost, params: Record<string, unknown>): Check<PanelSettingsChange> {
  const panel = readPanel(params['panelId'], livePanels(host));
  if (!panel.ok) return panel;
  const title = readOptionalText(params['title'], 'title');
  if (!title.ok) return title;
  const icon = readOptionalText(params['icon'], 'icon');
  if (!icon.ok) return icon;
  const patch = readConfigPatch(params['config']);
  if (!patch.ok) return patch;
  if (!patch.value && title.value === undefined && icon.value === undefined) return refuse('Pass config, title or icon to change.');
  const config: Check<PanelConfig> = patch.value ? patchConfig(host, panel.value, patch.value) : { ok: true, value: panel.value.config };
  if (!config.ok) return config;
  return { ok: true, value: { panelId: panel.value.id, config: config.value, title: title.value, icon: icon.value } };
}

/**
 * The panel's config with the patch merged over it and checked against the panel's part type. A key the
 * patch sets to null is removed first. When the merged config fails because of values the patch did not
 * send, the refusal says that the panel's current config is invalid and names those keys.
 */
function patchConfig(host: DashboardStudioHost, panel: DashboardPanel, patch: Record<string, unknown>): Check<PanelConfig> {
  const partTypeName = configRulesName(host, panel);
  if (!partTypeName) {
    return refuse(`Panel "${panel.title}" is a ${panel.config.type || 'custom'} part; only its title and icon can be changed here.`);
  }
  const merged = withoutNullKeys(MergePartConfig(panel.config, patch), patch);
  const checked = ValidatePartConfig(partTypeName, merged);
  if (checked.ok) return { ok: true, value: checked.config };
  const stored = rejectedKeys(partTypeName, merged).filter(problem => !Object.hasOwn(patch, problem.key));
  return refuse(stored.length ? invalidCurrentConfig(panel, stored) : checked.error);
}

/** A copy of the merged config without the keys the patch sets to null. `type` stays. */
function withoutNullKeys(merged: PanelConfig, patch: Record<string, unknown>): PanelConfig {
  const config: PanelConfig = { ...merged };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null && key !== 'type') delete config[key];
  }
  return config;
}

/**
 * The keys of `config` that the part type's rules reject: keys the rules do not allow, and values that fail
 * their key's rule. Each key is checked beside one key that is valid on its own (a required key with a good
 * value), so a missing required key is never counted. Empty when no key is valid on its own.
 */
function rejectedKeys(partType: DashboardPartTypeName, config: PanelConfig): KeyProblem[] {
  const entries = Object.entries(config).filter(([key]) => key !== 'type');
  const anchor = entries.find(([key, value]) => ValidatePartConfig(partType, { [key]: value }).ok);
  if (!anchor) return [];
  const [anchorKey, anchorValue] = anchor;
  return entries.flatMap(([key, value]) => {
    if (key === anchorKey) return [];
    const probe = ValidatePartConfig(partType, { [anchorKey]: anchorValue, [key]: value });
    return probe.ok ? [] : [{ key, reason: probe.error }];
  });
}

/** The refusal for a patch that fails because of values the panel holds and the call did not send. */
function invalidCurrentConfig(panel: DashboardPanel, problems: readonly KeyProblem[]): string {
  const reasons = problems.map(problem => problem.reason).join(' ');
  const keys = problems.map(problem => problem.key).join(' and ');
  return (
    `The current config of panel "${panel.title}" is invalid, in values this call did not send: ${reasons} ` +
    `Send a valid value or null (which removes the key) for ${keys}, or change only the title or icon.`
  );
}

/** The part type whose config rules apply to the panel: its installed part type's name, else its config type. Null for other part types. */
function configRulesName(host: DashboardStudioHost, panel: DashboardPanel): DashboardPartTypeName | null {
  const installed = host.GetPartTypes().find(pt => UUIDsEqual(pt.ID, panel.partTypeId));
  const name = installed?.Name || panel.config.type;
  return DASHBOARD_PART_TYPE_NAMES.find(known => namesMatch(name, known)) ?? null;
}

/** The layout an editor function returns, or a refusal for the LayoutEditError it throws. Other errors propagate. */
function editLayout(panelId: string, edit: () => ResolvedLayoutConfig): Check<LayoutChange> {
  try {
    return { ok: true, value: { panelId, layout: edit() } };
  } catch (error) {
    if (error instanceof LayoutEditError) return refuse(error.message);
    throw error;
  }
}

// ── reading parameters ──────────────────────────────────────────────────────

function readPartTypeName(raw: unknown): Check<DashboardPartTypeName> {
  const name = DASHBOARD_PART_TYPE_NAMES.find(known => namesMatch(raw, known));
  return name ? { ok: true, value: name } : refuse(`partType must be one of ${DASHBOARD_PART_TYPE_NAMES.join(', ')}.`);
}

/** Required text, trimmed. */
function readText(raw: unknown, name: string): Check<string> {
  return typeof raw === 'string' && raw.trim() ? { ok: true, value: raw.trim() } : refuse(`${name} must be a non-empty string.`);
}

/** Optional text, trimmed; missing or blank text is undefined. */
function readOptionalText(raw: unknown, name: string): Check<string | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'string') return refuse(`${name} must be a string.`);
  return { ok: true, value: raw.trim() || undefined };
}

/** An optional percentage. The layout editor keeps a size it applies within its bounds. */
function readPercent(raw: unknown, name: string): Check<number | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  return typeof raw === 'number' && Number.isFinite(raw) ? { ok: true, value: raw } : refuse(`${name} must be a number, such as 40 for 40%.`);
}

/** The screenshot width ceiling: a number of pixels, rounded, or the default when none is given. */
function readMaxWidth(raw: unknown): Check<number> {
  if (raw === undefined || raw === null) return { ok: true, value: SCREENSHOT_MAX_WIDTH };
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
    ? { ok: true, value: Math.round(raw) }
    : refuse(`maxWidth must be a number of pixels, such as ${SCREENSHOT_MAX_WIDTH}.`);
}

/** The search query, trimmed. A missing query is the empty query, which lists the first sources by name. */
function readSearchQuery(raw: unknown): Check<string> {
  if (raw === undefined || raw === null) return { ok: true, value: '' };
  return typeof raw === 'string'
    ? { ok: true, value: raw.trim() }
    : refuse('query must be text: a word or phrase from a name or description, or "" to list the first sources by name.');
}

/**
 * The source kinds to search, in SOURCE_KINDS order, matched ignoring case and outer spaces, and the entries
 * that name no kind. A missing or empty list means every kind.
 */
function readSourceKinds(raw: unknown): Check<{ kinds: readonly SourceKind[]; ignored: unknown[] }> {
  if (raw === undefined || raw === null) return { ok: true, value: { kinds: SOURCE_KINDS, ignored: [] } };
  if (!Array.isArray(raw)) return refuse(`kinds must be a list of source kinds: ${SOURCE_KINDS.join(', ')}.`);
  const entries: unknown[] = raw;
  if (entries.length === 0) return { ok: true, value: { kinds: SOURCE_KINDS, ignored: [] } };
  const kinds = SOURCE_KINDS.filter(kind => entries.some(entry => namesMatch(entry, kind)));
  if (kinds.length === 0) return refuse(`kinds must contain one of ${SOURCE_KINDS.join(', ')}.`);
  return { ok: true, value: { kinds, ignored: entries.filter(entry => !SOURCE_KINDS.some(kind => namesMatch(entry, kind))) } };
}

/** The most search results of each kind: a number of at least 1, rounded and capped at SEARCH_LIMIT_MAX, or the default when none is given. */
function readSearchLimit(raw: unknown): Check<number> {
  if (raw === undefined || raw === null) return { ok: true, value: SEARCH_LIMIT_DEFAULT };
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
    ? { ok: true, value: Math.min(SEARCH_LIMIT_MAX, Math.round(raw)) }
    : refuse(`limit must be a number of results per kind, such as ${SEARCH_LIMIT_DEFAULT} (at most ${SEARCH_LIMIT_MAX}).`);
}

/** The config patch, or undefined when there is none: a missing, null or empty config changes no config key. */
function readConfigPatch(raw: unknown): Check<Record<string, unknown> | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!isRecord(raw)) return refuse('config must be an object with the config keys to change.');
  return { ok: true, value: Object.keys(raw).length > 0 ? raw : undefined };
}

/**
 * The panel with this id, else the one panel with this title (ignoring case). A failure names the
 * parameter it read (`name`) and lists the panels.
 */
function readPanel(raw: unknown, panels: readonly DashboardPanel[], name = 'panelId'): Check<DashboardPanel> {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key) return refuse(`${name} is required: pass the id of a panel from GetDashboardState. Panels: ${listPanels(panels)}.`);
  const byId = panels.find(p => p.id === key);
  if (byId) return { ok: true, value: byId };
  const byTitle = panels.filter(p => namesMatch(p.title, key));
  if (byTitle.length === 1) return { ok: true, value: byTitle[0] };
  if (byTitle.length > 1) return refuse(`${name} "${key}" matches more than one panel title: ${listPanels(byTitle)}. Pass a panel id.`);
  return refuse(`${name} "${key}" matches no panel id or title. Panels: ${listPanels(panels)}.`);
}

/**
 * An optional position: `{ placement: 'end' }`, or a placement beside the `relativeTo` panel. A panel
 * being moved (`movingId`) cannot be placed relative to itself.
 */
function readPosition(raw: unknown, panels: readonly DashboardPanel[], movingId: string | null): Check<PanelPosition | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!isRecord(raw)) {
    return refuse('position must be an object: { relativeTo: <panel id>, placement: left|right|above|below|tab } or { placement: "end" }.');
  }
  const requested = raw['placement'];
  const placementName = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (placementName === 'end') return { ok: true, value: { placement: 'end' } };
  const placement = PANEL_PLACEMENTS.find(known => known === placementName);
  if (!placement) return refuse(`position.placement must be one of ${[...PANEL_PLACEMENTS, 'end'].join(', ')}.`);
  const relativeTo = raw['relativeTo'];
  if (typeof relativeTo !== 'string' || !relativeTo.trim()) {
    return refuse(`position.relativeTo is required for placement "${placement}": pass the id of a panel from GetDashboardState.`);
  }
  const target = readPanel(relativeTo, panels, 'position.relativeTo');
  if (!target.ok) return target;
  if (target.value.id === movingId) return refuse('A panel cannot be placed relative to itself.');
  return { ok: true, value: { relativeTo: target.value.id, placement } };
}

/** "Title (id)" for each panel, at most DASHBOARD_TAB_AGENT_LIST_CAP of them, or "(none)". */
function listPanels(panels: readonly DashboardPanel[]): string {
  if (panels.length === 0) return '(none)';
  const listed = panels.slice(0, DASHBOARD_TAB_AGENT_LIST_CAP).map(p => `${p.title || '(untitled)'} (${p.id})`).join(', ');
  const more = panels.length - DASHBOARD_TAB_AGENT_LIST_CAP;
  return more > 0 ? `${listed} and ${more} more` : listed;
}

/** The part types AddPanel can add that the dashboard has, by name, or "(none)". */
function listAddablePartTypes(partTypes: readonly Pick<MJDashboardPartTypeEntity, 'Name'>[]): string {
  const names = DASHBOARD_PART_TYPE_NAMES.filter(name => partTypes.some(pt => namesMatch(pt.Name, name)));
  return names.length > 0 ? names.join(', ') : '(none)';
}

/** True when `raw` is text that equals `name`, ignoring case and outer spaces. */
function namesMatch(raw: unknown, name: string): boolean {
  return typeof raw === 'string' && raw.trim().toLowerCase() === name.toLowerCase();
}

/** True for an object that is not null and not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
