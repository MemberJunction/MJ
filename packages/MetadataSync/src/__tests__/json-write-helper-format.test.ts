import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { JsonWriteHelper } from '../lib/json-write-helper';
import { RecordData } from '../lib/sync-engine';

/** Serializes like a hand-written file: non-ASCII as `\uXXXX` escapes, with a trailing newline. */
function asciiEscapedWithNewline(data: RecordData): string {
  const text = JSON.stringify(data, null, 2).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  return `${text}\n`;
}

describe('JsonWriteHelper keeps the format of the file it overwrites', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-jwh-'));
    file = path.join(dir, '.T001-login-smoke.json');
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  it('rewrites an unchanged record byte for byte', async () => {
    const record: RecordData = {
      fields: { Name: 'T001 - Login Smoke', Description: 'The most basic test — login must work.' },
      primaryKey: { ID: 'C9FE51A9-8750-47FD-A6B6-347ED5E53A65' },
    };
    const original = asciiEscapedWithNewline(record);
    await fs.writeFile(file, original, 'utf8');

    await JsonWriteHelper.WriteOrderedRecordData(file, JSON.parse(original) as RecordData);

    expect(await fs.readFile(file, 'utf8')).toBe(original);
  });

  it('keeps the trailing newline and escape style when a field changes', async () => {
    const record: RecordData = {
      fields: { Name: 'T001 - Login Smoke', Description: 'Old — text.' },
      primaryKey: { ID: 'C9FE51A9-8750-47FD-A6B6-347ED5E53A65' },
    };
    await fs.writeFile(file, asciiEscapedWithNewline(record), 'utf8');

    const changed: RecordData = { ...record, fields: { ...record.fields, Description: 'New — text \u{1F600}.' } };
    await JsonWriteHelper.WriteOrderedRecordData(file, changed);

    expect(await fs.readFile(file, 'utf8')).toBe(asciiEscapedWithNewline(changed));
  });
});
