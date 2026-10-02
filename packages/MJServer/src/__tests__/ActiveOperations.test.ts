/**
 * plan.md: "In the UI for the integration ... there shouldbe an area that shows thigns that are
 * running actively, this can be syncs, rsu, discovery, etc." and, crucially, "Let us say i clear
 * browser cache and then i go to that integration page, i should see the same steps i mentioned
 * hapepning there to". Everything here is derived server-side for exactly that reason.
 *
 * A surface previously had to fan out to four queries and stitch them, and each got the
 * attribution wrong in its own way. The two rules that kept breaking are pinned below.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');

function methodBody(name: string): string {
  const i = SRC.indexOf(`async ${name}(`);
  expect(i, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(i);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('IntegrationGetActiveOperations', () => {
  const body = () => methodBody('IntegrationGetActiveOperations');

  it('exists and is authorized per connection', () => {
    expect(SRC).toMatch(/@Query\(\(\) => ActiveOperationsOutput\)/);
    expect(body()).toMatch(/userCanReadCompanyIntegration\(/);
  });

  it('covers sync, in-flight runs and RSU in ONE call', () => {
    const b = body();
    expect(b).toMatch(/GetSyncProgressAsync\(/);
    expect(b).toMatch(/ListRuns\(/);
    expect(b).toMatch(/RuntimeSchemaManager\.Instance\.GetStatus\(\)/);
  });

  it('never narrates a ConnectorCreation run as a sync', () => {
    // it fetches nothing; calling it a sync made first-time setup claim record counts it never had
    const b = body();
    expect(b).toMatch(/kind === 'SyncRun'/);
    expect(b).not.toMatch(/Kind: 'sync'[\s\S]{0,200}ConnectorCreation/);
  });

  it('labels a process-wide RSU as workspace scope, not this connection', () => {
    const b = body();
    expect(b).toMatch(/rsuNamesThisConnection/);
    expect(b).toMatch(/Scope: 'workspace'/);
  });

  it('only reports the process RSU when no artifact tied one to this connection', () => {
    expect(body()).toMatch(/rsu\?\.Running && !rsuNamesThisConnection/);
  });

  it('marks only the sync cancellable', () => {
    const b = body();
    const syncBlock = b.slice(b.indexOf("Kind: 'sync'"), b.indexOf("Kind: 'sync'") + 700);
    expect(syncBlock).toMatch(/Cancellable: true/);
    const rsuBlock = b.slice(b.indexOf("Scope: 'workspace'"));
    expect(rsuBlock).toMatch(/Cancellable: false/);
  });

  it('surfaces the maintenance lock reason, so a refusal can say why', () => {
    expect(body()).toMatch(/GetMaintenanceLock\(/);
    expect(body()).toMatch(/MaintenanceLockReason/);
  });
});
