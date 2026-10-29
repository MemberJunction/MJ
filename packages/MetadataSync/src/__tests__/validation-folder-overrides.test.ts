/**
 * A folder's `overrides` in `.mj-sync.json`: a later folder may set listed fields of a record to a
 * different value than an earlier folder sets, without a conflict error. For example, a folder that
 * saves models as Draft and a later one that sets them to Active once their children exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { EntityInfo } from '@memberjunction/core';

const widgetInfo = new EntityInfo({
  ID: 'eeeeeeee-0000-4000-8000-000000000001',
  Name: 'Test: Widgets',
  BaseTable: 'Widget',
  BaseView: 'vwWidgets',
  Status: 'Active',
  Fields: [
    { ID: 'w-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'w-name', Name: 'Name', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'w-status', Name: 'Status', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
    { ID: 'w-owner', Name: 'OwnerName', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
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
import type { ValidationOptions } from '../types/validation';

type Fields = Record<string, string>;

describe('ValidationService — folder overrides', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-validate-overrides-'));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function writeRoot(directoryOrder: string[]): Promise<void> {
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', directoryOrder });
  }

  async function writeFolder(name: string, records: Fields[], overrides?: unknown): Promise<string> {
    const dir = path.join(root, name);
    await fs.ensureDir(dir);
    const config: Record<string, unknown> = { entity: 'Test: Widgets', filePattern: '**/.*.json' };
    if (overrides !== undefined) {
      config.overrides = overrides;
    }
    await fs.writeJson(path.join(dir, '.mj-sync.json'), config);
    const file = path.join(dir, '.widgets.json');
    await fs.writeJson(file, records.map((fields) => ({ primaryKey: { ID: 'w-1' }, fields })), { spaces: 2 });
    return file;
  }

  async function validate(dir: string = root, options: Partial<ValidationOptions> = {}): Promise<string[]> {
    const result = await new ValidationService(options).ValidateDirectory(dir);
    return result.errors.map((e) => e.message);
  }

  const conflicts = (messages: string[]): string[] => messages.filter((m) => m.startsWith('Conflicting values'));

  /** The usual two-pass shape: `draft` saves the widget, `activate` sets its Status afterwards. */
  async function twoPass(overrides?: unknown, activateFields: Fields = { Status: 'Active' }): Promise<{ draft: string; activate: string }> {
    await writeRoot(['draft', 'activate']);
    const draft = await writeFolder('draft', [{ Name: 'Widget', Status: 'Draft', OwnerName: 'System' }]);
    const activate = await writeFolder('activate', [activateFields], overrides);
    return { draft, activate };
  }

  it('reports a field a later folder changes without declaring it, and names overrides as a fix', async () => {
    const { draft, activate } = await twoPass();

    expect(conflicts(await validate())).toEqual([
      'Conflicting values for Test: Widgets record {"ID":"w-1"}: ' +
        `field "Status" is "Draft" at ${draft}:2 and "Active" at ${activate}:2. ` +
        'Make both entries set the same value, set the field in one entry only, or, if the later folder changes it on purpose, ' +
        `list it in "overrides" in ${path.join('activate', '.mj-sync.json')}.`,
    ]);
  });

  it('accepts a field the later folder lists in overrides for the earlier folder', async () => {
    await twoPass([{ folder: 'draft', fields: ['Status'] }]);

    expect(await validate()).toEqual([]);
  });

  it('matches the listed field names without regard to case', async () => {
    await twoPass([{ folder: 'draft', fields: ['status'] }]);

    expect(await validate()).toEqual([]);
  });

  it('still reports a field the entry does not list', async () => {
    await twoPass([{ folder: 'draft', fields: ['Status'] }], { Status: 'Active', OwnerName: 'demo.user@example.com' });

    const found = conflicts(await validate());

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('field "OwnerName" is "System"');
    expect(found[0]).not.toContain('field "Status"');
  });

  it('still reports two entries in the later folder that disagree with each other', async () => {
    await writeRoot(['draft', 'activate']);
    await writeFolder('draft', [{ Status: 'Draft' }]);
    const activate = await writeFolder('activate', [{ Status: 'Active' }, { Status: 'Retired' }], [{ folder: 'draft', fields: ['Status'] }]);

    const found = conflicts(await validate());

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`"Active" at ${activate}:2 and "Retired" at ${activate}:10`);
    expect(found[0]).toContain('Make both entries set the same value, or set the field in one entry only.');
  });

  it('does not exempt a third folder that declares nothing', async () => {
    await writeRoot(['draft', 'activate', 'retire']);
    await writeFolder('draft', [{ Status: 'Draft' }]);
    await writeFolder('activate', [{ Status: 'Active' }], [{ folder: 'draft', fields: ['Status'] }]);
    await writeFolder('retire', [{ Status: 'Retired' }]);

    const found = conflicts(await validate());

    expect(found).toHaveLength(2);
    expect(found.every((m) => m.includes('"Retired" at'))).toBe(true);
  });

  it('exempts only the folder the entry names', async () => {
    await writeRoot(['draft', 'review', 'activate']);
    await writeFolder('draft', [{ Status: 'Draft' }]);
    await writeFolder('review', [{ Status: 'Draft' }]);
    await writeFolder('activate', [{ Status: 'Active' }], [{ folder: 'draft', fields: ['Status'] }]);

    const found = conflicts(await validate());

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`at ${path.join(root, 'review', '.widgets.json')}:2`);
  });

  it('accepts entries for several earlier folders', async () => {
    await writeRoot(['draft', 'review', 'activate']);
    await writeFolder('draft', [{ Status: 'Draft' }]);
    await writeFolder('review', [{ Status: 'Review' }], [{ folder: 'draft', fields: ['Status'] }]);
    await writeFolder('activate', [{ Status: 'Active' }], [
      { folder: 'draft', fields: ['Status'] },
      { folder: 'review', fields: ['Status'] },
    ]);

    expect(await validate()).toEqual([]);
  });

  describe('checks the declaration', () => {
    const configOf = (folder: string): string => path.join(root, folder, '.mj-sync.json');

    async function declarationErrors(): Promise<Array<{ file?: string; message: string }>> {
      const result = await new ValidationService({}).ValidateDirectory(root);
      return result.errors.filter((e) => !e.message.startsWith('Conflicting values')).map((e) => ({ file: e.file, message: e.message }));
    }

    it('reports a folder that push runs after the declaring folder', async () => {
      await writeRoot(['activate', 'draft']);
      await writeFolder('activate', [{ Status: 'Active' }], [{ folder: 'draft', fields: ['Status'] }]);
      await writeFolder('draft', [{ Status: 'Draft' }]);

      expect(await declarationErrors()).toEqual([
        {
          file: configOf('activate'),
          message: '"overrides" names folder "draft", which push runs after "activate". Put "draft" before "activate" in directoryOrder',
        },
      ]);
    });

    it('reports a folder that is not an entity folder under the root', async () => {
      await twoPass([{ folder: 'drafts', fields: ['Status'] }]);

      expect(await declarationErrors()).toEqual([
        { file: configOf('activate'), message: `"overrides" names folder "drafts", which is not an entity folder under ${root}` },
      ]);
    });

    it('reports the declaring folder naming itself', async () => {
      await twoPass([{ folder: 'activate', fields: ['Status'] }]);

      expect((await declarationErrors()).map((e) => e.message)).toEqual([
        '"overrides" names this folder itself ("activate"); name the earlier folder that sets the values it changes',
      ]);
    });

    it('reports a field the entity does not have', async () => {
      await twoPass([{ folder: 'draft', fields: ['Status', 'Stauts'] }]);

      expect((await declarationErrors()).map((e) => e.message)).toEqual([
        '"overrides" lists field "Stauts", which entity "Test: Widgets" does not have',
      ]);
    });

    it.each([
      ['an object instead of a list', { folder: 'draft', fields: ['Status'] }, '"overrides" must be a list'],
      ['an entry without fields', [{ folder: 'draft' }], 'Each "overrides" entry must be'],
      ['an empty fields list', [{ folder: 'draft', fields: [] }], 'Each "overrides" entry must be'],
      ['a blank folder', [{ folder: ' ', fields: ['Status'] }], 'Each "overrides" entry must be'],
      ['a field that is not a string', [{ folder: 'draft', fields: [1] }], 'Each "overrides" entry must be'],
    ])('reports %s', async (_label, overrides, expected) => {
      await twoPass(overrides);

      const messages = (await declarationErrors()).map((e) => e.message);

      expect(messages).toHaveLength(1);
      expect(messages[0].startsWith(expected)).toBe(true);
    });

    it('checks the order with --exclude leaving the earlier folder out, and finds no conflict', async () => {
      await twoPass([{ folder: 'draft', fields: ['Status'] }]);

      expect(await validate(root, { exclude: ['draft'] })).toEqual([]);
    });

    it('reports the order against the full push order when --include leaves the earlier folder out', async () => {
      await writeRoot(['activate', 'draft']);
      await writeFolder('activate', [{ Status: 'Active' }], [{ folder: 'draft', fields: ['Status'] }]);
      await writeFolder('draft', [{ Status: 'Draft' }]);

      expect(await validate(root, { include: ['activate'] })).toEqual([
        '"overrides" names folder "draft", which push runs after "activate". Put "draft" before "activate" in directoryOrder',
      ]);
    });

    it('does not check the folders when one entity folder is validated on its own', async () => {
      await twoPass([{ folder: 'not-a-folder', fields: ['Status'] }]);

      expect(await validate(path.join(root, 'activate'))).toEqual([]);
    });
  });
});
