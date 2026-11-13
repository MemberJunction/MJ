import { describe, expect, it } from 'vitest';

import {
  ComputeListRefreshStatus,
  DefinitionFromSnapshot,
  DescribeViewDefinition,
  DiffDefinitions,
  ToHistoryEntry,
} from '../lib/services/list-refresh.service';

const linkedView = { SourceViewID: 'v', SourceQueryID: null, SourceFingerprint: 'fp', AutoRefresh: true, UseSnapshot: false };

describe('ComputeListRefreshStatus', () => {
  it('a list with no source is static', () => {
    expect(ComputeListRefreshStatus({ ...linkedView, SourceViewID: null }, null, null)).toBe('Static');
  });

  it('a paused routine wins: the owner has to approve a source change', () => {
    expect(ComputeListRefreshStatus(linkedView, { Status: 'Paused', LastRunStatus: 'Failed' }, 'fp')).toBe('Paused');
  });

  it('a source whose fingerprint moved is changed, before the routine notices', () => {
    expect(ComputeListRefreshStatus(linkedView, { Status: 'Active', LastRunStatus: 'Success' }, 'fp-2')).toBe('SourceChanged');
  });

  it('a snapshot list never reports a changed source', () => {
    expect(ComputeListRefreshStatus({ ...linkedView, UseSnapshot: true }, { Status: 'Active', LastRunStatus: null }, 'fp-2')).toBe('Scheduled');
  });

  it('an active routine is scheduled, or failed when its last run failed', () => {
    expect(ComputeListRefreshStatus(linkedView, { Status: 'Active', LastRunStatus: 'Success' }, 'fp')).toBe('Scheduled');
    expect(ComputeListRefreshStatus(linkedView, { Status: 'Active', LastRunStatus: 'Failed' }, 'fp')).toBe('Failed');
  });

  it('without an active routine it is manual', () => {
    expect(ComputeListRefreshStatus({ ...linkedView, AutoRefresh: false }, { Status: 'Disabled', LastRunStatus: 'Success' }, 'fp')).toBe('Manual');
    expect(ComputeListRefreshStatus(linkedView, null, null)).toBe('Manual');
  });
});

describe('ToHistoryEntry', () => {
  it('reads the counts, mode and source from a List Refreshed row', () => {
    const entry = ToHistoryEntry({
      ID: 'a1', AuditLogType: 'List Refreshed', User: 'Yuri', Description: 'refreshed', __mj_CreatedAt: new Date('2026-11-12T10:00:00Z'),
      Details: JSON.stringify({ Mode: 'Sync', Added: 3, Removed: 1, Failed: 0, RecordsBefore: 10, RecordsAfter: 12, SourceKind: 'query', SourceName: 'Q', SourceFingerprint: 'fp' }),
    });
    expect(entry).toMatchObject({ Type: 'Refreshed', Mode: 'Sync', Added: 3, Removed: 1, RecordsAfter: 12, SourceKind: 'query', SourceName: 'Q', SourceFingerprint: 'fp' });
  });

  it('a source change carries its current fingerprint and no counts', () => {
    const entry = ToHistoryEntry({
      ID: 'a2', AuditLogType: 'List Source Changed', User: 'System', Description: 'changed', __mj_CreatedAt: new Date(),
      Details: JSON.stringify({ SourceKind: 'view', SourceName: 'V', CurrentFingerprint: 'fp-new' }),
    });
    expect(entry).toMatchObject({ Type: 'SourceChanged', Added: null, SourceFingerprint: 'fp-new' });
  });

  it('survives details that are missing or not JSON', () => {
    const entry = ToHistoryEntry({ ID: 'a3', AuditLogType: 'List Source Approved', User: null, Description: null, Details: '{bad', __mj_CreatedAt: new Date() });
    expect(entry).toMatchObject({ Type: 'SourceApproved', UserName: '', Description: '', Mode: null });
  });
});

describe('source definitions', () => {
  it('describes a view by the filter fields its fingerprint covers', () => {
    expect(DescribeViewDefinition({ WhereClause: "Status='Active'", CustomWhereClause: false, SmartFilterWhereClause: '' }))
      .toBe("WhereClause:\nStatus='Active'\n\nCustomWhereClause:\nfalse");
  });

  it('reads the definition from a Record Change snapshot', () => {
    expect(DefinitionFromSnapshot('query', JSON.stringify({ SQL: 'SELECT 1' }))).toBe('SELECT 1');
    expect(DefinitionFromSnapshot('view', JSON.stringify({ WhereClause: 'A=1' }))).toBe('WhereClause:\nA=1');
    expect(DefinitionFromSnapshot('query', null)).toBeNull();
    expect(DefinitionFromSnapshot('query', 'not json')).toBeNull();
  });

  it('diffs two definitions line by line, numbered on both sides', () => {
    const lines = DiffDefinitions('SELECT ID\nWHERE A >= 3\nAND B', 'SELECT ID\nWHERE A >= 2\nAND B');
    expect(lines).toEqual([
      { Kind: 'same', Text: 'SELECT ID', OldNumber: 1, NewNumber: 1 },
      { Kind: 'remove', Text: 'WHERE A >= 3', OldNumber: 2, NewNumber: null },
      { Kind: 'add', Text: 'WHERE A >= 2', OldNumber: null, NewNumber: 2 },
      { Kind: 'same', Text: 'AND B', OldNumber: 3, NewNumber: 3 },
    ]);
  });
});
