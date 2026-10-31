/**
 * Push finds delete markers nested under `relatedEntities` and in `@include`d files before it
 * decides to skip the deletion audit, and the delete phase then removes a child before its parent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockMetadata {
    public static get Provider(): null {
      return null;
    }
    public EntityByName(): null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import type { RecordData } from '../lib/sync-engine';
import { DeletionAuditor, type DeletionAudit } from '../lib/deletion-auditor';
import { RecordDependencyAnalyzer, type FlattenedRecord } from '../lib/record-dependency-analyzer';
import { FileMayHaveDeletions, RecordsHaveDeletions, TextHasInclude } from '../lib/deletion-prescan';
import type { FileBackupManager } from '../lib/file-backup-manager';

const PARENT_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const CHILD_ID = 'A1B2C3D4-0000-4000-8000-000000000002';

/** A parent agent that is kept, with one child prompt row marked for deletion. */
function nestedOnlyRecord(): RecordData {
  return {
    fields: { Name: 'Kept Agent' },
    primaryKey: { ID: PARENT_ID },
    relatedEntities: {
      'MJ: AI Agent Prompts': [{ fields: {}, primaryKey: { ID: CHILD_ID }, deleteRecord: { delete: true } }],
    },
  };
}

/** A parent marked for deletion with a child also marked for deletion. */
function parentAndChildDeleted(): RecordData {
  return {
    fields: { Name: 'Retired Agent' },
    primaryKey: { ID: PARENT_ID },
    deleteRecord: { delete: true },
    relatedEntities: {
      'MJ: AI Agent Prompts': [{ fields: {}, primaryKey: { ID: CHILD_ID }, deleteRecord: { delete: true } }],
    },
  };
}

/** The audit a database where every marked row still exists would return. */
function auditOf(records: FlattenedRecord[]): DeletionAudit {
  const deletes = records.filter((r) => r.record.deleteRecord?.delete === true);
  return {
    explicitDeletes: new Map(deletes.map((r) => [r.id, r] as const)),
    implicitDeletes: new Map(),
    alreadyDeleted: new Map(),
    databaseOnlyReferences: [],
    databaseOnlyDeletions: [],
    reverseDependencies: new Map(),
    deletionLevels: new RecordDependencyAnalyzer().ReverseTopologicalSort(deletes),
    circularDependencies: [],
    orphanedReferences: [],
  };
}

describe('deletion pre-scan helpers', () => {
  it('finds a delete marker nested under relatedEntities', () => {
    expect(RecordsHaveDeletions([nestedOnlyRecord()])).toBe(true);
    expect(FileMayHaveDeletions(JSON.stringify([nestedOnlyRecord()]))).toBe(true);
  });

  it('reports no deletions for a file without markers', () => {
    expect(FileMayHaveDeletions(JSON.stringify({ fields: { Name: 'x' } }))).toBe(false);
  });

  it('treats every @include form as possibly holding deletes', () => {
    expect(TextHasInclude('{"@include": "a.json"}')).toBe(true);
    expect(TextHasInclude('{"@include.models": {"file": "a.json"}}')).toBe(true);
    expect(TextHasInclude('["@include:a.json"]')).toBe(true);
    expect(FileMayHaveDeletions('["@include:a.json"]')).toBe(true);
  });
});

describe('push deletion audit with nested markers', () => {
  let dir: string;
  let service: PushService;
  let logs: string[];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-nested-delete-'));
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: 'MJ: AI Agents' });
    service = new PushService(new SyncEngine({} as UserInfo), {} as UserInfo);
    logs = [];
    vi.spyOn(DeletionAuditor.prototype, 'auditDeletions').mockImplementation(async (records: FlattenedRecord[]) => auditOf(records));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(dir);
  });

  const audit = () => service['auditAllDeletions']([dir], { verbose: true }, { onLog: (m: string) => logs.push(m), onWarn: () => undefined });

  it('runs the audit when the only delete marker is nested', async () => {
    await fs.writeJson(path.join(dir, '.agents.json'), [nestedOnlyRecord()]);

    const result = await audit();

    expect(result).not.toBeNull();
    expect(logs.some((m) => m.includes('No deletion operations found'))).toBe(false);
    const marked = [...(result?.explicitDeletes.values() ?? [])];
    expect(marked.map((r) => r.entityName)).toEqual(['MJ: AI Agent Prompts']);
  });

  it('still skips the audit when no file has a marker', async () => {
    await fs.writeJson(path.join(dir, '.agents.json'), [{ fields: { Name: 'Kept Agent' } }]);

    expect(await audit()).toBeNull();
    expect(logs.some((m) => m.includes('No deletion operations found'))).toBe(true);
  });

  it('falls through to the full audit for a file that uses @include, and expands it', async () => {
    await fs.ensureDir(path.join(dir, 'parts'));
    await fs.writeJson(path.join(dir, 'parts', 'agents.json'), [nestedOnlyRecord()]);
    await fs.writeJson(path.join(dir, '.agents.json'), ['@include:parts/agents.json']);

    const result = await audit();

    expect(result).not.toBeNull();
    expect(result?.explicitDeletes.size).toBe(1);
  });

  it('runs the delete phase and deletes the child before its parent', async () => {
    await fs.writeJson(path.join(dir, '.agents.json'), [parentAndChildDeleted()]);
    const deletionAudit = await audit();
    expect(deletionAudit).not.toBeNull();

    vi.spyOn(service as unknown as { processAllEntityDirectories: () => Promise<object> }, 'processAllEntityDirectories').mockResolvedValue({
      created: 0, updated: 0, unchanged: 0, deleted: 0, skipped: 0, deferred: 0, errors: 0,
    });
    const order: string[] = [];
    vi.spyOn(service as unknown as { processDeleteRecord: (r: FlattenedRecord) => Promise<object> }, 'processDeleteRecord').mockImplementation(async (record: FlattenedRecord) => {
      order.push(record.entityName);
      return { status: 'deleted' };
    });

    const totals = await service['runPushPhases']({
      entityDirs: [dir],
      deletionAudit,
      options: {},
      fileBackupManager: {} as FileBackupManager,
      callbacks: { onLog: () => undefined },
      syncRootDir: dir,
      belowSyncRoot: false,
    });

    expect(totals.deleted).toBe(2);
    expect(order).toEqual(['MJ: AI Agent Prompts', 'MJ: AI Agents']);
  });
});
