import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { FileWriteBatch } from '../lib/file-write-batch';
import { RecordData } from '../lib/sync-engine';
import { CreatePrimaryKeyLookup } from '../lib/record-primary-key';

function record(id: string, name: string): RecordData {
  return { primaryKey: { ID: id }, fields: { Name: name } };
}

describe('FileWriteBatch array updates', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-fwb-'));
    file = path.join(dir, '.widgets.json');
    await fs.writeJson(file, [record('1', 'one'), record('2', 'two')]);
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('appends every new record with a distinct key and updates existing ones in place', async () => {
    const batch = new FileWriteBatch();
    batch.queueArrayUpdate(file, record('2', 'two (updated)'), 'ID:2');
    for (const id of ['3', '4', '5']) {
      batch.queueArrayUpdate(file, record(id, `new ${id}`), `ID:${id}`);
    }
    await batch.flush();

    const written: RecordData[] = await fs.readJson(file);
    expect(written.map((r) => r.primaryKey?.ID)).toEqual(['1', '2', '3', '4', '5']);
    expect(written[1].fields.Name).toBe('two (updated)');
  });

  it('refuses a record whose key is incomplete, before anything is written', async () => {
    const batch = new FileWriteBatch();
    const noValue: RecordData = { primaryKey: { ID: undefined }, fields: { Name: 'x' } };
    const noKey: RecordData = { primaryKey: {}, fields: { Name: 'x' } };
    const noKeyObject: RecordData = { fields: { Name: 'x' } };
    expect(() => batch.queueArrayUpdate(file, noValue, 'ID:undefined')).toThrow(/incomplete primary key/);
    expect(() => batch.queueArrayUpdate(file, noKey, '')).toThrow(/incomplete primary key/);
    expect(() => batch.queueArrayUpdate(file, noKeyObject, '')).toThrow(/incomplete primary key/);
    expect(batch.getPendingFileCount()).toBe(0);
    expect(await fs.readJson(file)).toHaveLength(2);
  });

  it('accepts key values containing the separator, an empty string or the text null, and updates them in place', async () => {
    const keys = ['AB|CD', '', 'null'];
    await fs.writeJson(file, keys.map((id) => record(id, `old ${id}`)));
    const batch = new FileWriteBatch();
    for (const id of keys) {
      batch.queueArrayUpdate(file, record(id, `new ${id}`), CreatePrimaryKeyLookup({ ID: id }));
    }
    await batch.flush();

    const written: RecordData[] = await fs.readJson(file);
    expect(written.map((r) => r.primaryKey?.ID)).toEqual(keys);
    expect(written.map((r) => r.fields.Name)).toEqual(keys.map((id) => `new ${id}`));
  });
});
