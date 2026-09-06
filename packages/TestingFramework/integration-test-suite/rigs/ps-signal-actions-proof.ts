/**
 * ps-signal-actions-proof.ts — proves the signal layer is reachable the way a CALLER reaches it.
 *
 * `ps-signal-compute-proof.ts` calls `SignalComputer` directly, which proves the computation. This
 * proves the surface above it: the two Actions a dashboard, an agent or `utilities.ml` actually
 * invoke. That path has failure modes the direct call cannot have — an action missing from
 * metadata, a `DriverClass` that does not match its `@RegisterClass` key, a parameter the action
 * reads under a different name than the seed declares. Every one of those ships silently.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-signal-actions-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionEngineBase, ActionParam, RunActionParams } from '@memberjunction/actions-base';

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

/** Run an action the way the GraphQL resolver does: by name, out of metadata. */
async function runByName(name: string, params: ActionParam[], user: UserInfo) {
  const action = ActionEngineBase.Instance.Actions.find(a => a.Name === name);
  if (!action) throw new Error(`The '${name}' action is not in metadata.`);
  const p = new RunActionParams();
  p.Action = action;
  p.ContextUser = user;
  p.Params = params;
  p.Filters = [];
  return { action, result: await ActionEngineServer.Instance.RunAction(p) };
}
const output = (result: { Params?: ActionParam[] }, name: string): unknown =>
  result.Params?.find(p => p.Name === name)?.Value;

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

  console.log('▸ Both actions are discoverable in metadata');
  for (const name of ['List Signals', 'Compute Signal']) {
    const action = ActionEngineBase.Instance.Actions.find(a => a.Name === name);
    check(!!action, `'${name}' is registered${action ? ` (DriverClass ${action.DriverClass})` : ''}`);
  }
  console.log();

  console.log('▸ List Signals — the catalogue, unranked');
  const listed = await runByName('List Signals', [{ Name: 'MaxRows', Value: 50, Type: 'Input' }], user);
  check(listed.result.Success, `ran (${listed.result.Message ?? 'ok'})`);
  const signals = output(listed.result, 'Signals') as Array<{
    ID: string; Name: string; TypeName: string; Story: string | null; Rebindable: boolean;
  }> | undefined;
  check(Array.isArray(signals) && signals.length > 0, `returned ${signals?.length ?? 0} signal(s)`);
  if (!signals?.length) { console.log('SKIP: no signals materialised in this database.'); process.exit(failures > 0 ? 1 : 0); }

  const rebindable = signals.filter(s => s.Rebindable);
  const fixed = signals.filter(s => !s.Rebindable);
  check(rebindable.length > 0, `${rebindable.length}/${signals.length} can be pointed at another population`);
  console.log(`  rebindable:   ${rebindable.slice(0, 4).map(s => `${s.Name} [${s.TypeName}]`).join(', ')}`);
  if (fixed.length > 0) {
    console.log(`  not rebindable: ${fixed.slice(0, 4).map(s => `${s.Name} [${s.TypeName}]`).join(', ')}`);
  }
  const withStory = signals.filter(s => s.Story && s.Story.length > 0);
  check(withStory.length > 0, `${withStory.length}/${signals.length} carry a written story`);
  if (withStory[0]) console.log(`  e.g. "${withStory[0].Name}": ${withStory[0].Story?.slice(0, 110)}…`);
  console.log();

  console.log('▸ List Signals — ranked by meaning, no table or column name involved');
  const searched = await runByName('List Signals', [
    { Name: 'QueryText', Value: 'how long ago someone last engaged with us', Type: 'Input' },
    { Name: 'RebindableOnly', Value: true, Type: 'Input' },
    { Name: 'MaxRows', Value: 5, Type: 'Input' },
  ], user);
  check(searched.result.Success, `ran (${searched.result.Message ?? 'ok'})`);
  const ranked = output(searched.result, 'Signals') as Array<{ ID: string; Name: string; Similarity?: number }> | undefined;
  if (ranked?.length) {
    check(ranked.every(s => typeof s.Similarity === 'number'), 'every ranked entry carries its similarity');
    check(ranked.every((s, i) => i === 0 || (ranked[i - 1].Similarity ?? 0) >= (s.Similarity ?? 0)), 'ordered by similarity');
    console.log(`  ${ranked.map(s => `${s.Name} (${(s.Similarity ?? 0).toFixed(3)})`).join('\n  ')}`);
  } else {
    console.log(`  (no ranked match — ${JSON.stringify(output(searched.result, 'Warnings') ?? 'no warnings')})`);
  }
  console.log();

  // The catalogue's own answer feeds the computation — which is the whole point: a caller that
  // starts with nothing but a question ends up with numbers, having named no table on the way.
  const target = rebindable.find(s => s.TypeName.startsWith('As-Of')) ?? rebindable[0];
  console.log(`▸ Compute Signal — '${target.Name}' over a population, via the action`);
  const computed = await runByName('Compute Signal', [
    { Name: 'SignalID', Value: target.ID, Type: 'Input' },
    { Name: 'TargetEntity', Value: 'Members', Type: 'Input' },
    { Name: 'MaxRows', Value: 50, Type: 'Input' },
    { Name: 'AsOfColumn', Value: 'RenewalDecidedAt', Type: 'Input' },
  ], user);
  check(computed.result.Success, `ran (${computed.result.Message ?? 'ok'})`);
  const values = output(computed.result, 'Values') as Array<{ RecordID: string; Value: unknown }> | undefined;
  check(Array.isArray(values) && values.length > 0, `returned ${values?.length ?? 0} value(s) into '${output(computed.result, 'OutputColumn')}'`);
  const populated = (values ?? []).filter(v => v.Value !== null && Number(v.Value) !== 0);
  check(populated.length > 0, `${populated.length}/${values?.length ?? 0} records have a non-zero value`);
  console.log(`  sample: ${JSON.stringify((values ?? []).slice(0, 3))}`);
  console.log(`  resolved as: ${JSON.stringify(output(computed.result, 'ResolvedAs'))?.slice(0, 200)}`);
  console.log();

  console.log('▸ A refused binding stays a refusal — never a column of zeros');
  const refused = await runByName('Compute Signal', [
    { Name: 'SignalID', Value: target.ID, Type: 'Input' },
    { Name: 'TargetEntity', Value: 'Members', Type: 'Input' },
    { Name: 'MaxRows', Value: 10, Type: 'Input' },
    { Name: 'ForeignKeyField', Value: 'NoSuchColumn', Type: 'Input' },
  ], user);
  check(!refused.result.Success, 'refused rather than returning nulls');
  check((refused.result.Message ?? '').includes('NoSuchColumn'), `names the offending field: ${refused.result.Message}`);
  console.log();

  console.log(failures === 0 ? '✅ PROVEN — the signal layer is callable through its actions.' : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
