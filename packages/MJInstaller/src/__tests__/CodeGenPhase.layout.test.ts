/**
 * CodeGenPhase artifact check against REAL on-disk layouts.
 *
 * `CodeGenPhase.test.ts` mocks the filesystem; this file builds the directory trees a package
 * manager actually leaves behind — including pnpm's relative symlinks — and runs the phase with
 * the real {@link FileSystemAdapter}. Only the process runner is mocked, so `mj codegen` and every
 * build "succeed" without running.
 *
 * The layouts are the ones observed on disk (R33): pnpm links a workspace package into the
 * `node_modules` of each package that declares it and never creates a root entry, so
 * `mj_generatedentities` exists at `apps/MJAPI/node_modules` (distribution) or
 * `packages/MJAPI/node_modules` (monorepo) from the moment `pnpm install` finished.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter } from './mocks/emitter.js';

const mockRunner = createMockProcessRunner();

vi.mock('../adapters/ProcessRunner.js', () => ({
  ProcessRunner: vi.fn(function () { return mockRunner; }),
}));

import { CodeGenPhase } from '../phases/CodeGenPhase.js';

/** Install-root-relative path of MJAPI in each layout. */
const MJAPI_DIR = { distribution: path.join('apps', 'MJAPI'), monorepo: path.join('packages', 'MJAPI') } as const;

type Layout = keyof typeof MJAPI_DIR;

let root: string;

/** Write a file, creating its parent directories. */
async function writeFile(relativePath: string, content: string): Promise<void> {
  const full = path.join(root, relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

/**
 * The tree CodeGen leaves in either layout: the GeneratedEntities package with the barrel CodeGen
 * writes, and MJAPI declaring the package. The monorepo additionally has `packages/MJCoreEntities`.
 */
async function scaffold(layout: Layout): Promise<void> {
  await writeFile(path.join('packages', 'GeneratedEntities', 'package.json'), '{ "name": "mj_generatedentities", "version": "1.0.0" }');
  await writeFile(path.join('packages', 'GeneratedEntities', 'src', 'generated', 'entity_subclasses.ts'), 'export {};\n');
  await writeFile(path.join(MJAPI_DIR[layout], 'package.json'), '{ "name": "mj_api", "dependencies": { "mj_generatedentities": "1.0.0" } }');
  if (layout === 'monorepo') {
    await fs.mkdir(path.join(root, 'packages', 'MJCoreEntities'), { recursive: true });
  }
}

/** Link `<fromDir>/node_modules/mj_generatedentities` to the package with a relative symlink, as pnpm and npm do. */
async function linkGeneratedEntities(fromDir: string): Promise<void> {
  const nodeModules = path.join(root, fromDir, 'node_modules');
  await fs.mkdir(nodeModules, { recursive: true });
  const target = path.relative(nodeModules, path.join(root, 'packages', 'GeneratedEntities'));
  await fs.symlink(target, path.join(nodeModules, 'mj_generatedentities'), 'junction');
}

/** How many times `mj codegen` ran. */
function codegenRuns(): number {
  return mockRunner.Run.mock.calls.filter((c: [string, string[]]) => c[1].includes('codegen')).length;
}

async function runPhase(): Promise<Awaited<ReturnType<CodeGenPhase['Run']>>> {
  const { emitter } = createMockEmitter();
  return new CodeGenPhase().Run({ Dir: root, Emitter: emitter, Fast: true, PackageManager: 'pnpm', VersionTag: 'v6.2.0' });
}

describe('CodeGenPhase on real package-manager layouts', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-codegen-layout-'));
    mockRunner.Run.mockReset();
    mockRunner.Run.mockResolvedValue({ ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('passes the first attempt on a pnpm distribution install (link only under apps/MJAPI)', async () => {
    await scaffold('distribution');
    await linkGeneratedEntities(MJAPI_DIR.distribution);

    const result = await runPhase();

    expect(result).toMatchObject({ Success: true, ArtifactsVerified: true, RetryUsed: false });
    expect(codegenRuns()).toBe(1);
  });

  it('passes the first attempt on a pnpm monorepo install (link only under packages/MJAPI)', async () => {
    await scaffold('monorepo');
    await linkGeneratedEntities(MJAPI_DIR.monorepo);

    const result = await runPhase();

    expect(result).toMatchObject({ Success: true, RetryUsed: false });
    expect(codegenRuns()).toBe(1);
  });

  it('passes on an npm install, which hoists the link to the install root', async () => {
    await scaffold('distribution');
    await linkGeneratedEntities('.');

    expect((await runPhase()).RetryUsed).toBe(false);
  });

  it('fails without a rebuild or a second codegen run when nothing links the package', async () => {
    await scaffold('distribution');

    await expect(runPhase()).rejects.toMatchObject({ Code: 'CODEGEN_FAILED' });
    expect(codegenRuns()).toBe(1);
    expect(mockRunner.Run.mock.calls.some((c: [string, string[]]) => c[1].includes('build'))).toBe(false);
  });

  it('does not count a dangling link as the package', async () => {
    await scaffold('distribution');
    await linkGeneratedEntities(MJAPI_DIR.distribution);
    await fs.rm(path.join(root, 'packages', 'GeneratedEntities'), { recursive: true, force: true });

    await expect(runPhase()).rejects.toMatchObject({ Code: 'CODEGEN_FAILED' });
  });
});
