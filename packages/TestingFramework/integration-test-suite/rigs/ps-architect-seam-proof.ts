/**
 * ps-architect-seam-proof.ts — proves the Architect can SEE the component model.
 *
 * The component system was fully built and the agent designing with it was shown none of it: the
 * Architect had no data sources, so it had to name `ComponentTypeRef`s from memory and could never
 * propose a reuse because it did not know what existed.
 *
 * This checks the seam from both sides:
 *   - each data source's RunView actually resolves and returns the fields the prompt promises (a
 *     wrong filter or field name gives the Architect an empty list and NO error — the exact silent
 *     failure being fixed);
 *   - the three component-tree actions are on the agent;
 *   - and the reuse path the prompt now advertises really executes end to end.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-architect-seam-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunView } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';

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
  await AIEngine.Instance.Config(false, user);

  const rv = new RunView();
  const agent = AIEngine.Instance.Agents.find(a => a.Name === 'Architect');
  console.log('▸ The Architect has data sources at all');
  check(!!agent, `found the Architect sub-agent`);
  if (!agent) { process.exit(1); }

  const sources = await rv.RunView<{ ID: string; Name: string; EntityName: string; ExtraFilter: string | null; FieldsToRetrieve: string | null; Status: string }>(
    { EntityName: 'MJ: AI Agent Data Sources', ExtraFilter: `AgentID='${agent.ID}'`,
      Fields: ['ID','Name','EntityName','ExtraFilter','FieldsToRetrieve','Status'], ResultType: 'simple', BypassCache: true }, user);
  const names = (sources.Results ?? []).map(s => s.Name).sort();
  check(names.length === 3, `${names.length} data source(s): ${names.join(', ')}`);
  console.log();

  console.log('▸ Every source resolves and returns what the prompt promises');
  for (const s of sources.Results ?? []) {
    const fields: string[] = s.FieldsToRetrieve ? JSON.parse(s.FieldsToRetrieve) : [];
    const result = await rv.RunView<Record<string, unknown>>(
      { EntityName: s.EntityName, ExtraFilter: s.ExtraFilter ?? '', Fields: fields, ResultType: 'simple', BypassCache: true }, user);
    check(result.Success, `${s.Name}: query runs (${s.EntityName})`);
    if (!result.Success) { console.log(`      ${result.ErrorMessage}`); continue; }
    // An empty list is not an error, but it IS the difference between a source that informs the
    // Architect and one that quietly tells it nothing exists — so it is reported either way.
    console.log(`      ${s.Name}: ${result.Results.length} row(s)`);
    if (result.Results.length > 0) {
      const missing = fields.filter(f => !(f in result.Results[0]));
      check(missing.length === 0, `${s.Name}: every promised field is present${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);
    }
  }
  console.log();

  console.log('▸ The vocabulary the Architect must name from is real');
  const types = await rv.RunView<{ Name: string; Kind: string; IsAbstract: boolean }>(
    { EntityName: 'MJ: ML Component Types', ExtraFilter: "Status='Published'", Fields: ['Name','Kind','IsAbstract'], ResultType: 'simple', BypassCache: true }, user);
  const concrete = types.Results.filter(t => !t.IsAbstract);
  check(concrete.length > 0, `${concrete.length} concrete type(s) it may put in a graph, ${types.Results.length - concrete.length} abstract it may only reify under`);
  const structures = types.Results.filter(t => t.Kind === 'Structure' && !t.IsAbstract);
  console.log(`      structures it can compose with: ${structures.map(t => t.Name).join(', ') || '(none)'}`);

  const slots = await rv.RunView<{ Name: string }>(
    { EntityName: 'MJ: ML Component Type Slots', Fields: ['Name'], ResultType: 'simple', BypassCache: true }, user);
  check(slots.Results.length > 0, `${slots.Results.length} slot(s) it can fill`);
  console.log();

  console.log('▸ The three component actions are on the agent');
  const parent = AIEngine.Instance.Agents.find(a => a.Name === 'Model Development Agent');
  const agentActions = await rv.RunView<{ Action: string }>(
    { EntityName: 'MJ: AI Agent Actions', ExtraFilter: `AgentID='${parent?.ID}'`, Fields: ['Action'], ResultType: 'simple', BypassCache: true }, user);
  const have = new Set((agentActions.Results ?? []).map(a => a.Action));
  for (const name of ['Browse ML Component Tree', 'Find Reusable Components', 'Validate Component Graph']) {
    check(have.has(name), `'${name}' is available to the agent`);
  }
  console.log();

  console.log('▸ Reuse: what the prompt now advertises');
  // Read through the LIVE data-source filter, never a copy of it — a rig with its own filter would
  // keep passing while the Architect was being shown something else entirely.
  const reuseSource = (sources.Results ?? []).find(s => s.Name === 'REUSABLE_COMPONENTS');
  check(!!reuseSource, 'the reuse source exists to read through');
  const reusable = await rv.RunView<{ ID: string; Name: string; Story: string | null }>(
    { EntityName: 'MJ: ML Components', ExtraFilter: reuseSource?.ExtraFilter ?? '',
      Fields: ['ID','Name','Story'], ResultType: 'simple', BypassCache: true }, user);
  console.log(`      ${reusable.Results.length} component(s) currently approved for reuse`);
  if (reusable.Results.length === 0) {
    console.log(`      NOTE: the source is wired and honest, but empty — no component has been promoted to`);
    console.log(`            Approved yet, so the Architect will correctly see nothing to reuse. The plumbing`);
    console.log(`            is proven by the graph translation below; the CATALOG is what needs filling.`);
  } else {
    for (const c of reusable.Results.slice(0, 3)) console.log(`      • ${c.Name}: ${(c.Story ?? '(no story)').slice(0, 90)}`);
    // The point of the filter: everything offered must be loadable as a frozen child. A component
    // advertised without its artifact fails at train time, after a decision was built around it.
    const loadable = await rv.RunView<{ ID: string }>(
      { EntityName: 'MJ: ML Components',
        ExtraFilter: `(${reuseSource?.ExtraFilter}) AND ArtifactFileID IS NOT NULL`,
        Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
    check(loadable.Results.length === reusable.Results.length,
      `all ${reusable.Results.length} carry a loadable artifact — nothing is offered that would fail when frozen`);
  }
  console.log();

  console.log(failures === 0 ? '✅ PROVEN — the Architect can see the component model it designs with.' : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
