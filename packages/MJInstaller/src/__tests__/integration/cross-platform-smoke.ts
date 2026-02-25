/**
 * Cross-platform integration smoke test for MJInstaller.
 *
 * Runs via `npx tsx` in GitHub Actions on ubuntu, macos-14, and windows.
 * Exercises real platform APIs (OS detection, path handling, filesystem,
 * Node/npm version checks) without downloading releases or needing a database.
 *
 * Exit code 0 = all checks passed, 1 = one or more failed.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InstallerEngine } from '../../InstallerEngine.js';
import type { Diagnostics, DiagnosticCheck } from '../../models/Diagnostics.js';

// ── Helpers ──────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return 'PASS';
    case 'fail': return 'FAIL';
    case 'warn': return 'WARN';
    case 'info': return 'INFO';
    default:     return '????';
  }
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Platform:     ${process.platform}`);
  log(`Architecture: ${os.arch()}`);
  log(`Node:         ${process.version}`);
  log(`OS:           ${os.type()} ${os.release()}`);
  log(`Temp dir:     ${os.tmpdir()}`);
  log('');

  // Create a temp directory for the smoke test
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-installer-smoke-'));
  log(`Created temp dir: ${tempDir}`);

  const failures: string[] = [];

  try {
    const engine = new InstallerEngine();

    // Subscribe to events for CI log visibility
    engine.On('diagnostic', (e) => {
      log(`  [${statusIcon(e.Status)}] ${e.Check}: ${e.Message}`);
    });
    engine.On('log', (e) => {
      log(`  [LOG/${e.Level}] ${e.Message}`);
    });
    engine.On('error', (e) => {
      log(`  [ERROR] ${e.Phase}: ${e.Error.message}`);
    });

    // ── Test 1: Doctor (real preflight diagnostics) ─────────────
    log('--- Test 1: Doctor (real preflight diagnostics) ---');
    const diagnostics: Diagnostics = await engine.Doctor(tempDir);

    // Verify environment was detected
    assertTruthy(failures, 'Environment.OS is set',
      diagnostics.Environment.OS.length > 0);
    assertTruthy(failures, 'Environment.NodeVersion is set',
      diagnostics.Environment.NodeVersion.length > 0);
    assertTruthy(failures, 'Environment.NpmVersion is set',
      diagnostics.Environment.NpmVersion.length > 0);
    assertTruthy(failures, 'Environment.Architecture is set',
      diagnostics.Environment.Architecture.length > 0);

    // Verify platform detection matches reality
    assertTruthy(failures, 'OS string contains platform identifier',
      diagnostics.Environment.OS.includes(process.platform) ||
      diagnostics.Environment.OS.includes(os.type().toLowerCase()));

    assertTruthy(failures, 'Architecture matches os.arch()',
      diagnostics.Environment.Architecture === os.arch());

    // Verify checks were actually produced
    assertTruthy(failures, 'At least 3 diagnostic checks produced',
      diagnostics.Checks.length >= 3);

    // Verify Node version check passes (CI runner has Node 24)
    const nodeCheck = diagnostics.Checks.find((c: DiagnosticCheck) =>
      c.Name.toLowerCase().includes('node'));
    assertTruthy(failures, 'Node version check exists',
      nodeCheck !== undefined);
    if (nodeCheck) {
      assertTruthy(failures, 'Node version check is pass or info',
        nodeCheck.Status === 'pass' || nodeCheck.Status === 'info');
    }

    // Verify npm version check exists
    const npmCheck = diagnostics.Checks.find((c: DiagnosticCheck) =>
      c.Name.toLowerCase().includes('npm'));
    assertTruthy(failures, 'npm version check exists',
      npmCheck !== undefined);

    // Verify OS check was produced
    const osCheck = diagnostics.Checks.find((c: DiagnosticCheck) =>
      c.Name.toLowerCase().includes('os') ||
      c.Name.toLowerCase().includes('operating'));
    assertTruthy(failures, 'OS check exists',
      osCheck !== undefined);

    log('');
    log(`Doctor produced ${diagnostics.Checks.length} checks, ${diagnostics.Failures.length} failures, ${diagnostics.Warnings.length} warnings`);
    log('');

    // ── Test 2: CreatePlan + Summarize ──────────────────────────
    log('--- Test 2: CreatePlan + Summarize ---');
    const plan = await engine.CreatePlan({
      Dir: tempDir,
      Tag: 'v5.2.0',
      SkipDB: true,
      SkipStart: true,
      SkipCodeGen: true,
    });

    assertTruthy(failures, 'Plan tag is v5.2.0',
      plan.Tag === 'v5.2.0');
    assertTruthy(failures, 'Plan dir matches temp dir',
      plan.Dir === tempDir);
    assertTruthy(failures, 'Plan has 9 phases',
      plan.Phases.length === 9);

    // Verify skip flags
    const dbPhase = plan.Phases.find(p => p.Id === 'database');
    assertTruthy(failures, 'Database phase is skipped',
      dbPhase?.Skipped === true);
    const smokePhase = plan.Phases.find(p => p.Id === 'smoke_test');
    assertTruthy(failures, 'Smoke test phase is skipped',
      smokePhase?.Skipped === true);
    const codeGenPhase = plan.Phases.find(p => p.Id === 'codegen');
    assertTruthy(failures, 'CodeGen phase is skipped',
      codeGenPhase?.Skipped === true);

    // Summarize should produce readable output
    const summary = plan.Summarize();
    assertTruthy(failures, 'Summarize produces non-empty string',
      summary.length > 0);
    assertTruthy(failures, 'Summarize contains tag',
      summary.includes('v5.2.0'));
    log(`Plan summary:\n${summary}`);
    log('');

    // ── Test 3: DryRun ──────────────────────────────────────────
    log('--- Test 3: DryRun returns immediately ---');
    const dryResult = await engine.Run(plan, { DryRun: true });
    assertTruthy(failures, 'DryRun returns Success=true',
      dryResult.Success === true);
    assertTruthy(failures, 'DryRun returns empty PhasesCompleted',
      dryResult.PhasesCompleted.length === 0);
    assertTruthy(failures, 'DryRun returns empty PhasesFailed',
      dryResult.PhasesFailed.length === 0);
    log('DryRun returned successfully');
    log('');

    // ── Test 4: Path handling ───────────────────────────────────
    log('--- Test 4: Platform path handling ---');
    const joinedPath = path.join(tempDir, 'packages', 'MJAPI', '.env');
    if (process.platform === 'win32') {
      assertTruthy(failures, 'path.join uses backslash on Windows',
        joinedPath.includes('\\'));
    } else {
      assertTruthy(failures, 'path.join uses forward slash on Unix',
        joinedPath.includes('/') && !joinedPath.includes('\\'));
    }
    log(`Joined path: ${joinedPath}`);
    log('');

    // ── Test 5: Real filesystem operations ──────────────────────
    log('--- Test 5: Real filesystem operations ---');
    const subDir = path.join(tempDir, 'test-subdir');
    await fs.mkdir(subDir, { recursive: true });
    const testFile = path.join(subDir, 'test.txt');
    await fs.writeFile(testFile, 'hello from MJInstaller smoke test');
    const content = await fs.readFile(testFile, 'utf-8');
    assertTruthy(failures, 'File write/read round-trip works',
      content === 'hello from MJInstaller smoke test');
    log('Filesystem operations OK');

  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    log(`Cleaned up temp dir: ${tempDir}`);
  }

  // ── Summary ───────────────────────────────────────────────────
  log('');
  log('='.repeat(60));
  if (failures.length === 0) {
    log('ALL CHECKS PASSED');
    log('='.repeat(60));
    process.exit(0);
  } else {
    log(`${failures.length} CHECK(S) FAILED:`);
    for (const f of failures) {
      log(`  FAIL: ${f}`);
    }
    log('='.repeat(60));
    process.exit(1);
  }
}

function assertTruthy(failures: string[], name: string, condition: boolean): void {
  if (condition) {
    log(`  [PASS] ${name}`);
  } else {
    log(`  [FAIL] ${name}`);
    failures.push(name);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
