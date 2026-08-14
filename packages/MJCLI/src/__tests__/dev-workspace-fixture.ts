/**
 * Shared temp-directory fixture builder for the dev-workspace tests.
 * Not a test file — imported by the .test.ts files in this directory.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MemberPackageJson } from '../lib/dev-workspace/types.js';

/** Declarative description of one fake repo checkout under the fixture parent. */
export interface FixtureRepoSpec {
  /** Root package.json content; omit the property entirely for a dir with no manifest. */
  RootPackageJson?: MemberPackageJson;
  /** Write an mj-app.json marker file. */
  MjAppJson?: boolean;
  /** package.json contents keyed by directory name under the repo's packages dir. */
  Packages?: Record<string, MemberPackageJson>;
  /** Raw turbo.json contents. */
  TurboJson?: string;
  /** Create a .git directory (marks the dir as a git repo root). */
  GitDir?: boolean;
}

/** Creates a throwaway parent directory containing the described fake repos. */
export function CreateFixtureParent(repos: Record<string, FixtureRepoSpec>): string {
  const parent = mkdtempSync(path.join(tmpdir(), 'mj-devws-test-'));
  for (const [name, spec] of Object.entries(repos)) {
    writeFixtureRepo(path.join(parent, name), spec);
  }
  return parent;
}

/** Writes one fake repo checkout. */
function writeFixtureRepo(repoDir: string, spec: FixtureRepoSpec): void {
  mkdirSync(repoDir, { recursive: true });
  if (spec.RootPackageJson !== undefined) {
    writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify(spec.RootPackageJson, null, 2), 'utf8');
  }
  if (spec.MjAppJson === true) {
    writeFileSync(path.join(repoDir, 'mj-app.json'), JSON.stringify({ name: path.basename(repoDir) }), 'utf8');
  }
  for (const [pkgDir, pkgJson] of Object.entries(spec.Packages ?? {})) {
    const dir = path.join(repoDir, 'packages', pkgDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');
  }
  if (spec.TurboJson !== undefined) {
    writeFileSync(path.join(repoDir, 'turbo.json'), spec.TurboJson, 'utf8');
  }
  if (spec.GitDir === true) {
    mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  }
}

/** Removes a fixture parent created by {@link CreateFixtureParent}. */
export function RemoveFixture(parent: string): void {
  rmSync(parent, { recursive: true, force: true });
}
