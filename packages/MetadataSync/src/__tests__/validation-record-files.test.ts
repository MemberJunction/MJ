/**
 * ValidationService reads the record files of an entity folder the way push finds them:
 * by absolute path, with the folder's filePattern, in sub-folders too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { EntityInfo } from '@memberjunction/core';

const widgetInfo = new EntityInfo({
  ID: 'eeeeeeee-0000-4000-8000-000000000000',
  Name: 'Test: Widgets',
  BaseTable: 'Widget',
  BaseView: 'vwWidgets',
  Status: 'Active',
  Fields: [
    { ID: 'w-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'w-name', Name: 'Name', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'w-category', Name: 'Category', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: false, IsVirtual: true, Status: 'Active' },
    { ID: 'w-total', Name: 'Total', Type: 'int', AllowsNull: true, AllowUpdateAPI: false, Status: 'Active' },
    { ID: 'w-created', Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, AllowUpdateAPI: false, Status: 'Active' },
  ],
});

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public EntityByName(name: string): EntityInfo | null {
      return name === 'Test: Widgets' ? widgetInfo : null;
    }
    public async GetEntityObject(): Promise<never> {
      throw new Error('no entity objects in this test');
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { ValidationService } from '../services/ValidationService';

describe('ValidationService — record files', () => {
  let root: string;
  let widgets: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-validate-files-'));
    widgets = path.join(root, 'widgets');
    await fs.ensureDir(path.join(widgets, 'sub'));
    await fs.ensureDir(path.join(widgets, 'node_modules'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0' });
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function validate(filePattern?: string): Promise<{ messages: string[]; totalFiles: number }> {
    await fs.writeJson(path.join(widgets, '.mj-sync.json'), { entity: 'Test: Widgets', ...(filePattern ? { filePattern } : {}) });
    const result = await new ValidationService({}).ValidateDirectory(root);
    return { messages: result.errors.map((e) => e.message), totalFiles: result.summary.totalFiles };
  }

  it('reads records in the folder and its sub-folders, whatever the working folder is', async () => {
    await fs.writeJson(path.join(widgets, '.a.json'), { fields: { Name: 'A', BogusTop: 1 } });
    await fs.writeJson(path.join(widgets, 'sub', '.b.json'), { fields: { Name: 'B', BogusSub: 1 } });

    const { messages, totalFiles } = await validate('**/.*.json');

    expect(totalFiles).toBe(2);
    expect(messages).toContain('Field "BogusTop" does not exist on entity "Test: Widgets"');
    expect(messages).toContain('Field "BogusSub" does not exist on entity "Test: Widgets"');
  });

  it('reports a file that is not valid JSON', async () => {
    await fs.writeFile(path.join(widgets, '.broken.json'), '{ not json');

    const { messages } = await validate('**/.*.json');

    expect(messages.some((m) => m.startsWith('Failed to parse JSON:'))).toBe(true);
  });

  it('leaves out node_modules and .mj-*.json files', async () => {
    await fs.writeJson(path.join(widgets, 'node_modules', '.x.json'), { fields: { BogusModule: 1 } });
    await fs.writeJson(path.join(widgets, '.mj-folder.json'), { defaults: { BogusDefault: 1 } });

    const { messages, totalFiles } = await validate('**/.*.json');

    expect(totalFiles).toBe(0);
    expect(messages.some((m) => m.includes('Bogus'))).toBe(false);
  });

  it('uses *.json in the folder itself when the folder sets no filePattern', async () => {
    await fs.writeJson(path.join(widgets, 'top.json'), { fields: { BogusPlain: 1 } });
    await fs.writeJson(path.join(widgets, 'sub', 'deep.json'), { fields: { BogusDeep: 1 } });

    const { messages, totalFiles } = await validate();

    expect(totalFiles).toBe(1);
    expect(messages).toContain('Field "BogusPlain" does not exist on entity "Test: Widgets"');
  });

  it('resolves a record @file: reference from the entity folder, as push does', async () => {
    await fs.outputFile(path.join(widgets, 'sub', 'assets', 'note.txt'), 'note');
    await fs.outputJson(path.join(widgets, 'data', 'config.json'), { inner: '@file:inner.txt' });
    await fs.outputFile(path.join(widgets, 'data', 'inner.txt'), 'inner');
    await fs.writeJson(path.join(widgets, 'sub', '.a.json'), [
      { fields: { Name: '@file:sub/assets/note.txt' } },
      { fields: { Name: '@file:data/config.json' } },
      { fields: { Name: '@file:assets/note.txt' } },
    ]);

    const { messages } = await validate('**/.*.json');

    expect(messages.filter((m) => m.includes('not found'))).toEqual(['File reference not found: "assets/note.txt"']);
  });

  it('reports a @template: value as not supported by push, with the record start line', async () => {
    const file = path.join(widgets, '.a.json');
    await fs.writeFile(file, '[\n  { "fields": { "Name": "Plain" } },\n  {\n    "fields": { "Name": "@template:templates/x.json" }\n  }\n]\n');

    const { messages } = await validate('**/.*.json');

    expect(messages).toEqual([
      '@template: is not supported by mj sync push; push would save the literal text "@template:templates/x.json" ' +
        `to Test: Widgets.Name at ${file}:3. Use @file: instead.`,
    ]);
  });

  describe('read-only fields', () => {
    async function validateFields(fields: Record<string, unknown>) {
      await fs.writeJson(path.join(widgets, '.a.json'), { primaryKey: { ID: 'w-1' }, fields });
      await fs.writeJson(path.join(widgets, '.mj-sync.json'), { entity: 'Test: Widgets', filePattern: '**/.*.json' });
      return new ValidationService({}).ValidateDirectory(root);
    }

    it('gives a warning, not an error, for a pulled virtual display field', async () => {
      const result = await validateFields({ Name: 'A', Category: 'Tools' });

      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => w.message)).toContain(
        'Field "Category" is read-only: push ignores it; set pull.ignoreVirtualFields: true to stop pull writing it'
      );
    });

    it('names pull.excludeFields for a read-only field that is not virtual', async () => {
      const result = await validateFields({ Name: 'A', Total: 3 });

      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => w.message)).toContain(
        'Field "Total" is read-only: push ignores it; add it to pull.excludeFields to stop pull writing it'
      );
    });

    it('matches field names without regard to case', async () => {
      const result = await validateFields({ name: 'A', category: 'Tools' });

      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => w.message)).toContain(
        'Field "category" is read-only: push ignores it; set pull.ignoreVirtualFields: true to stop pull writing it'
      );
    });

    it('keeps the error for a __mj_ field in another case', async () => {
      const result = await validateFields({ Name: 'A', __MJ_CreatedAt: '2026-01-01' });

      expect(result.errors.map((e) => e.message)).toEqual(['Field "__MJ_CreatedAt" is a read-only or system field and cannot be set']);
    });

    it('keeps the error for a __mj_ field and for the primary key in fields', async () => {
      const result = await validateFields({ Name: 'A', __mj_CreatedAt: '2026-01-01', ID: 'w-1' });

      expect(result.errors.map((e) => e.message)).toEqual([
        'Field "__mj_CreatedAt" is a read-only or system field and cannot be set',
        'Field "ID" is a read-only or system field and cannot be set',
      ]);
    });
  });

  describe('records with the same primary key', () => {
    const conflicts = (messages: string[]): string[] => messages.filter((m) => m.startsWith('Conflicting values'));
    const conflictText = (field: string, first: string, second: string, firstAt: string, secondAt: string): string =>
      'Conflicting values for Test: Widgets record {"ID":"w-1"}: ' +
      `field "${field}" is ${first} at ${firstAt} and ${second} at ${secondAt}. ` +
      'Make both entries set the same value, or set the field in one entry only.';

    it('accepts entries in two files that do not conflict', async () => {
      await fs.writeJson(path.join(widgets, '.a.json'), { primaryKey: { ID: 'w-1' }, fields: { Name: 'Same' } }, { spaces: 2 });
      await fs.writeJson(path.join(widgets, '.b.json'), [{ primaryKey: { ID: 'w-1' }, fields: { Name: 'Same' } }], { spaces: 2 });

      const { messages } = await validate('**/.*.json');

      expect(messages).toEqual([]);
    });

    it('does not compare children whose key is relative to their parent', async () => {
      const child = (name: string) => ({ primaryKey: { ID: '@parent:ID' }, fields: { Name: name } });
      await fs.writeJson(
        path.join(widgets, '.a.json'),
        [
          { fields: { Name: 'Parent A' }, relatedEntities: { 'Test: Widgets': [child('Child A')] } },
          { fields: { Name: 'Parent B' }, relatedEntities: { 'Test: Widgets': [child('Child B')] } },
        ],
        { spaces: 2 }
      );

      const { messages } = await validate('**/.*.json');

      expect(messages).toEqual([]);
    });

    it('does not compare children whose key holds a parent reference inside a lookup, or is an object', async () => {
      const child = (key: unknown, name: string) => ({ primaryKey: { ID: key }, fields: { Name: name } });
      await fs.writeJson(
        path.join(widgets, '.a.json'),
        [
          {
            fields: { Name: 'Parent A' },
            relatedEntities: { 'Test: Widgets': [child('@lookup:Test: Widgets.Name=@parent:Name', 'Child A'), child({ a: 1 }, 'Object A')] },
          },
          {
            fields: { Name: 'Parent B' },
            relatedEntities: { 'Test: Widgets': [child('@lookup:Test: Widgets.Name=@parent:Name', 'Child B'), child({ a: 1 }, 'Object B')] },
          },
        ],
        { spaces: 2 }
      );

      const { messages } = await validate('**/.*.json');

      expect(conflicts(messages)).toEqual([]);
    });

    it('still compares entries with the same number key', async () => {
      await fs.writeJson(path.join(widgets, '.a.json'), [{ primaryKey: { ID: 7 }, fields: { Name: 'One' } }, { primaryKey: { ID: 7 }, fields: { Name: 'Two' } }]);

      const { messages } = await validate('**/.*.json');

      expect(conflicts(messages)).toHaveLength(1);
    });

    it('names the field and each entry as path:line when two files conflict', async () => {
      const fileA = path.join(widgets, '.a.json');
      const fileB = path.join(widgets, '.b.json');
      await fs.writeFile(fileA, '{\n  "primaryKey": { "ID": "w-1" },\n  "fields": { "Name": "One" }\n}\n');
      await fs.writeFile(
        fileB,
        '\uFEFF[\n  {\n    "fields": { "Name": "Other" }\n  },\n  {\n    "primaryKey": { "ID": "w-1" },\n    "fields": { "Name": "Two" }\n  }\n]\n'
      );

      const result = await new ValidationService({}).ValidateDirectory(
        await writeWidgetConfig('**/.*.json')
      );

      const conflictErrors = result.errors.filter((e) => e.message.startsWith('Conflicting values'));
      expect(conflictErrors.map((e) => e.message)).toEqual([conflictText('Name', '"One"', '"Two"', `${fileA}:1`, `${fileB}:5`)]);
      expect(conflictErrors[0].file).toBe(fileB);
    });

    it('reports a conflict inside one file', async () => {
      const file = path.join(widgets, '.a.json');
      await fs.writeFile(
        file,
        '[\n  { "primaryKey": { "ID": "w-1" }, "fields": { "Name": { "a": 1, "b": [1, 2] } } },\n' +
          '  { "primaryKey": { "ID": "w-1" }, "fields": { "Name": { "b": [1, 2], "a": 1 } } },\n' +
          '  { "primaryKey": { "ID": "w-1" }, "fields": { "Name": "@env:WIDGET_NAME" } }\n]\n'
      );

      const { messages } = await validate('**/.*.json');

      expect(conflicts(messages)).toEqual([
        conflictText('Name', '{"a":1,"b":[1,2]}', '"@env:WIDGET_NAME"', `${file}:2`, `${file}:4`),
        conflictText('Name', '{"b":[1,2],"a":1}', '"@env:WIDGET_NAME"', `${file}:3`, `${file}:4`),
      ]);
    });

    it('reports a conflict in a nested related record', async () => {
      const fileA = path.join(widgets, '.a.json');
      const fileB = path.join(widgets, '.b.json');
      await fs.writeJson(fileA, { primaryKey: { ID: 'w-1' }, fields: { Name: 'Same' } }, { spaces: 2 });
      await fs.writeFile(
        fileB,
        [
          '{',
          '  "fields": { "Name": "Parent" },',
          '  "relatedEntities": {',
          '    "Test: Widgets": [',
          '      {',
          '        "primaryKey": { "ID": "w-1" },',
          '        "fields": { "Name": "Nested" }',
          '      }',
          '    ]',
          '  }',
          '}',
        ].join('\n')
      );

      const { messages } = await validate('**/.*.json');

      expect(conflicts(messages)).toEqual([conflictText('Name', '"Same"', '"Nested"', `${fileA}:1`, `${fileB}:5`)]);
    });
  });

  async function writeWidgetConfig(filePattern: string): Promise<string> {
    await fs.writeJson(path.join(widgets, '.mj-sync.json'), { entity: 'Test: Widgets', filePattern });
    return root;
  }
});
