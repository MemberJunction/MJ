import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { UserInfo } from '@memberjunction/core';
import { SyncEngine, SyncResolutionCollector } from '../lib/sync-engine';
import { OptionalEnvMissingError } from '../lib/env-reference';
import { BatchContextStub } from '../lib/batch-context-index';

function collector(): SyncResolutionCollector {
  return { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };
}

function stubRecord(values: Record<string, unknown>): BatchContextStub {
  return {
    EntityInfo: { Name: 'Parents', PrimaryKeys: [{ Name: 'ID' }], Fields: Object.keys(values).map(Name => ({ Name })) },
    Get: (field: string) => values[field],
    GetAll: () => values
  };
}

describe('SyncEngine — EnvFields and ResolvedEnvVariables', () => {
  let engine: SyncEngine;
  let dir: string;

  beforeEach(async () => {
    engine = new SyncEngine(new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' }));
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-env-fields-'));
    vi.stubEnv('MJ_EF_A', 'value-a');
    vi.stubEnv('MJ_EF_B', 'value-b');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await fs.remove(dir);
  });

  it('records a flat @env: field', async () => {
    const c = collector();
    expect(await engine.ProcessFieldValue('@env:MJ_EF_A', dir, null, null, 0, undefined, c, 'Token')).toBe('value-a');
    expect(c.EnvFields?.get('Token')).toEqual(new Set(['MJ_EF_A']));
    expect(engine.ResolvedEnvVariables.has('MJ_EF_A')).toBe(true);
  });

  it('records every variable inside an inline JSON object under the top-level field, with no notes', async () => {
    vi.spyOn(engine, 'ResolveLookup').mockResolvedValue('id-1');
    const c = collector();
    const result = await engine.ProcessFieldValue(
      { a: '@env:MJ_EF_A', b: ['@env:MJ_EF_B'], owner: '@lookup:MJ: Users.Email=someone@example.com' },
      dir, null, null, 0, undefined, c, 'Config'
    );
    expect(JSON.parse(result)).toEqual({ a: 'value-a', b: ['value-b'], owner: 'id-1' });
    expect(c.EnvFields?.get('Config')).toEqual(new Set(['MJ_EF_A', 'MJ_EF_B']));
    expect(c.notes).toEqual([]);
  });

  it('records a set ?optional leaf inside nested JSON', async () => {
    const c = collector();
    await engine.ProcessFieldValue({ auth: { key: '@env:MJ_EF_A?optional' } }, dir, null, null, 0, undefined, c, 'Config');
    expect(c.EnvFields?.get('Config')).toEqual(new Set(['MJ_EF_A']));
  });

  it('records nothing for a field when a later nested leaf has an unset ?optional variable', async () => {
    const c = collector();
    await expect(
      engine.ProcessFieldValue({ a: '@env:MJ_EF_A', b: '@env:MJ_EF_MISSING?optional' }, dir, null, null, 0, undefined, c, 'Config')
    ).rejects.toBeInstanceOf(OptionalEnvMissingError);
    expect(c.EnvFields?.has('Config')).toBe(false);
  });

  it('records nothing for a @file: JSON side file that falls back to text', async () => {
    await fs.writeJson(path.join(dir, 'config.json'), { a: '@env:MJ_EF_A', b: '@env:MJ_EF_MISSING?optional' });
    const c = collector();
    const result = await engine.ProcessFieldValue('@file:config.json', dir, null, null, 0, undefined, c, 'Config');
    expect(typeof result).toBe('string');
    expect(c.EnvFields?.has('Config')).toBe(false);
  });

  it('records a @parent: copy of an env-sourced value and labels the note', async () => {
    await engine.ProcessFieldValue('@env:MJ_EF_A', dir);
    const c = collector();
    const parent = stubRecord({ Token: 'value-a' });
    expect(await engine.ProcessFieldValue('@parent:Token', dir, parent, null, 0, undefined, c, 'ParentToken')).toBe('value-a');
    expect(c.EnvFields?.get('ParentToken')).toEqual(new Set(['MJ_EF_A']));
    expect(c.notes).toEqual([{ type: 'parent', field: 'fields.ParentToken', expression: '@parent:Token', resolved: '<from @env:MJ_EF_A>' }]);
    expect(JSON.stringify(c.notes)).not.toContain('value-a');
  });

  it('records a @parent: copy of a JSON value that holds an env value', async () => {
    await engine.ProcessFieldValue('@env:MJ_EF_A', dir);
    const c = collector();
    const parent = stubRecord({ Config: JSON.stringify({ apiKey: 'value-a' }) });
    await engine.ProcessFieldValue('@parent:Config', dir, parent, null, 0, undefined, c, 'ParentConfig');
    expect(c.EnvFields?.get('ParentConfig')).toEqual(new Set(['MJ_EF_A']));
    expect(JSON.stringify(c.notes)).not.toContain('value-a');
  });

  it('records an @owner: copy of an env-sourced key and labels the note', async () => {
    vi.stubEnv('MJ_EF_KEY', 'AAAA-1111');
    await engine.ProcessFieldValue('@env:MJ_EF_KEY', dir);
    const c = collector();
    const owner = stubRecord({ ID: 'aaaa-1111' });
    expect(await engine.ProcessFieldValue('@owner:ID', dir, null, null, 0, undefined, c, 'OwnerID', undefined, owner)).toBe('aaaa-1111');
    expect(c.EnvFields?.get('OwnerID')).toEqual(new Set(['MJ_EF_KEY']));
    expect(c.notes[0].resolved).toBe('<from @env:MJ_EF_KEY>');
  });

  it('labels a @parent: note without an EnvFields map', async () => {
    await engine.ProcessFieldValue('@env:MJ_EF_A', dir);
    await engine.ProcessFieldValue('@env:MJ_EF_B', dir);
    vi.stubEnv('MJ_EF_B', 'value-a');
    const c: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };
    await engine.ProcessFieldValue('@parent:Token', dir, stubRecord({ Token: 'value-a' }), null, 0, undefined, c, 'ParentToken');
    expect(c.notes[0].resolved).toBe('<from @env:MJ_EF_A, @env:MJ_EF_B>');
  });

  it('keeps the value in the note and records nothing for a @parent: value that is not env-sourced', async () => {
    await engine.ProcessFieldValue('@env:MJ_EF_A', dir);
    const c = collector();
    await engine.ProcessFieldValue('@parent:Name', dir, stubRecord({ Name: 'plain-name' }), null, 0, undefined, c, 'ParentName');
    expect(c.EnvFields?.has('ParentName')).toBe(false);
    expect(c.notes[0].resolved).toBe('plain-name');
  });

  it('records the variables of a @file: JSON side file', async () => {
    await fs.writeJson(path.join(dir, 'config.json'), { auth: { key: '@env:MJ_EF_A' } });
    const c = collector();
    await engine.ProcessFieldValue('@file:config.json', dir, null, null, 0, undefined, c, 'Config');
    expect(c.EnvFields?.get('Config')).toEqual(new Set(['MJ_EF_A']));
  });

  it('does not record lookup criteria as a field value, but lists the variable as resolved', async () => {
    vi.spyOn(engine, 'ResolveLookup').mockResolvedValue('id-1');
    const c = collector();
    await engine.ProcessFieldValue('@lookup:MJ: Users.Email=@env:MJ_EF_A', dir, null, null, 0, undefined, c, 'OwnerID');
    expect(c.EnvFields?.has('OwnerID')).toBe(false);
    expect(engine.ResolvedEnvVariables.has('MJ_EF_A')).toBe(true);
  });

  it('does not record a field whose optional variable is not set', async () => {
    const c = collector();
    await expect(
      engine.ProcessFieldValue('@env:MJ_EF_MISSING?optional', dir, null, null, 0, undefined, c, 'Token')
    ).rejects.toBeInstanceOf(OptionalEnvMissingError);
    expect(c.EnvFields?.has('Token')).toBe(false);
    expect(engine.ResolvedEnvVariables.has('MJ_EF_MISSING')).toBe(false);
  });

  it('works with a collector that has no EnvFields map', async () => {
    const c: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };
    expect(await engine.ProcessFieldValue('@env:MJ_EF_A', dir, null, null, 0, undefined, c, 'Token')).toBe('value-a');
    expect(c.EnvFields).toBeUndefined();
  });

  it('records env-sourced defaults through BuildDefaults', async () => {
    const c = collector();
    vi.spyOn(engine, 'ResolveLookup').mockResolvedValue('id-1');
    const defaults = await engine.BuildDefaults(
      path.join(dir, '.record.json'),
      { entity: 'MJ: Tags', defaults: { Token: '@env:MJ_EF_B', OwnerID: '@lookup:MJ: Users.Email=someone@example.com' } },
      c
    );
    expect(defaults).toEqual({ Token: 'value-b', OwnerID: 'id-1' });
    expect(c.EnvFields?.get('Token')).toEqual(new Set(['MJ_EF_B']));
    expect(c.notes).toEqual([]);
  });
});
