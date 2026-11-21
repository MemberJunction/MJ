/**
 * `.mj-folder.json` defaults: SyncEngine.BuildDefaults walks from the record file's folder up to
 * the sync root, and validation does not treat `.mj-folder.json` as an entity config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public EntityByName(): null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { SyncEngine } from '../lib/sync-engine';
import type { SyncResolutionCollector } from '../lib/sync-engine';
import { ValidationService } from '../services/ValidationService';

describe('SyncEngine.BuildDefaults — .mj-folder.json', () => {
  let outer: string;
  let root: string;
  let engine: SyncEngine;

  beforeEach(async () => {
    outer = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-folder-defaults-'));
    root = path.join(outer, 'metadata');
    await fs.ensureDir(path.join(root, 'widgets', 'sub'));
    await fs.writeJson(path.join(outer, '.mj-folder.json'), { defaults: { Outside: 'outer' } });
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0' });
    await fs.writeJson(path.join(root, '.mj-folder.json'), { defaults: { A: 'root', B: 'root' } });
    await fs.writeJson(path.join(root, 'widgets', '.mj-sync.json'), { entity: 'MJ: Widgets' });
    await fs.writeJson(path.join(root, 'widgets', '.mj-folder.json'), { defaults: { B: 'widgets' } });
    await fs.writeJson(path.join(root, 'widgets', 'sub', '.mj-folder.json'), { defaults: { C: '@env:MJ_FOLDER_C' } });
    vi.stubEnv('MJ_FOLDER_C', 'from-env');
    engine = new SyncEngine({} as UserInfo);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.remove(outer);
  });

  it('applies folder defaults from the sync root down to the file folder, deeper folders winning', async () => {
    const defaults = await engine.BuildDefaults(path.join(root, 'widgets', 'sub', '.w.json'), {
      entity: 'MJ: Widgets',
      defaults: { A: 'entity', D: 'entity' },
    });

    expect(defaults).toEqual({ A: 'root', B: 'widgets', C: 'from-env', D: 'entity' });
  });

  it('does not read .mj-folder.json above the sync root', async () => {
    const defaults = await engine.BuildDefaults(path.join(root, 'widgets', '.w.json'), { entity: 'MJ: Widgets' });

    expect(defaults).toEqual({ A: 'root', B: 'widgets' });
    expect(defaults).not.toHaveProperty('Outside');
  });

  it('records an env-sourced folder default in the collector', async () => {
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };

    await engine.BuildDefaults(path.join(root, 'widgets', 'sub', '.w.json'), { entity: 'MJ: Widgets' }, collector);

    expect(collector.EnvFields?.get('C')).toEqual(new Set(['MJ_FOLDER_C']));
  });

  it('treats a .mj-sync.json with an empty entity as the sync root', async () => {
    await fs.writeJson(path.join(root, '.mj-sync.json'), { entity: '' });

    const defaults = await engine.BuildDefaults(path.join(root, 'widgets', '.w.json'), { entity: 'MJ: Widgets' });

    expect(defaults).toEqual({ A: 'root', B: 'widgets' });
  });

  it('leaves out a default whose optional variable is not set, and keeps the others', async () => {
    await fs.writeJson(path.join(root, 'widgets', 'sub', '.mj-folder.json'), {
      defaults: { C: '@env:MJ_FOLDER_C', E: '@env:MJ_FOLDER_MISSING?optional' },
    });
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields', EnvFields: new Map() };
    const skipped = new Map<string, string>();

    const defaults = await engine.BuildDefaults(path.join(root, 'widgets', 'sub', '.w.json'), { entity: 'MJ: Widgets' }, collector, skipped);

    expect(defaults).toEqual({ A: 'root', B: 'widgets', C: 'from-env' });
    expect(skipped).toEqual(new Map([['E', 'MJ_FOLDER_MISSING']]));
    expect(collector.EnvFields?.has('E')).toBe(false);
  });
});

describe('ValidationService — .mj-folder.json is not an entity config', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-folder-validate-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0' });
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  async function errors(): Promise<string[]> {
    const result = await new ValidationService({}).ValidateDirectory(root);
    return result.errors.map((e) => e.message);
  }

  it('validates an entity folder that has a defaults-only .mj-folder.json', async () => {
    await fs.ensureDir(path.join(root, 'widgets'));
    await fs.writeJson(path.join(root, 'widgets', '.mj-sync.json'), { entity: 'Entity widgets' });
    await fs.writeJson(path.join(root, 'widgets', '.mj-folder.json'), { defaults: { Status: 'Active' } });

    const messages = await errors();

    expect(messages).toContain('Entity "Entity widgets" not found in metadata');
    expect(messages.some((m) => m.includes('.mj-folder.json'))).toBe(false);
  });

  it('does not validate a folder that has only a .mj-folder.json', async () => {
    await fs.ensureDir(path.join(root, 'loose'));
    await fs.writeJson(path.join(root, 'loose', '.mj-folder.json'), { entityName: 'Entity loose', defaults: {} });

    expect(await errors()).toEqual([]);
  });
});
