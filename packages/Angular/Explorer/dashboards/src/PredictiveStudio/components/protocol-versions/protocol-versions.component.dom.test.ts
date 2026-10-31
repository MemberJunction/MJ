import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EvaluationProtocolRules, ProtocolRows, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PSProtocolVersionsComponent } from './protocol-versions.component';
import type { AfterVersionSavedEventArgs } from '../ps-widget-events';
import type { ProtocolVersionRow } from '../versioned-list/lineage-reads';
import { CreateRowDouble, CreateVersionStoreDouble, DOUBLE_USER_ID } from '../versioned-list/version-rows.test-support';

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

describe('PSProtocolVersionsComponent saves (DOM)', () => {
  it('saves the next version under the lineage root with Version + 1 and the carried description, leaving the row ID to the server', async () => {
    const store = CreateVersionStoreDouble([storedV1()]);
    const fixture = TestBed.createComponent(PSProtocolVersionsComponent);
    fixture.componentInstance.Provider = store.Provider;
    fixture.componentInstance.EvaluationProtocolID = ROOT;
    const after: AfterVersionSavedEventArgs[] = [];
    fixture.componentInstance.AfterVersionSaved.subscribe((e) => after.push(e));
    fixture.detectChanges();
    // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
    await fixture.componentInstance.Load();
    expect(fixture.componentInstance.Versions).toHaveLength(1);
    const row = CreateRowDouble(store, emptyRow('ROW-ID-BEFORE-SAVE'), 'SERVER-ID-V2');
    let idWhenSaved = '';
    const save = row.Save;
    row.Save = async (): Promise<boolean> => { idWhenSaved = row.ID; return save(); };
    store.NextRow = row;
    await fixture.componentInstance.Save({ ...draft, seed: 7 });
    expect([row.LineageRootID, row.Version, row.Seed, row.Description]).toEqual([ROOT, 2, 7, 'Renewal, 2024 test set']);
    expect(idWhenSaved).toBe('ROW-ID-BEFORE-SAVE');
    expect([after[0]?.ID, after[0]?.Version, after[0]?.Success]).toEqual(['SERVER-ID-V2', 2, true]);
    expect(fixture.componentInstance.Versions.map((v) => v.Row.Version)).toEqual([1, 2]);
  });

  it('shows the save message when the save fails', async () => {
    const store = CreateVersionStoreDouble([storedV1()]);
    const fixture = TestBed.createComponent(PSProtocolVersionsComponent);
    fixture.componentInstance.Provider = store.Provider;
    fixture.componentInstance.EvaluationProtocolID = ROOT;
    fixture.detectChanges();
    // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
    await fixture.componentInstance.Load();
    store.NextRow = CreateRowDouble(store, emptyRow(''), 'UNUSED', 'An agent tool call cannot change the guard fields promotion.');
    await fixture.componentInstance.Save(draft);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="ps-protocol-versions-error"]')?.textContent).toContain('cannot change the guard fields promotion');
  });
});
