/**
 * Run MJ CodeGen and AWAIT it. The `mj codegen` CLI command fires
 * `runMemberJunctionCodeGeneration(...)` without awaiting (commands/codegen/index.ts:100),
 * so under some invocation paths the process exits before codegen does anything —
 * a silent exit-0 no-op. This runner awaits the run and exits non-zero on failure.
 *
 * DB connection comes from the standard env vars / mj.config.cjs (DB_PLATFORM,
 * DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD, CODEGEN_DB_*,
 * MJ_CORE_SCHEMA). Usage:
 *
 *   DB_PLATFORM=postgresql DB_HOST=localhost DB_PORT=5433 DB_DATABASE=pg_build \
 *   DB_USERNAME=mj_admin DB_PASSWORD=... CODEGEN_DB_USERNAME=mj_admin \
 *   CODEGEN_DB_PASSWORD=... MJ_CORE_SCHEMA=__mj \
 *   node scripts/pg-codegen-await.mjs [--skipfiles] [--skipdb]
 */
import { runMemberJunctionCodeGeneration, initializeConfig } from '@memberjunction/codegen-lib';

const skipFiles = process.argv.includes('--skipfiles');
const skipDb = process.argv.includes('--skipdb');

initializeConfig(process.cwd());
console.log(`[pg-codegen-await] starting codegen (skipDb=${skipDb}, skipFiles=${skipFiles})`);
const started = Date.now();
try {
  await runMemberJunctionCodeGeneration(skipDb, skipFiles);
  console.log(`[pg-codegen-await] codegen complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(0);
} catch (err) {
  console.error('[pg-codegen-await] codegen FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}
