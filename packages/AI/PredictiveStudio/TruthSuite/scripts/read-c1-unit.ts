/**
 * Reads the C1 renewal unit's rows from the loaded C1 corpus through MJAPI and prints the resolution counts as one
 * JSON line. Needs MJAPI running and MJ_API_KEY, GRAPHQL_PORT in the environment (the repo env file).
 *
 *   tsx scripts/read-c1-unit.ts
 */
import { PredictionUnit, ProtocolRows, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PredictionUnitRowReader, ProviderAssemblyMetadata, RunViewDataAccess } from '@memberjunction/predictive-studio';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { UnitFixtures } from '../src/fixtures/unit-fixtures';
import { ScriptRunner } from './script-runner';

/** Fixed id for the in-memory unit; it is never saved. */
const UNIT_ID = '6C1A0E2B-0000-4000-8000-0000000000C1';

/** The C1 renewal unit as an unsaved version-1 spec, parsed from the gates' own draft (`UnitFixtures.C1RenewalUnitDraft`). */
function c1RenewalUnit(provider: GraphQLDataProvider): PredictionUnitSpec {
  const parsed = PredictionUnit.ParsePredictionUnitRow({
    ...ProtocolRows.UnitDraftColumns(UnitFixtures.C1RenewalUnitDraft({ Provider: provider })),
    ID: UNIT_ID, LineageRootID: UNIT_ID, Version: 1, LabelVersion: 1,
    AuthoredBy: JSON.stringify({ kind: 'human', userId: provider.CurrentUser.ID }),
  });
  if (parsed.Ok === false) throw new Error(`the C1 renewal unit does not parse: ${parsed.Errors.join('; ')}`);
  return parsed.Value;
}

async function main(): Promise<void> {
  const provider = await ScriptRunner.ConnectWithApiKey();
  const out = await new PredictionUnitRowReader().Read(c1RenewalUnit(provider), {
    DataAccess: new RunViewDataAccess(provider.CurrentUser, provider),
    Metadata: new ProviderAssemblyMetadata(provider),
    Read: { mode: 'complete' },
    Now: new Date(),
  });
  if (out.Status === 'refused') {
    console.log(JSON.stringify(out.Refusal));
    process.exit(1);
  }
  console.log(JSON.stringify(out.Counts));
}

void ScriptRunner.Run(main);
