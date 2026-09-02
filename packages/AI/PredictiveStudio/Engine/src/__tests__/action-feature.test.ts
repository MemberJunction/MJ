/**
 * Code as a feature — donation item 8.
 *
 * The approval gate and the coercion contract carry most of the weight. Both exist because the
 * quiet failure is worse than the loud one: an unapproved Action that yields nulls trains a model
 * on a feature that is silently absent, and an empty string coerced to `0` scores a record as
 * "measured zero" when the truth is "we got nothing back".
 */

import { describe, it, expect } from 'vitest';
import type { ActionFeatureStep } from '@memberjunction/predictive-studio-core';

import {
  ActionFeatureConfigError,
  ActionFeatureExtractor,
  clampToRange,
  coerceActionOutput,
  resolveActionContract,
  type ActionFeatureRunParams,
  type ActionFeatureRunResult,
  type IActionApprovalCheck,
  type IActionRunner,
} from '../feature-assembly/action-feature';

const STEP: ActionFeatureStep = {
  Id: 'a1',
  Kind: 'action',
  ActionRef: 'Compute Engagement Index',
  FeatureName: 'engagement_index',
};

/** Runs a caller-supplied function per record; records every invocation. */
class FakeRunner implements IActionRunner {
  public Calls: ActionFeatureRunParams[] = [];
  public InFlight = 0;
  public MaxInFlight = 0;
  constructor(private readonly reply: (p: ActionFeatureRunParams) => ActionFeatureRunResult | Promise<ActionFeatureRunResult>) {}
  async run(params: ActionFeatureRunParams): Promise<ActionFeatureRunResult> {
    this.Calls.push(params);
    this.InFlight++;
    this.MaxInFlight = Math.max(this.MaxInFlight, this.InFlight);
    try {
      return await this.reply(params);
    } finally {
      this.InFlight--;
    }
  }
}

class FakeApprovals implements IActionApprovalCheck {
  constructor(private readonly status: string | null) {}
  async approvalStatus(): Promise<string | null> {
    return this.status;
  }
}

function targets(...ids: string[]) {
  return ids.map((recordId) => ({ recordId, asOf: new Date('2026-06-01T00:00:00Z') }));
}

function ok(value: unknown): ActionFeatureRunResult {
  return { success: true, outputs: { Value: value } };
}

describe('coerceActionOutput', () => {
  it.each([
    [7, 7],
    [0, 0],
    [-3.5, -3.5],
    [true, 1],
    [false, 0],
    ['42', 42],
    [' 42 ', 42],
  ])('coerces %p to %p', (raw, expected) => {
    expect(coerceActionOutput(raw)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined], ['abc'], [NaN], [Infinity], [{}], [[]]])(
    'treats %p as no data, not zero',
    (raw) => {
      // The distinction that matters: `Number('')` is 0, which would score as a real measurement.
      expect(coerceActionOutput(raw)).toBeNull();
    },
  );
});

describe('clampToRange', () => {
  it('leaves an in-range value alone', () => {
    expect(clampToRange(5, 0, 10)).toEqual({ value: 5, clamped: false });
  });
  it('clamps and reports contract drift on both ends', () => {
    expect(clampToRange(-1, 0, 10)).toEqual({ value: 0, clamped: true });
    expect(clampToRange(99, 0, 10)).toEqual({ value: 10, clamped: true });
  });
  it('treats an omitted bound as unbounded', () => {
    expect(clampToRange(-500, undefined, 10)).toEqual({ value: -500, clamped: false });
  });
});

describe('resolveActionContract', () => {
  it('applies the default I/O contract', () => {
    const c = resolveActionContract(STEP);
    expect(c).toMatchObject({ recordParam: 'RecordID', asOfParam: 'AsOf', outputParam: 'Value', maxConcurrency: 8 });
  });

  it('honours per-step overrides', () => {
    const c = resolveActionContract({ ...STEP, RecordParam: 'MemberID', OutputParam: 'Score', MaxConcurrency: 2 });
    expect(c).toMatchObject({ recordParam: 'MemberID', outputParam: 'Score', maxConcurrency: 2 });
  });

  it.each([
    [{ ...STEP, ActionRef: '  ' }, 'names no Action'],
    [{ ...STEP, FeatureName: '' }, 'produces no named feature column'],
    [{ ...STEP, OutputMin: 10, OutputMax: 5 }, 'empty output range'],
    [{ ...STEP, Params: { bad: { nested: true } } as never }, 'must be a string, number, or boolean'],
  ])('refuses misconfiguration (%#)', (step, message) => {
    expect(() => resolveActionContract(step as ActionFeatureStep)).toThrow(message);
  });
});

describe('ActionFeatureExtractor — the approval gate', () => {
  it.each([['Pending'], ['Rejected']])('refuses to run an Action whose approval is %s', async (status) => {
    const runner = new FakeRunner(() => ok(1));
    const extractor = new ActionFeatureExtractor(runner, new FakeApprovals(status));

    await expect(extractor.extract(STEP, targets('r1'))).rejects.toThrow(ActionFeatureConfigError);
    // ...and nothing ran. The gate is a precondition, not a filter on the results.
    expect(runner.Calls).toHaveLength(0);
  });

  it('says which status it found and why that is not enough', async () => {
    const extractor = new ActionFeatureExtractor(new FakeRunner(() => ok(1)), new FakeApprovals('Pending'));
    await expect(extractor.extract(STEP, targets('r1'))).rejects.toThrow(/'Pending', not 'Approved'/);
  });

  it('refuses an Action that does not exist', async () => {
    const extractor = new ActionFeatureExtractor(new FakeRunner(() => ok(1)), new FakeApprovals(null));
    await expect(extractor.extract(STEP, targets('r1'))).rejects.toThrow(/does not exist/);
  });
});

describe('ActionFeatureExtractor — running', () => {
  const approved = () => new FakeApprovals('Approved');

  it('produces one value per record, passing the record id and as-of date', async () => {
    const runner = new FakeRunner((p) => ok(Number(String(p.params.RecordID).slice(1)) * 10));
    const values = await new ActionFeatureExtractor(runner, approved()).extract(STEP, targets('r1', 'r2', 'r3'));

    expect(values.get('r1')).toBe(10);
    expect(values.get('r2')).toBe(20);
    expect(values.get('r3')).toBe(30);
    expect(runner.Calls[0].params.AsOf).toBe('2026-06-01T00:00:00.000Z');
  });

  it('passes the step static params on every call', async () => {
    const runner = new FakeRunner(() => ok(1));
    await new ActionFeatureExtractor(runner, approved()).extract(
      { ...STEP, Params: { Window: 90, Mode: 'strict' } },
      targets('r1', 'r2'),
    );
    expect(runner.Calls.every((c) => c.params.Window === 90 && c.params.Mode === 'strict')).toBe(true);
  });

  it('reads the value from the configured output param', async () => {
    const runner = new FakeRunner(() => ({ success: true, outputs: { Value: 1, Score: 99 } }));
    const values = await new ActionFeatureExtractor(runner, approved()).extract(
      { ...STEP, OutputParam: 'Score' },
      targets('r1'),
    );
    expect(values.get('r1')).toBe(99);
  });

  it('clamps an out-of-contract value into the declared range', async () => {
    const runner = new FakeRunner(() => ok(500));
    const values = await new ActionFeatureExtractor(runner, approved()).extract(
      { ...STEP, OutputMin: 0, OutputMax: 100 },
      targets('r1'),
    );
    expect(values.get('r1')).toBe(100);
  });

  it('isolates a per-record failure as no-data, and keeps going', async () => {
    // One bad record must not cost the other 999 their features.
    const runner = new FakeRunner((p) =>
      p.params.RecordID === 'r2' ? { success: false, outputs: {}, message: 'row exploded' } : ok(5),
    );
    const values = await new ActionFeatureExtractor(runner, approved()).extract(STEP, targets('r1', 'r2', 'r3'));
    expect(values.get('r1')).toBe(5);
    expect(values.get('r2')).toBeNull();
    expect(values.get('r3')).toBe(5);
  });

  it('isolates a thrown runner error the same way', async () => {
    const runner = new FakeRunner((p) => {
      if (p.params.RecordID === 'r1') throw new Error('network');
      return ok(5);
    });
    const values = await new ActionFeatureExtractor(runner, approved()).extract(STEP, targets('r1', 'r2'));
    expect(values.get('r1')).toBeNull();
    expect(values.get('r2')).toBe(5);
  });

  it('fails the whole run on a config error, rather than nulling everyone', async () => {
    // A rejected input set is wrong for every record — nulls would look like "this signal is
    // always absent" instead of "this is wired up wrong".
    const runner = new FakeRunner(() => ({ success: false, outputs: {}, configError: true, message: "unknown param 'Windo'" }));
    await expect(new ActionFeatureExtractor(runner, approved()).extract(STEP, targets('r1', 'r2'))).rejects.toThrow(
      /rejected its inputs — unknown param 'Windo'/,
    );
  });

  it('respects MaxConcurrency', async () => {
    const runner = new FakeRunner(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return ok(1);
    });
    await new ActionFeatureExtractor(runner, approved()).extract({ ...STEP, MaxConcurrency: 2 }, targets('a', 'b', 'c', 'd', 'e'));
    expect(runner.MaxInFlight).toBeLessThanOrEqual(2);
    expect(runner.Calls).toHaveLength(5);
  });

  it('does nothing at all for an empty population', async () => {
    const runner = new FakeRunner(() => ok(1));
    expect((await new ActionFeatureExtractor(runner, approved()).extract(STEP, [])).size).toBe(0);
    expect(runner.Calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// End to end through the assembler: the column reaches the matrix, and the gate
// stops the assembly rather than quietly emptying the column.
// ---------------------------------------------------------------------------

import type { FeatureStepGraph, LeakageGuard, SourceBinding } from '@memberjunction/predictive-studio-core';
import {
  FeatureAssemblyExecutor,
  type FeatureAssemblyParams,
  type FetchRowsParams,
  type FetchRowsResult,
  type IFeatureDataAccess,
  type SourceRow,
} from '../feature-assembly';

class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    return rows ? { Success: true, Rows: rows } : { Success: false, Rows: [], ErrorMessage: `no fixture: ${params.EntityName}` };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

const MEMBERS: SourceRow[] = [
  { ID: 'm1', tenure: 12, Renewed: 'yes' },
  { ID: 'm2', tenure: 3, Renewed: 'no' },
];

function assembleWithAction(runner: IActionRunner, approvals: IActionApprovalCheck, step?: Partial<ActionFeatureStep>) {
  const sources: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];
  const guard: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.9 };
  const steps: FeatureStepGraph = {
    Steps: [
      { Id: 's', Kind: 'select', Columns: ['tenure'] },
      { ...STEP, ...step } as ActionFeatureStep,
    ],
  };
  const params: FeatureAssemblyParams = {
    targetEntityName: 'Members',
    records: MEMBERS,
    sources,
    steps,
    asOf: { Mode: 'none' },
    leakageGuard: guard,
    dataAccess: new InMemoryDataAccess({ Members: MEMBERS }),
    actionRunner: runner,
    actionApprovals: approvals,
  };
  return new FeatureAssemblyExecutor().assemble(params);
}

describe('FeatureAssemblyExecutor — action steps', () => {
  it('adds the action feature as a numeric column, one value per record', async () => {
    const runner = new FakeRunner((p) => ok(p.params.RecordID === 'm1' ? 0.8 : 0.2));
    const result = await assembleWithAction(runner, new FakeApprovals('Approved'));

    const kinds = new Map(result.featureSchema.map((f) => [f.Name, f.Kind]));
    expect(kinds.get('engagement_index')).toBe('numeric');

    const col = result.matrix.columns.indexOf('engagement_index');
    expect(result.matrix.rows[0][col]).toBe(0.8);
    expect(result.matrix.rows[1][col]).toBe(0.2);
    // One call per record — the cost model this feature kind carries.
    expect(runner.Calls).toHaveLength(2);
  });

  it('fails the assembly when the Action is not approved, instead of emptying the column', async () => {
    // A model trained here would have a feature that is silently always null — and would look
    // completely normal doing it.
    const runner = new FakeRunner(() => ok(1));
    await expect(assembleWithAction(runner, new FakeApprovals('Pending'))).rejects.toThrow(ActionFeatureConfigError);
    expect(runner.Calls).toHaveLength(0);
  });

  it('honours the leakage deny-list on the action feature name', async () => {
    const runner = new FakeRunner(() => ok(1));
    const sources: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Members',
      records: MEMBERS,
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }, STEP] },
      asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: ['engagement_index'], SingleFeatureDominanceThreshold: 0.9 },
      dataAccess: new InMemoryDataAccess({ Members: MEMBERS }),
      actionRunner: runner,
      actionApprovals: new FakeApprovals('Approved'),
    });
    expect(result.matrix.columns).not.toContain('engagement_index');
    // Deny-listed means never run — not run and discarded.
    expect(runner.Calls).toHaveLength(0);
  });

  it('leaves a null for a record the action had nothing for', async () => {
    const runner = new FakeRunner((p) => (p.params.RecordID === 'm2' ? ok('') : ok(0.8)));
    const result = await assembleWithAction(runner, new FakeApprovals('Approved'));
    const col = result.matrix.columns.indexOf('engagement_index');
    // Null, not 0 — so the missing-data policy decides what absence means.
    expect(result.matrix.rows[1][col]).toBeNull();
  });
});
