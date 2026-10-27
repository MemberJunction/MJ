/**
 * Wire probe for the immutable Prediction Unit version rule. Connects to MJAPI with the system API key, saves a
 * version-1 unit, edits LabelWindowDays on the saved row and saves again; the server must refuse the second save.
 * With --label-version it saves a version 1, then a version 2 that changes the outcome window but keeps
 * LabelVersion 1 (the server must refuse it), corrects LabelVersion to 2 (accepted), saves a version 3 through
 * PredictionUnitVersioning with a description change only (LabelVersion stays 2) and tries a version 5 (refused: versions
 * must be consecutive).
 *
 *   tsx scripts/probe-unit-immutability.ts                  create the probe unit and attempt the edit
 *   tsx scripts/probe-unit-immutability.ts --label-version  the LabelVersion and consecutive-version checks
 *   tsx scripts/probe-unit-immutability.ts --cleanup        delete every probe unit row through the entity
 *
 * Needs MJAPI running and MJ_API_KEY, GRAPHQL_PORT in the environment (the repo env file).
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { MetadataEntityFactory, PredictionUnitVersioning } from '@memberjunction/predictive-studio';
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
  unit.UnitRows = JSON.stringify({ kind: 'grain-x-periods', grainEntity: 'PS Truth: C1Person', childEntity: 'PS Truth: C1DuesPeriod', foreignKey: 'PersonID', periodDate: 'OrderDate', filter: [] });
  unit.LabelRule = JSON.stringify({ kind: 'next-period', periodIndexField: 'PeriodIndex', offset: 1 });
  unit.LabelWindowDays = 400;
  unit.LabelGapDays = 0;
  unit.TaskType = JSON.stringify({ kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 });
  unit.LabelVersion = 1;
  unit.Censoring = JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'PS Truth: C1OrderHeader', field: 'OrderDate' } });
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

/** A later version of the probe lineage, written by hand so the probe controls Version and LabelVersion. */
async function saveHandWrittenVersion(provider: GraphQLDataProvider, lineageRootID: string, version: number, labelVersion: number): Promise<MJPredictionUnitEntity> {
  const unit = await provider.GetEntityObject<MJPredictionUnitEntity>(ENTITY_NAME, provider.CurrentUser);
  fillProbeUnit(unit);
  unit.LineageRootID = lineageRootID;
  unit.Version = version;
  unit.LabelWindowDays = 365;
  unit.LabelVersion = labelVersion;
  const saved = await unit.Save();
  console.log(`v${version} with LabelVersion ${labelVersion}: save ${saved}`);
  if (!saved) console.log(unit.LatestResult?.CompleteMessage);
  return unit;
}

async function probeLabelVersion(provider: GraphQLDataProvider): Promise<void> {
  console.log(`probe rows before: ${await countProbeRows(provider)}`);
  const v1 = await provider.GetEntityObject<MJPredictionUnitEntity>(ENTITY_NAME, provider.CurrentUser);
  fillProbeUnit(v1);
  const firstSave = await v1.Save();
  console.log(`v1: save ${firstSave}`);
  if (!firstSave) {
    console.log(v1.LatestResult?.CompleteMessage);
    return;
  }
  const v2 = await saveHandWrittenVersion(provider, v1.ID, 2, 1);
  v2.LabelVersion = 2;
  const corrected = await v2.Save();
  console.log(`v2 corrected to LabelVersion 2: save ${corrected}`);
  if (!corrected) {
    console.log(v2.LatestResult?.CompleteMessage);
    return;
  }
  const v3 = await PredictionUnitVersioning.CreateNextPredictionUnitVersion(v2, { Description: 'Probe version 3: description change only' }, { kind: 'human', userId: PROBE_AUTHOR_USER_ID }, new MetadataEntityFactory(provider), provider.CurrentUser);
  console.log(`v3 through PredictionUnitVersioning: Version ${v3.Version}, LabelVersion ${v3.LabelVersion}`);
  await saveHandWrittenVersion(provider, v1.ID, 5, 2);
  console.log(`probe rows after: ${await countProbeRows(provider)}`);
}

/** Every probe unit row, newest version first (so a later version is deleted before the row it follows). */
async function findProbeRows(provider: GraphQLDataProvider): Promise<MJPredictionUnitEntity[]> {
  const found = await RunView.FromMetadataProvider(provider).RunView<MJPredictionUnitEntity>(
    { EntityName: ENTITY_NAME, ExtraFilter: `Name='${PROBE_UNIT_NAME}'`, OrderBy: 'Version DESC', ResultType: 'entity_object' },
    provider.CurrentUser,
  );
  if (!found.Success) throw new Error(`probe unit lookup failed: ${found.ErrorMessage}`);
  return found.Results;
}

/** How many probe unit rows exist (count only). */
async function countProbeRows(provider: GraphQLDataProvider): Promise<number> {
  const found = await RunView.FromMetadataProvider(provider).RunView<MJPredictionUnitEntity>(
    { EntityName: ENTITY_NAME, ExtraFilter: `Name='${PROBE_UNIT_NAME}'`, ResultType: 'count_only' },
    provider.CurrentUser,
  );
  if (!found.Success) throw new Error(`probe unit count failed: ${found.ErrorMessage}`);
  return found.TotalRowCount;
}

async function cleanup(provider: GraphQLDataProvider): Promise<void> {
  for (const unit of await findProbeRows(provider)) {
    const deleted = await unit.Delete();
    console.log(`delete: ${deleted}`);
    if (!deleted) console.log(unit.LatestResult?.CompleteMessage);
  }
  console.log(`probe rows after cleanup: ${await countProbeRows(provider)}`);
}

async function main(): Promise<void> {
  const provider = await connect();
  if (process.argv.includes('--cleanup')) await cleanup(provider);
  else if (process.argv.includes('--label-version')) await probeLabelVersion(provider);
  else await probeEdit(provider);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
