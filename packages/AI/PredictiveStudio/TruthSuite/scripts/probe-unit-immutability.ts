/**
 * Wire probe for the immutable Prediction Unit version rule. Connects to MJAPI with the system API key, saves a
 * version-1 unit, edits LabelWindowDays on the saved row and saves again; the server must refuse the second save.
 *
 *   tsx scripts/probe-unit-immutability.ts            create the probe unit and attempt the edit
 *   tsx scripts/probe-unit-immutability.ts --cleanup  delete the probe unit through the entity
 *
 * Needs MJAPI running and MJ_API_KEY, GRAPHQL_PORT in the environment (the repo env file).
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { LoadClientConfig } from '@memberjunction/testing-integration';

const PROBE_UNIT_NAME = 'Member renewal (immutability probe)';
const ENTITY_NAME = 'MJ: Prediction Units';
/** Placeholder author user id: the unit's AuthoredBy JSON needs a UUID-shaped value; it is not resolved to a user. */
const PROBE_AUTHOR_USER_ID = '3B0F6C59-0000-4000-8000-000000000001';

/** Connect with the system API key on a separate connection and return the provider. */
async function connect(): Promise<GraphQLDataProvider> {
  const client = LoadClientConfig();
  const provider = new GraphQLDataProvider();
  const config = new GraphQLProviderConfigData('', client.Url, '', async () => '', '__mj', undefined, undefined, client.MJAPIKey);
  if (!(await provider.Config(config, undefined, true))) throw new Error('GraphQLDataProvider Config() returned false');
  return provider;
}

/** The version-1 renewal unit the truth suite stores. The server gives it its ID and makes it its own lineage root. */
function fillProbeUnit(unit: MJPredictionUnitEntity): void {
  unit.NewRecord();
  unit.Version = 1;
  unit.Name = PROBE_UNIT_NAME;
  unit.UnitRows = JSON.stringify({ kind: 'grain-x-periods', grainEntity: 'PS Truth: C1 People', childEntity: 'PS Truth: C1 Dues Periods', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] });
  unit.LabelRule = JSON.stringify({ kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 });
  unit.LabelWindowDays = 400;
  unit.LabelGapDays = 0;
  unit.TaskType = JSON.stringify({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 });
  unit.LabelVersion = 1;
  unit.Censoring = JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'PS Truth: C1 Order Headers', field: 'OrderDate' } });
  unit.ChangeHistoryPolicy = JSON.stringify({ onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' });
  unit.DecisionSpec = JSON.stringify({ action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: 150, period: 'month' });
  unit.IncumbentHeuristic = JSON.stringify({ kind: 'none' });
  unit.AuthoredBy = JSON.stringify({ kind: 'human', userId: PROBE_AUTHOR_USER_ID });
}

/** Reloads the saved unit and compares its LineageRootID to its ID. */
async function lineageRootEqualsID(provider: GraphQLDataProvider, id: string): Promise<boolean> {
  const reloaded = await provider.GetEntityObject<MJPredictionUnitEntity>(ENTITY_NAME, provider.CurrentUser);
  if (!(await reloaded.Load(id))) throw new Error(`probe unit ${id} could not be reloaded`);
  return UUIDsEqual(reloaded.LineageRootID, reloaded.ID);
}

async function probeEdit(provider: GraphQLDataProvider): Promise<void> {
  const unit = await provider.GetEntityObject<MJPredictionUnitEntity>(ENTITY_NAME, provider.CurrentUser);
  fillProbeUnit(unit);
  const firstSave = await unit.Save();
  console.log(`first save: ${firstSave}`);
  if (!firstSave) {
    console.log(unit.LatestResult?.CompleteMessage);
    return;
  }
  console.log(`lineage root equals id: ${await lineageRootEqualsID(provider, unit.ID)}`);
  unit.LabelWindowDays = 365;
  console.log(`second save: ${await unit.Save()}`);
  console.log(unit.LatestResult?.CompleteMessage);
}

async function cleanup(provider: GraphQLDataProvider): Promise<void> {
  const found = await RunView.FromMetadataProvider(provider).RunView<MJPredictionUnitEntity>(
    { EntityName: ENTITY_NAME, ExtraFilter: `Name='${PROBE_UNIT_NAME}'`, ResultType: 'entity_object' },
    provider.CurrentUser,
  );
  if (!found.Success) throw new Error(`probe unit lookup failed: ${found.ErrorMessage}`);
  for (const unit of found.Results) {
    const deleted = await unit.Delete();
    console.log(`delete: ${deleted}`);
    if (!deleted) console.log(unit.LatestResult?.CompleteMessage);
  }
}

async function main(): Promise<void> {
  const provider = await connect();
  if (process.argv.includes('--cleanup')) await cleanup(provider);
  else await probeEdit(provider);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
