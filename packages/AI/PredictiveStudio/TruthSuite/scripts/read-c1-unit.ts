/**
 * Reads the C1 renewal unit's rows from the loaded C1 corpus through MJAPI and prints the resolution counts as one
 * JSON line. Needs MJAPI running and MJ_API_KEY, GRAPHQL_PORT in the environment (the repo env file).
 *
 *   tsx scripts/read-c1-unit.ts
 */
import type { PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PredictionUnitRowReader, ProviderAssemblyMetadata, RunViewDataAccess } from '@memberjunction/predictive-studio';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { LoadClientConfig } from '@memberjunction/testing-integration';

/** Fixed id for the in-memory unit; it is never saved. */
const UNIT_ID = '6C1A0E2B-0000-4000-8000-0000000000C1';

/** Connect with the system API key on a separate connection and return the provider. */
async function connect(): Promise<GraphQLDataProvider> {
  const client = LoadClientConfig();
  const provider = new GraphQLDataProvider();
  const config = new GraphQLProviderConfigData('', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey);
  if (!(await provider.Config(config, undefined, true))) throw new Error('GraphQLDataProvider Config() returned false');
  return provider;
}

/** The registered entity over a pstruth table; fails loudly when the truth suite is not provisioned. */
function truthEntityName(provider: GraphQLDataProvider, baseTable: string): string {
  const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === baseTable);
  if (!entity) throw new Error(`No entity is registered over pstruth.${baseTable}; provision the truth suite first`);
  return entity.Name;
}

/** The C1 renewal unit: renewed = the next dues period within 400 days of this one. */
function c1RenewalUnit(provider: GraphQLDataProvider): PredictionUnitSpec {
  return {
    id: UNIT_ID, lineageRootId: UNIT_ID, version: 1, name: 'C1 renewal (person x dues period)',
    rows: { kind: 'grain-x-periods', grainEntity: truthEntityName(provider, 'C1Person'), childEntity: truthEntityName(provider, 'C1DuesPeriod'), foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] },
    label: { rule: { kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 }, windowDays: 400, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
    censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: truthEntityName(provider, 'C1OrderHeader'), field: 'OrderDate' } },
    history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
    groupKey: 'PersonID', temporal: null,
    decision: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: 150, period: 'month' },
    incumbent: { kind: 'rule', name: 'renewed last year', scoreExpression: 'prior_dues_periods_400d >= 2' },
    authoredBy: { kind: 'human', userId: provider.CurrentUser.ID },
  };
}

async function main(): Promise<void> {
  const provider = await connect();
  const out = await new PredictionUnitRowReader().Read(c1RenewalUnit(provider), {
    DataAccess: new RunViewDataAccess(provider.CurrentUser, provider),
    Metadata: new ProviderAssemblyMetadata(provider),
    Read: { mode: 'complete' },
    Now: new Date(),
  });
  console.log(JSON.stringify(out.Status === 'read' ? out.Counts : out.Refusal));
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
