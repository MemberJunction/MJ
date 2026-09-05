/**
 * ps-capability-diagnosis-proof.ts — the first-meeting artefact, run against real data.
 *
 * Feeds a plausible association's strategic plan through `Assess Capability Coverage` and prints the
 * diagnosis. The checks are about not misleading a client in their first meeting:
 *
 *   - the two axes stay separate (measurable ≠ evidenced), because each implies different work;
 *   - an objective nothing describes comes back as a Gap rather than a false match — the failure
 *     that matters, and the one embedding similarity alone could NOT catch: on this corpus the
 *     parking-lease objective out-scored real matches on every numeric measure tried;
 *   - the corpus sizes travel with the result, so a gap can be read as "not catalogued" rather
 *     than "not possible";
 *   - the same document twice produces the same diagnosis.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-capability-diagnosis-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { UserInfo } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase, ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { ObjectiveCoverage, CoverageVerdict } from '@memberjunction/predictive-studio';

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

/** A plausible association strategic plan. The last section is deliberately unrelated to any model. */
const PLAN = `
# Membership

- Grow paid membership by ten percent over the next two years
- Reduce lapse among first-year professional members
- Increase how recently and how often members engage with our programs

# Revenue

- Grow non-dues revenue through increased member spending on events and courses

# Facilities

- Complete the seismic retrofit of the downtown headquarters building by 2028
- Negotiate a favourable renewal of the parking structure lease
`;

async function runByName(name: string, params: ActionParam[], user: UserInfo) {
  const action = ActionEngineBase.Instance.Actions.find(a => a.Name === name);
  if (!action) throw new Error(`The '${name}' action is not in metadata.`);
  const p = new RunActionParams();
  p.Action = action; p.ContextUser = user; p.Params = params; p.Filters = [];
  return ActionEngineServer.Instance.RunAction(p);
}
const output = (r: { Params?: ActionParam[] }, name: string): unknown => r.Params?.find(p => p.Name === name)?.Value;

const ICON: Record<CoverageVerdict, string> = {
  Covered: '✓✓', Measurable: '✓·', Evidenced: '·✓', Partial: '~ ', Gap: '  ', Undetermined: '??',
};

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
  await AIEngine.Instance.Config(false, user);

  console.log('▸ The diagnosis');
  const result = await runByName('Assess Capability Coverage', [{ Name: 'Text', Value: PLAN, Type: 'Input' }], user);
  check(result.Success, `ran`);
  if (!result.Success) { console.log(`  ${result.Message}`); process.exit(1); }

  const objectives = output(result, 'Objectives') as ObjectiveCoverage[];
  const summary = output(result, 'Summary') as Record<CoverageVerdict, number>;
  const signalsConsidered = output(result, 'SignalsConsidered') as number;
  const findingsConsidered = output(result, 'FindingsConsidered') as number;

  let section: string | null = null;
  for (const o of objectives) {
    if (o.Objective.Section !== section) {
      section = o.Objective.Section;
      console.log(`\n  ${section ?? '(no section)'}`);
    }
    console.log(`   ${ICON[o.Verdict]} [${o.Verdict.padEnd(12)}] ${o.Objective.Text.slice(0, 72)}`);
    if (o.Rationale) console.log(`                 ${o.Rationale.slice(0, 150)}`);
  }
  console.log(`\n  ${result.Message}\n`);

  console.log('▸ The two axes stay separate');
  check(objectives.length >= 5, `${objectives.length} objectives read from the plan`);
  check(
    Object.values(summary).reduce((a, b) => a + b, 0) === objectives.length,
    'every objective carries exactly one verdict',
  );
  const engagement = objectives.find(o => /engage/i.test(o.Objective.Text));
  check(!!engagement, 'the engagement objective was read');
  if (engagement) {
    check(engagement.Verdict !== 'Gap', `engagement is not a gap — it is '${engagement.Verdict}'`);
    check(engagement.Signals.length > 0, `matched ${engagement.Signals.length} signal(s), best ${engagement.Signals[0]?.Similarity.toFixed(3)}`);
  }
  console.log();

  console.log('▸ Something nothing describes comes back as a gap, not a false match');
  const facilities = objectives.filter(o => o.Objective.Section === 'Facilities');
  check(facilities.length > 0, `${facilities.length} facilities objective(s) read`);
  check(
    facilities.every(o => o.Verdict === 'Gap' || o.Verdict === 'Partial'),
    `facilities objectives are ${facilities.map(o => o.Verdict).join(', ')} — nothing here models buildings`,
  );
  for (const f of facilities) console.log(`      "${f.Rationale ?? '(no rationale)'}"`);
  console.log();

  console.log('▸ Absence is reported as absence of a DESCRIPTION');
  check(signalsConsidered > 0, `matched against ${signalsConsidered} signal(s) and ${findingsConsidered} finding(s)`);
  const gap = objectives.find(o => o.Verdict === 'Gap');
  check(!gap || gap.NextStep.includes('nobody has described it yet'), 'a gap says the description may be what is missing');
  check(String(result.Message).includes('nothing DESCRIBED covers it'), 'the summary says what a gap means');
  console.log();

  console.log('▸ What is reproducible, and what is judgment');
  const again = await runByName('Assess Capability Coverage', [{ Name: 'Text', Value: PLAN, Type: 'Input' }], user);
  const repeat = output(again, 'Objectives') as ObjectiveCoverage[];
  // GUARANTEED: chunking and retrieval are deterministic, so the same document always yields the
  // same objectives in the same order with the same shortlists.
  check(
    JSON.stringify(repeat.map(o => [o.Objective.Text, o.Signals.map(s => s.ID)])) ===
      JSON.stringify(objectives.map(o => [o.Objective.Text, o.Signals.map(s => s.ID)])),
    'chunking and retrieval are reproducible — the same objectives, the same shortlists',
  );
  // NOT guaranteed: the verdict is a judgment. Reported as an observation, never asserted — a test
  // that demanded identical verdicts would be asserting an LLM is deterministic, which it is not.
  const agreed = repeat.filter((o, i) => o.Verdict === objectives[i]?.Verdict).length;
  console.log(`  note: ${agreed}/${objectives.length} verdicts matched between the two runs.`);
  console.log(`        Verdicts are a judgment and may move at the margin; the gaps are what matter,`);
  console.log(`        and a Gap↔Covered flip would be a real problem worth investigating.`);
  const flipped = repeat.filter((o, i) => {
    const before = objectives[i]?.Verdict;
    return (before === 'Gap') !== (o.Verdict === 'Gap');
  });
  check(flipped.length === 0, `no objective flipped in or out of Gap between runs`);
  console.log();

  console.log(failures === 0 ? '✅ PROVEN — a strategy document in, an honest capability read out.' : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
