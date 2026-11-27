/**
 * A7b baseline world switch (local to the uncommitted baseline worktree; never committed; generalises M0's
 * m0-world.ts). Loads one child suite's planted-truth dataset into pstruth through the truth suite's DatasetLoader and
 * empties every other membership world and scenario table (rows and dataset stamp), so exactly one dataset besides the
 * C1 corpus is visible to the agent. C1's child runs on C1 + W1-signal s42 (plan D5-45).
 *
 *   tsx scripts/a7b-world.ts C1|W1-signal|W2-noise|W3-leak-row|W7-small-imbalanced|C4|N1c
 */
import type sql from 'mssql';
import { ScriptRunner } from './script-runner';
import { TruthConnection } from '../src/db/connection';
import { DatasetLoader } from '../src/db/dataset-loader';
import type { DatasetRef, ScenarioID, WorldID } from '../src/harness/types';

type ChildWorld = 'C1' | 'W1-signal' | 'W2-noise' | 'W3-leak-row' | 'W7-small-imbalanced' | 'C4' | 'N1c';

const CHILD_DATASET: Record<ChildWorld, DatasetRef> = {
  'C1': { Kind: 'world', ID: 'W1-signal', Seed: 42 },
  'W1-signal': { Kind: 'world', ID: 'W1-signal', Seed: 42 },
  'W2-noise': { Kind: 'world', ID: 'W2-noise', Seed: 100 },
  'W3-leak-row': { Kind: 'world', ID: 'W3-leak-row', Seed: 42 },
  'W7-small-imbalanced': { Kind: 'world', ID: 'W7-small-imbalanced', Seed: 42 },
  'C4': { Kind: 'scenario', ID: 'C4', Seed: 2202 },
  'N1c': { Kind: 'scenario', ID: 'N1c', Seed: 2212 },
};
const MEMBERSHIP_WORLDS: readonly WorldID[] = ['W1-signal', 'W2-noise', 'W3-leak-row', 'W7-small-imbalanced'];
const SCENARIOS: readonly ScenarioID[] = ['C4', 'N1c'];

function isChildWorld(value: string | undefined): value is ChildWorld {
  return value !== undefined && Object.prototype.hasOwnProperty.call(CHILD_DATASET, value);
}

async function emptyTable(pool: sql.ConnectionPool, table: string): Promise<void> {
  const bare = table.startsWith('pstruth.') ? table.slice('pstruth.'.length) : table;
  await pool.request().query(`DELETE FROM pstruth.[${bare}];
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('pstruth.${bare}') AND minor_id = 0 AND name = 'pstruth_dataset')
      EXEC sys.sp_dropextendedproperty @name = 'pstruth_dataset', @level0type = 'SCHEMA', @level0name = 'pstruth', @level1type = 'TABLE', @level1name = '${bare}';`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!isChildWorld(arg)) throw new Error(`usage: tsx scripts/a7b-world.ts ${Object.keys(CHILD_DATASET).join('|')}`);
  const ref = CHILD_DATASET[arg];
  const provider = await ScriptRunner.ConnectWithApiKey();
  const pool = await TruthConnection.OpenPool();
  try {
    for (const world of MEMBERSHIP_WORLDS) {
      if (ref.Kind === 'world' && ref.ID === world) continue;
      await emptyTable(pool, DatasetLoader.WorldRowTable(world));
      await emptyTable(pool, DatasetLoader.WorldPersonTable(world));
    }
    for (const scenario of SCENARIOS) {
      if (ref.Kind === 'scenario' && ref.ID === scenario) continue;
      await emptyTable(pool, DatasetLoader.ScenarioTable(scenario));
    }
    const loaded = await DatasetLoader.Load({ Provider: provider, User: provider.CurrentUser, Pool: pool }, ref);
    const counts = await pool.request().query<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM pstruth.W1_MembershipYear) AS W1, (SELECT COUNT(*) FROM pstruth.W2_MembershipYear) AS W2,
              (SELECT COUNT(*) FROM pstruth.W3_MembershipYear) AS W3, (SELECT COUNT(*) FROM pstruth.W7_MembershipYear) AS W7,
              (SELECT COUNT(*) FROM pstruth.Scn_C4) AS C4, (SELECT COUNT(*) FROM pstruth.Scn_N1c) AS N1c,
              (SELECT COUNT(*) FROM pstruth.C1Person) AS C1Person`);
    console.log(JSON.stringify({ child: arg, loaded: `${loaded.Ref.ID} s${loaded.Ref.Seed}`, rows: loaded.RowCount, ...counts.recordset[0] }));
  } finally {
    await pool.close();
  }
}

void ScriptRunner.Run(main);
