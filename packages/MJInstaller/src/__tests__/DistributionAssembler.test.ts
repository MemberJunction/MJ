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
import { DistributionAssembler, distributionSourcePaths, type WriteOp } from '../distribution/DistributionAssembler.js';

let sourceDir: string;

async function writeUnder(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, ...rel.split('/'));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

/** Seed every required distribution source path EXCEPT the migration trees. */
async function seedBaseFixture(dir: string): Promise<void> {
  // Root distribution templates + base tsconfigs
  await writeUnder(dir, 'tsconfig.server.json', '{ "compilerOptions": { "module": "es2022" } }');
  await writeUnder(dir, 'tsconfig.angular.json', '{ "compilerOptions": { "target": "es2022" } }');
  await writeUnder(dir, 'distribution.package.json', '{ "name": "memberjunction-distribution" }');
  await writeUnder(dir, 'distribution.turbo.json', '{ "tasks": {} }');
  await writeUnder(dir, 'distribution.config.cjs', 'module.exports = {};');
  await writeUnder(dir, 'distribution.README.md', '# Distribution');
  await writeUnder(dir, 'install.config.json', '{}');
  await writeUnder(dir, 'packages/Update_MemberJunction_Packages_To_Latest.ps1', '# update script');

  // MJAPI (server) — has tsc-alias and a generated dir + node_modules to exclude
  await writeUnder(dir, 'packages/MJAPI/package.json', '{ "name": "mj_api", "scripts": { "build": "tsc && tsc-alias -f" } }');
  await writeUnder(
    dir,
    'packages/MJAPI/tsconfig.json',
    '{ "extends": "../../tsconfig.server.json", "compilerOptions": { "outDir": "dist" }, "exclude": ["../../node_modules", "dist"] }',
  );
  await writeUnder(dir, 'packages/MJAPI/src/index.ts', 'export const x = 1;');
  await writeUnder(dir, 'packages/MJAPI/src/generated/gen.ts', 'export const g = 1;');
  await writeUnder(dir, 'packages/MJAPI/node_modules/dep/index.js', 'module.exports = 1;');

  // MJExplorer (angular) — port flag, ng-bootstrap alias, environments + generated to exclude
  await writeUnder(dir, 'packages/MJExplorer/package.json', '{ "name": "mj_explorer", "scripts": { "start": "ng serve --port 4201" } }');
  await writeUnder(
    dir,
    'packages/MJExplorer/tsconfig.json',
    '{ "extends": "../../tsconfig.angular.json", "compilerOptions": { "paths": { "@memberjunction/ng-bootstrap": ["x"] } } }',
  );
  await writeUnder(dir, 'packages/MJExplorer/angular.json', '{ "version": 1 }');
  await writeUnder(dir, 'packages/MJExplorer/src/main.ts', 'bootstrap();');
  await writeUnder(dir, 'packages/MJExplorer/src/environments/environment.ts', 'export const secret = 1;');
  await writeUnder(dir, 'packages/MJExplorer/src/app/generated/form.ts', 'export const f = 1;');
  await writeUnder(dir, 'packages/MJExplorer/kendo-ui-license.txt', 'LICENSE');

  // Generated packages (server)
  await writeUnder(dir, 'packages/GeneratedEntities/package.json', '{ "name": "mj_generatedentities", "scripts": { "build": "tsc && tsc-alias" } }');
  await writeUnder(dir, 'packages/GeneratedEntities/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeUnder(dir, 'packages/GeneratedEntities/src/index.ts', 'export const e = 1;');
  await writeUnder(dir, 'packages/GeneratedActions/package.json', '{ "name": "mj_generatedactions", "scripts": { "build": "tsc" } }');
  await writeUnder(dir, 'packages/GeneratedActions/tsconfig.json', '{ "extends": "../../tsconfig.server.json" }');
  await writeUnder(dir, 'packages/GeneratedActions/src/index.ts', 'export const a = 1;');

  // SQL Scripts — keep MJ_Base.sql, drop _all_entities / generated / internal_only
  await writeUnder(dir, 'SQL Scripts/MJ_Base.sql', 'CREATE TABLE x;');
  await writeUnder(dir, 'SQL Scripts/_all_entities.sql', 'ALL');
  await writeUnder(dir, 'SQL Scripts/generated/gen.sql', 'GEN');
  await writeUnder(dir, 'SQL Scripts/internal_only/secret.sql', 'SECRET');
}

function dests(ops: readonly WriteOp[]): string[] {
  return ops.map((o) => o.Dest);
}

function byDest(ops: readonly WriteOp[], dest: string): WriteOp | undefined {
  return ops.find((o) => o.Dest === dest);
}

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), 'mj-asm-src-'));
  await seedBaseFixture(sourceDir);

  // Both migration trees (only included on demand) — SQL Server + PostgreSQL
  await writeUnder(sourceDir, 'migrations/v5/V202601010000__x.sql', 'MIGRATION');
  await writeUnder(sourceDir, 'migrations/CLAUDE.md', '# docs');
  await writeUnder(sourceDir, 'migrations-pg/v5/V202601010000__x.sql', 'PG MIGRATION');
  await writeUnder(sourceDir, 'migrations-pg/CLAUDE.md', '# docs');
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

describe('distributionSourcePaths', () => {
  it('lists no migration dirs by default', () => {
    const paths = distributionSourcePaths();
    expect(paths.some((p) => p === 'migrations' || p === 'migrations-pg')).toBe(false);
  });

  it('includes both migration dirs when migrations are requested with no platform', () => {
    const paths = distributionSourcePaths(true);
    expect(paths).toContain('migrations');
    expect(paths).toContain('migrations-pg');
  });

  it('includes only the sqlserver dir when narrowed to sqlserver', () => {
    const paths = distributionSourcePaths(true, 'sqlserver');
    expect(paths).toContain('migrations');
    expect(paths).not.toContain('migrations-pg');
  });

  it('includes only the postgresql dir when narrowed to postgresql', () => {
    const paths = distributionSourcePaths(true, 'postgresql');
    expect(paths).toContain('migrations-pg');
    expect(paths).not.toContain('migrations');
  });
});

describe('DistributionAssembler migration platform selection', () => {
  it('includes both SQL Server and PostgreSQL trees by default', async () => {
    const d = dests(await new DistributionAssembler().Plan({ SourceDir: sourceDir, IncludeMigrations: true }));
    expect(d).toContain('migrations/v5/V202601010000__x.sql');
    expect(d).toContain('migrations-pg/v5/V202601010000__x.sql');
  });

  it('ships only the SQL Server tree when narrowed to sqlserver', async () => {
    const d = dests(await new DistributionAssembler().Plan({ SourceDir: sourceDir, IncludeMigrations: true, MigrationPlatform: 'sqlserver' }));
    expect(d).toContain('migrations/v5/V202601010000__x.sql');
    expect(d.some((p) => p.startsWith('migrations-pg/'))).toBe(false);
  });

  it('ships only the PostgreSQL tree when narrowed to postgresql', async () => {
    const d = dests(await new DistributionAssembler().Plan({ SourceDir: sourceDir, IncludeMigrations: true, MigrationPlatform: 'postgresql' }));
    expect(d).toContain('migrations-pg/v5/V202601010000__x.sql');
    // the SQL Server tree (a path under migrations/ that is not migrations-pg/) is absent
    expect(d.some((p) => p.startsWith('migrations/'))).toBe(false);
  });

  it('default selection silently skips a tree that is absent at the source', async () => {
    const sqlOnly = await mkdtemp(path.join(tmpdir(), 'mj-asm-sqlonly-'));
    try {
      await seedBaseFixture(sqlOnly);
      await writeUnder(sqlOnly, 'migrations/v5/V1__x.sql', 'M'); // no migrations-pg/
      const d = dests(await new DistributionAssembler().Plan({ SourceDir: sqlOnly, IncludeMigrations: true }));
      expect(d).toContain('migrations/v5/V1__x.sql');
      expect(d.some((p) => p.startsWith('migrations-pg/'))).toBe(false);
    } finally {
      await rm(sqlOnly, { recursive: true, force: true });
    }
  });

  it('throws when an explicitly-selected tree is missing at the source', async () => {
    const sqlOnly = await mkdtemp(path.join(tmpdir(), 'mj-asm-explicit-'));
    try {
      await seedBaseFixture(sqlOnly);
      await writeUnder(sqlOnly, 'migrations/v5/V1__x.sql', 'M'); // no migrations-pg/
      await expect(new DistributionAssembler().Plan({ SourceDir: sqlOnly, IncludeMigrations: true, MigrationPlatform: 'postgresql' })).rejects.toThrow(
        /migrations-pg/,
      );
    } finally {
      await rm(sqlOnly, { recursive: true, force: true });
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
