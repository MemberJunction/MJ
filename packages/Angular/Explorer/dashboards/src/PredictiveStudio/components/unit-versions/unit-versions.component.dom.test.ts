import { describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ProtocolRows, type UnitDraft } from '@memberjunction/predictive-studio-core';
import { PSUnitVersionsComponent } from './unit-versions.component';
import type { AfterVersionSavedEventArgs, BeforeVersionSavedEventArgs } from '../ps-widget-events';
import type { UnitVersionRow } from '../versioned-list/lineage-reads';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import { CreateRowDouble, CreateVersionStoreDouble, DOUBLE_USER_ID, RowsMatching, ViewResult, type VersionStoreDouble } from '../versioned-list/version-rows.test-support';

const ROOT = '11111111-2222-4333-8444-555555555555';
const draft: UnitDraft = {
  Name: 'Renewal', Description: null,
  UnitRows: { kind: 'grain', grainEntity: 'Membership Years', decisionDate: { kind: 'column', column: 'StartDate' }, filter: [] },
  LabelRule: { kind: 'column', column: 'Renewed' }, LabelWindowDays: 365, LabelGapDays: 0,
  TaskType: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 },
  Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } },
  ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  GroupKey: null, TemporalSpec: null,
  DecisionSpec: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  IncumbentHeuristic: { kind: 'none' },
};

function emptyRow(id: string): UnitVersionRow {
  return {
    ID: id, LineageRootID: '', Version: 0, LabelVersion: 0, Name: '', Description: null, UnitRows: '', LabelRule: '', LabelWindowDays: 0,
    LabelGapDays: 0, TaskType: '', Censoring: '', ChangeHistoryPolicy: '', GroupKey: null, TemporalSpec: null, DecisionSpec: '',
    IncumbentHeuristic: '', AuthoredBy: '', __mj_CreatedAt: '2026-01-01T00:00:00Z',
  };
}

/** Version 1 of the lineage as stored, with a description the next version must carry. */
function storedV1(): UnitVersionRow {
  const row = emptyRow(ROOT);
  ProtocolRows.ApplyPredictionUnitDraftToRow(row, { ...draft, Description: 'Renewal of a membership year' }, { ID: ROOT, LineageRootID: ROOT, Version: 1, LabelVersion: 1, AuthoredBy: { kind: 'human', userId: DOUBLE_USER_ID } });
  return row;
}

interface Rendered {
  readonly Fixture: ComponentFixture<PSUnitVersionsComponent>;
  readonly Store: VersionStoreDouble<UnitVersionRow>;
  readonly After: AfterVersionSavedEventArgs[];
}

async function render(unitId: string | null, rows: UnitVersionRow[]): Promise<Rendered> {
  const store = CreateVersionStoreDouble(rows);
  const fixture = TestBed.createComponent(PSUnitVersionsComponent);
  fixture.componentInstance.Provider = store.Provider;
  fixture.componentInstance.UnitID = unitId;
  const after: AfterVersionSavedEventArgs[] = [];
  fixture.componentInstance.AfterVersionSaved.subscribe((e) => after.push(e));
  fixture.detectChanges();
  // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
  await fixture.componentInstance.Load();
  return { Fixture: fixture, Store: store, After: after };
}

describe('PSUnitVersionsComponent saves (DOM)', () => {
  it('saves version 1 as its own lineage root with label version 1, then emits the ID the saved row carries', async () => {
    const { Fixture, Store, After } = await render(null, []);
    const row = CreateRowDouble(Store, emptyRow(''), 'SERVER-MINTED-ID');
    Store.NextRow = row;
    await Fixture.componentInstance.Save({ Draft: draft, LabelVersion: 7 });
    expect([row.Version, row.LabelVersion]).toEqual([1, 1]);
    expect(row.AuthoredBy).toBe(JSON.stringify({ kind: 'human', userId: DOUBLE_USER_ID }));
    expect(After).toHaveLength(1);
    expect([After[0]?.ID, After[0]?.Success, After[0]?.Version]).toEqual(['SERVER-MINTED-ID', true, 1]);
    expect(Fixture.componentInstance.UnitID).toBe('SERVER-MINTED-ID');
    expect(Fixture.componentInstance.Versions.map((v) => v.Row.Version)).toEqual([1]);
  });

  it('saves a later version under the lineage root with Version + 1, the requested label version and the carried description', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    expect(Fixture.componentInstance.Versions).toHaveLength(1);
    const row = CreateRowDouble(Store, emptyRow('ROW-ID-BEFORE-SAVE'), 'SERVER-ID-V2');
    Store.NextRow = row;
    await Fixture.componentInstance.Save({ Draft: { ...draft, LabelWindowDays: 400 }, LabelVersion: 2 });
    expect([row.LineageRootID, row.Version, row.LabelVersion, row.LabelWindowDays]).toEqual([ROOT, 2, 2, 400]);
    expect(row.Description).toBe('Renewal of a membership year');
    expect([After[0]?.ID, After[0]?.Version]).toEqual(['SERVER-ID-V2', 2]);
    expect(Fixture.componentInstance.Versions.map((v) => v.Row.Version)).toEqual([1, 2]);
  });

  it('shows the save message when the save fails and reports it in AfterVersionSaved', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    Store.NextRow = CreateRowDouble(Store, emptyRow(''), 'UNUSED', 'LabelVersion must be 2: the outcome definition changed.');
    await Fixture.componentInstance.Save({ Draft: draft, LabelVersion: 1 });
    Fixture.detectChanges();
    const host = Fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="ps-unit-versions-error"]')?.textContent).toContain('LabelVersion must be 2: the outcome definition changed.');
    expect([After[0]?.Success, After[0]?.ID, After[0]?.ErrorMessage]).toEqual([false, null, 'LabelVersion must be 2: the outcome definition changed.']);
    expect(Store.Rows).toHaveLength(1);
  });

  it('does not save when a host cancels BeforeVersionSaved, and does not emit AfterVersionSaved', async () => {
    const { Fixture, Store, After } = await render(ROOT, [storedV1()]);
    const row = CreateRowDouble(Store, emptyRow(''), 'SERVER-ID-V2');
    Store.NextRow = row;
    Fixture.componentInstance.BeforeVersionSaved.subscribe((e: BeforeVersionSavedEventArgs<UnitDraft>) => { e.Cancel = true; e.CancelReason = 'Held for review.'; });
    await Fixture.componentInstance.Save({ Draft: draft, LabelVersion: 1 });
    expect([row.Version, After.length, Store.Rows.length]).toEqual([0, 0, 1]);
    expect(Fixture.componentInstance.Error).toBe('Held for review.');
  });

  it('never writes a new version 1 for a lineage whose versions did not load', async () => {
    const { Fixture, Store, After } = await render('MISSING-ID', []);
    expect(Fixture.componentInstance.Error).toContain('was not found');
    const row = CreateRowDouble(Store, emptyRow(''), 'SERVER-ID');
    Store.NextRow = row;
    await Fixture.componentInstance.Save({ Draft: draft, LabelVersion: 1 });
    expect([row.Version, After.length, Store.Rows.length]).toEqual([0, 0, 0]);
  });

  it('clears the previous lineage when the unit changes to one that cannot be read', async () => {
    const { Fixture } = await render(ROOT, [storedV1()]);
    expect(Fixture.componentInstance.Versions).toHaveLength(1);
    Fixture.componentInstance.UnitID = 'MISSING-ID';
    await Fixture.componentInstance.Load();
    expect(Fixture.componentInstance.Versions).toEqual([]);
    expect(Fixture.componentInstance.Selected).toBeNull();
    expect(Fixture.componentInstance.Error).toContain('was not found');
  });

  it('shows the loading indicator while a read is in flight, and drops the result of a load that a newer load overtook', async () => {
    const { Fixture, Store } = await render('MISSING-ID', [storedV1()]);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    Object.assign(Store.Provider, {
      RunView: async (params: RunViewParams): Promise<RunViewResult<UnitVersionRow>> => {
        if (params.ExtraFilter === `ID='${ROOT}'`) await held;
        return ViewResult(RowsMatching(Store.Rows, params));
      },
    });
    Fixture.componentInstance.UnitID = ROOT;
    const older = Fixture.componentInstance.Load();
    Fixture.detectChanges();
    const host = Fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mj-loading')).not.toBeNull();
    expect(host.querySelector('[data-testid="ps-unit-version-list"]')).toBeNull();
    Fixture.componentInstance.UnitID = 'ANOTHER-MISSING-ID';
    await Fixture.componentInstance.Load();
    release();
    await older;
    expect(Fixture.componentInstance.Versions).toEqual([]);
    expect(Fixture.componentInstance.Error).toContain('ANOTHER-MISSING-ID');
  });
});
