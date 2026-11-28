/**
 * The agent eval suite's world-loading step (scripts/a7b-world.ts, D5-58): for each of the seven child suites of
 * "Predictive Studio Agent Eval", the script loads the planted-truth dataset that child suite's Configuration names
 * (C1's child runs on the C1 corpus plus W1-signal s42, D5-45) and empties every other membership world and scenario
 * table, so exactly one dataset besides the C1 corpus is visible to the agent.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UUIDsEqual } from '@memberjunction/global';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatasetLoadContext } from '../db/dataset-loader';
import type { DatasetRef, LoadedDataset } from '../harness/types';

/** One child suite's world as the suite metadata declares it. */
interface ChildSuiteConfiguration {
  readonly worldId: string;
  readonly worldKind: 'corpus' | 'world' | 'scenario';
  readonly seed?: number;
}

interface SuiteMetadataRecord {
  readonly fields: { readonly Name: string; readonly ParentID?: string; readonly Configuration: ChildSuiteConfiguration };
  readonly primaryKey: { readonly ID: string };
}

/** What the mocked script plumbing records for one run of the script. */
interface ScriptRunState {
  Done: Promise<void> | null;
  Loaded: DatasetRef[];
  Queries: string[];
  PoolClosed: boolean;
}

const state = vi.hoisted<ScriptRunState>(() => ({ Done: null, Loaded: [], Queries: [], PoolClosed: false }));

vi.mock('../../scripts/script-runner', () => ({
  ScriptRunner: {
    ConnectWithApiKey: async () => ({ CurrentUser: { ID: 'test-user' } }),
    Run: (main: () => Promise<void>) => {
      state.Done = main();
      return state.Done;
    },
  },
}));

vi.mock('../db/connection', () => ({
  TruthConnection: {
    OpenPool: async () => ({
      request: () => ({
        query: async (text: string) => {
          state.Queries.push(text);
          return { recordset: [{}] };
        },
      }),
      close: async () => {
        state.PoolClosed = true;
      },
    }),
  },
}));

vi.mock('../db/dataset-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/dataset-loader')>();
  const real = actual.DatasetLoader;
  return {
    DatasetLoader: {
      WorldRowTable: (worldId: string) => real.WorldRowTable(worldId),
      WorldPersonTable: (worldId: string) => real.WorldPersonTable(worldId),
      ScenarioTable: (scenarioId: string) => real.ScenarioTable(scenarioId),
      Load: async (_ctx: DatasetLoadContext, ref: DatasetRef): Promise<Pick<LoadedDataset, 'Ref' | 'RowCount'>> => {
        state.Loaded.push(ref);
        return { Ref: ref, RowCount: 1 };
      },
    },
  };
});

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const SUITE_PATH = join(REPO_ROOT, 'metadata', 'test-suites', '.predictive-studio-agent-eval-suite.json');
const MEMBERSHIP_TABLES: Record<string, readonly string[]> = {
  'W1-signal': ['W1_MembershipYear', 'W1_Person'],
  'W2-noise': ['W2_MembershipYear', 'W2_Person'],
  'W3-leak-row': ['W3_MembershipYear', 'W3_Person'],
  'W7-small-imbalanced': ['W7_MembershipYear', 'W7_Person'],
};
const SCENARIO_TABLES: Record<string, readonly string[]> = { C4: ['Scn_C4'], N1c: ['Scn_N1c'] };

function ReadChildSuites(): readonly ChildSuiteConfiguration[] {
  const records = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as readonly SuiteMetadataRecord[];
  const parent = records.find((r) => r.fields.Name === 'Predictive Studio Agent Eval');
  if (!parent) throw new Error('the suite metadata has no "Predictive Studio Agent Eval" parent suite');
  return records
    .filter((r) => UUIDsEqual(r.fields.ParentID, parent.primaryKey.ID))
    .map((child) => child.fields.Configuration);
}

/** The dataset a child suite's world resolves to: its own, except the C1 corpus child, which runs on W1-signal s42. */
function ExpectedRef(child: ChildSuiteConfiguration): DatasetRef {
  if (child.worldKind === 'corpus') return { Kind: 'world', ID: 'W1-signal', Seed: 42 };
  if (child.seed === undefined) throw new Error(`child suite ${child.worldId} declares no seed`);
  return { Kind: child.worldKind, ID: child.worldId, Seed: child.seed } as DatasetRef;
}

/** The pstruth tables the script empties: every membership world and scenario table except the loaded dataset's. */
function ExpectedEmptiedTables(ref: DatasetRef): string[] {
  const all = { ...MEMBERSHIP_TABLES, ...SCENARIO_TABLES };
  return Object.entries(all)
    .filter(([id]) => id !== ref.ID)
    .flatMap(([, tables]) => tables);
}

function EmptiedTables(): string[] {
  return state.Queries.flatMap((q) => [...q.matchAll(/^DELETE FROM pstruth\.\[([^\]]+)\]/gm)].map((m) => m[1]));
}

async function RunScriptFor(worldId: string): Promise<void> {
  process.argv = ['node', 'a7b-world.ts', worldId];
  vi.resetModules();
  // The script runs its main when its module loads (`void ScriptRunner.Run(main)`), so each child world's run needs
  // a fresh load of the module after argv is set; a static import would run it once, before any argv is chosen.
  await import('../../scripts/a7b-world');
  if (!state.Done) throw new Error('the world script never called ScriptRunner.Run');
  await state.Done;
}

describe('a7b-world.ts — the world loader for each child suite (D5-58)', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    state.Done = null;
    state.Loaded = [];
    state.Queries = [];
    state.PoolClosed = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  const children = ReadChildSuites();

  it('the parent suite groups exactly the seven child worlds', () => {
    expect(children.map((c) => c.worldId).sort()).toEqual(
      ['C1', 'C4', 'N1c', 'W1-signal', 'W2-noise', 'W3-leak-row', 'W7-small-imbalanced'].sort()
    );
  });

  for (const child of ReadChildSuites()) {
    it(`resolves child suite ${child.worldId} to its world and empties every other world`, async () => {
      await RunScriptFor(child.worldId);
      const expected = ExpectedRef(child);
      expect(state.Loaded).toEqual([expected]);
      expect(EmptiedTables().sort()).toEqual(ExpectedEmptiedTables(expected).sort());
      expect(state.PoolClosed).toBe(true);
    });
  }

  it('refuses a world no child suite names', async () => {
    await expect(RunScriptFor('W9-multiclass')).rejects.toThrow(/usage: tsx scripts\/a7b-world\.ts/);
    expect(state.Loaded).toEqual([]);
  });
});
