/**
 * Tests for createDistributionBundle. The DistributionAssembler runs for real
 * against a temp fixture; RepoFetcher is mocked so the ref path does no network I/O.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

interface FetchResult {
  Dir: string;
  UsedFallback: boolean;
  Cleanup: () => Promise<void>;
}

const mockFetchPaths = vi.fn<(opts: { RepoUrl: string; Ref: string; Paths: readonly string[] }) => Promise<FetchResult>>();
vi.mock('../adapters/RepoFetcher.js', () => ({
  RepoFetcher: function RepoFetcher() {
    return { FetchPaths: mockFetchPaths };
  },
}));

import { createDistributionBundle } from '../distribution/createBundle.js';

let fixtureDir: string;

async function writeFixtureFile(rel: string, content: string): Promise<void> {
  const abs = path.join(fixtureDir, ...rel.split('/'));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), 'mj-bundle-src-'));
  await writeFixtureFile('tsconfig.server.json', '{ "compilerOptions": { "module": "es2022" } }');
  await writeFixtureFile('tsconfig.angular.json', '{ "compilerOptions": { "target": "es2022" } }');
  await writeFixtureFile('distribution.package.json', '{ "name": "memberjunction-distribution" }');
  await writeFixtureFile('distribution.turbo.json', '{ "tasks": {} }');
  await writeFixtureFile('distribution.config.cjs', 'module.exports = {};');
  await writeFixtureFile('distribution.README.md', '# Distribution');
  await writeFixtureFile('install.config.json', '{}');
  await writeFixtureFile('packages/Update_MemberJunction_Packages_To_Latest.ps1', '# update script');
  await writeFixtureFile('packages/MJAPI/package.json', '{ "name": "mj_api", "scripts": { "build": "tsc && tsc-alias -f" } }');
  await writeFixtureFile('packages/MJAPI/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeFixtureFile('packages/MJAPI/src/index.ts', 'export const x = 1;');
  await writeFixtureFile('packages/MJExplorer/package.json', '{ "name": "mj_explorer", "scripts": { "start": "ng serve --port 4201" } }');
  await writeFixtureFile('packages/MJExplorer/tsconfig.json', '{ "extends": "../../tsconfig.angular.json" }');
  await writeFixtureFile('packages/MJExplorer/angular.json', '{ "version": 1 }');
  await writeFixtureFile('packages/MJExplorer/src/main.ts', 'bootstrap();');
  await writeFixtureFile('packages/GeneratedEntities/package.json', '{ "name": "mj_generatedentities" }');
  await writeFixtureFile('packages/GeneratedEntities/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeFixtureFile('packages/GeneratedEntities/src/index.ts', 'export const e = 1;');
  await writeFixtureFile('packages/GeneratedActions/package.json', '{ "name": "mj_generatedactions" }');
  await writeFixtureFile('packages/GeneratedActions/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeFixtureFile('packages/GeneratedActions/src/index.ts', 'export const a = 1;');
  await writeFixtureFile('SQL Scripts/MJ_Base.sql', 'CREATE TABLE x;');
  await writeFixtureFile('migrations/v5/V202601010000__x.sql', 'MIGRATION');
  await writeFixtureFile('migrations-pg/v5/V202601010000__x.sql', 'PG MIGRATION');
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe('createDistributionBundle', () => {
  it('bundles from a local source directory into a zip', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'mj-bundle-out-'));
    const out = path.join(outDir, 'dist.zip');
    try {
      const result = await createDistributionBundle({ SourceDir: fixtureDir, Out: out });
      expect(result.Source).toBe('local');
      expect(result.EntryCount).toBeGreaterThan(0);
      await expect(stat(out)).resolves.toBeDefined();
      const names = new Set(new AdmZip(out).getEntries().map((e) => e.entryName));
      expect(names.has('package.json')).toBe(true);
      expect(names.has('apps/MJAPI/src/index.ts')).toBe(true);
      expect([...names].some((n) => n.startsWith('migrations/'))).toBe(false); // omitted by default
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('includes both migration trees by default when requested', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'mj-bundle-mig-'));
    const out = path.join(outDir, 'dist.zip');
    try {
      await createDistributionBundle({ SourceDir: fixtureDir, Out: out, IncludeMigrations: true });
      const names = new Set(new AdmZip(out).getEntries().map((e) => e.entryName));
      expect(names.has('migrations/v5/V202601010000__x.sql')).toBe(true);
      expect(names.has('migrations-pg/v5/V202601010000__x.sql')).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('narrows bundled migrations to one platform via MigrationPlatform', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'mj-bundle-pg-'));
    const out = path.join(outDir, 'dist.zip');
    try {
      await createDistributionBundle({ SourceDir: fixtureDir, Out: out, IncludeMigrations: true, MigrationPlatform: 'postgresql' });
      const names = new Set(new AdmZip(out).getEntries().map((e) => e.entryName));
      expect(names.has('migrations-pg/v5/V202601010000__x.sql')).toBe(true);
      expect([...names].some((n) => n.startsWith('migrations/'))).toBe(false);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('fetches via RepoFetcher for a ref and cleans up the temp clone', async () => {
    const cleanup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    mockFetchPaths.mockResolvedValue({ Dir: fixtureDir, UsedFallback: true, Cleanup: cleanup });
    const outDir = await mkdtemp(path.join(tmpdir(), 'mj-bundle-ref-'));
    const out = path.join(outDir, 'dist.zip');
    try {
      const result = await createDistributionBundle({ Ref: 'v1.0.0', RepoUrl: 'url', Out: out });
      expect(mockFetchPaths).toHaveBeenCalledWith(expect.objectContaining({ Ref: 'v1.0.0', RepoUrl: 'url' }));
      expect(result.Source).toBe('fetch');
      expect(result.UsedFallback).toBe(true);
      expect(cleanup).toHaveBeenCalled();
      await expect(stat(out)).resolves.toBeDefined();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('throws when neither SourceDir nor Ref is provided', async () => {
    await expect(createDistributionBundle({ Out: '/tmp/none.zip' })).rejects.toThrow(/SourceDir or Ref/);
  });
});
