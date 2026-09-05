/**
 * ps-signal-compute-proof.ts — proves a signal is CALLABLE, not just browsable.
 *
 * Takes a signal that was proven inside a renewal model and computes it over a population with no
 * model involved, then computes it again against a DIFFERENT binding to show the meaning travels
 * while the attachment does not.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-signal-compute-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunView } from '@memberjunction/core';
import { SignalComputer } from '@memberjunction/predictive-studio';

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

  // An as-of signal that earned its place inside a trained model.
  const found = await new RunView().RunView<{ ID: string; Name: string; ComponentType: string }>(
    { EntityName: 'MJ: ML Components', ExtraFilter: "ComponentType = 'As-Of Count'",
      Fields: ['ID', 'Name', 'ComponentType'], MaxRows: 1, ResultType: 'simple', BypassCache: true }, user);
  if (!found.Success || found.Results.length === 0) { console.log('SKIP: no As-Of Count signal present.'); process.exit(0); }
  const signal = found.Results[0];
  console.log(`signal: ${signal.Name}  [${signal.ComponentType}]\n`);

  const computer = new SignalComputer();

  console.log('▸ Computed over its own population, no model involved');
  const asIs = await computer.compute(
    { SignalID: signal.ID, TargetEntity: 'Members', MaxRows: 50, AsOfColumn: 'RenewalDecidedAt' }, user, provider);
  check(asIs.Success, `ran (${asIs.ErrorMessage ?? 'ok'})`);
  check(asIs.Values.length > 0, `returned ${asIs.Values.length} value(s) into '${asIs.OutputColumn}'`);
  const nonNull = asIs.Values.filter(v => v.Value !== null && Number(v.Value) > 0);
  check(nonNull.length > 0, `${nonNull.length}/${asIs.Values.length} records have a non-zero value`);
  console.log(`  sample: ${JSON.stringify(asIs.Values.slice(0, 3))}`);
  if (asIs.ResolvedAs?.Kind === 'as-of') {
    const ds = asIs.ResolvedAs.DatedSource;
    console.log(`  measured: ${ds.EntityName}.${ds.DateField} keyed by ${ds.ForeignKeyField}, window ${JSON.stringify(ds.Features[0].Window)}\n`);
  }

  console.log('▸ The SAME signal, rebound to a different source');
  // Rebinding to Activities via a different date column proves the substitution reaches the
  // executor — the meaning (a 90-day count) is untouched.
  const rebound = await computer.compute(
    { SignalID: signal.ID, TargetEntity: 'Members', MaxRows: 50, AsOfColumn: 'RenewalDecidedAt',
      Binding: { SourceEntity: 'Activities', ForeignKeyField: 'MemberID', DateField: 'ActivityDate' } }, user, provider);
  check(rebound.Success, `ran (${rebound.ErrorMessage ?? 'ok'})`);
  if (rebound.ResolvedAs?.Kind === 'as-of') {
    const ds = rebound.ResolvedAs.DatedSource;
    check(ds.EntityName === 'Activities', `bound to '${ds.EntityName}' as instructed`);
    check(JSON.stringify(ds.Features[0].Window) === JSON.stringify({ Kind: 'Rolling', LengthDays: 90 }),
      'the 90-day window survived the rebind — the meaning travelled, the attachment did not');
  }

  console.log('\n▸ A bad binding is refused, not silently returned as nulls');
  const bad = await computer.compute(
    { SignalID: signal.ID, TargetEntity: 'Members', MaxRows: 5,
      Binding: { SourceEntity: 'Activities', ForeignKeyField: 'NoSuchColumn', DateField: 'ActivityDate' } }, user, provider);
  check(!bad.Success, 'refused');
  check((bad.ErrorMessage ?? '').includes('NoSuchColumn'), `and said which field is wrong: "${bad.ErrorMessage}"`);

  console.log(`\n${failures === 0 ? 'PROVEN' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(2); });
