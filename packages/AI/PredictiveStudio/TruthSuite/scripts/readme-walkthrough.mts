/**
 * scripts/readme-walkthrough.mts — the README walkthrough. Runs every `bash readme-step` block of
 * TruthSuite/README.md, in order, in a fresh git worktree of HEAD (what a `git clone` of the branch contains) against
 * a new private database `<your DB_DATABASE>_readme` on GRAPHQL_PORT + 10, stops at the first non-zero exit, writes
 * results/readme-walkthrough.json, then stops the servers the README started, drops the database and removes the
 * worktree. Usage: pnpm run truth:readme -- --env "$MJ/.env.MJ_PS_PR2_<agent>"
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReadmeSteps } from '../src/readme/steps';
import { TruthSuite } from '../src/registry/load';

interface StepResult { Index: number; Line: number; ExitCode: number; Seconds: number }

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`missing ${name} <value>`);
  return value;
}

function envValue(envText: string, key: string): string {
  const prefix = `${key}=`;
  const line = envText.split(/\r?\n/).find((l) => l.startsWith(prefix));
  const value = line ? line.slice(prefix.length).trim() : '';
  if (!value) throw new Error(`the env file has no ${key} line`);
  return value;
}

/** Bash run inside the worktree with its .env loaded; never throws (cleanup must finish). */
function bash(tree: string, script: string): number {
  // `??` on purpose: exit status 0 is the success value; null (killed by a signal) counts as failure.
  return spawnSync('bash', ['-euo', 'pipefail', '-c', `set -a; source .env; set +a\n${script}`], { cwd: tree, stdio: 'inherit' }).status ?? 1;
}

function main(): number {
  const suite = TruthSuite.Root();
  const mjRoot = path.resolve(suite, '../../../..');
  const steps = ReadmeSteps.Extract(readFileSync(path.join(suite, 'README.md'), 'utf8'));
  const baseEnv = readFileSync(path.resolve(arg('--env')), 'utf8');
  const database = `${envValue(baseEnv, 'DB_DATABASE')}_readme`;
  const port = String(Number(envValue(baseEnv, 'GRAPHQL_PORT')) + 10);
  const tree = path.join(mkdtempSync(path.join(tmpdir(), 'truth-readme-')), 'mj');
  execFileSync('git', ['-C', mjRoot, 'worktree', 'add', '--detach', tree, 'HEAD'], { stdio: 'inherit' });
  writeFileSync(path.join(tree, '.env'), baseEnv
    .replace(/^DB_DATABASE=.*$/m, () => `DB_DATABASE=${database}`)
    .replace(/^GRAPHQL_PORT=.*$/m, () => `GRAPHQL_PORT=${port}`));
  const results: StepResult[] = [];
  try {
    for (const s of steps) {
      const t0 = Date.now();
      const exitCode = bash(tree, s.Script);
      results.push({ Index: s.Index, Line: s.Line, ExitCode: exitCode, Seconds: Math.round((Date.now() - t0) / 1000) });
      if (exitCode !== 0) break;
    }
  } finally {
    const out = path.join(suite, 'results', 'readme-walkthrough.json');
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ database, port, steps: steps.length, results }, null, 2));
    const sidecarUrl = path.join(tree, 'packages/AI/PredictiveStudio/TruthSuite/.run/sidecar.url');
    const sidecarPort = existsSync(sidecarUrl) ? new URL(readFileSync(sidecarUrl, 'utf8').trim()).port : '';
    for (const p of [port, sidecarPort].filter((x) => x.length > 0)) {
      bash(tree, `pids=$(lsof -ti tcp:${p} || true); if [ -n "$pids" ]; then kill $pids; fi`);
    }
    bash(tree, `sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -Q "IF DB_ID(N'$DB_DATABASE') IS NOT NULL BEGIN ALTER DATABASE [$DB_DATABASE] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB_DATABASE]; END"`);
    execFileSync('git', ['-C', mjRoot, 'worktree', 'remove', '--force', tree], { stdio: 'inherit' });
  }
  const passed = results.filter((r) => r.ExitCode === 0).length;
  console.log(`readme walkthrough: ${passed} of ${steps.length} steps passed (database ${database})`);
  return passed === steps.length ? 0 : 1;
}

process.exitCode = main();
