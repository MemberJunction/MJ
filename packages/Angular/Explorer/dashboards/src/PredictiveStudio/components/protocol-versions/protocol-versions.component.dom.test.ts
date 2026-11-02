import { describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { EvaluationProtocolRules, ProtocolRows, type EvaluationProtocolDraft, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PSProtocolVersionsComponent } from './protocol-versions.component';
import type { AfterVersionSavedEventArgs, BeforeVersionSavedEventArgs } from '../ps-widget-events';
import type { ProtocolVersionRow } from '../versioned-list/lineage-reads';
import { VersionRowDoubles, DOUBLE_USER_ID, type VersionStoreDouble } from '../versioned-list/version-rows.test-support';
import { PSDomQueries } from '../ps-dom-queries.test-support';

const ROOT = '33333333-4444-4555-8666-777777777777';
const unit: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'Renewal',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: DOUBLE_USER_ID },
};
const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
  Unit: unit, Name: 'Renewal protocol',
  Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
  Candidates: 3, Seed: 42,
});

function emptyRow(id: string): ProtocolVersionRow {
  return {
    ID: id, LineageRootID: '', Version: 0, Name: '', Description: null, Holdout: '', InnerValidation: '', Seed: 0, HoldoutAccessBudget: 0,
    PrimaryScore: '', SecondaryMetrics: '', Baselines: '', Calibration: '', Resampling: '', Intervals: '', Promotion: '',
    AllowedOutcomes: '', LeakageAudit: '', Exclusions: '', Slices: '', PredictionIntervals: null, ResidualDiagnostics: null,
    RetrainTriggers: '', SearchStrategy: '', Budgets: '', MinMinorityClassRows: 0, GuardFieldsEditableBy: '', AuthoredBy: '',
    __mj_CreatedAt: '2026-01-01T00:00:00Z',
  };
}

function storedV1(): ProtocolVersionRow {
  const row = emptyRow(ROOT);
  ProtocolRows.ApplyProtocolDraftToRow(row, draft, { ID: ROOT, LineageRootID: ROOT, Version: 1, AuthoredBy: { kind: 'human', userId: DOUBLE_USER_ID }, Description: 'Renewal, 2024 test set' });
  return row;
}

/** Version 2 of the lineage as stored (seed 7). */
function storedV2(): ProtocolVersionRow {
  const row = emptyRow('44444444-5555-4666-8777-888888888888');
  ProtocolRows.ApplyProtocolDraftToRow(row, { ...draft, seed: 7 }, { ID: row.ID, LineageRootID: ROOT, Version: 2, AuthoredBy: { kind: 'human', userId: DOUBLE_USER_ID }, Description: 'Renewal, 2024 test set' });
  return row;
}

interface Rendered {
  readonly Fixture: ComponentFixture<PSProtocolVersionsComponent>;
  readonly Store: VersionStoreDouble<ProtocolVersionRow>;
  readonly After: AfterVersionSavedEventArgs[];
}

async function render(protocolId: string | null, rows: ProtocolVersionRow[]): Promise<Rendered> {
  const store = VersionRowDoubles.CreateStore(rows);
  const fixture = TestBed.createComponent(PSProtocolVersionsComponent);
  fixture.componentInstance.Provider = store.Provider;
  fixture.componentInstance.EvaluationProtocolID = protocolId;
  const after: AfterVersionSavedEventArgs[] = [];
  fixture.componentInstance.AfterVersionSaved.subscribe((e) => after.push(e));
  fixture.detectChanges();
  // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
  await fixture.componentInstance.Load();
  fixture.detectChanges();
  return { Fixture: fixture, Store: store, After: after };
}

describe('PSProtocolVersionsComponent saves (DOM)', () => {
  it('saves the next version under the lineage root with Version + 1 and the carried description, leaving the row ID to the server', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    expect(Fixture.componentInstance.Versions).toHaveLength(1);
    const row = VersionRowDoubles.CreateRow(Store, emptyRow('ROW-ID-BEFORE-SAVE'), 'SERVER-ID-V2');
    let idWhenSaved = '';
    const save = row.Save;
    row.Save = async (): Promise<boolean> => { idWhenSaved = row.ID; return save(); };
    Store.NextRow = row;
    await Fixture.componentInstance.Save({ ...draft, seed: 7 });
    expect([row.LineageRootID, row.Version, row.Seed, row.Description]).toEqual([ROOT, 2, 7, 'Renewal, 2024 test set']);
    expect(idWhenSaved).toBe('ROW-ID-BEFORE-SAVE');
    expect([After[0]?.ID, After[0]?.Version, After[0]?.Success]).toEqual(['SERVER-ID-V2', 2, true]);
    expect(Fixture.componentInstance.Versions.map((v) => v.Row.Version)).toEqual([1, 2]);
  });

  it('shows the save message when the save fails and reports it in AfterVersionSaved', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    Store.NextRow = VersionRowDoubles.CreateRow(Store, emptyRow(''), 'UNUSED', 'An agent tool call cannot change the guard fields promotion.');
    await Fixture.componentInstance.Save(draft);
    Fixture.detectChanges();
    expect(PSDomQueries.HostElement(Fixture).querySelector('[data-testid="ps-protocol-versions-error"]')?.textContent).toContain('cannot change the guard fields promotion');
    expect([After[0]?.Success, After[0]?.ID]).toEqual([false, null]);
    expect(Store.Rows).toHaveLength(1);
  });

  it('does not save when a host cancels BeforeVersionSaved, and does not emit AfterVersionSaved', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    const row = VersionRowDoubles.CreateRow(Store, emptyRow(''), 'SERVER-ID-V2');
    Store.NextRow = row;
    const seen: BeforeVersionSavedEventArgs<EvaluationProtocolDraft>[] = [];
    Fixture.componentInstance.BeforeVersionSaved.subscribe((e) => { seen.push(e); e.Cancel = true; e.CancelReason = 'Held for review.'; });
    await Fixture.componentInstance.Save(draft);
    expect([seen[0]?.EntityName, seen[0]?.Version]).toEqual(['MJ: Evaluation Protocols', 2]);
    expect([row.Version, After.length, Store.Rows.length]).toEqual([0, 0, 1]);
    expect(Fixture.componentInstance.Error).toBe('Held for review.');
  });

  it('opened on version 1 of a longer lineage, shows version 1 and offers a new version only on the latest', async () => {
    const { Fixture } = await render(ROOT, [storedV1(), storedV2()]);
    expect(Fixture.componentInstance.Selected?.Row.Version).toBe(1);
    expect(PSDomQueries.HostElement(Fixture).querySelector('[data-testid="ps-protocol-edit"]')).toBeNull();
    const buttons = PSDomQueries.HostElement(Fixture).querySelectorAll('[data-testid="ps-protocol-version-list"] button');
    const v2 = buttons.item(1);
    if (!(v2 instanceof HTMLButtonElement)) throw new Error('version 2 is not listed');
    v2.click();
    await Fixture.whenStable();
    Fixture.detectChanges();
    expect(PSDomQueries.HostElement(Fixture).querySelector('[data-testid="ps-protocol-edit"]')?.textContent).toContain('Create version 3');
  });

  it('writes no first version: without a loaded lineage, Save writes no row and emits nothing', async () => {
    const { Fixture, Store, After } = await render('MISSING-ID', []);
    expect(Fixture.componentInstance.Error).toContain('was not found');
    const row = VersionRowDoubles.CreateRow(Store, emptyRow(''), 'SERVER-ID');
    Store.NextRow = row;
    await Fixture.componentInstance.Save(draft);
    expect([row.Version, After.length, Store.Rows.length]).toEqual([0, 0, 0]);
  });
});
