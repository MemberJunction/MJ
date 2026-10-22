/**
 * plan.md: "going to a page should NEVER, NEVER trigger such things automatically, it must in a
 * very clean way tell the user to click a button to start discovery of tables".
 *
 * A button needs a call that returns at once. The only discovery entry point that existed was
 * synchronous - it runs the whole pipeline inline and times out at the gateway on a large catalog -
 * so both wizards auto-triggered on page entry and adopted whatever run they happened to find.
 * IntegrationStartSchemaRefresh is the explicit start: it returns a tailable RunID immediately.
 *
 * Source-level, for the same reason the sibling default tests are: these are decorator and
 * argument shapes, and invoking the resolver needs a provider, a connector driver and the RSU
 * pipeline stood up.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');

function methodBody(name: string): string {
  const start = SRC.indexOf(`async ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('IntegrationStartSchemaRefresh', () => {
  it('exists as a mutation', () => {
    expect(SRC).toMatch(/@Mutation\(\(\) => StartSchemaRefreshOutput\)/);
    expect(SRC).toMatch(/async IntegrationStartSchemaRefresh\(/);
  });

  it('launches DETACHED rather than awaiting the pipeline', () => {
    const body = methodBody('IntegrationStartSchemaRefresh');
    expect(body).toMatch(/startSchemaRefreshPipelineDetached\(/);
    // an await on the pipeline would reintroduce the gateway timeout this exists to avoid
    expect(body).not.toMatch(/await this\.runSchemaRefreshPipeline\(/);
  });

  it('refuses a second start with the reason, instead of handing back a doomed RunID', () => {
    const body = methodBody('IntegrationStartSchemaRefresh');
    expect(body).toMatch(/GetMaintenanceLock\(/);
    expect(body).toMatch(/RunID: 'not-started'/);
    expect(body).toMatch(/BlockedBy/);
  });

  it('probes the lock BEFORE launching, or the refusal is useless', () => {
    const body = methodBody('IntegrationStartSchemaRefresh');
    expect(body.indexOf('GetMaintenanceLock('))
      .toBeLessThan(body.indexOf('startSchemaRefreshPipelineDetached('));
  });

  it('uses the read-write provider, since the pipeline writes the catalog', () => {
    expect(methodBody('IntegrationStartSchemaRefresh')).toMatch(/GetReadWriteProvider\(/);
  });

  it('is a separate mutation, so the synchronous one keeps its real-counts contract', () => {
    // the synchronous reply promises counts because it waited; a detached launch has only zeros
    expect(SRC).toMatch(/async IntegrationRefreshConnectorSchema\(/);
    const detached = methodBody('IntegrationStartSchemaRefresh');
    expect(detached).not.toMatch(/ObjectsCreated/);
  });
});
