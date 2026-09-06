/**
 * ps-saved-enrichment-proof.ts — proves a Query can CARRY its enrichment.
 *
 * The runtime `Enrichment` directive already worked end to end. What it could not do is be
 * *discovered*: a caller had to know an enricher existed in order to pass one, so a saved report
 * could never return predictions. This runs `RunQuery` with **no Enrichment argument at all** and
 * asserts the prediction column arrives anyway, from `Query.DefaultEnrichment`.
 *
 * THROWAWAY: creates a Query, sets its DefaultEnrichment, runs it, and deletes it.
 *
 * USAGE (from the repo root, Python sidecar reachable):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-saved-enrichment-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunQuery, RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJQueryEntity } from '@memberjunction/core-entities';
import { LoadMLModelScoreEnricher, LoadMLModelInferenceProcessor } from '@memberjunction/predictive-studio';

// Anchor the @RegisterClass side effects against tree-shaking.
LoadMLModelScoreEnricher();
LoadMLModelInferenceProcessor();

const OUTPUT_FIELD = 'RenewalScore';
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 300000,
  }).connect();
  const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'));
  await UserCache.Instance.Refresh(provider);
  const user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

  // A published model to score with — any will do; the model supplies its own target entity.
  const models = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Models', ExtraFilter: "Status='Published'", Fields: ['ID'], OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'simple', BypassCache: true },
    user,
  );
  if (!models.Success || models.Results.length === 0) {
    console.log('SKIP: no published model to score with.');
    process.exit(0);
  }
  const modelId = models.Results[0].ID;
  console.log(`model: ${modelId}`);

  let query: MJQueryEntity | null = null;
  try {
    query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    query.NewRecord();
    query.Name = `ps-saved-enrichment-proof ${Date.now()}`;
    query.Description = 'Throwaway: proves Query.DefaultEnrichment is applied when the caller passes none.';
    query.SQL = 'SELECT TOP 5 ID FROM demo.vwMembers';
    query.Status = 'Approved';
    // The whole point: the directive lives ON the query.
    query.DefaultEnrichment = JSON.stringify({
      EnricherKey: 'ML Model Score',
      Config: { modelId, outputField: OUTPUT_FIELD, primaryKeyField: 'ID' },
    });
    if (!(await query.Save())) throw new Error(`query save failed: ${query.LatestResult?.CompleteMessage}`);
    console.log(`query: ${query.ID}`);
    // Diagnostics: did the column round-trip, and is the enricher registered?
    const reloaded = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    await reloaded.Load(query.ID);
    console.log(`  saved DefaultEnrichment: ${reloaded.DefaultEnrichment ?? '(null)'}`);
    const { resolveQueryResultEnricher } = await import('@memberjunction/core');
    console.log(`  enricher registered:     ${resolveQueryResultEnricher('ML Model Score') ? 'yes' : 'NO'}`);
    console.log(`  QueryInfo in cache:      ${provider.Queries.some(qq => qq.ID === query!.ID) ? 'yes' : 'NO'}\n`);

    // No Enrichment argument anywhere in this call.
    const result = await new RunQuery().RunQuery({ QueryID: query.ID }, user);
    check(result.Success, `query ran (${result.ErrorMessage ?? 'ok'})`);
    const rows = (result.Results ?? []) as Record<string, unknown>[];
    check(rows.length > 0, `returned ${rows.length} row(s)`);
    const scored = rows.filter(r => r[OUTPUT_FIELD] != null);
    check(scored.length === rows.length, `every row carries '${OUTPUT_FIELD}' (${scored.length}/${rows.length}) — from the SAVED directive, not a caller argument`);
    if (rows[0]) console.log(`  sample: ${JSON.stringify(rows[0]).slice(0, 160)}`);

    // A query with no saved directive must be untouched — the fallback must not leak.
    const plain = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    plain.NewRecord();
    plain.Name = `ps-saved-enrichment-proof-plain ${Date.now()}`;
    plain.SQL = 'SELECT TOP 3 ID FROM demo.vwMembers';
    plain.Status = 'Approved';
    if (await plain.Save()) {
      const plainResult = await new RunQuery().RunQuery({ QueryID: plain.ID }, user);
      const plainRows = (plainResult.Results ?? []) as Record<string, unknown>[];
      check(plainRows.every(r => !(OUTPUT_FIELD in r)), 'a query with no saved directive is returned unenriched');
      await plain.Delete();
    }
  } finally {
    if (query?.ID) await query.Delete();
  }

  console.log(`\n${failures === 0 ? 'PROVEN' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
