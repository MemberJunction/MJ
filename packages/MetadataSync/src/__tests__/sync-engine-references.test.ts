import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Unit tests for the REAL reference-resolution core in SyncEngine:
// processFieldValue + resolveLookup. Only the provider boundary is mocked —
// Metadata (entity metadata + entity-object creation) and RunView (DB queries).
// Everything else (parsing, filter building, recursion, error paths) is the
// real production code, so drift there fails these tests.
//
// The mock keeps every other @memberjunction/core export real (importOriginal
// spread) so transitive imports (SyncMetadataEngine extends BaseEngine, etc.)
// keep working. Handler closures below are read at call time, matching the
// pattern in RelatedEntityHandler.test.ts.
// -----------------------------------------------------------------------------

interface CapturedRunViewParams {
  EntityName: string;
  ExtraFilter?: string;
  MaxRows?: number;
  ResultType?: string;
  Fields?: string[];
  BypassCache?: boolean;
}

interface MockRunViewResult {
  Success: boolean;
  Results: Array<Record<string, unknown>>;
  ErrorMessage?: string;
}

interface FakeFieldInfo {
  Name: string;
  Type: string;
  NeedsQuotes: boolean;
}

interface FakeEntityInfo {
  Name: string;
  Fields: FakeFieldInfo[];
  PrimaryKeys: FakeFieldInfo[];
  /** Mirrors EntityInfo.FirstPrimaryKey — the accessor production code reads for single-column keys. */
  FirstPrimaryKey?: FakeFieldInfo;
}

const runViewInvocations: CapturedRunViewParams[] = [];
const runViewContextUsers: unknown[] = [];
let runViewHandler: (params: CapturedRunViewParams, callIndex: number) => MockRunViewResult = () => ({
  Success: true,
  Results: [],
});

const entityRegistry = new Map<string, FakeEntityInfo>();

/**
 * Minimal stand-in for the BaseEntity returned by Metadata.GetEntityObject on
 * the ?create path. Fields must exist as own properties because production
 * guards assignments with `fieldName in newEntity`.
 */
class FakeCreatedEntity {
  public ID: string;
  public Name: string | null = null;
  public Description: string | null = null;
  public Status: string | null = null;
  public NewRecordCallCount = 0;
  public SaveCallCount = 0;
  public LatestResult: { Message?: string } | null = null;
  private readonly saveSucceeds: boolean;

  constructor(id: string, saveSucceeds: boolean = true, failureMessage?: string) {
    this.ID = id;
    this.saveSucceeds = saveSucceeds;
    if (!saveSucceeds && failureMessage) {
      this.LatestResult = { Message: failureMessage };
    }
  }

  public NewRecord(): void {
    this.NewRecordCallCount++;
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    return this.saveSucceeds;
  }

  public Get(fieldName: string): unknown {
    return Reflect.get(this, fieldName);
  }
}

const getEntityObjectCalls: string[] = [];
let entityObjectFactory: (entityName: string) => FakeCreatedEntity | null = () => null;

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockMetadata {
    public EntityByName(name: string): FakeEntityInfo | null {
      return entityRegistry.get(name) ?? null;
    }

    public async GetEntityObject(name: string): Promise<FakeCreatedEntity | null> {
      getEntityObjectCalls.push(name);
      return entityObjectFactory(name);
    }

    public static get Provider(): null {
      return null;
    }
  }

  class MockRunView {
    public async RunView(params: CapturedRunViewParams, contextUser?: unknown): Promise<MockRunViewResult> {
      const idx = runViewInvocations.length;
      runViewInvocations.push(params);
      runViewContextUsers.push(contextUser);
      return runViewHandler(params, idx);
    }
  }

  return { ...actual, Metadata: MockMetadata, RunView: MockRunView };
});

import { SyncEngine, DeferrableLookupError } from '../lib/sync-engine';
import type { SyncResolutionCollector } from '../lib/sync-engine';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { BatchContextStub } from '../lib/batch-context-index';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fieldDef(name: string, type: string, needsQuotes: boolean): FakeFieldInfo {
  return { Name: name, Type: type, NeedsQuotes: needsQuotes };
}

function registerEntity(name: string, fields: FakeFieldInfo[]): void {
  const pk = fields.find((f) => f.Name === 'ID');
  entityRegistry.set(name, { Name: name, Fields: fields, PrimaryKeys: pk ? [pk] : [], FirstPrimaryKey: pk });
}

/** Builds a BatchContextStub — the exported production stand-in for BaseEntity. */
function makeStub(entityName: string, fields: Record<string, unknown>): BatchContextStub {
  return {
    EntityInfo: {
      Name: entityName,
      PrimaryKeys: [{ Name: 'ID' }],
      FirstPrimaryKey: { Name: 'ID' },
      Fields: Object.keys(fields).map((name) => ({ Name: name })),
    },
    Get: (field: string) => fields[field],
    GetAll: () => ({ ...fields }),
  };
}

const testUser = { ID: 'test-user-id' } as UserInfo;

describe('SyncEngine reference resolution (processFieldValue / resolveLookup)', () => {
  let engine: SyncEngine;
  let tmpDir: string;

  beforeEach(async () => {
    runViewInvocations.length = 0;
    runViewContextUsers.length = 0;
    runViewHandler = () => ({ Success: true, Results: [] });
    getEntityObjectCalls.length = 0;
    entityObjectFactory = () => null;
    entityRegistry.clear();

    // Deterministic dialect for the LOWER() filter assertions
    vi.stubEnv('DB_PLATFORM', 'sqlserver');

    registerEntity('MJ: AI Prompt Categories', [
      fieldDef('ID', 'uniqueidentifier', true),
      fieldDef('Name', 'nvarchar', true),
      fieldDef('Description', 'nvarchar', true),
      fieldDef('Status', 'nvarchar', true),
      fieldDef('ParentID', 'uniqueidentifier', true),
      fieldDef('Sequence', 'int', false),
      fieldDef('CreatedAt', 'datetime', true),
    ]);
    registerEntity('MJ: AI Agents', [fieldDef('ID', 'uniqueidentifier', true), fieldDef('Name', 'nvarchar', true)]);
    registerEntity('MJ: Users', [
      fieldDef('ID', 'uniqueidentifier', true),
      fieldDef('Email', 'nvarchar', true),
      fieldDef('Department', 'nvarchar', true),
    ]);
    registerEntity('MJ: AI Models', [fieldDef('ID', 'uniqueidentifier', true), fieldDef('Name', 'nvarchar', true)]);
    registerEntity('MJ: AI Model Vendors', [
      fieldDef('ID', 'uniqueidentifier', true),
      fieldDef('ModelID', 'uniqueidentifier', true),
    ]);

    engine = new SyncEngine(testUser);
    tmpDir = await fsExtra.mkdtemp(path.join(os.tmpdir(), 'mj-refs-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fsExtra.remove(tmpDir);
  });

  // ---------------------------------------------------------------------------
  // @lookup — single field
  // ---------------------------------------------------------------------------

  describe('@lookup — single-field resolution', () => {
    it('resolves via a case-insensitive point query and returns the primary key', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'cat-123' }] });
      const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: AI Prompt Categories.Name=Examples',
        tmpDir,
        null,
        null,
        0,
        undefined,
        collector,
        'CategoryID',
      );

      expect(result).toBe('cat-123');
      expect(runViewInvocations).toHaveLength(1);
      expect(runViewInvocations[0]).toEqual({
        EntityName: 'MJ: AI Prompt Categories',
        ExtraFilter: "LOWER(Name) = LOWER('Examples')",
        MaxRows: 1,
        ResultType: 'simple',
        Fields: ['ID'],
        BypassCache: true,
      });
      // The engine's contextUser must flow into the query
      expect(runViewContextUsers[0]).toBe(testUser);
      // Resolution is tracked for sync notes
      expect(collector.notes).toEqual([
        {
          type: 'lookup',
          field: 'fields.CategoryID',
          expression: '@lookup:MJ: AI Prompt Categories.Name=Examples',
          resolved: 'cat-123',
        },
      ]);
    });

    it('escapes embedded single quotes in the filter value', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'cat-obrien' }] });

      const result: unknown = await engine.processFieldValue(
        "@lookup:MJ: AI Prompt Categories.Name=O'Brien",
        tmpDir,
      );

      expect(result).toBe('cat-obrien');
      expect(runViewInvocations[0].ExtraFilter).toBe("LOWER(Name) = LOWER('O''Brien')");
    });

    it('throws the not-found error when no record matches', async () => {
      await expect(
        engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Name=Missing', tmpDir),
      ).rejects.toThrow("Lookup failed: No record found in 'MJ: AI Prompt Categories' where Name='Missing'");
    });

    it('treats a failed RunView the same as not-found', async () => {
      runViewHandler = () => ({ Success: false, Results: [], ErrorMessage: 'boom' });

      await expect(
        engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Name=Anything', tmpDir),
      ).rejects.toThrow("Lookup failed: No record found in 'MJ: AI Prompt Categories' where Name='Anything'");
    });
  });

  // ---------------------------------------------------------------------------
  // @lookup — multi-field criteria
  // ---------------------------------------------------------------------------

  describe('@lookup — multi-field (&-joined) criteria', () => {
    it('ANDs all criteria into one filter and resolves the record', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'user-42' }] });

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: Users.Email=john@example.com&Department=Sales',
        tmpDir,
      );

      expect(result).toBe('user-42');
      expect(runViewInvocations).toHaveLength(1);
      expect(runViewInvocations[0].EntityName).toBe('MJ: Users');
      expect(runViewInvocations[0].ExtraFilter).toBe(
        "LOWER(Email) = LOWER('john@example.com') AND LOWER(Department) = LOWER('Sales')",
      );
    });

    it('renders IS NULL for a null-valued criterion', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'root-cat' }] });

      await engine.processFieldValue(
        '@lookup:MJ: AI Prompt Categories.Name=Examples&ParentID=null',
        tmpDir,
      );

      expect(runViewInvocations[0].ExtraFilter).toBe(
        "LOWER(Name) = LOWER('Examples') AND ParentID IS NULL",
      );
    });

    it('skips the LOWER() wrapper for uuid- and date-typed fields', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'cat-9' }] });

      await engine.processFieldValue(
        '@lookup:MJ: AI Prompt Categories.ParentID=ABC-DEF&CreatedAt=2024-01-01',
        tmpDir,
      );

      expect(runViewInvocations[0].ExtraFilter).toBe(
        "ParentID = 'ABC-DEF' AND CreatedAt = '2024-01-01'",
      );
    });

    it('renders unquoted comparisons for numeric fields', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'cat-5' }] });

      await engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Sequence=5', tmpDir);

      expect(runViewInvocations[0].ExtraFilter).toBe('Sequence = 5');
    });

    it('lists every criterion in the not-found error message', async () => {
      await expect(
        engine.processFieldValue('@lookup:MJ: Users.Email=x@y.z&Department=Ops', tmpDir),
      ).rejects.toThrow(
        "Lookup failed: No record found in 'MJ: Users' where Email='x@y.z' AND Department='Ops'",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // @lookup — ?create auto-creation
  // ---------------------------------------------------------------------------

  describe('@lookup — ?create auto-creation', () => {
    it('creates the record when missing, applying lookup fields and URI-decoded extra payload', async () => {
      const created = new FakeCreatedEntity('created-id-1');
      entityObjectFactory = () => created;

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: AI Prompt Categories.Name=Fresh Category?create&Description=Auto%20created%20category&Status=Active',
        tmpDir,
      );

      expect(result).toBe('created-id-1');
      // A probe query ran first and missed
      expect(runViewInvocations).toHaveLength(1);
      expect(runViewInvocations[0].ExtraFilter).toBe("LOWER(Name) = LOWER('Fresh Category')");
      // Creation went through the metadata system
      expect(getEntityObjectCalls).toEqual(['MJ: AI Prompt Categories']);
      expect(created.NewRecordCallCount).toBe(1);
      expect(created.SaveCallCount).toBe(1);
      // Lookup field + extra creation fields all landed on the new entity
      expect(created.Name).toBe('Fresh Category');
      expect(created.Description).toBe('Auto created category');
      expect(created.Status).toBe('Active');
    });

    it('does not create when the record already exists', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'existing-id' }] });
      entityObjectFactory = () => new FakeCreatedEntity('should-not-be-used');

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: AI Prompt Categories.Name=Existing?create',
        tmpDir,
      );

      expect(result).toBe('existing-id');
      expect(getEntityObjectCalls).toHaveLength(0);
    });

    it('surfaces the save failure message when auto-creation fails', async () => {
      entityObjectFactory = () => new FakeCreatedEntity('never-saved', false, 'Simulated save failure');

      await expect(
        engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Name=Broken?create', tmpDir),
      ).rejects.toThrow('Failed to auto-create MJ: AI Prompt Categories: Simulated save failure');
    });
  });

  // ---------------------------------------------------------------------------
  // @lookup — ?allowDefer
  // ---------------------------------------------------------------------------

  describe('@lookup — ?allowDefer', () => {
    it('throws DeferrableLookupError carrying the structured lookup for retry queues', async () => {
      expect.assertions(4);
      try {
        await engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Name=Ghost?allowDefer', tmpDir);
      } catch (error) {
        expect(error).toBeInstanceOf(DeferrableLookupError);
        const deferrable = error as DeferrableLookupError;
        expect(deferrable.entityName).toBe('MJ: AI Prompt Categories');
        expect(deferrable.lookupFields).toEqual([{ fieldName: 'Name', fieldValue: 'Ghost' }]);
        expect(deferrable.originalValue).toBe('@lookup:MJ: AI Prompt Categories.Name=Ghost?allowDefer');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // @lookup — batch context
  // ---------------------------------------------------------------------------

  describe('@lookup — batch context resolution', () => {
    it('resolves case-insensitively from the in-memory batch Map without querying the DB', async () => {
      const batch = new Map<string, BaseEntity | BatchContextStub>();
      batch.set('MJ: AI Agents:agent-1', makeStub('MJ: AI Agents', { ID: 'agent-1', Name: 'Sage' }));

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: AI Agents.Name=sage',
        tmpDir,
        null,
        null,
        0,
        batch,
      );

      expect(result).toBe('agent-1');
      expect(runViewInvocations).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // @parent / @root
  // ---------------------------------------------------------------------------

  describe('@parent and @root references', () => {
    it('resolves @parent:Field from the parent record and tracks the resolution', async () => {
      const parent = makeStub('MJ: AI Agents', { ID: 'agent-77', Name: 'Sage' });
      const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };

      const result: unknown = await engine.processFieldValue(
        '@parent:ID',
        tmpDir,
        parent,
        null,
        0,
        undefined,
        collector,
        'AgentID',
      );

      expect(result).toBe('agent-77');
      expect(collector.notes).toEqual([
        { type: 'parent', field: 'fields.AgentID', expression: '@parent:ID', resolved: 'agent-77' },
      ]);
    });

    it('throws when @parent is used without a parent record', async () => {
      await expect(engine.processFieldValue('@parent:ID', tmpDir)).rejects.toThrow(
        '@parent reference used but no parent record available: @parent:ID',
      );
    });

    it('resolves @root:Field from the root record', async () => {
      const root = makeStub('MJ: AI Agents', { ID: 'root-1', Name: 'Root Agent' });

      const result: unknown = await engine.processFieldValue('@root:Name', tmpDir, null, root);

      expect(result).toBe('Root Agent');
    });

    it('throws when @root is used without a root record', async () => {
      await expect(engine.processFieldValue('@root:ID', tmpDir)).rejects.toThrow(
        '@root reference used but no root record available: @root:ID',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // @file
  // ---------------------------------------------------------------------------

  describe('@file references', () => {
    it('returns the content of a text file', async () => {
      await fsExtra.writeFile(path.join(tmpDir, 'note.md'), 'Hello from the file', 'utf-8');

      const result: unknown = await engine.processFieldValue('@file:note.md', tmpDir);

      expect(result).toBe('Hello from the file');
    });

    it('returns a parsed object (not a string) for a JSON file', async () => {
      await fsExtra.writeJson(path.join(tmpDir, 'config.json'), { Setting: 'value', Count: 3 });

      const result: unknown = await engine.processFieldValue('@file:config.json', tmpDir);

      expect(result).toEqual({ Setting: 'value', Count: 3 });
    });

    it('resolves @lookup references nested inside a JSON file', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'agent-sage' }] });
      await fsExtra.writeJson(path.join(tmpDir, 'job.json'), {
        AgentID: '@lookup:MJ: AI Agents.Name=Sage',
        Note: 'plain',
      });

      const result: unknown = await engine.processFieldValue('@file:job.json', tmpDir);

      expect(result).toEqual({ AgentID: 'agent-sage', Note: 'plain' });
      expect(runViewInvocations).toHaveLength(1);
      expect(runViewInvocations[0].EntityName).toBe('MJ: AI Agents');
      expect(runViewInvocations[0].ExtraFilter).toBe("LOWER(Name) = LOWER('Sage')");
    });

    it('throws when the referenced file does not exist', async () => {
      await expect(engine.processFieldValue('@file:missing.md', tmpDir)).rejects.toThrow(
        `File not found: ${path.resolve(tmpDir, 'missing.md')}`,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Recursion / nesting
  // ---------------------------------------------------------------------------

  describe('recursion and nesting', () => {
    it('resolves references embedded in a larger inline object and returns pretty JSON', async () => {
      runViewHandler = (params) =>
        params.ExtraFilter === "LOWER(Name) = LOWER('Sage')"
          ? { Success: true, Results: [{ ID: 'agent-sage' }] }
          : { Success: true, Results: [{ ID: 'agent-mm' }] };
      const parent = makeStub('MJ: Scheduled Jobs', { ID: 'job-1' });

      const raw: unknown = await engine.processFieldValue(
        {
          AgentID: '@lookup:MJ: AI Agents.Name=Sage',
          OwnerJobID: '@parent:ID',
          Settings: {
            MaxItems: 100,
            TargetAgent: '@lookup:MJ: AI Agents.Name=Memory Manager',
          },
        },
        tmpDir,
        parent,
      );

      expect(typeof raw).toBe('string');
      expect(JSON.parse(raw as string)).toEqual({
        AgentID: 'agent-sage',
        OwnerJobID: 'job-1',
        Settings: { MaxItems: 100, TargetAgent: 'agent-mm' },
      });
      expect(runViewInvocations).toHaveLength(2);
    });

    it('resolves references inside arrays and preserves non-reference elements', async () => {
      runViewHandler = () => ({ Success: true, Results: [{ ID: 'agent-sage' }] });

      const raw: unknown = await engine.processFieldValue(
        ['@lookup:MJ: AI Agents.Name=Sage', 'plain', 5],
        tmpDir,
      );

      expect(JSON.parse(raw as string)).toEqual(['agent-sage', 'plain', 5]);
    });

    it('resolves a nested @lookup used as a criterion of an outer @lookup and tracks it', async () => {
      runViewHandler = (params) =>
        params.EntityName === 'MJ: AI Models'
          ? { Success: true, Results: [{ ID: 'model-1' }] }
          : { Success: true, Results: [{ ID: 'mv-1' }] };
      const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };

      const result: unknown = await engine.processFieldValue(
        '@lookup:MJ: AI Model Vendors.ModelID=@lookup:MJ: AI Models.Name=GPT 5',
        tmpDir,
        null,
        null,
        0,
        undefined,
        collector,
        'ModelVendorID',
      );

      expect(result).toBe('mv-1');
      // Inner lookup runs first, its resolved ID feeds the outer filter
      expect(runViewInvocations.map((p) => p.EntityName)).toEqual(['MJ: AI Models', 'MJ: AI Model Vendors']);
      expect(runViewInvocations[0].ExtraFilter).toBe("LOWER(Name) = LOWER('GPT 5')");
      expect(runViewInvocations[1].ExtraFilter).toBe("ModelID = 'model-1'");
      expect(collector.notes).toEqual([
        {
          type: 'lookup',
          field: 'fields.ModelVendorID',
          expression: '@lookup:MJ: AI Model Vendors.ModelID=@lookup:MJ: AI Models.Name=GPT 5',
          resolved: 'mv-1',
          nested: [{ expression: '@lookup:MJ: AI Models.Name=GPT 5', resolved: 'model-1' }],
        },
      ]);
    });

    it('enforces the maximum recursion depth', async () => {
      await expect(engine.processFieldValue('anything', tmpDir, null, null, 51)).rejects.toThrow(
        'Maximum recursion depth (50) exceeded',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // @env
  // ---------------------------------------------------------------------------

  describe('@env references', () => {
    it('resolves an environment variable', async () => {
      vi.stubEnv('MJ_REFS_TEST_VALUE', 'from-env');

      const result: unknown = await engine.processFieldValue('@env:MJ_REFS_TEST_VALUE', tmpDir);

      expect(result).toBe('from-env');
    });

    it('throws when the environment variable is not set', async () => {
      await expect(engine.processFieldValue('@env:MJ_REFS_TEST_MISSING', tmpDir)).rejects.toThrow(
        'Environment variable not found: MJ_REFS_TEST_MISSING',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Passthrough behavior
  // ---------------------------------------------------------------------------

  describe('non-reference passthrough', () => {
    it('leaves @-strings that are not MetadataSync keywords untouched (npm scopes)', async () => {
      const result: unknown = await engine.processFieldValue('@mui/material', tmpDir);
      expect(result).toBe('@mui/material');
    });

    it('leaves plain scalars untouched', async () => {
      expect(await engine.processFieldValue('plain string', tmpDir)).toBe('plain string');
      expect(await engine.processFieldValue(42, tmpDir)).toBe(42);
      expect(await engine.processFieldValue(true, tmpDir)).toBe(true);
      expect(await engine.processFieldValue(null, tmpDir)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Malformed references
  // ---------------------------------------------------------------------------

  describe('malformed reference errors', () => {
    it('rejects a lookup without an Entity.Field separator', async () => {
      await expect(engine.processFieldValue('@lookup:NoDotHere', tmpDir)).rejects.toThrow(
        'Invalid lookup format: @lookup:NoDotHere',
      );
    });

    it('rejects a lookup criterion without an equals sign', async () => {
      await expect(engine.processFieldValue('@lookup:Entity.MissingEquals', tmpDir)).rejects.toThrow(
        'Invalid lookup field format: MissingEquals in @lookup:Entity.MissingEquals',
      );
    });

    it('rejects a lookup against an unknown entity', async () => {
      await expect(engine.processFieldValue('@lookup:Ghost Entity.Name=X', tmpDir)).rejects.toThrow(
        'Entity not found: Ghost Entity',
      );
    });

    it('rejects a lookup against an unknown field', async () => {
      await expect(
        engine.processFieldValue('@lookup:MJ: AI Prompt Categories.Bogus=X', tmpDir),
      ).rejects.toThrow("Field 'Bogus' not found in entity 'MJ: AI Prompt Categories'");
    });
  });
});
