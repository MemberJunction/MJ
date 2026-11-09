import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { EvaluatePushWhen, FilterByPushWhen, PushWhenError } from '../lib/push-when';

describe('PushWhenError', () => {
  it('accepts a plain @env: reference', () => {
    expect(PushWhenError('@env:DEMO_ENABLED')).toBeNull();
  });

  it('rejects a non-string', () => {
    expect(PushWhenError(true)).toContain('must be a string');
    expect(PushWhenError(null)).toContain('must be a string');
  });

  it('rejects a value that is not an @env: reference', () => {
    expect(PushWhenError('env:DEMO_ENABLED')).toContain('must be an @env: reference');
    expect(PushWhenError('@env:DEMO?bogus')).toContain('must be an @env: reference');
  });

  it('rejects ?optional', () => {
    expect(PushWhenError('@env:DEMO_ENABLED?optional')).toContain('cannot use ?optional');
  });
});

describe('EvaluatePushWhen', () => {
  it('pushes when pushWhen is not given', () => {
    expect(EvaluatePushWhen(undefined, {})).toEqual({ Push: true, Reason: null });
  });

  it('pushes when the variable is true or 1', () => {
    expect(EvaluatePushWhen('@env:DEMO', { DEMO: 'true' })).toEqual({ Push: true, Reason: null });
    expect(EvaluatePushWhen('@env:DEMO', { DEMO: ' 1 ' })).toEqual({ Push: true, Reason: null });
  });

  it('skips when the variable is missing or empty', () => {
    expect(EvaluatePushWhen('@env:DEMO', {})).toEqual({ Push: false, Reason: 'DEMO is not set' });
    expect(EvaluatePushWhen('@env:DEMO', { DEMO: '  ' })).toEqual({ Push: false, Reason: 'DEMO is not set' });
  });

  it('skips, without naming the value, when the variable has another value', () => {
    expect(EvaluatePushWhen('@env:DEMO', { DEMO: 'yes' })).toEqual({ Push: false, Reason: 'DEMO is not true' });
  });

  it('throws on a malformed value', () => {
    expect(() => EvaluatePushWhen('DEMO', {})).toThrow('must be an @env: reference');
  });
});

describe('FilterByPushWhen', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-when-'));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function folder(name: string, config: Record<string, unknown> | null): Promise<string> {
    const dir = path.join(root, name);
    await fs.ensureDir(dir);
    if (config) {
      await fs.writeJson(path.join(dir, '.mj-sync.json'), config);
    }
    return dir;
  }

  it('keeps the order of included folders and lists skipped ones with a reason', async () => {
    const open = await folder('open', { entity: 'A' });
    const gated = await folder('gated', { entity: 'B', pushWhen: '@env:GATE' });
    const on = await folder('on', { entity: 'C', pushWhen: '@env:ON' });

    const result = FilterByPushWhen([open, gated, on], { ON: 'true' });

    expect(result.Included).toEqual([open, on]);
    expect(result.Skipped).toEqual([{ Directory: gated, Reason: 'GATE is not set' }]);
  });

  it('includes a folder that has no .mj-sync.json', async () => {
    const bare = await folder('bare', null);

    expect(FilterByPushWhen([bare], {}).Included).toEqual([bare]);
  });

  it('throws with the config path when a pushWhen is malformed', async () => {
    const bad = await folder('bad', { entity: 'A', pushWhen: 'GATE' });

    expect(() => FilterByPushWhen([bad], {})).toThrow(path.join(bad, '.mj-sync.json'));
  });

  it('throws with the config path when .mj-sync.json is not valid JSON', async () => {
    const broken = await folder('broken', null);
    await fs.writeFile(path.join(broken, '.mj-sync.json'), '{ "entity": "A", }');

    expect(() => FilterByPushWhen([broken], {})).toThrow(path.join(broken, '.mj-sync.json'));
  });

  it('throws when .mj-sync.json is not a JSON object', async () => {
    const empty = await folder('empty', null);
    await fs.writeFile(path.join(empty, '.mj-sync.json'), 'null');

    expect(() => FilterByPushWhen([empty], {})).toThrow(
      `Invalid .mj-sync.json in ${path.join(empty, '.mj-sync.json')}: expected a JSON object`
    );
  });
});
