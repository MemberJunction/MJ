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
  /** package.json contents keyed by directory path under the repo's packages dir (may be nested, e.g. `AI/Engine`). */
  Packages?: Record<string, MemberPackageJson>;
  /** Raw turbo.json contents. */
  TurboJson?: string;
  /** Raw contents of the repo's own pnpm-workspace.yaml. */
  PnpmWorkspaceYaml?: string;
  /** Raw contents of a committed pnpm-lock.yaml. */
  PnpmLock?: string;
  /** Raw contents of a committed package-lock.json. */
  NpmLock?: string;
  /** Extra files keyed by repo-relative path (parent dirs auto-created) — patches, nested manifests, etc. */
  Files?: Record<string, string>;
  /** Repo-relative dirs to create as fake standalone-install `node_modules` trees (each gets a marker file). */
  NodeModulesDirs?: string[];
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
  if (spec.PnpmWorkspaceYaml !== undefined) {
    writeFileSync(path.join(repoDir, 'pnpm-workspace.yaml'), spec.PnpmWorkspaceYaml, 'utf8');
  }
  if (spec.PnpmLock !== undefined) {
    writeFileSync(path.join(repoDir, 'pnpm-lock.yaml'), spec.PnpmLock, 'utf8');
  }
  if (spec.NpmLock !== undefined) {
    writeFileSync(path.join(repoDir, 'package-lock.json'), spec.NpmLock, 'utf8');
  }
  for (const [relPath, content] of Object.entries(spec.Files ?? {})) {
    const filePath = path.join(repoDir, relPath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
  for (const relDir of spec.NodeModulesDirs ?? []) {
    const dir = path.join(repoDir, relDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.marker'), 'fixture', 'utf8');
  }
  if (spec.GitDir === true) {
    mkdirSync(path.join(repoDir, '.git'), { recursive: true });
  }
}

/** Removes a fixture parent created by {@link CreateFixtureParent}. */
export function RemoveFixture(parent: string): void {
  rmSync(parent, { recursive: true, force: true });
}
