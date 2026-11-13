/**
 * RefreshFromSource's source-change check, refresh from a saved query, and ApproveListSource.
 *
 * `@memberjunction/core` and `@memberjunction/core-entities` are stubbed so the fingerprint
 * comparison, the routine pause/resume and the query path can be exercised without a database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunView = vi.fn();
const mockRunViews = vi.fn();
const mockRunQuery = vi.fn();
const mockGetEntityObject = vi.fn();
const mockViewFingerprint = vi.fn();
const mockQueryFingerprint = vi.fn();
const mockAudit = vi.fn();

const CONTACTS_ENTITY = { ID: 'entity-contacts', Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] };

vi.mock('@memberjunction/core', () => {
  class CompositeKey {
    KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
    ToCompactURLSegment(): string {
      return String(this.KeyValuePairs[0]?.Value ?? '');
    }
    static FromEntityRecord(entity: { PrimaryKeys: Array<{ Name: string }> }, row: Record<string, unknown>): CompositeKey {
      const key = new CompositeKey();
      key.KeyValuePairs = entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: row[pk.Name] }));
      return key;
    }
  }
  class RunView {
    static FromMetadataProvider() {
      return new RunView();
    }
    static async GetEntityNameFromRunViewParams(): Promise<string> {
      return 'Contacts';
    }
    RunView(params: unknown) {
      return mockRunView(params);
    }
    RunViews(params: unknown[]) {
      return mockRunViews(params);
    }
  }
  class RunQuery {
    RunQuery(params: unknown) {
      return mockRunQuery(params);
    }
  }
  class Metadata {
    static get Provider() {
      return { ScreenClientClause: () => undefined };
    }
    get Entities() {
      return [CONTACTS_ENTITY];
    }
    EntityByName(name: string) {
      return name === 'Contacts' ? CONTACTS_ENTITY : undefined;
    }
    EntityByID(id: string) {
      return id === CONTACTS_ENTITY.ID ? CONTACTS_ENTITY : undefined;
    }
    GetEntityObject(entityName: string) {
      return mockGetEntityObject(entityName);
    }
  }
  return { CompositeKey, RunView, RunQuery, Metadata, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  ComputeUserViewFingerprintAsync: (view: unknown) => mockViewFingerprint(view),
  ComputeQueryFingerprintAsync: (query: unknown, rows: unknown) => mockQueryFingerprint(query, rows),
}));

vi.mock('../listAuditLog', () => ({
  EmitListAuditLog: (entry: unknown) => mockAudit(entry),
}));

import { SetDeltaTokenSecret } from '../deltaToken';
import { ListOperations } from '../ListOperations';

const OWNER = { ID: 'owner-1', Name: 'Owner', Email: 'owner@x', UserRoles: [] };
const OTHER = { ID: 'other-1', Name: 'Other', Email: 'other@x', UserRoles: [] };

interface MockList {
  ID: string;
  Name: string;
  EntityID: string;
  UserID: string;
  SourceViewID: string | null;
  SourceQueryID: string | null;
  SourceQueryParameters: string | null;
  SourceQueryKeyField: string | null;
  SourceFingerprint: string | null;
  RefreshRoutineID: string | null;
  RefreshMode: 'Additive' | 'Sync';
  UseSnapshot: boolean;
  LastRefreshedAt: Date | null;
  LastRefreshedByUserID: string | null;
  LatestResult: { CompleteMessage: string };
  Load: ReturnType<typeof vi.fn>;
  Save: ReturnType<typeof vi.fn>;
}

function makeList(overrides: Partial<MockList> = {}): MockList {
  return {
    ID: 'list-1',
    Name: 'Members',
    EntityID: CONTACTS_ENTITY.ID,
    UserID: OWNER.ID,
    SourceViewID: 'view-1',
    SourceQueryID: null,
    SourceQueryParameters: null,
    SourceQueryKeyField: null,
    SourceFingerprint: 'fp-linked',
    RefreshRoutineID: null,
    RefreshMode: 'Additive',
    UseSnapshot: false,
    LastRefreshedAt: null,
    LastRefreshedByUserID: null,
    LatestResult: { CompleteMessage: '' },
    Load: vi.fn().mockResolvedValue(true),
    Save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeRoutine(status: 'Active' | 'Paused' | 'Disabled') {
  return { ID: 'routine-1', Status: status, LatestResult: { CompleteMessage: '' }, Load: vi.fn().mockResolvedValue(true), Save: vi.fn().mockResolvedValue(true) };
}

const VIEW = { ID: 'view-1', Name: 'Active contacts', __mj_UpdatedAt: new Date('2026-11-10T09:00:00Z'), Load: vi.fn().mockResolvedValue(true) };
const QUERY = { ID: 'query-1', Name: 'Conference attendees', __mj_UpdatedAt: new Date('2026-11-09T09:00:00Z'), Load: vi.fn().mockResolvedValue(true) };

/** Wires the entity objects a refresh loads: the list, its source, its routine and new list details. */
function wireEntities(list: MockList, routine?: ReturnType<typeof makeRoutine>) {
  const details: Array<{ RecordID: string }> = [];
  mockGetEntityObject.mockImplementation((name: string) => {
    if (name === 'MJ: Lists') return list;
    if (name === 'MJ: User Views') return VIEW;
    if (name === 'MJ: Queries') return QUERY;
    if (name === 'MJ: User Routines' && routine) return routine;
    if (name === 'MJ: List Details') {
      const detail = { NewRecord: vi.fn(), Save: vi.fn().mockResolvedValue(true), LatestResult: { CompleteMessage: '' }, ListID: '', RecordID: '', Sequence: 0 };
      details.push(detail);
      return detail;
    }
    throw new Error(`unexpected entity ${name}`);
  });
  return details;
}

/** The list currently holds `members`; the source view returns `sourceIDs`. */
function wireRecords(members: string[], sourceIDs: string[]) {
  mockRunView.mockImplementation(async (params: { EntityName?: string; ViewID?: string }) => {
    if (params.EntityName === 'MJ: List Details') {
      return { Success: true, Results: members.map((RecordID) => ({ RecordID })), RowCount: members.length };
    }
    if (params.ViewID) return { Success: true, Results: sourceIDs.map((ID) => ({ ID })), RowCount: sourceIDs.length };
    return { Success: true, Results: [], RowCount: 0 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  SetDeltaTokenSecret('test-secret-test-secret-test-secret');
  mockViewFingerprint.mockResolvedValue('fp-linked');
  mockQueryFingerprint.mockResolvedValue('fp-linked');
  mockRunViews.mockResolvedValue([
    { Success: true, Results: [{ SQLDialectID: 'D-1', SQL: 'SELECT 1' }] },
    { Success: true, Results: [] },
  ]);
});

describe('RefreshFromSource — source fingerprint', () => {
  it('refreshes when the source still matches the fingerprint the list was linked against', async () => {
    const list = makeList();
    const details = wireEntities(list);
    wireRecords(['a'], ['a', 'b']);

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(details.map((d) => d.RecordID)).toEqual(['b']);
    expect(mockAudit.mock.calls.map(([e]) => (e as { Type: string }).Type)).toEqual(['List Refreshed']);
  });

  it('writes a List Refreshed audit row with the counts, mode and source', async () => {
    wireEntities(makeList());
    wireRecords(['a'], ['a', 'b', 'c']);

    await new ListOperations(OWNER as never).RefreshFromSource('list-1', 'Sync', { ConfirmDrops: true });

    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      Type: 'List Refreshed',
      ListID: 'list-1',
      Details: expect.objectContaining({
        Mode: 'Sync', Added: 2, Removed: 0, RecordsBefore: 1, RecordsAfter: 3,
        SourceKind: 'view', SourceID: 'view-1', SourceName: 'Active contacts', SourceFingerprint: 'fp-linked',
      }),
    }));
  });

  it('writes no audit row when a refresh changes nothing', async () => {
    wireEntities(makeList());
    wireRecords(['a', 'b'], ['a', 'b']);

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.Success).toBe(true);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('applies nothing and returns SOURCE_CHANGED when the source definition changed', async () => {
    const list = makeList();
    const details = wireEntities(list);
    wireRecords(['a'], ['a', 'b']);
    mockViewFingerprint.mockResolvedValue('fp-edited');

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', 'Sync', { ConfirmDrops: true });

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('SOURCE_CHANGED');
    expect(result.SourceChange).toEqual({
      SourceKind: 'view', SourceID: 'view-1', SourceName: 'Active contacts', ChangedAt: VIEW.__mj_UpdatedAt,
      LinkedFingerprint: 'fp-linked', CurrentFingerprint: 'fp-edited',
    });
    expect(details).toHaveLength(0);
    expect(mockRunView.mock.calls.some(([p]) => (p as { ViewID?: string }).ViewID)).toBe(false);
    expect(list.Save).not.toHaveBeenCalled();
  });

  it('pauses an active refresh routine and writes one audit row', async () => {
    const list = makeList({ RefreshRoutineID: 'routine-1' });
    const routine = makeRoutine('Active');
    wireEntities(list, routine);
    mockViewFingerprint.mockResolvedValue('fp-edited');

    await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(routine.Status).toBe('Paused');
    expect(routine.Save).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ Type: 'List Source Changed', ListID: 'list-1' }));
  });

  it('leaves a routine that is already paused alone, so a repeat check writes no audit row', async () => {
    const list = makeList({ RefreshRoutineID: 'routine-1' });
    const routine = makeRoutine('Paused');
    wireEntities(list, routine);
    mockViewFingerprint.mockResolvedValue('fp-edited');

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.ResultCode).toBe('SOURCE_CHANGED');
    expect(routine.Save).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('a list with no stored fingerprint refreshes and takes the current one', async () => {
    const list = makeList({ SourceFingerprint: null });
    wireEntities(list);
    wireRecords([], ['a']);
    mockViewFingerprint.mockResolvedValue('fp-now');

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(list.SourceFingerprint).toBe('fp-now');
  });

  it('skips the check for a UseSnapshot list', async () => {
    const list = makeList({
      UseSnapshot: true,
      SourceFilterSnapshot: JSON.stringify({ v: 1, whereClause: "Status='Active'" }),
    } as Partial<MockList>);
    wireEntities(list);
    mockRunView.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });

    await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(mockViewFingerprint).not.toHaveBeenCalled();
  });
});

describe('RefreshFromSource — saved query source', () => {
  function queryList(overrides: Partial<MockList> = {}) {
    return makeList({
      SourceViewID: null,
      SourceQueryID: 'query-1',
      SourceQueryKeyField: 'ContactID',
      SourceQueryParameters: '{"EventCode":"CONF2026"}',
      ...overrides,
    });
  }

  it('runs the query with its stored parameters and adds the records its key column names', async () => {
    const list = queryList();
    const details = wireEntities(list);
    wireRecords(['a'], []);
    mockRunQuery.mockResolvedValue({ Success: true, Results: [{ ContactID: 'a' }, { ContactID: 'b' }, { ContactID: 'b' }, { ContactID: null }] });

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(mockRunQuery).toHaveBeenCalledWith({ QueryID: 'query-1', Parameters: { EventCode: 'CONF2026' } });
    expect(details.map((d) => d.RecordID)).toEqual(['b']);
  });

  it('fingerprints the query from its dialect and parameter rows read past the cache', async () => {
    const list = queryList();
    wireEntities(list);
    mockQueryFingerprint.mockResolvedValue('fp-edited');

    const result = await new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false });

    expect(result.ResultCode).toBe('SOURCE_CHANGED');
    expect(result.SourceChange?.SourceKind).toBe('query');
    const reads = mockRunViews.mock.calls[0][0] as Array<{ EntityName: string; BypassCache: boolean }>;
    expect(reads.map((r) => [r.EntityName, r.BypassCache])).toEqual([['MJ: Query SQLs', true], ['MJ: Query Parameters', true]]);
    expect(mockRunQuery).not.toHaveBeenCalled();
  });

  it('fails clearly when the query result has no key column', async () => {
    const list = queryList({ SourceQueryKeyField: 'MemberID' });
    wireEntities(list);
    wireRecords([], []);
    mockRunQuery.mockResolvedValue({ Success: true, Results: [{ ContactID: 'a' }] });

    await expect(new ListOperations(OWNER as never).RefreshFromSource('list-1', undefined, { ConfirmDrops: false }))
      .rejects.toThrow(/no column named 'MemberID'/);
  });
});

describe('ApproveListSource', () => {
  it('only the list owner can approve', async () => {
    const list = makeList();
    wireEntities(list);

    const result = await new ListOperations(OTHER as never).ApproveListSource('list-1', { ConfirmDrops: false });

    expect(result.ResultCode).toBe('PERMISSION_DENIED');
    expect(list.Save).not.toHaveBeenCalled();
  });

  it('stores the current fingerprint, resumes a paused routine, audits, and refreshes right away', async () => {
    const list = makeList({ RefreshRoutineID: 'routine-1' });
    const routine = makeRoutine('Paused');
    const details = wireEntities(list, routine);
    wireRecords([], ['a']);
    mockViewFingerprint.mockResolvedValue('fp-edited');

    const result = await new ListOperations(OWNER as never).ApproveListSource('list-1', { ConfirmDrops: false });

    expect(list.SourceFingerprint).toBe('fp-edited');
    expect(routine.Status).toBe('Active');
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ Type: 'List Source Approved' }));
    expect(result.ResultCode).toBe('SUCCESS');
    expect(details.map((d) => d.RecordID)).toEqual(['a']);
  });

  it('takes new parameter values for a query source', async () => {
    const list = makeList({ SourceViewID: null, SourceQueryID: 'query-1', SourceQueryKeyField: 'ContactID' });
    wireEntities(list);
    wireRecords([], []);
    mockRunQuery.mockResolvedValue({ Success: true, Results: [] });

    await new ListOperations(OWNER as never).ApproveListSource('list-1', { ConfirmDrops: false, Parameters: { EventCode: 'CONF2027' } });

    expect(list.SourceQueryParameters).toBe('{"EventCode":"CONF2027"}');
    expect(mockRunQuery).toHaveBeenCalledWith({ QueryID: 'query-1', Parameters: { EventCode: 'CONF2027' } });
  });
});

describe('PreviewRefreshFromSource', () => {
  it('previews a refresh without changing the list', async () => {
    const list = makeList();
    const details = wireEntities(list);
    wireRecords(['a', 'c'], ['a', 'b']);

    const preview = await new ListOperations(OWNER as never).PreviewRefreshFromSource('list-1', { Mode: 'Sync' });

    expect(preview.ResultCode).toBe('SUCCESS');
    expect(preview.Delta?.ToAdd).toEqual(['b']);
    expect(preview.Delta?.ToRemove).toEqual(['c']);
    expect(details).toHaveLength(0);
    expect(list.Save).not.toHaveBeenCalled();
  });

  it('uses the list\'s own RefreshMode when no mode is given', async () => {
    wireEntities(makeList({ RefreshMode: 'Additive' }));
    wireRecords(['a', 'c'], ['a', 'b']);

    const preview = await new ListOperations(OWNER as never).PreviewRefreshFromSource('list-1');

    expect(preview.Delta?.ToRemove).toEqual([]);
  });

  it('reports a changed source without pausing the routine or writing an audit row', async () => {
    const routine = makeRoutine('Active');
    wireEntities(makeList({ RefreshRoutineID: 'routine-1' }), routine);
    wireRecords(['a'], ['a', 'b']);
    mockViewFingerprint.mockResolvedValue('fp-edited');

    const preview = await new ListOperations(OWNER as never).PreviewRefreshFromSource('list-1');

    expect(preview.ResultCode).toBe('SOURCE_CHANGED');
    expect(preview.SourceChange?.CurrentFingerprint).toBe('fp-edited');
    expect(preview.Delta).toBeUndefined();
    expect(routine.Status).toBe('Active');
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('lets the owner preview the changed source as approving it would, with new parameter values', async () => {
    const list = makeList({ SourceViewID: null, SourceQueryID: 'query-1', SourceQueryKeyField: 'ContactID', SourceQueryParameters: '{"Region":"West"}' });
    wireEntities(list);
    wireRecords([], []);
    mockQueryFingerprint.mockResolvedValue('fp-edited');
    mockRunQuery.mockResolvedValue({ Success: true, Results: [{ ContactID: 'x' }, { ContactID: 'y' }] });

    const preview = await new ListOperations(OWNER as never).PreviewRefreshFromSource('list-1', {
      AcceptCurrentSource: true, Parameters: { Region: 'Northeast' },
    });

    expect(preview.ResultCode).toBe('SUCCESS');
    expect(preview.Delta?.ToAdd).toEqual(['x', 'y']);
    expect(mockRunQuery).toHaveBeenCalledWith(expect.objectContaining({ Parameters: { Region: 'Northeast' } }));
    expect(list.Save).not.toHaveBeenCalled();
  });

  it('only the owner can preview a changed source', async () => {
    wireEntities(makeList());
    const preview = await new ListOperations(OTHER as never).PreviewRefreshFromSource('list-1', { AcceptCurrentSource: true });
    expect(preview.ResultCode).toBe('PERMISSION_DENIED');
  });
});

describe('ApplyRefreshPreview', () => {
  it('applies a previewed refresh, stamps the list and writes a List Refreshed row', async () => {
    const list = makeList();
    const details = wireEntities(list);
    wireRecords(['a'], ['a', 'b']);
    const ops = new ListOperations(OWNER as never);
    const preview = await ops.PreviewRefreshFromSource('list-1');

    const result = await ops.ApplyRefreshPreview(preview.Delta!, { ConfirmDrops: false, DeltaToken: preview.Delta!.DeltaToken });

    expect(result.ResultCode).toBe('SUCCESS');
    expect(details.map((d) => d.RecordID)).toEqual(['b']);
    expect(list.LastRefreshedAt).toBeInstanceOf(Date);
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({
      Type: 'List Refreshed', Details: expect.objectContaining({ Mode: 'Additive', Added: 1 }),
    }));
  });

  it('applies nothing when the source changed after the preview', async () => {
    const list = makeList();
    const details = wireEntities(list);
    wireRecords(['a'], ['a', 'b']);
    const ops = new ListOperations(OWNER as never);
    const preview = await ops.PreviewRefreshFromSource('list-1');
    mockViewFingerprint.mockResolvedValue('fp-edited');

    const result = await ops.ApplyRefreshPreview(preview.Delta!, { ConfirmDrops: false, DeltaToken: preview.Delta!.DeltaToken });

    expect(result.ResultCode).toBe('SOURCE_CHANGED');
    expect(details).toHaveLength(0);
  });

  it('keeps the drop guard', async () => {
    wireEntities(makeList());
    wireRecords(['a', 'c'], ['a']);
    const ops = new ListOperations(OWNER as never);
    const preview = await ops.PreviewRefreshFromSource('list-1', { Mode: 'Sync' });

    const result = await ops.ApplyRefreshPreview(preview.Delta!, { ConfirmDrops: false, DeltaToken: preview.Delta!.DeltaToken });

    expect(result.ResultCode).toBe('DROP_NOT_CONFIRMED');
  });
});
