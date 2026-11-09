import { describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PSUnitEditorComponent, type UnitSaveRequest } from './unit-editor.component';
import { PSDomQueries } from '../ps-dom-queries.test-support';

const v1: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'Renewal',
  rows: { kind: 'grain', grainEntity: 'Membership Years', decisionDate: { kind: 'column', column: 'StartDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};

async function render(base: PredictionUnitSpec | null): Promise<ComponentFixture<PSUnitEditorComponent>> {
  const fixture = TestBed.createComponent(PSUnitEditorComponent);
  fixture.componentInstance.Base = base;
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<PSUnitEditorComponent>): HTMLElement {
  return PSDomQueries.HostElement(fixture);
}

function saveButton(fixture: ComponentFixture<PSUnitEditorComponent>): HTMLButtonElement {
  return PSDomQueries.QueryElement(host(fixture), '[data-testid="ps-unit-save"]', HTMLButtonElement);
}

describe('PSUnitEditorComponent (DOM)', () => {
  it('saves version 1 with label version 1 once the form names the rows, the outcome and the classes', async () => {
    const fixture = await render(null);
    expect(host(fixture).querySelector('[data-testid="ps-unit-error"]')?.textContent).toContain('The unit needs a name.');
    expect(saveButton(fixture).disabled).toBe(true);
    const saved: UnitSaveRequest[] = [];
    fixture.componentInstance.SaveRequested.subscribe((r) => saved.push(r));
    fixture.componentInstance.Form = {
      ...fixture.componentInstance.Form, Name: 'Renewal', GrainEntity: 'Membership Years', DecisionDateColumn: 'StartDate',
      LabelColumn: 'Renewed', ClassOrder: 'Lapsed, Renewed', AdverseClass: 'Lapsed',
    };
    fixture.componentInstance.Recompute();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host(fixture).querySelector('[data-testid="ps-unit-label-version"]')?.textContent).toContain('Label version will be 1');
    saveButton(fixture).click();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.LabelVersion).toBe(1);
    expect(saved[0]?.Draft.TaskType).toEqual({ kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 });
    expect(saved[0]?.Draft.UnitRows).toEqual(v1.rows);
  });

  it('bumps the label version when the outcome window is edited in the form and emits it on save', async () => {
    const fixture = await render(v1);
    expect(host(fixture).querySelector('[data-testid="ps-unit-label-version"]')?.textContent).toContain('Label version will be 1');
    const window = PSDomQueries.QueryElement(host(fixture), '[data-testid="ps-unit-window"]', HTMLInputElement);
    window.value = '400';
    window.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host(fixture).querySelector('[data-testid="ps-unit-label-version"]')?.textContent).toContain('Label version will be 2');
    const saved: UnitSaveRequest[] = [];
    fixture.componentInstance.SaveRequested.subscribe((r) => saved.push(r));
    saveButton(fixture).click();
    expect(saved[0]?.LabelVersion).toBe(2);
    expect(saved[0]?.Draft.LabelWindowDays).toBe(400);
  });

  it('shows the form problem and disables save', async () => {
    const fixture = await render(v1);
    fixture.componentInstance.Form = { ...fixture.componentInstance.Form, AdverseClass: 'Gone' };
    fixture.componentInstance.Recompute();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host(fixture).querySelector('[data-testid="ps-unit-error"]')?.textContent).toContain('The adverse class "Gone" is not one of: Lapsed, Renewed.');
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('carries a forecast task and a child-event outcome over read-only', async () => {
    const forecast: PredictionUnitSpec = {
      ...v1,
      label: { ...v1.label, rule: { kind: 'child-event', childEntity: 'Visits', foreignKey: 'MemberID', ownerKeyField: null, dateField: 'VisitDate', aggregate: 'count', valueField: null, filter: [] }, outcome: { kind: 'forecast', valueKind: 'count' } },
      temporal: { timeColumn: 'Month', horizonPeriods: 1, lags: [1], rollingWindows: [], period: 'month', seasonality: null },
    };
    const fixture = await render(forecast);
    expect(PSDomQueries.QueryElement(host(fixture), '[data-testid="ps-unit-task"]', HTMLSelectElement).disabled).toBe(true);
    expect(host(fixture).querySelector('[data-testid="ps-unit-rule-carried"]')?.textContent).toContain('count of Visits.VisitDate');
    expect(saveButton(fixture).disabled).toBe(false);
  });
});
