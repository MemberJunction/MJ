#!/usr/bin/env node
/**
 * scripts/codegen-idempotency-check.mjs
 *
 * Automated verification harness for CodeGen idempotency relative to database state (§7.1).
 *
 * Usage:
 *   node scripts/codegen-idempotency-check.mjs --stage <warm-twice|single-column|clean-room> [--no-ai] [--skip-first-run] [--skip-warm] [--keep-column]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readdirSync, statSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';
import sql from 'mssql';

dotenvConfig();

// ---------------------------------------------------------------------------
// Helpers: CLI Execution & Logging
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[idempotency-check] ${msg}`);
}

function logError(msg) {
  console.error(`[idempotency-check] ❌ ${msg}`);
}

function logSuccess(msg) {
  console.log(`[idempotency-check] ✅ ${msg}`);
}

export function runProcess(command, args, extraEnv = {}) {
  log(`Executing: ${command} ${args.join(' ')}`);
  const env = { ...process.env, ...extraEnv };
  const res = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`Command exited with status ${res.status}: ${command} ${args.join(' ')}`);
  }
  return res;
}

export function runProcessCapture(command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const res = spawnSync(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return res;
}

// ---------------------------------------------------------------------------
// Database Helpers (mssql)
// ---------------------------------------------------------------------------

async function getDbPool() {
  const config = {
    server: process.env.CODEGEN_DB_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.CODEGEN_DB_PORT || process.env.DB_PORT || '1433', 10),
    user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME || process.env.DB_USER || 'sa',
    password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.CODEGEN_DB_DATABASE || process.env.DB_DATABASE || '',
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      requestTimeout: 120000,
    },
    pool: { max: 1, min: 1 },
  };
  return await sql.connect(config);
}

// ---------------------------------------------------------------------------
// Git & SQL Log Inspection Helpers
// ---------------------------------------------------------------------------

export function getGitDiff(paths = ['packages/', 'metadata/']) {
  runProcessCapture('git', ['add', '-N', ...paths]);
  const res = runProcessCapture('git', ['diff', '--binary', 'HEAD', '--', ...paths]);
  if (res.status !== 0 || res.error) {
    throw new Error(`git diff failed (status=${res.status}, signal=${res.signal}): ${res.error?.message ?? res.stderr ?? '(no output)'}`);
  }
  return res.stdout;
}

export function getGitStatusPorcelain(paths = ['packages/', 'metadata/']) {
  runProcessCapture('git', ['add', '-N', ...paths]);
  const res = runProcessCapture('git', ['status', '--porcelain', '--', ...paths]);
  if (res.status !== 0 || res.error) {
    throw new Error(`git status failed (status=${res.status}, signal=${res.signal}): ${res.error?.message ?? res.stderr ?? '(no output)'}`);
  }
  // NOT stdout.trim(): porcelain lines are ' M path' (3-char prefix) and callers slice(3).
  // Trimming the whole buffer strips the leading space of the FIRST line only, so that one
  // path loses its first character ('packages/x' -> 'ackages/x') and silently fails every
  // allow-list match. Trim the trailing newline instead and leave line prefixes intact.
  return res.stdout.split('\n').map((l) => l.replace(/\s+$/, '')).filter(Boolean);
}

export function computeFileHash(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

export function snapshotFiles(paths = ['packages/', 'metadata/']) {
  const snapshot = new Map();
  const statusLines = getGitStatusPorcelain(paths);
  for (const line of statusLines) {
    const filePath = line.substring(3).trim();
    snapshot.set(filePath, computeFileHash(filePath));
  }
  return snapshot;
}

export function findChangedFilesBetween(beforeSnapshot, paths = ['packages/', 'metadata/']) {
  const changed = [];
  const statusLines = getGitStatusPorcelain(paths);
  for (const line of statusLines) {
    const filePath = line.substring(3).trim();
    const currentHash = computeFileHash(filePath);
    if (!beforeSnapshot.has(filePath)) {
      // Newly created or modified file
      changed.push(filePath);
    } else {
      const prevHash = beforeSnapshot.get(filePath);
      if (currentHash !== prevHash) {
        changed.push(filePath);
      }
    }
  }
  return changed;
}

export function findSqlCaptureFiles(afterTimestamp = 0) {
  const results = [];
  const searchDirs = ['migrations', 'migrations-pg', 'SQL Scripts'];
  function walk(currentDir) {
    if (!existsSync(currentDir)) return;
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('CodeGen_Run_') && entry.name.endsWith('.sql')) {
        const st = statSync(fullPath);
        if (st.mtimeMs >= afterTimestamp) {
          results.push({ fullPath, mtimeMs: st.mtimeMs, size: st.size });
        }
      }
    }
  }
  for (const dir of searchDirs) {
    walk(dir);
  }
  return results;
}

export async function getLatestReport(afterTimestamp = 0) {
  const stateDir = path.join(os.homedir(), '.mj', 'codegen-state');
  if (!existsSync(stateDir)) return null;

  try {
    const files = (await fs.readdir(stateDir))
      .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of files) {
      const fullPath = path.join(stateDir, file);
      const st = await fs.stat(fullPath);
      if (st.mtimeMs >= afterTimestamp) {
        const raw = await fs.readFile(fullPath, 'utf8');
        return JSON.parse(raw);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stage 1: warm-twice (§7.1)
// ---------------------------------------------------------------------------

export async function checkWarmTwice({ noAI = false, skipFirstRun = false }) {
  log('Starting stage: warm-twice');
  const tmpDir = os.tmpdir();
  const run1PatchPath = path.join(tmpDir, 'run1.patch');
  const run2PatchPath = path.join(tmpDir, 'run2.patch');

  const codegenEnv = {
    MJ_CODEGEN_REPORT: '1',
    MJ_CODEGEN_SKIP_COMMANDS: '1',
    ...(noAI ? { MJ_CODEGEN_NO_AI: '1' } : {}),
  };

  // Run 1
  const run1StartTime = Date.now();
  if (!skipFirstRun) {
    log('Running CodeGen (run 1)...');
    runProcess('node', ['packages/MJCLI/bin/run.js', 'codegen', ...(noAI ? ['--no-ai'] : [])], codegenEnv);
  } else {
    log('Skipping run 1 (--skip-first-run), capturing current tree state...');
  }

  const run1Diff = getGitDiff(['packages/', 'metadata/']);
  await fs.writeFile(run1PatchPath, run1Diff, 'utf8');

  // Copy any run 1 SQL captures if present
  const run1Captures = findSqlCaptureFiles(run1StartTime - 5000);
  if (run1Captures.length > 0) {
    const latestCapture = run1Captures.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    await fs.copyFile(latestCapture.fullPath, path.join(tmpDir, 'run1.sql'));
  }

  // Run 2
  log('Running CodeGen (run 2)...');
  const run2StartTime = Date.now();
  runProcess('node', ['packages/MJCLI/bin/run.js', 'codegen', ...(noAI ? ['--no-ai'] : [])], codegenEnv);

  const run2Diff = getGitDiff(['packages/', 'metadata/']);
  await fs.writeFile(run2PatchPath, run2Diff, 'utf8');

  // Assertion 1: Patches must be byte-identical
  if (run1Diff !== run2Diff) {
    logError('run2.patch is NOT byte-identical to run1.patch! CodeGen produced new diffs on run 2.');
    const diffRes = runProcessCapture('diff', ['-u', run1PatchPath, run2PatchPath]);
    const lines = diffRes.stdout.split('\n').slice(0, 40);
    console.error(lines.join('\n'));
    throw new Error('Stage warm-twice failed: run 2 changed artifacts relative to run 1.');
  }

  // Assertion 2: No new CodeGen_Run_*.sql left behind by run 2
  const run2Captures = findSqlCaptureFiles(run2StartTime - 1000);
  if (run2Captures.length > 0) {
    const files = run2Captures.map((c) => c.fullPath).join(', ');
    logError(`Surviving CodeGen_Run_*.sql found after run 2: ${files}`);
    throw new Error('Stage warm-twice failed: run 2 left behind non-empty SQL log file.');
  }

  // Assertion 3: Counters in run 2 report
  const report = await getLatestReport(run2StartTime - 1000);
  if (report) {
    const counters = report.counters || {};
    log(`Run 2 counters: ${JSON.stringify(counters)}`);

    const fieldsNew = counters.fieldsNew ?? 0;
    const fieldsChanged = counters.fieldsChanged ?? 0;
    const decisionRecordsWritten = counters['metadata.decisionRecordsWritten'] ?? 0;

    if (fieldsNew !== 0 || fieldsChanged !== 0 || decisionRecordsWritten !== 0) {
      logError(`Non-zero counters in run 2: fieldsNew=${fieldsNew}, fieldsChanged=${fieldsChanged}, decisionRecordsWritten=${decisionRecordsWritten}`);
      throw new Error('Stage warm-twice failed: run 2 modified schema/decisions.');
    }

    if (!noAI) {
      const smartFieldCalls = counters['ai.smartFieldCalls'] ?? 0;
      const formLayoutCalls = counters['ai.formLayoutCalls'] ?? 0;
      if (smartFieldCalls !== 0 || formLayoutCalls !== 0) {
        logError(`Non-zero AI calls in run 2: smartFieldCalls=${smartFieldCalls}, formLayoutCalls=${formLayoutCalls}`);
        throw new Error('Stage warm-twice failed: run 2 made LLM calls when AI was enabled.');
      }
    }
  } else {
    log('Note: Could not locate run 2 JSON report; diff and SQL capture assertions passed.');
  }

  logSuccess('Stage warm-twice PASSED: 0 diffs, 0 surviving SQL logs, 0 changed fields.');
}

// ---------------------------------------------------------------------------
// Stage 2: single-column (§7.1)
// ---------------------------------------------------------------------------

export async function checkSingleColumn({ noAI = false, skipWarm = false, keepColumn = false }) {
  log('Starting stage: single-column');
  if (!skipWarm) {
    await checkWarmTwice({ noAI });
  }

  const pool = await getDbPool();
  const probeColumn = 'IdempotencyProbe';
  let probeFieldId = null;
  let probeCaptureFile = null;

  // Snapshot before-probe state
  const beforeSnapshot = snapshotFiles(['packages/', 'metadata/']);
  const beforeMjTs = existsSync('packages/MJCoreEntities/src/generated/entities/__mj.ts')
    ? readFileSync('packages/MJCoreEntities/src/generated/entities/__mj.ts', 'utf8')
    : '';

  try {
    // 1. Add probe column and refresh base view
    log(`Adding probe column [${probeColumn}] to [__mj].[Entity] and refreshing vwEntities...`);
    await pool.request().query(`
      IF COL_LENGTH('[__mj].[Entity]', '${probeColumn}') IS NULL
      BEGIN
        ALTER TABLE [__mj].[Entity] ADD [${probeColumn}] NVARCHAR(50) NULL;
        EXEC sp_addextendedproperty
          @name = N'MS_Description',
          @value = N'Test column for CodeGen single-column idempotency verification',
          @level0type = N'SCHEMA', @level0name = N'__mj',
          @level1type = N'TABLE', @level1name = N'Entity',
          @level2type = N'COLUMN', @level2name = N'${probeColumn}';
        EXEC sp_refreshview '[__mj].[vwEntities]';
      END
    `);

    // Snapshot decisions file if present
    const decisionFilePath = path.join('metadata', 'entities', 'decisions', '.__mj.mj-entities.json');
    let beforeDecisionJson = null;
    if (existsSync(decisionFilePath)) {
      beforeDecisionJson = JSON.parse(await fs.readFile(decisionFilePath, 'utf8'));
    }

    // 2. Run CodeGen
    log('Running CodeGen with probe column added...');
    const codegenStartTime = Date.now();
    const codegenEnv = {
      MJ_CODEGEN_REPORT: '1',
      MJ_CODEGEN_SKIP_COMMANDS: '1',
      ...(noAI ? { MJ_CODEGEN_NO_AI: '1' } : {}),
    };
    runProcess('node', ['packages/MJCLI/bin/run.js', 'codegen', ...(noAI ? ['--no-ai'] : [])], codegenEnv);

    // 3. Inspect changed files between before and after probe
    const changedFiles = findChangedFilesBetween(beforeSnapshot, ['packages/', 'metadata/']);
    log(`Changed files count due to probe: ${changedFiles.length} (${changedFiles.join(', ')})`);

    const allowListRegexes = [
      /^packages\/MJCoreEntities\/src\/generated\/entities\/__mj\.ts$/,
      /^packages\/MJCoreEntities\/src\/generated\/.*entity.*\.ts$/,
      /^packages\/MJCoreEntities\/src\/generated\/.*entity.*\.json$/,
      /^packages\/MJServer\/src\/generated\/generated\.ts$/,
      /^packages\/MJServer\/src\/generated\/graphql-schemas\/__mj\.ts$/,
      /^packages\/Angular\/Explorer\/core-entity-forms\/src\/lib\/generated\/Entities\/MJEntity\/.*$/,
      /^metadata\/entities\/decisions\/.__mj\.mj-entities\.json$/,
      /^(?:migrations|migrations-pg)\/(?:v\d+\/)?CodeGen_Run_.*\.sql$/,
    ];

    const forbiddenRegexes = [
      /generated-forms\.module\.ts$/,
    ];

    const offendingFiles = [];
    for (const filePath of changedFiles) {
      const isForbidden = forbiddenRegexes.some((re) => re.test(filePath));
      const isAllowed = allowListRegexes.some((re) => re.test(filePath));
      if (isForbidden || !isAllowed) {
        offendingFiles.push(filePath);
      }
    }

    if (offendingFiles.length > 0) {
      logError(`Unexpected files changed during single-column probe: ${offendingFiles.join(', ')}`);
      throw new Error(`Stage single-column failed: changed files outside allow-list.`);
    }

    // 4. Assert diff inside __mj.ts touches only IdempotencyProbe
    const currentMjTs = readFileSync('packages/MJCoreEntities/src/generated/entities/__mj.ts', 'utf8');
    const beforeLines = new Set(beforeMjTs.split('\n').map((l) => l.trim()));
    for (const line of currentMjTs.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !beforeLines.has(trimmed)) {
        if (!trimmed.includes(probeColumn) && trimmed !== '}' && trimmed !== '{' && trimmed !== '/**' && trimmed !== '*/' && !trimmed.startsWith('*')) {
          logError(`__mj.ts diff contains unexpected modification: ${trimmed}`);
          throw new Error('Stage single-column failed: __mj.ts modified outside probe property.');
        }
      }
    }

    // 5. Query probe field ID
    const probeRes = await pool.request().query(`
      SELECT ID, Category FROM [__mj].[EntityField]
      WHERE Name = '${probeColumn}'
        AND EntityID = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'MJ: Entities')
    `);
    if (probeRes.recordset.length === 0) {
      throw new Error(`Stage single-column failed: EntityField row for ${probeColumn} was not found in database.`);
    }
    probeFieldId = probeRes.recordset[0].ID.toString().toLowerCase();

    // 6. Assert in SQL capture file
    const sqlCaptures = findSqlCaptureFiles(codegenStartTime - 1000);
    if (sqlCaptures.length === 0) {
      throw new Error('Stage single-column failed: expected CodeGen_Run_*.sql capture file, none found.');
    }
    const latestCapture = sqlCaptures.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    probeCaptureFile = latestCapture.fullPath;
    const captureContent = await fs.readFile(latestCapture.fullPath, 'utf8');

    // Parse capture SQL for updates
    const updateRegex = /UPDATE\s+(?:\[?(?:__mj|\$\{flyway:defaultSchema\})\]?\.)?\[?EntityField\]?\s+SET[\s\S]*?WHERE\s+\[?ID\]?\s*=\s*'([^']+)'/gi;
    let match;
    while ((match = updateRegex.exec(captureContent)) !== null) {
      const updatedId = match[1].toLowerCase();
      if (updatedId !== probeFieldId) {
        logError(`Capture file updated unexpected EntityField ID '${updatedId}' (expected '${probeFieldId}')`);
        throw new Error('Stage single-column failed: SQL capture touched other EntityField rows.');
      }
    }

    // 7. Check decision metadata changes (if decisions file is tracked)
    if (beforeDecisionJson && existsSync(decisionFilePath)) {
      const afterDecisionJson = JSON.parse(await fs.readFile(decisionFilePath, 'utf8'));
      const beforeFields = beforeDecisionJson.fields || {};
      const afterFields = afterDecisionJson.fields || {};
      const addedKeys = Object.keys(afterFields).filter((k) => !(k in beforeFields));
      if (addedKeys.length !== 1 || addedKeys[0].toLowerCase() !== probeColumn.toLowerCase()) {
        logError(`Unexpected decision field added: ${addedKeys.join(', ')}`);
        throw new Error('Stage single-column failed: decisions file did not add exactly the probe column.');
      }
    }

    logSuccess('Stage single-column assertions PASSED.');
  } finally {
    if (!keepColumn) {
      log('Cleaning up probe column and restoring database view...');
      try {
        await pool.request().query(`
          IF COL_LENGTH('[__mj].[Entity]', '${probeColumn}') IS NOT NULL
          BEGIN
            ALTER TABLE [__mj].[Entity] DROP COLUMN [${probeColumn}];
          END
          DELETE FROM [__mj].[EntityField] WHERE Name = '${probeColumn}';
          EXEC sp_refreshview '[__mj].[vwEntities]';
        `);
        if (probeCaptureFile && existsSync(probeCaptureFile)) {
          unlinkSync(probeCaptureFile);
        }
        log('Running CodeGen to restore pristine working tree...');
        const restoreStartTime = Date.now();
        runProcess('node', ['packages/MJCLI/bin/run.js', 'codegen', '--skipdb', ...(noAI ? ['--no-ai'] : [])], {
          MJ_CODEGEN_REPORT: '1',
          ...(noAI ? { MJ_CODEGEN_NO_AI: '1' } : {}),
        });
        const teardownCaptures = findSqlCaptureFiles(restoreStartTime - 1000);
        for (const cap of teardownCaptures) {
          if (existsSync(cap.fullPath)) {
            unlinkSync(cap.fullPath);
          }
        }
      } catch (cleanupErr) {
        logError(`Cleanup failed: ${cleanupErr.message}`);
      }
    }
    await pool.close();
  }
}

// ---------------------------------------------------------------------------
// Stage 3: clean-room (§7.1)
// ---------------------------------------------------------------------------

export async function checkCleanRoom({ noAI = false }) {
  log('Starting stage: clean-room');

  log('1. Running migrations...');
  runProcess('node', ['packages/MJCLI/bin/run.js', 'migrate']);

  log('2. Running metadata sync push (--ci)...');
  runProcess('node', ['packages/MJCLI/bin/run.js', 'sync', 'push', '--dir=metadata', '--ci']);

  log('3. Running CodeGen...');
  const codegenStartTime = Date.now();
  const codegenEnv = {
    MJ_CODEGEN_REPORT: '1',
    MJ_CODEGEN_SKIP_COMMANDS: '1',
    ...(noAI ? { MJ_CODEGEN_NO_AI: '1' } : {}),
  };
  runProcess('node', ['packages/MJCLI/bin/run.js', 'codegen', ...(noAI ? ['--no-ai'] : [])], codegenEnv);

  log('4. Inspecting working tree for drift...');
  const statusLines = getGitStatusPorcelain(['packages/', 'metadata/', 'migrations/']);
  if (statusLines.length > 0) {
    logError(`Clean-room drift detected! Working tree has modified/untracked files:\n${statusLines.join('\n')}`);
    throw new Error('Stage clean-room failed: working tree is not clean after CodeGen.');
  }

  log('5. Inspecting CodeGen run report...');
  const report = await getLatestReport(codegenStartTime - 1000);
  if (report) {
    const counters = report.counters || {};
    const fieldsChanged = counters.fieldsChanged ?? 0;
    const decisionRecordsWritten = counters['metadata.decisionRecordsWritten'] ?? 0;

    if (fieldsChanged !== 0) {
      logError(`Clean-room reported fieldsChanged = ${fieldsChanged}`);
      throw new Error(`Stage clean-room failed: fieldsChanged = ${fieldsChanged} (expected 0).`);
    }

    if (decisionRecordsWritten !== 0) {
      logError(`Clean-room reported decisionRecordsWritten = ${decisionRecordsWritten}`);
      throw new Error(`Stage clean-room failed: decisionRecordsWritten = ${decisionRecordsWritten} (expected 0).`);
    }
  }

  logSuccess('Stage clean-room PASSED: 0 drift, fieldsChanged = 0, decisionRecordsWritten = 0.');
}

// ---------------------------------------------------------------------------
// CLI Driver
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const getArgValue = (flag) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };

  const stage = getArgValue('--stage');
  const noAI = args.has('--no-ai');
  const skipFirstRun = args.has('--skip-first-run');
  const skipWarm = args.has('--skip-warm');
  const keepColumn = args.has('--keep-column');

  if (!stage) {
    console.error('Usage: node scripts/codegen-idempotency-check.mjs --stage <warm-twice|single-column|clean-room> [--no-ai] [--skip-first-run] [--skip-warm] [--keep-column]');
    process.exit(1);
  }

  try {
    switch (stage) {
      case 'warm-twice':
        await checkWarmTwice({ noAI, skipFirstRun });
        break;
      case 'single-column':
        await checkSingleColumn({ noAI, skipWarm, keepColumn });
        break;
      case 'clean-room':
        await checkCleanRoom({ noAI });
        break;
      default:
        console.error(`Unknown stage: ${stage}`);
        process.exit(1);
    }
  } catch (err) {
    logError(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
