/**
 * Organic-key config pass round trips (#3815).
 *
 * The pass used to resolve the related entity, probe for the existing row and write it, one round
 * trip each, for every (organic key, related entity) pair, and rewrote every row even when nothing
 * had changed. These tests drive the real `processOrganicKeyConfig` against a canned connection and
 * pin that it reads a fixed number of times, writes only what differs, and drops duplicate
 * related-entity entries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../Misc/status_logging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../Misc/status_logging')>()),
  logError: vi.fn(),
  logStatus: vi.fn(),
  logWarning: vi.fn(),
  LogWarning: vi.fn(),
}));

import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { ManageMetadataBase, OrganicKeyConfigResult } from '../Database/manage-metadata';
import { CodeGenConnection, CodeGenDatabaseProvider, CodeGenQueryResult, CodeGenQueryRow } from '../Database/codeGenDatabaseProvider';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';
import { SQLLogging } from '../Misc/sql_logging';
import { logError, logStatus, LogWarning } from '../Misc/status_logging';
import { ConfigEntityIndex, DedupeRelatedEntities, OrganicKeyNeedsUpdate, DesiredOrganicKey, OrganicKeyRowValues } from '../Database/organic-key-sync';

class TestableOrganicKeys extends ManageMetadataBase {
  constructor(private readonly testProvider: CodeGenDatabaseProvider) {
    super();
  }

  protected get dbProvider(): CodeGenDatabaseProvider {
    return this.testProvider;
  }

  public Run(pool: CodeGenConnection): Promise<OrganicKeyConfigResult> {
    return this.processOrganicKeyConfig(pool);
  }
}

interface FakeDatabase {
  entities: CodeGenQueryRow[];
  keys: CodeGenQueryRow[];
  related: CodeGenQueryRow[];
}

/** A connection that answers the three preload reads from `db` and counts every read. */
function createConnection(db: FakeDatabase): { pool: CodeGenConnection; reads: string[] } {
  const reads: string[] = [];
  const answer = async (sql: string): Promise<CodeGenQueryResult> => {
    reads.push(sql);
    if (sql.includes('EntityOrganicKeyRelatedEntity')) return { recordset: db.related };
    if (sql.includes('EntityOrganicKey')) return { recordset: db.keys };
    if (sql.includes('Entity')) return { recordset: db.entities };
    return { recordset: [] };
  };
  const pool: CodeGenConnection = {
    Dialect: new SQLServerDialect(),
    query: answer,
    queryWithParams: answer,
    executeStoredProcedure: async () => ({ recordset: [] }),
    beginTransaction: async () => {
      throw new Error('not used');
    },
  };
  return { pool, reads };
}

/** `keyCount` keys on hr.Owner, each relating to `relatedCount` tables hr.Rel0..n. */
function buildConfig(keyCount: number, relatedCount: number, displayName = 'Shown') {
  return {
    hr: [
      {
        TableName: 'Owner',
        OrganicKeys: Array.from({ length: keyCount }, (_, k) => ({
          Name: `Key ${k}`,
          MatchFieldNames: ['Email'],
          RelatedEntities: Array.from({ length: relatedCount }, (_, r) => ({
            SchemaName: 'hr',
            TableName: `Rel${r}`,
            RelatedFieldNames: ['Email'],
            DisplayName: displayName,
          })),
        })),
      },
    ],
  };
}

function entitiesFor(relatedCount: number): CodeGenQueryRow[] {
  return [
    { ID: 'owner-id', Name: 'Owners', SchemaName: 'hr', BaseTable: 'Owner' },
    ...Array.from({ length: relatedCount }, (_, r) => ({ ID: `rel-${r}-id`, Name: `Rel ${r}`, SchemaName: 'hr', BaseTable: `Rel${r}` })),
  ];
}

/** The rows a previous run over `buildConfig(keyCount, relatedCount, displayName)` left behind. */
function storedRowsFor(keyCount: number, relatedCount: number, displayName = 'Shown'): Pick<FakeDatabase, 'keys' | 'related'> {
  const keys: CodeGenQueryRow[] = [];
  const related: CodeGenQueryRow[] = [];
  for (let k = 0; k < keyCount; k++) {
    keys.push({
      ID: `key-${k}`, EntityID: 'OWNER-ID', Name: `Key ${k}`, MatchFieldNames: 'Email', NormalizationStrategy: 'LowerCaseTrim',
      CustomNormalizationExpression: null, Description: null, Sequence: k, Status: 'Active', Source: 'Config',
    });
    for (let r = 0; r < relatedCount; r++) {
      related.push({
        KeyEntityID: 'owner-id', KeyName: `Key ${k}`, ID: `related-${k}-${r}`, RelatedEntityID: `rel-${r}-id`,
        RelatedEntityFieldNames: 'Email', TransitiveObjectName: null, TransitiveObjectMatchFieldNames: null,
        TransitiveObjectOutputFieldName: null, RelatedEntityJoinFieldName: null, DisplayName: displayName,
        DisplayLocation: 'After Field Tabs', Sequence: r,
      });
    }
  }
  return { keys, related };
}

describe('processOrganicKeyConfig — round trips (#3815)', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    vi.spyOn(SQLLogging, 'LogSQLAndExecute').mockImplementation(async (_ds, query: string) => {
      writes.push(query);
      return [];
    });
    vi.mocked(logError).mockClear();
    vi.mocked(logStatus).mockClear();
    vi.mocked(LogWarning).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function run(config: object, db: FakeDatabase) {
    vi.spyOn(ManageMetadataBase, 'GetSoftPKFKConfig').mockReturnValue(config);
    const { pool, reads } = createConnection(db);
    const result = await new TestableOrganicKeys(new SQLServerCodeGenProvider()).Run(pool);
    return { result, reads };
  }

  it('reads three times for N keys × M related entities, not three times per pair', async () => {
    const { result, reads } = await run(buildConfig(5, 4), { entities: entitiesFor(4), keys: [], related: [] });

    expect(reads).toHaveLength(3);
    expect(result).toMatchObject({ success: true, createdCount: 5, updatedCount: 0, unchangedCount: 0, failedCount: 0 });
    expect(writes.filter((w) => /INSERT INTO \S*EntityOrganicKey\]?\s/.test(w))).toHaveLength(5);
    expect(writes.filter((w) => w.includes('INSERT INTO') && w.includes('EntityOrganicKeyRelatedEntity'))).toHaveLength(20);
    expect(writes.some((w) => w.startsWith('UPDATE'))).toBe(false);
  });

  it('writes nothing when every stored row already matches the file', async () => {
    const { result, reads } = await run(buildConfig(5, 4), { entities: entitiesFor(4), ...storedRowsFor(5, 4) });

    expect(reads).toHaveLength(3);
    expect(writes).toEqual([]);
    expect(result).toMatchObject({ success: true, createdCount: 0, updatedCount: 0, unchangedCount: 5 });
  });

  it('issues one UPDATE when one related row changed its DisplayName', async () => {
    const stored = storedRowsFor(2, 2);
    stored.related[3] = { ...stored.related[3], DisplayName: 'Old label' };

    const { result } = await run(buildConfig(2, 2), { entities: entitiesFor(2), ...stored });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^UPDATE \S*EntityOrganicKeyRelatedEntity/);
    expect(writes[0]).toContain("DisplayName = 'Shown'");
    expect(writes[0]).toContain("WHERE ID = 'related-1-1'");
    expect(result).toMatchObject({ updatedCount: 1, unchangedCount: 1 });
  });

  it('updates a key whose stored columns differ, leaving its unchanged related rows alone', async () => {
    const stored = storedRowsFor(1, 2);
    stored.keys[0] = { ...stored.keys[0], MatchFieldNames: 'OldField' };

    const { result } = await run(buildConfig(1, 2), { entities: entitiesFor(2), ...stored });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^UPDATE \S*EntityOrganicKey\]? SET/);
    expect(writes[0]).toContain("WHERE ID = 'key-0'");
    expect(result).toMatchObject({ updatedCount: 1, unchangedCount: 0 });
  });

  it('writes a duplicate related entity once, from its last entry, with one warning', async () => {
    const config = buildConfig(1, 1);
    const related = config.hr[0].OrganicKeys[0].RelatedEntities;
    related.push({ ...related[0], DisplayName: 'Last wins' });

    const { result } = await run(config, { entities: entitiesFor(1), keys: [], related: [] });

    const relatedInserts = writes.filter((w) => w.includes('INSERT INTO') && w.includes('EntityOrganicKeyRelatedEntity'));
    expect(relatedInserts).toHaveLength(1);
    expect(relatedInserts[0]).toContain("'Last wins'");
    expect(LogWarning).toHaveBeenCalledTimes(1);
    expect(LogWarning).toHaveBeenCalledWith(expect.stringContaining('"hr.Rel0" is listed more than once'));
    expect(result.success).toBe(true);
  });

  it('does not insert a key twice when the file declares the same key twice', async () => {
    const config = buildConfig(1, 1);
    config.hr[0].OrganicKeys.push({ ...config.hr[0].OrganicKeys[0] });
    config.hr[0].OrganicKeys[1].Sequence = 0;
    config.hr[0].OrganicKeys[0].Sequence = 0;

    const { result } = await run(config, { entities: entitiesFor(1), keys: [], related: [] });

    expect(writes.filter((w) => w.includes('INSERT INTO'))).toHaveLength(2);
    expect(result).toMatchObject({ createdCount: 1, unchangedCount: 1 });
  });

  it('logs one progress line every 250 pairs', async () => {
    await run(buildConfig(30, 10), { entities: entitiesFor(10), ...storedRowsFor(30, 10) });

    const progress = vi.mocked(logStatus).mock.calls.map(([message]) => message).filter((m) => m.includes('organic key relationships'));
    expect(progress).toEqual(['    > Organic keys: processed 250/300 organic key relationships']);
  });
});

describe('organic-key-sync helpers', () => {
  it('ConfigEntityIndex resolves by schema + table first, then by entity name, case-insensitively', () => {
    const index = new ConfigEntityIndex([
      { ID: 'by-name', Name: 'Contact', SchemaName: 'crm', BaseTable: 'People' },
      { ID: 'by-table', Name: 'Contacts', SchemaName: 'crm', BaseTable: 'Contact' },
    ]);

    expect(index.Resolve('CRM', 'contact')?.ID).toBe('by-table');
    expect(index.Resolve('other', 'Contact')?.ID).toBe('by-name');
    expect(index.Resolve('crm', 'Missing')).toBeNull();
  });

  it('DedupeRelatedEntities keeps the last entry per schema + table, in its position', () => {
    const { Kept, Dropped } = DedupeRelatedEntities([
      { SchemaName: 'hr', TableName: 'A', n: 1 },
      { SchemaName: 'hr', TableName: 'B', n: 2 },
      { SchemaName: 'HR', TableName: 'a', n: 3 },
    ]);

    expect(Kept.map((e) => e.n)).toEqual([2, 3]);
    expect(Dropped.map((e) => e.n)).toEqual([1]);
  });

  it('OrganicKeyNeedsUpdate ignores Description and the custom expression when the file leaves them out', () => {
    const stored: OrganicKeyRowValues = {
      ID: 'k', MatchFieldNames: 'Email', NormalizationStrategy: 'Trim', CustomNormalizationExpression: 'LOWER({{Email}})',
      Description: 'kept', Sequence: 0, Status: 'Active', Source: 'Config',
    };
    const desired: DesiredOrganicKey = {
      MatchFieldNames: 'Email', NormalizationStrategy: 'Trim', CustomNormalizationExpression: undefined,
      Description: undefined, Sequence: 0, Status: 'Active', Source: 'Config',
    };

    expect(OrganicKeyNeedsUpdate(stored, desired)).toBe(false);
    expect(OrganicKeyNeedsUpdate(stored, { ...desired, Description: 'changed' })).toBe(true);
    expect(OrganicKeyNeedsUpdate({ ...stored, Source: 'Manual' }, desired)).toBe(true);
  });
});
