/**
 * A3 attack 6 (G4.2): every agent-callable read of a draft unit's rows goes through `AgentReadScope.DevelopmentRows`,
 * which returns the unit's rows minus the holdout `ProtocolDefaults.DefaultHoldoutFor` gives it (the holdout the builder
 * binds), so no holdout row — and no holdout label — reaches the agent. No snapshot exists before approval.
 */
import { describe, expect, it } from 'vitest';
import { PredictionUnit, type UnitDraft } from '@memberjunction/predictive-studio-core';

import { AgentReadScope } from '../agent-read-scope';
import { ProtocolDefaults } from '../../protocol/protocol-defaults';
import { HoldoutCarvers } from '../../snapshot/holdout-carver';
import { PredictionUnitRowReader } from '../../prediction-unit/unit-row-reader';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

/** The years world's renewal unit as a draft (no row, no ID: what the draft-unit Action returns). */
function YearsDraft(): UnitDraft {
  const parsed = PredictionUnit.ParsePredictionUnitRow(UnitYearsWorld.UnitColumns());
  if (parsed.Ok === false) throw new Error(`the years world's unit does not parse: ${parsed.Errors.join('; ')}`);
  const s = parsed.Value;
  return {
    Name: s.name, Description: null, UnitRows: s.rows, LabelRule: s.label.rule, LabelWindowDays: s.label.windowDays, LabelGapDays: s.label.gapDays,
    TaskType: s.label.outcome, Censoring: s.censoring, ChangeHistoryPolicy: s.history, GroupKey: s.groupKey, TemporalSpec: s.temporal,
    DecisionSpec: s.decision, IncumbentHeuristic: s.incumbent,
  };
}

const NOW = new Date('2026-11-27T00:00:00Z');

function deps(): Parameters<typeof AgentReadScope.DevelopmentRowsWith>[1] {
  return { DataAccess: new TableDataAccess(UnitYearsWorld.Tables()), Metadata: UnitYearsWorld.Metadata(), Now: NOW };
}

/** The holdout row IDs the builder's protocol would carve, computed independently of the read scope. */
async function holdoutRowIds(draft: UnitDraft): Promise<Set<string>> {
  const unit = AgentReadScope.DraftSpec(draft);
  const holdout = await ProtocolDefaults.DefaultHoldoutFor(unit, deps());
  const read = await new PredictionUnitRowReader().Read(unit, { ...deps(), Read: { mode: 'complete' } });
  if (read.Status !== 'read') throw new Error('the years world cannot be read');
  const carve = HoldoutCarvers.CarverForProtocol({ holdout, seed: ProtocolDefaults.DEFAULT_SEED }, unit).AssignRoles(read.Rows, new Map(read.Rows.map((r) => [r.RowID, r])));
  return new Set([...carve.Roles].filter(([, role]) => role === 'locked-holdout').map(([id]) => id));
}

describe('A3 attack 6: AgentReadScope.DevelopmentRows reads development rows only (G4.2)', () => {
  it('returns no holdout row, reports HoldoutRowsRead = 0, and counts the holdout rows it left out', async () => {
    const draft = YearsDraft();
    const held = await holdoutRowIds(draft);
    expect(held.size).toBeGreaterThan(0);
    const scope = await AgentReadScope.DevelopmentRowsWith(draft, deps());
    expect(scope.Status).toBe('read');
    if (scope.Status !== 'read') return;
    expect(scope.Rows.length).toBeGreaterThan(0);
    expect(scope.Rows.filter((r) => held.has(r.RowID))).toEqual([]);
    expect(scope.HoldoutRowsRead).toBe(0);
    expect(scope.HoldoutRowsExcluded).toBe(held.size);
    expect(scope.Holdout).toEqual(await ProtocolDefaults.DefaultHoldoutFor(AgentReadScope.DraftSpec(draft), deps()));
  });

  it('a unit whose rows cannot be read is refused, with no rows', async () => {
    const draft: UnitDraft = { ...YearsDraft(), UnitRows: { kind: 'grain', grainEntity: 'NoSuchEntity', decisionDate: { kind: 'column', column: 'StartDate' }, filter: [] } };
    const scope = await AgentReadScope.DevelopmentRowsWith(draft, deps());
    expect(scope.Status).toBe('refused');
  });
});
