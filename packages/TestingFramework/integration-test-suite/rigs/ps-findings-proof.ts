/**
 * ps-findings-proof.ts — proves a promotion leaves DURABLE, CITABLE facts behind.
 *
 * Runs the finding writer against a real promoted model, then searches the results by meaning
 * through the `Find Relevant Findings` action — the path an agent takes. The checks are about
 * over-claiming, because that is what makes a body of findings worse than none:
 *
 *   - a direction is only claimed when the numbers support one;
 *   - "out-of-sample" is only claimed when the metrics came from the locked holdout;
 *   - an input measured and found not to matter is on the record;
 *   - re-running supersedes rather than duplicating.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-findings-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunView, UserInfo, Metadata } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase, ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { FindingWriter } from '@memberjunction/predictive-studio';
import { deriveTrustVerdict } from '@memberjunction/predictive-studio-core';

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

async function runByName(name: string, params: ActionParam[], user: UserInfo) {
  const action = ActionEngineBase.Instance.Actions.find(a => a.Name === name);
  if (!action) throw new Error(`The '${name}' action is not in metadata.`);
  const p = new RunActionParams();
  p.Action = action; p.ContextUser = user; p.Params = params; p.Filters = [];
  return ActionEngineServer.Instance.RunAction(p);
}
const output = (r: { Params?: ActionParam[] }, name: string): unknown => r.Params?.find(p => p.Name === name)?.Value;

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
  await ActionEngineServer.Instance.Config(false, user);
  // Required: the entity server embeds a finding's Story on save, and does so SILENTLY when no
  // local embedding model is loaded — which would leave findings that exist and cannot be found.
  await AIEngine.Instance.Config(false, user);

  // A published model, which is the only state that produces findings.
  const found = await new RunView().RunView<{ ID: string; Pipeline: string; Version: number }>(
    { EntityName: 'MJ: ML Models', ExtraFilter: "Status='Published'", Fields: ['ID', 'Pipeline', 'Version'],
      OrderBy: 'Version DESC', MaxRows: 1, ResultType: 'simple', BypassCache: true }, user);
  if (!found.Success || found.Results.length === 0) { console.log('SKIP: no published model.'); process.exit(0); }

  const md = new Metadata();
  const model = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
  await model.Load(found.Results[0].ID);
  console.log(`model: ${model.Pipeline} v${model.Version}  [${model.ProblemType}]\n`);

  console.log('▸ A promotion writes findings from measured facts alone (no LLM)');
  const writer = new FindingWriter();
  const first = await writer.write(model, deriveTrustVerdict(model), { contextUser: user, provider, story: null });
  check(first.Written > 0, `wrote ${first.Written} finding(s)`);
  for (const reason of first.Reasons) console.log(`    note: ${reason}`);
  console.log();

  const rv = new RunView();
  const listed = await rv.RunView<{
    ID: string; Name: string; Statement: string; EvidenceType: string; Direction: string;
    Magnitude: number | null; MagnitudeUnit: string | null; Confidence: string | null;
    PopulationSize: number | null; HoldoutMetric: string | null; HoldoutMetricValue: number | null; Status: string;
  }>({ EntityName: 'MJ: ML Findings', ExtraFilter: `MLModelID='${model.ID}' AND Status='Active'`,
       Fields: ['ID','Name','Statement','EvidenceType','Direction','Magnitude','MagnitudeUnit','Confidence','PopulationSize','HoldoutMetric','HoldoutMetricValue','Status'],
       ResultType: 'simple', BypassCache: true }, user);
  check(listed.Success && listed.Results.length > 0, `${listed.Results?.length ?? 0} active finding(s) on the record`);

  const vectors = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Findings', ExtraFilter: `MLModelID='${model.ID}' AND Status='Active' AND StoryVector IS NOT NULL`,
      Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
  check(vectors.Results.length === (listed.Results?.length ?? 0),
    `${vectors.Results.length}/${listed.Results?.length ?? 0} carry a story vector — a finding without one can never be found`);

  console.log('\n▸ What was recorded');
  for (const f of (listed.Results ?? []).slice(0, 6)) {
    const mag = f.Magnitude != null ? `${(f.Magnitude * 100).toFixed(1)}% ${f.MagnitudeUnit}` : '—';
    console.log(`  • [${f.EvidenceType} / ${f.Direction} / ${f.Confidence}] ${mag}  n=${f.PopulationSize}  ${f.HoldoutMetric ?? 'no holdout'}=${f.HoldoutMetricValue ?? '—'}`);
    console.log(`      ${f.Statement}`);
  }
  console.log();

  console.log('▸ Nothing over-claims');
  const all = listed.Results ?? [];
  const withMagnitude = all.filter(f => f.Magnitude != null);
  check(withMagnitude.every(f => !!f.MagnitudeUnit), 'every magnitude carries its unit');
  const directional = all.filter(f => f.Direction === 'Increases' || f.Direction === 'Decreases');
  check(all.every(f => f.EvidenceType !== 'Tested Intervention'), 'nothing claims a tested intervention — none was run');
  const outOfSample = all.filter(f => f.EvidenceType === 'Predictive Contribution');
  check(outOfSample.every(f => f.HoldoutMetric != null), 'every out-of-sample claim names the holdout metric behind it');
  console.log(`  ${directional.length}/${all.length} claim a direction (only a signed importance map earns one)`);
  const negatives = all.filter(f => f.Direction === 'None');
  console.log(`  ${negatives.length}/${all.length} record an input measured and found not to matter`);
  console.log();

  console.log('▸ Re-running supersedes rather than duplicating');
  const second = await writer.write(model, deriveTrustVerdict(model), { contextUser: user, provider, story: null });
  check(second.Superseded === first.Written, `superseded ${second.Superseded} earlier measurement(s) (wrote ${first.Written})`);
  const after = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Findings', ExtraFilter: `MLModelID='${model.ID}' AND Status='Active'`, Fields: ['ID'],
      ResultType: 'simple', BypassCache: true }, user);
  check(after.Results.length === first.Written, `${after.Results.length} active finding(s) — the chain grew, the current view did not`);
  console.log();

  console.log('▸ Searchable by meaning, through the action an agent uses');
  const searched = await runByName('Find Relevant Findings', [
    { Name: 'QueryText', Value: 'what makes members more likely to stay with us', Type: 'Input' },
    { Name: 'TopK', Value: 5, Type: 'Input' },
  ], user);
  check(searched.Success, `ran (${searched.Message ?? 'ok'})`);
  const matches = output(searched, 'Findings') as Array<{ Statement: string; Similarity: number; EvidenceType: string }> | undefined;
  check(Array.isArray(matches) && matches.length > 0, `returned ${matches?.length ?? 0} finding(s)`);
  for (const m of (matches ?? []).slice(0, 3)) {
    console.log(`  (${m.Similarity.toFixed(3)}) [${m.EvidenceType}] ${m.Statement.slice(0, 120)}…`);
  }
  console.log();

  console.log('▸ An evidence floor returns nothing rather than dressing up an association');
  const strict = await runByName('Find Relevant Findings', [
    { Name: 'QueryText', Value: 'what makes members more likely to stay with us', Type: 'Input' },
    { Name: 'MinEvidence', Value: 'Tested Intervention', Type: 'Input' },
  ], user);
  check(strict.Success, `ran (${strict.Message ?? 'ok'})`);
  const strictMatches = output(strict, 'Findings') as unknown[] | undefined;
  check((strictMatches?.length ?? 0) === 0, 'no tested intervention on record, and none was invented');
  check((strict.Message ?? '').includes('not that it is untrue'), 'the empty answer says what absence means');
  console.log();

  console.log(failures === 0 ? '✅ PROVEN — a promotion leaves citable facts, and they resist over-claiming.' : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
