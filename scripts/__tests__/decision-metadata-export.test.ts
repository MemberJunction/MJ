import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'node:fs/promises';
import os from 'os';
import { exportDecisionMetadata } from '../codegen-decision-metadata-export.mjs';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<unknown> {
  const text = await fs.readFile(p, 'utf8');
  return JSON.parse(text);
}

function shuffle<T>(array: T[], seed = 42): T[] {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

describe('T15 — Decision Metadata Export (C7, §3.5, §6 T15)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `mj-test-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function createFakeSnapshot() {
    const entities = [
      {
        ID: 'e-1',
        Name: 'MJ: Entities',
        SchemaName: '__mj',
        Icon: 'fa-solid fa-table',
        Description: 'Human locked description for entities',
        AutoUpdateDescription: 0, // Human owned -> should be present
        AllowUserSearchAPI: 1, // Set -> should be present
        AutoUpdateAllowUserSearchAPI: 1, // Default -> should be absent
        FullTextSearchEnabled: 0, // Not set -> should be absent
        AutoUpdateFullTextSearch: 0, // 0 -> should be present
        SupportsGeoCoding: 0, // Not set -> should be absent
        AutoUpdateSupportsGeoCoding: 1, // Default -> should be absent
      },
      {
        ID: 'e-2',
        Name: 'Customer',
        SchemaName: 'dbo',
        Icon: null,
        Description: 'Schema auto-updated description',
        AutoUpdateDescription: 1, // Auto-updated -> should be absent
        AllowUserSearchAPI: 0,
        AutoUpdateAllowUserSearchAPI: 0, // 0 -> should be present
        FullTextSearchEnabled: 1, // Set -> should be present
        AutoUpdateFullTextSearch: 1,
        SupportsGeoCoding: 1, // Set -> should be present
        AutoUpdateSupportsGeoCoding: 1,
      }
    ];

    const entityFields = [
      {
        ID: 'f-1',
        EntityID: 'e-1',
        Name: 'SubtypeSelector',
        Sequence: 2,
        DisplayName: 'Subtype Selector',
        AutoUpdateDisplayName: 1, // Default -> absent
        Category: 'Subtype Configuration',
        AutoUpdateCategory: 1, // Default -> absent
        GeneratedFormSection: 'Category',
        ExtendedType: 'JSON',
        AutoUpdateExtendedType: 1, // Default -> absent
        CodeType: null,
        Description: 'Manual field description',
        AutoUpdateDescription: 0, // Human owned -> should be present
        DefaultInView: 0, // Not set -> absent
        AutoUpdateDefaultInView: 0, // 0 -> should be present
        IncludeInUserSearchAPI: 0, // Not set -> absent
        AutoUpdateIncludeInUserSearchAPI: 1, // Default -> absent
        UserSearchPredicateAPI: 'Contains',
        AutoUpdateUserSearchPredicate: 1,
        IsNameField: 0,
        AutoUpdateIsNameField: 1,
        FullTextSearchEnabled: 0,
        AutoUpdateFullTextSearch: 1,
      },
      {
        ID: 'f-2',
        EntityID: 'e-1',
        Name: 'Name',
        Sequence: 1,
        DisplayName: 'Entity Name',
        AutoUpdateDisplayName: 0, // 0 -> should be present
        Category: 'General',
        AutoUpdateCategory: 0, // 0 -> should be present
        GeneratedFormSection: 'Category',
        ExtendedType: null,
        AutoUpdateExtendedType: 0, // 0 -> should be present
        CodeType: null,
        Description: 'Auto description',
        AutoUpdateDescription: 1, // Auto -> should be absent
        DefaultInView: 1, // Set -> should be present
        AutoUpdateDefaultInView: 1,
        IncludeInUserSearchAPI: 1, // Set -> should be present
        AutoUpdateIncludeInUserSearchAPI: 1,
        UserSearchPredicateAPI: 'BeginsWith',
        AutoUpdateUserSearchPredicate: 0, // 0 -> should be present
        IsNameField: 1, // Set -> should be present
        AutoUpdateIsNameField: 0, // 0 -> should be present
        FullTextSearchEnabled: 1, // Set -> should be present
        AutoUpdateFullTextSearch: 0, // 0 -> should be present
      },
      {
        ID: 'f-3',
        EntityID: 'e-2',
        Name: 'CustomerCode',
        Sequence: 1,
        DisplayName: 'Customer Code',
        AutoUpdateDisplayName: 1,
        Category: 'Identification',
        AutoUpdateCategory: 1,
        GeneratedFormSection: 'Category',
        ExtendedType: null,
        AutoUpdateExtendedType: 1,
        CodeType: null,
        Description: null,
        AutoUpdateDescription: 1,
        DefaultInView: 1,
        AutoUpdateDefaultInView: 1,
        IncludeInUserSearchAPI: 1,
        AutoUpdateIncludeInUserSearchAPI: 1,
        UserSearchPredicateAPI: 'Exact',
        AutoUpdateUserSearchPredicate: 1,
        IsNameField: 1,
        AutoUpdateIsNameField: 1,
        FullTextSearchEnabled: 0,
        AutoUpdateFullTextSearch: 1,
      }
    ];

    const entitySettings = [
      {
        ID: 's-1',
        EntityID: 'e-1',
        Name: 'FieldCategoryInfo',
        Value: JSON.stringify({
          'Subtype Configuration': { icon: 'fa-solid fa-sitemap', description: 'Settings' }
        })
      }
    ];

    const applicationEntities = [
      {
        ID: 'ae-1',
        EntityID: 'e-1',
        ApplicationID: 'app-1',
        Application: 'Core Explorer',
        DefaultForNewUser: 1,
        AutoUpdateDefaultForNewUser: 0,
      }
    ];

    return { entities, entityFields, entitySettings, applicationEntities };
  }

  it('exports one file per entity with deterministic filenames and expected decision shapes', async () => {
    const snapshot = createFakeSnapshot();
    const summary = await exportDecisionMetadata({
      snapshot,
      outDir: tmpDir,
      log: () => {}
    });

    expect(summary.totalEntities).toBe(2);
    expect(summary.totalFieldRecords).toBe(3);
    expect(summary.totalSettingRecords).toBe(1);
    expect(summary.totalAppEntityRecords).toBe(1);
    expect(summary.filesWritten).toBe(2);

    // Verify filenames: .<schema>.<slug>.json
    const file1 = path.join(tmpDir, '.__mj.mj-entities.json');
    const file2 = path.join(tmpDir, '.dbo.customer.json');
    expect(await pathExists(file1)).toBe(true);
    expect(await pathExists(file2)).toBe(true);

    // Read and verify file1 content
    const parsed1 = (await readJson(file1)) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed1)).toBe(true);
    expect(parsed1.length).toBe(1);

    const record1 = parsed1[0];
    expect(record1.primaryKey).toEqual({ ID: '@lookup:MJ: Entities.Name=MJ: Entities' });

    // Entity-level decision columns
    expect(record1.fields.Name).toBe('MJ: Entities');
    expect(record1.fields.Icon).toBe('fa-solid fa-table');
    expect(record1.fields.AllowUserSearchAPI).toBe(true);
    // Description present only when AutoUpdateDescription=0
    expect(record1.fields.Description).toBe('Human locked description for entities');
    expect(record1.fields.AutoUpdateDescription).toBe(false);
    expect(record1.fields.AutoUpdateFullTextSearch).toBe(false);
    // When AutoUpdate* is 1 (default), it must NOT be present
    expect(record1.fields.AutoUpdateAllowUserSearchAPI).toBeUndefined();
    expect(record1.fields.AutoUpdateSupportsGeoCoding).toBeUndefined();
    // When boolean is 0 / not set, it must NOT be present
    expect(record1.fields.FullTextSearchEnabled).toBeUndefined();
    expect(record1.fields.SupportsGeoCoding).toBeUndefined();

    // Verify fields are sorted by Sequence ASC (Name seq 1 first, SubtypeSelector seq 2 second)
    const fieldRecords = record1.relatedEntities['MJ: Entity Fields'];
    expect(fieldRecords.length).toBe(2);
    expect(fieldRecords[0].fields.Name).toBe('Name');
    expect(fieldRecords[1].fields.Name).toBe('SubtypeSelector');

    // Field 1 (Name): AutoUpdate* = 0 values are present
    const nameField = fieldRecords[0].fields;
    expect(nameField.DisplayName).toBe('Entity Name');
    expect(nameField.AutoUpdateDisplayName).toBe(false);
    expect(nameField.Category).toBe('General');
    expect(nameField.AutoUpdateCategory).toBe(false);
    expect(nameField.AutoUpdateExtendedType).toBe(false);
    expect(nameField.IsNameField).toBe(true);
    expect(nameField.AutoUpdateIsNameField).toBe(false);
    expect(nameField.IncludeInUserSearchAPI).toBe(true);
    expect(nameField.UserSearchPredicateAPI).toBe('BeginsWith');
    expect(nameField.AutoUpdateUserSearchPredicate).toBe(false);
    // Description should be absent because AutoUpdateDescription was 1
    expect(nameField.Description).toBeUndefined();
    expect(nameField.AutoUpdateDescription).toBeUndefined();

    // Field 2 (SubtypeSelector): Description present because AutoUpdateDescription = 0
    const subtypeField = fieldRecords[1].fields;
    expect(subtypeField.Description).toBe('Manual field description');
    expect(subtypeField.AutoUpdateDescription).toBe(false);
    expect(subtypeField.AutoUpdateDefaultInView).toBe(false);
    expect(subtypeField.ExtendedType).toBe('JSON');
    // DefaultInView was 0 -> absent
    expect(subtypeField.DefaultInView).toBeUndefined();

    // Settings
    const settingRecords = record1.relatedEntities['MJ: Entity Settings'];
    expect(settingRecords.length).toBe(1);
    expect(settingRecords[0].fields.Name).toBe('FieldCategoryInfo');
    expect(settingRecords[0].fields.Value).toEqual({
      'Subtype Configuration': { icon: 'fa-solid fa-sitemap', description: 'Settings' }
    });

    // App entities
    const appEntityRecords = record1.relatedEntities['MJ: Application Entities'];
    expect(appEntityRecords.length).toBe(1);
    expect(appEntityRecords[0].fields.DefaultForNewUser).toBe(true);
    expect(appEntityRecords[0].fields.AutoUpdateDefaultForNewUser).toBe(false);
    expect(appEntityRecords[0].primaryKey).toEqual({
      ID: '@lookup:MJ: Application Entities.ApplicationID=@lookup:MJ: Applications.Name=Core Explorer&EntityID=@lookup:MJ: Entities.Name=MJ: Entities'
    });
  });

  it('honours schema filter', async () => {
    const snapshot = createFakeSnapshot();
    const summary = await exportDecisionMetadata({
      snapshot,
      outDir: tmpDir,
      schemas: '__mj',
      log: () => {}
    });

    expect(summary.totalEntities).toBe(1);
    expect(summary.filesWritten).toBe(1);

    const file1 = path.join(tmpDir, '.__mj.mj-entities.json');
    const file2 = path.join(tmpDir, '.dbo.customer.json');
    expect(await pathExists(file1)).toBe(true);
    expect(await pathExists(file2)).toBe(false);
  });

  it('output is byte-identical across two runs with shuffled input row order', async () => {
    const dirRun1 = path.join(tmpDir, 'run1');
    const dirRun2 = path.join(tmpDir, 'run2');
    await fs.mkdir(dirRun1, { recursive: true });
    await fs.mkdir(dirRun2, { recursive: true });

    const snapshot1 = createFakeSnapshot();

    // Shuffled snapshot for run 2
    const snapshot2 = {
      entities: shuffle(snapshot1.entities, 101),
      entityFields: shuffle(snapshot1.entityFields, 202),
      entitySettings: shuffle(snapshot1.entitySettings, 303),
      applicationEntities: shuffle(snapshot1.applicationEntities, 404),
    };

    const summary1 = await exportDecisionMetadata({
      snapshot: snapshot1,
      outDir: dirRun1,
      log: () => {}
    });

    const summary2 = await exportDecisionMetadata({
      snapshot: snapshot2,
      outDir: dirRun2,
      log: () => {}
    });

    expect(summary1.totalEntities).toBe(summary2.totalEntities);
    expect(summary1.totalFieldRecords).toBe(summary2.totalFieldRecords);
    expect(summary1.totalSettingRecords).toBe(summary2.totalSettingRecords);
    expect(summary1.totalAppEntityRecords).toBe(summary2.totalAppEntityRecords);
    expect(summary1.columnCounts).toEqual(summary2.columnCounts);

    const files1 = (await fs.readdir(dirRun1)).sort();
    const files2 = (await fs.readdir(dirRun2)).sort();
    expect(files1).toEqual(files2);

    for (const fileName of files1) {
      const content1 = await fs.readFile(path.join(dirRun1, fileName), 'utf8');
      const content2 = await fs.readFile(path.join(dirRun2, fileName), 'utf8');
      expect(content1).toBe(content2);
    }
  });

  it('summary counts are accurate', async () => {
    const snapshot = createFakeSnapshot();
    const summary = await exportDecisionMetadata({
      snapshot,
      outDir: tmpDir,
      log: () => {}
    });

    expect(summary.columnCounts['entity.Icon']).toBe(1);
    expect(summary.columnCounts['entity.AllowUserSearchAPI']).toBe(1);
    expect(summary.columnCounts['entity.Description']).toBe(1);
    expect(summary.columnCounts['entity.FullTextSearchEnabled']).toBe(1);
    expect(summary.columnCounts['entity.SupportsGeoCoding']).toBe(1);
    expect(summary.columnCounts['fields.DisplayName']).toBe(3);
    expect(summary.columnCounts['fields.Category']).toBe(3);
    expect(summary.columnCounts['fields.Description']).toBe(1);
    expect(summary.columnCounts['fields.ExtendedType']).toBe(1);
    expect(summary.columnCounts['fields.IsNameField']).toBe(2);
    expect(summary.columnCounts['fields.DefaultInView']).toBe(2);
    expect(summary.columnCounts['fields.IncludeInUserSearchAPI']).toBe(2);
    expect(summary.columnCounts['settings.FieldCategoryInfo']).toBe(1);
    expect(summary.columnCounts['appEntities.DefaultForNewUser']).toBe(1);
  });
});
