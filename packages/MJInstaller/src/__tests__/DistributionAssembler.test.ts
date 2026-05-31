/**
 * Tests for DistributionAssembler against a real temp fixture tree.
 *
 * Verifies the layout transforms ported from CreateMJDistribution.js: dir-rename,
 * tsconfig flattening, script stripping, exclusions, root-file mapping, the
 * conditional migrations slice, and the dir/zip sinks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { DistributionAssembler, type WriteOp } from '../distribution/DistributionAssembler.js';

let sourceDir: string;

async function writeFixtureFile(rel: string, content: string): Promise<void> {
  const abs = path.join(sourceDir, ...rel.split('/'));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

function dests(ops: readonly WriteOp[]): string[] {
  return ops.map((o) => o.Dest);
}

function byDest(ops: readonly WriteOp[], dest: string): WriteOp | undefined {
  return ops.find((o) => o.Dest === dest);
}

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), 'mj-asm-src-'));

  // Root distribution templates + base tsconfigs
  await writeFixtureFile('tsconfig.server.json', '{ "compilerOptions": { "module": "es2022" } }');
  await writeFixtureFile('tsconfig.angular.json', '{ "compilerOptions": { "target": "es2022" } }');
  await writeFixtureFile('distribution.package.json', '{ "name": "memberjunction-distribution" }');
  await writeFixtureFile('distribution.turbo.json', '{ "tasks": {} }');
  await writeFixtureFile('distribution.config.cjs', 'module.exports = {};');
  await writeFixtureFile('distribution.README.md', '# Distribution');
  await writeFixtureFile('install.config.json', '{}');
  await writeFixtureFile('packages/Update_MemberJunction_Packages_To_Latest.ps1', '# update script');

  // MJAPI (server) — has tsc-alias and a generated dir + node_modules to exclude
  await writeFixtureFile('packages/MJAPI/package.json', '{ "name": "mj_api", "scripts": { "build": "tsc && tsc-alias -f" } }');
  await writeFixtureFile('packages/MJAPI/tsconfig.json', '{ "extends": "../../tsconfig.server.json", "compilerOptions": { "outDir": "dist" }, "exclude": ["../../node_modules", "dist"] }');
  await writeFixtureFile('packages/MJAPI/src/index.ts', 'export const x = 1;');
  await writeFixtureFile('packages/MJAPI/src/generated/gen.ts', 'export const g = 1;');
  await writeFixtureFile('packages/MJAPI/node_modules/dep/index.js', 'module.exports = 1;');

  // MJExplorer (angular) — port flag, ng-bootstrap alias, environments + generated to exclude
  await writeFixtureFile('packages/MJExplorer/package.json', '{ "name": "mj_explorer", "scripts": { "start": "ng serve --port 4201" } }');
  await writeFixtureFile('packages/MJExplorer/tsconfig.json', '{ "extends": "../../tsconfig.angular.json", "compilerOptions": { "paths": { "@memberjunction/ng-bootstrap": ["x"] } } }');
  await writeFixtureFile('packages/MJExplorer/angular.json', '{ "version": 1 }');
  await writeFixtureFile('packages/MJExplorer/src/main.ts', 'bootstrap();');
  await writeFixtureFile('packages/MJExplorer/src/environments/environment.ts', 'export const secret = 1;');
  await writeFixtureFile('packages/MJExplorer/src/app/generated/form.ts', 'export const f = 1;');
  await writeFixtureFile('packages/MJExplorer/kendo-ui-license.txt', 'LICENSE');

  // Generated packages (server)
  await writeFixtureFile('packages/GeneratedEntities/package.json', '{ "name": "mj_generatedentities", "scripts": { "build": "tsc && tsc-alias" } }');
  await writeFixtureFile('packages/GeneratedEntities/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeFixtureFile('packages/GeneratedEntities/src/index.ts', 'export const e = 1;');
  await writeFixtureFile('packages/GeneratedActions/package.json', '{ "name": "mj_generatedactions", "scripts": { "build": "tsc" } }');
  await writeFixtureFile('packages/GeneratedActions/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeFixtureFile('packages/GeneratedActions/src/index.ts', 'export const a = 1;');

  // SQL Scripts — keep MJ_Base.sql, drop _all_entities / generated / internal_only
  await writeFixtureFile('SQL Scripts/MJ_Base.sql', 'CREATE TABLE x;');
  await writeFixtureFile('SQL Scripts/_all_entities.sql', 'ALL');
  await writeFixtureFile('SQL Scripts/generated/gen.sql', 'GEN');
  await writeFixtureFile('SQL Scripts/internal_only/secret.sql', 'SECRET');

  // Migrations (only included on demand)
  await writeFixtureFile('migrations/v5/V202601010000__x.sql', 'MIGRATION');
  await writeFixtureFile('migrations/CLAUDE.md', '# docs');
});

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
});

describe('DistributionAssembler.Plan', () => {
  it('renames app dirs and includes kept source files', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const d = dests(ops);
    expect(d).toContain('apps/MJAPI/src/index.ts');
    expect(d).toContain('apps/MJExplorer/src/main.ts');
    expect(d).toContain('apps/MJExplorer/angular.json');
    expect(d).toContain('packages/GeneratedEntities/src/index.ts');
    expect(d).toContain('packages/GeneratedActions/src/index.ts');
    expect(d).toContain('SQL Scripts/MJ_Base.sql');
  });

  it('excludes generated, node_modules, environments, kendo, and SQL exclusions', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const d = dests(ops);
    expect(d).not.toContain('apps/MJAPI/src/generated/gen.ts');
    expect(d.some((p) => p.includes('node_modules'))).toBe(false);
    expect(d).not.toContain('apps/MJExplorer/src/environments/environment.ts');
    expect(d).not.toContain('apps/MJExplorer/src/app/generated/form.ts');
    expect(d).not.toContain('apps/MJExplorer/kendo-ui-license.txt');
    expect(d).not.toContain('SQL Scripts/_all_entities.sql');
    expect(d).not.toContain('SQL Scripts/generated/gen.sql');
    expect(d).not.toContain('SQL Scripts/internal_only/secret.sql');
  });

  it('emits an empty SQL Scripts/generated directory marker', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const op = byDest(ops, 'SQL Scripts/generated');
    expect(op).toBeDefined();
    expect(op?.Kind).toBe('emptyDir');
  });

  it('flattens server tsconfig and strips tsc-alias from package.json', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const tsconfigOp = byDest(ops, 'apps/MJAPI/tsconfig.json');
    const pkgOp = byDest(ops, 'apps/MJAPI/package.json');
    expect(tsconfigOp?.Kind).toBe('content');
    expect(pkgOp?.Kind).toBe('content');
    if (tsconfigOp?.Kind !== 'content' || pkgOp?.Kind !== 'content') throw new Error('expected content ops');

    const tsconfig = JSON.parse(tsconfigOp.Text) as { extends?: string; compilerOptions: Record<string, unknown>; exclude?: string[] };
    expect(tsconfig.extends).toBeUndefined();
    expect(tsconfig.compilerOptions.module).toBe('es2022'); // inlined from base
    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(tsconfig.exclude).toEqual(['dist']); // ../../node_modules dropped

    const pkg = JSON.parse(pkgOp.Text) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toBe('tsc');
  });

  it('flattens angular tsconfig (drops ng-bootstrap alias) and strips --port', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const tsconfigOp = byDest(ops, 'apps/MJExplorer/tsconfig.json');
    const pkgOp = byDest(ops, 'apps/MJExplorer/package.json');
    if (tsconfigOp?.Kind !== 'content' || pkgOp?.Kind !== 'content') throw new Error('expected content ops');

    const tsconfig = JSON.parse(tsconfigOp.Text) as { compilerOptions: { paths?: unknown } };
    expect(tsconfig.compilerOptions.paths).toBeUndefined();

    const pkg = JSON.parse(pkgOp.Text) as { scripts: Record<string, string> };
    expect(pkg.scripts.start).toBe('ng serve');
  });

  it('maps the root distribution files', async () => {
    const ops = await new DistributionAssembler().Plan({ SourceDir: sourceDir });
    const pkg = byDest(ops, 'package.json');
    expect(pkg?.Kind).toBe('copy');
    if (pkg?.Kind === 'copy') expect(pkg.SourceAbs).toContain('distribution.package.json');
    const d = dests(ops);
    expect(d).toContain('turbo.json');
    expect(d).toContain('mj.config.cjs');
    expect(d).toContain('README.md');
    expect(d).toContain('install.config.json');
    expect(d).toContain('Update_MemberJunction_Packages_To_Latest.ps1');
  });

  it('omits migrations by default and includes the slice (minus docs) on demand', async () => {
    const without = dests(await new DistributionAssembler().Plan({ SourceDir: sourceDir }));
    expect(without.some((p) => p.startsWith('migrations/'))).toBe(false);

    const withMig = dests(await new DistributionAssembler().Plan({ SourceDir: sourceDir, IncludeMigrations: true }));
    expect(withMig).toContain('migrations/v5/V202601010000__x.sql');
    expect(withMig).not.toContain('migrations/CLAUDE.md');
  });

  it('throws when required source paths are missing', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'mj-asm-empty-'));
    try {
      await expect(new DistributionAssembler().Plan({ SourceDir: empty })).rejects.toThrow(/missing required path/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('DistributionAssembler sinks', () => {
  it('AssembleToDir writes transformed files to disk', async () => {
    const dest = await mkdtemp(path.join(tmpdir(), 'mj-asm-dest-'));
    try {
      await new DistributionAssembler().AssembleToDir({ SourceDir: sourceDir }, dest);
      const apiPkg = JSON.parse(await readFile(path.join(dest, 'apps', 'MJAPI', 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
      expect(apiPkg.scripts.build).toBe('tsc');
      const angularJson = await readFile(path.join(dest, 'apps', 'MJExplorer', 'angular.json'), 'utf-8');
      expect(JSON.parse(angularJson)).toEqual({ version: 1 });
      const rootEntries = await readdir(dest);
      expect(rootEntries).toContain('package.json');
      expect(rootEntries).not.toContain('migrations');
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  it('AssembleToZip produces a zip whose entries match the plan', async () => {
    const zipDir = await mkdtemp(path.join(tmpdir(), 'mj-asm-zip-'));
    const zipPath = path.join(zipDir, 'dist.zip');
    try {
      const ops = await new DistributionAssembler().AssembleToZip({ SourceDir: sourceDir }, zipPath);
      const zip = new AdmZip(zipPath);
      const entryNames = new Set(zip.getEntries().map((e) => e.entryName));
      for (const op of ops) {
        const expected = op.Kind === 'emptyDir' ? `${op.Dest}/` : op.Dest;
        expect(entryNames.has(expected)).toBe(true);
      }
      expect(entryNames.has('apps/MJAPI/src/index.ts')).toBe(true);
      expect(entryNames.has('package.json')).toBe(true);
    } finally {
      await rm(zipDir, { recursive: true, force: true });
    }
  });
});
