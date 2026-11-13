import { Injectable } from '@angular/core';
import { CompositeKey, IMetadataProvider, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import type {
  MJAuditLogEntity,
  MJListEntity,
  MJQueryEntity,
  MJQueryParameterEntity,
  MJRecordChangeEntity,
  MJUserRoutineEntity,
  MJUserViewEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import type { ApplyResult, ListDelta, ListRefreshPreview, ListRefreshPreviewOptions } from '@memberjunction/lists-base';
import { diffLines } from 'diff';

import {
  ListRefreshEventType,
  ListRefreshHistoryEntry,
  ListRefreshRoutineInfo,
  ListRefreshStatus,
  ListRefreshSummary,
  ListSourceDiff,
  ListSourceDiffLine,
  ListSourceKind,
  ListSourceParameterInfo,
} from '../models/list-refresh.models';

/** The audit log type names a list's refresh history is built from, and what each one means. */
const HISTORY_TYPES: Record<string, ListRefreshEventType> = {
  'List Refreshed': 'Refreshed',
  'List Source Changed': 'SourceChanged',
  'List Source Approved': 'SourceApproved',
};

/** The view fields its fingerprint covers, in the order the review screen shows them. */
const VIEW_DEFINITION_FIELDS = ['WhereClause', 'CustomWhereClause', 'SmartFilterWhereClause', 'Properties'] as const;

type ListRow = Pick<MJListEntity,
  'ID' | 'Name' | 'Entity' | 'UserID' | 'User' | 'SourceViewID' | 'SourceView' | 'SourceQueryID' | 'SourceQuery' |
  'SourceFingerprint' | 'RefreshMode' | 'AutoRefresh' | 'UseSnapshot' | 'LastRefreshedAt' | 'LastRefreshedByUser' | 'RefreshRoutineID'>;
type RoutineRow = Pick<MJUserRoutineEntity,
  'ID' | 'Name' | 'Status' | 'CronExpression' | 'Timezone' | 'NextRunAt' | 'LastRunAt' | 'LastRunStatus'>;
type SourceRow = { ID: string; DefinitionFingerprint: string | null };
type AuditRow = Pick<MJAuditLogEntity, 'ID' | 'AuditLogType' | 'User' | 'Description' | 'Details' | '__mj_CreatedAt'>;
type ChangeRow = Pick<MJRecordChangeEntity, 'ID' | 'ChangedAt' | 'ChangesJSON' | 'FullRecordJSON' | 'User'>;

const LIST_FIELDS: Array<keyof ListRow> = [
  'ID', 'Name', 'Entity', 'UserID', 'User', 'SourceViewID', 'SourceView', 'SourceQueryID', 'SourceQuery', 'SourceFingerprint',
  'RefreshMode', 'AutoRefresh', 'UseSnapshot', 'LastRefreshedAt', 'LastRefreshedByUser', 'RefreshRoutineID',
];

/**
 * Data for the Lists app's self-updating lists: their refresh status, history and source changes,
 * plus the refresh operations (preview, apply, approve) over GraphQL.
 *
 * Holds no UI state. Multi-provider note: callers under a non-default provider set
 * `service.Provider = component.ProviderToUse` before calling, as with {@link ListSharingService}.
 */
@Injectable({ providedIn: 'root' })
export class ListRefreshService {
  private _provider: IMetadataProvider | null = null;

  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  // --- status -------------------------------------------------------------

  /**
   * The refresh summary of every list linked to a source that the current user can see, or of the
   * given lists (linked or not).
   */
  public async LoadSummariesAsync(listIDs?: string[]): Promise<ListRefreshSummary[]> {
    const filter = listIDs
      ? (listIDs.length ? `ID IN (${listIDs.map((id) => `'${EscapeSQLString(id)}'`).join(',')})` : '1=0')
      : '(SourceViewID IS NOT NULL OR SourceQueryID IS NOT NULL)';
    const lists = await this.runView<ListRow>({ EntityName: 'MJ: Lists', ExtraFilter: filter, Fields: LIST_FIELDS, OrderBy: 'Name' });
    return this.summarizeAsync(lists);
  }

  /** The refresh summary of one list, or null when it can't be read. */
  public async LoadSummaryAsync(listID: string): Promise<ListRefreshSummary | null> {
    return (await this.LoadSummariesAsync([listID]))[0] ?? null;
  }

  private async summarizeAsync(lists: ListRow[]): Promise<ListRefreshSummary[]> {
    const routineIDs = lists.map((l) => l.RefreshRoutineID).filter((id): id is string => !!id);
    const viewIDs = lists.map((l) => l.SourceViewID).filter((id): id is string => !!id);
    const queryIDs = lists.map((l) => l.SourceQueryID).filter((id): id is string => !!id);
    const [routines, views, queries] = await this.runViews([
      { EntityName: 'MJ: User Routines', ExtraFilter: inFilter(routineIDs), Fields: ['ID', 'Name', 'Status', 'CronExpression', 'Timezone', 'NextRunAt', 'LastRunAt', 'LastRunStatus'] },
      { EntityName: 'MJ: User Views', ExtraFilter: inFilter(viewIDs), Fields: ['ID', 'DefinitionFingerprint'] },
      { EntityName: 'MJ: Queries', ExtraFilter: inFilter(queryIDs), Fields: ['ID', 'DefinitionFingerprint'] },
    ]);
    const routineByID = IndexByUUID(routines as RoutineRow[]);
    const viewByID = IndexByUUID(views as SourceRow[]);
    const queryByID = IndexByUUID(queries as SourceRow[]);
    return lists.map((l) => {
      const routine = l.RefreshRoutineID ? routineByID.Get(l.RefreshRoutineID) ?? null : null;
      const source = l.SourceQueryID ? queryByID.Get(l.SourceQueryID) : l.SourceViewID ? viewByID.Get(l.SourceViewID) : undefined;
      return this.toSummary(l, routine, source?.DefinitionFingerprint ?? null);
    });
  }

  private toSummary(l: ListRow, routine: RoutineRow | null, sourceFingerprint: string | null): ListRefreshSummary {
    const kind: ListSourceKind | null = l.SourceQueryID ? 'query' : l.SourceViewID ? 'view' : null;
    return {
      ListID: l.ID,
      ListName: l.Name,
      EntityName: l.Entity ?? '',
      OwnerID: l.UserID,
      OwnerName: l.User ?? '',
      SourceKind: kind,
      SourceID: l.SourceQueryID ?? l.SourceViewID ?? null,
      SourceName: kind === 'query' ? l.SourceQuery : kind === 'view' ? l.SourceView : null,
      RefreshMode: l.RefreshMode,
      AutoRefresh: !!l.AutoRefresh,
      UseSnapshot: !!l.UseSnapshot,
      LastRefreshedAt: toDate(l.LastRefreshedAt),
      LastRefreshedBy: l.LastRefreshedByUser ?? null,
      Routine: routine ? toRoutineInfo(routine) : null,
      Status: ComputeListRefreshStatus(l, routine, sourceFingerprint),
    };
  }

  // --- history ------------------------------------------------------------

  /** The list's refresh history, newest first: refreshes that changed it, source changes and approvals. */
  public async LoadHistoryAsync(listID: string, maxRows = 200): Promise<ListRefreshHistoryEntry[]> {
    const listsEntity = this.Provider.EntityByName('MJ: Lists');
    if (!listsEntity) throw new Error("Entity 'MJ: Lists' not found in metadata");
    const types = Object.keys(HISTORY_TYPES).map((t) => `'${EscapeSQLString(t)}'`).join(',');
    const rows = await this.runView<AuditRow>({
      EntityName: 'MJ: Audit Logs',
      ExtraFilter: `EntityID='${EscapeSQLString(listsEntity.ID)}' AND RecordID='${EscapeSQLString(listID)}' AND AuditLogType IN (${types})`,
      Fields: ['ID', 'AuditLogType', 'User', 'Description', 'Details', '__mj_CreatedAt'],
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: maxRows,
    });
    return rows.map(ToHistoryEntry);
  }

  // --- source change review ----------------------------------------------

  /**
   * What changed in the list's source since its owner last approved it. The approved version is the
   * source as Record Changes had it when the list's `SourceFingerprint` was last set; the list
   * itself never stores the definition.
   */
  public async LoadSourceDiffAsync(listID: string): Promise<ListSourceDiff | null> {
    const list = await this.loadEntityAsync<MJListEntity>('MJ: Lists', listID);
    if (!list || (!list.SourceQueryID && !list.SourceViewID)) return null;
    const kind: ListSourceKind = list.SourceQueryID ? 'query' : 'view';
    const sourceID = (list.SourceQueryID ?? list.SourceViewID)!;
    const entityName = kind === 'query' ? 'MJ: Queries' : 'MJ: User Views';

    const approvedAt = await this.lastFingerprintChangeAsync(list.ID);
    const [current, before, latest] = await Promise.all([
      this.loadEntityAsync<MJQueryEntity | MJUserViewEntity>(entityName, sourceID),
      approvedAt ? this.sourceChangeAsOfAsync(entityName, sourceID, approvedAt) : Promise.resolve(null),
      this.sourceChangeAsOfAsync(entityName, sourceID, null),
    ]);
    if (!current) return null;

    const after = kind === 'query'
      ? (current as MJQueryEntity).SQL ?? ''
      : DescribeViewDefinition(current as MJUserViewEntity);
    const beforeText = before ? DefinitionFromSnapshot(kind, before.FullRecordJSON) : null;
    return {
      SourceKind: kind,
      SourceID: sourceID,
      SourceName: current.Name,
      Before: beforeText,
      After: after,
      ApprovedAt: approvedAt,
      ChangedBy: latest?.User ?? null,
      ChangedAt: latest ? toDate(latest.ChangedAt) : null,
      Lines: beforeText === null ? DiffDefinitions(after, after) : DiffDefinitions(beforeText, after),
    };
  }

  /** The parameters of a query source, with the list's stored values. */
  public async LoadSourceParametersAsync(queryID: string, storedParametersJSON: string | null): Promise<ListSourceParameterInfo[]> {
    const stored = parseParameters(storedParametersJSON);
    const rows = await this.runView<Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'Description' | 'SampleValue' | 'IsServerSet'>>({
      EntityName: 'MJ: Query Parameters',
      ExtraFilter: `QueryID='${EscapeSQLString(queryID)}'`,
      Fields: ['Name', 'Type', 'IsRequired', 'Description', 'SampleValue', 'IsServerSet'],
      OrderBy: 'Name',
    });
    return rows.filter((r) => !r.IsServerSet).map((r) => ({
      Name: r.Name,
      Type: r.Type,
      IsRequired: !!r.IsRequired,
      Description: r.Description ?? null,
      SampleValue: r.SampleValue ?? null,
      CurrentValue: stored[r.Name] ?? null,
    }));
  }

  /** When the list's `SourceFingerprint` was last set, from its Record Changes. */
  private async lastFingerprintChangeAsync(listID: string): Promise<Date | null> {
    const changes = await this.recordChangesAsync('MJ: Lists', listID, `ChangesJSON LIKE '%"SourceFingerprint"%'`, 1);
    return changes[0] ? toDate(changes[0].ChangedAt) : null;
  }

  /** The source's latest Record Change at or before `asOf`, or its latest of all when `asOf` is null. */
  private async sourceChangeAsOfAsync(entityName: string, sourceID: string, asOf: Date | null): Promise<ChangeRow | null> {
    const filter = asOf ? `ChangedAt <= '${asOf.toISOString()}'` : null;
    return (await this.recordChangesAsync(entityName, sourceID, filter, 1))[0] ?? null;
  }

  private async recordChangesAsync(entityName: string, recordID: string, extra: string | null, maxRows: number): Promise<ChangeRow[]> {
    const entity = this.Provider.EntityByName(entityName);
    if (!entity) return [];
    const key = CompositeKey.FromURLSegment(entity, recordID).ToURLSegment();
    return this.runView<ChangeRow>({
      EntityName: 'MJ: Record Changes',
      ExtraFilter: [`EntityID='${EscapeSQLString(entity.ID)}'`, `RecordID='${EscapeSQLString(key)}'`, `Status='Complete'`, extra]
        .filter(Boolean).join(' AND '),
      Fields: ['ID', 'ChangedAt', 'ChangesJSON', 'FullRecordJSON', 'User'],
      OrderBy: 'ChangedAt DESC',
      MaxRows: maxRows,
    });
  }

  // --- operations ---------------------------------------------------------

  /** Previews refreshing the list from its source. Never mutates. */
  public async PreviewRefreshAsync(listID: string, options: ListRefreshPreviewOptions = {}): Promise<ListRefreshPreview> {
    return this.client().PreviewRefresh(listID, options);
  }

  /** Applies a delta from {@link PreviewRefreshAsync}. */
  public async ApplyRefreshAsync(delta: ListDelta, confirmDrops: boolean): Promise<ApplyResult> {
    return this.client().ApplyRefresh({ Delta: delta, ConfirmDrops: confirmDrops });
  }

  /** The owner approves the source's current definition; refreshes resume and the list refreshes now. */
  public async ApproveSourceAsync(listID: string, confirmDrops: boolean, parameters?: Record<string, unknown>): Promise<ApplyResult> {
    return this.client().ApproveSource({ ListId: listID, ConfirmDrops: confirmDrops, Parameters: parameters });
  }

  /**
   * Saves changes to the list's refresh settings. The server keeps the routine in step: turning
   * `AutoRefresh` on creates or re-enables it, off disables it, and removing the source disables it.
   */
  public async UpdateListAsync(listID: string, change: Partial<Pick<MJListEntity,
    'AutoRefresh' | 'RefreshMode' | 'SourceViewID' | 'SourceQueryID' | 'SourceQueryKeyField' | 'SourceQueryParameters'>>): Promise<void> {
    const list = await this.loadEntityAsync<MJListEntity>('MJ: Lists', listID);
    if (!list) throw new Error(`List ${listID} not found`);
    if (change.AutoRefresh !== undefined) list.AutoRefresh = change.AutoRefresh;
    if (change.RefreshMode !== undefined) list.RefreshMode = change.RefreshMode;
    if (change.SourceViewID !== undefined) list.SourceViewID = change.SourceViewID;
    if (change.SourceQueryID !== undefined) list.SourceQueryID = change.SourceQueryID;
    if (change.SourceQueryKeyField !== undefined) list.SourceQueryKeyField = change.SourceQueryKeyField;
    if (change.SourceQueryParameters !== undefined) list.SourceQueryParameters = change.SourceQueryParameters;
    if (!(await list.Save())) {
      throw new Error(list.LatestResult?.CompleteMessage ?? 'Could not save the list');
    }
  }

  /** Unlinks the list from its source and turns off automatic refresh. The records stay. */
  public async UnlinkSourceAsync(listID: string): Promise<void> {
    await this.UpdateListAsync(listID, {
      SourceViewID: null, SourceQueryID: null, SourceQueryKeyField: null, SourceQueryParameters: null, AutoRefresh: false,
    });
  }

  // --- plumbing -----------------------------------------------------------

  private client(): GraphQLListsClient {
    const provider = this.Provider;
    if (!(provider instanceof GraphQLDataProvider)) {
      throw new Error('List refresh operations need a GraphQL data provider.');
    }
    return new GraphQLListsClient(provider);
  }

  private async loadEntityAsync<T extends MJListEntity | MJQueryEntity | MJUserViewEntity>(entityName: string, id: string): Promise<T | null> {
    const p = this.Provider;
    const entity = await p.GetEntityObject<T>(entityName, p.CurrentUser);
    return (await entity.Load(id)) ? entity : null;
  }

  private async runView<T>(params: { EntityName: string; ExtraFilter: string; Fields: string[]; OrderBy?: string; MaxRows?: number }): Promise<T[]> {
    const result = await RunView.FromMetadataProvider(this.Provider).RunView<T>({ ...params, ResultType: 'simple' });
    if (!result.Success) throw new Error(result.ErrorMessage ?? `Could not load ${params.EntityName}`);
    return result.Results ?? [];
  }

  /** Several simple-row views in one round trip; each result's rows in order. */
  private async runViews(params: Array<{ EntityName: string; ExtraFilter: string; Fields: string[] }>): Promise<object[][]> {
    const results: RunViewResult<object>[] = await RunView.FromMetadataProvider(this.Provider).RunViews<object>(
      params.map((p) => ({ ...p, ResultType: 'simple' as const })),
    );
    return results.map((r, i) => {
      if (!r.Success) throw new Error(r.ErrorMessage ?? `Could not load ${params[i].EntityName}`);
      return r.Results ?? [];
    });
  }
}

// --- pure helpers (exported for tests) -------------------------------------

/** Where a list stands with respect to refreshing; see {@link ListRefreshStatus}. */
export function ComputeListRefreshStatus(
  list: Pick<MJListEntity, 'SourceViewID' | 'SourceQueryID' | 'SourceFingerprint' | 'AutoRefresh' | 'UseSnapshot'>,
  routine: Pick<MJUserRoutineEntity, 'Status' | 'LastRunStatus'> | null,
  sourceFingerprint: string | null,
): ListRefreshStatus {
  if (!list.SourceViewID && !list.SourceQueryID) return 'Static';
  if (routine?.Status === 'Paused') return 'Paused';
  const changed = !list.UseSnapshot && !!list.SourceFingerprint && !!sourceFingerprint && list.SourceFingerprint !== sourceFingerprint;
  if (changed) return 'SourceChanged';
  const scheduled = !!list.AutoRefresh && routine?.Status === 'Active';
  if (scheduled && routine?.LastRunStatus === 'Failed') return 'Failed';
  return scheduled ? 'Scheduled' : 'Manual';
}

/** One audit row as a history entry; the counts come from its Details JSON. */
export function ToHistoryEntry(row: AuditRow): ListRefreshHistoryEntry {
  const d = parseDetails(row.Details);
  const kind = d['SourceKind'];
  const mode = d['Mode'];
  return {
    ID: row.ID,
    At: toDate(row.__mj_CreatedAt) ?? new Date(0),
    Type: (row.AuditLogType && HISTORY_TYPES[row.AuditLogType]) || 'Refreshed',
    UserName: row.User ?? '',
    Description: row.Description ?? '',
    Mode: mode === 'Additive' || mode === 'Sync' ? mode : null,
    Added: numberOrNull(d['Added']),
    Removed: numberOrNull(d['Removed']),
    Failed: numberOrNull(d['Failed']),
    RecordsBefore: numberOrNull(d['RecordsBefore']),
    RecordsAfter: numberOrNull(d['RecordsAfter']),
    SourceKind: kind === 'view' || kind === 'query' ? kind : null,
    SourceName: typeof d['SourceName'] === 'string' ? d['SourceName'] : null,
    SourceFingerprint: typeof d['SourceFingerprint'] === 'string'
      ? d['SourceFingerprint']
      : typeof d['CurrentFingerprint'] === 'string' ? d['CurrentFingerprint'] : null,
  };
}

/** A view's fingerprinted filter fields as readable text, one field per block. */
export function DescribeViewDefinition(view: Partial<Record<(typeof VIEW_DEFINITION_FIELDS)[number], unknown>>): string {
  return VIEW_DEFINITION_FIELDS
    .map((f) => {
      const value = view[f];
      if (value === null || value === undefined || value === '') return null;
      return `${f}:\n${typeof value === 'string' ? value : JSON.stringify(value)}`;
    })
    .filter((s): s is string => s !== null)
    .join('\n\n');
}

/** The source definition held in a Record Change's FullRecordJSON. */
export function DefinitionFromSnapshot(kind: ListSourceKind, fullRecordJSON: string | null): string | null {
  if (!fullRecordJSON) return null;
  try {
    const record = JSON.parse(fullRecordJSON) as Record<string, unknown>;
    if (kind === 'query') return typeof record['SQL'] === 'string' ? record['SQL'] : null;
    return DescribeViewDefinition(record);
  } catch {
    return null;
  }
}

/** A line diff of two definitions, numbered on both sides. */
export function DiffDefinitions(before: string, after: string): ListSourceDiffLine[] {
  const lines: ListSourceDiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const part of diffLines(before, after)) {
    const texts = part.value.replace(/\n$/, '').split('\n');
    for (const text of texts) {
      if (part.added) lines.push({ Kind: 'add', Text: text, OldNumber: null, NewNumber: newNo++ });
      else if (part.removed) lines.push({ Kind: 'remove', Text: text, OldNumber: oldNo++, NewNumber: null });
      else lines.push({ Kind: 'same', Text: text, OldNumber: oldNo++, NewNumber: newNo++ });
    }
  }
  return lines;
}

function toRoutineInfo(r: RoutineRow): ListRefreshRoutineInfo {
  return {
    ID: r.ID,
    Name: r.Name,
    Status: r.Status,
    CronExpression: r.CronExpression ?? null,
    Timezone: r.Timezone,
    NextRunAt: toDate(r.NextRunAt),
    LastRunAt: toDate(r.LastRunAt),
    LastRunStatus: r.LastRunStatus ?? null,
  };
}

function inFilter(ids: string[]): string {
  return ids.length ? `ID IN (${ids.map((id) => `'${EscapeSQLString(id)}'`).join(',')})` : '1=0';
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseDetails(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseParameters(json: string | null): Record<string, string> {
  const raw = parseDetails(json);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && v !== undefined) out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}
