import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { FileWriteBatch } from '../lib/file-write-batch';
import { RecordData } from '../lib/sync-engine';

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

  it('refuses an update whose key is incomplete, before anything is written', async () => {
    const batch = new FileWriteBatch();
    expect(() => batch.queueArrayUpdate(file, record('x', 'x'), 'ID:undefined')).toThrow(/incomplete primary key/);
    expect(() => batch.queueArrayUpdate(file, record('x', 'x'), '')).toThrow(/incomplete primary key/);
    expect(batch.getPendingFileCount()).toBe(0);
    expect(await fs.readJson(file)).toHaveLength(2);
  });
});
