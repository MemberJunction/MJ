import { describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  EvaluationProtocolRules, type Actor, type EvaluationProtocolDraft, type EvaluationProtocolSpec, type PredictionUnitSpec,
} from '@memberjunction/predictive-studio-core';
import { PSProtocolEditorComponent } from './protocol-editor.component';
import { PSDomQueries } from '../ps-dom-queries.test-support';

const unit: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'Renewal',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};
const base: EvaluationProtocolSpec = {
  ...EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
    Unit: unit, Name: 'Renewal protocol',
    Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
    Candidates: 3, Seed: 42,
  }),
  id: '33333333-4444-4555-8666-777777777777', lineageRootId: '33333333-4444-4555-8666-777777777777', version: 1,
  authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};
const human: Actor = { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' };
const agent: Actor = { kind: 'agent', agentRunId: '9A1D2C3B-4E5F-4A6B-8C7D-0E1F2A3B4C5D' };

describe('PSProtocolEditorComponent (DOM)', () => {
  async function render(author: Actor, protocol: EvaluationProtocolSpec): Promise<ComponentFixture<PSProtocolEditorComponent>> {
    const fixture = TestBed.createComponent(PSProtocolEditorComponent);
    fixture.componentInstance.Unit = unit;
    fixture.componentInstance.Author = author;
    fixture.componentInstance.Base = protocol;   // the setter initializes Form and Metrics and runs Recompute()
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  /** Sets the margin as the form would, then lets ngModel settle (it writes to the input asynchronously). */
  async function changeMargin(fixture: ComponentFixture<PSProtocolEditorComponent>, margin: number): Promise<HTMLElement> {
    fixture.componentInstance.Form = { ...fixture.componentInstance.Form, Margin: margin };
    fixture.componentInstance.Recompute();
    fixture.detectChanges();
    await fixture.whenStable();
    return PSDomQueries.HostElement(fixture);
  }

  it('lists only the scores of the protocol family and emits the next version draft on save', async () => {
    const fixture = await render(human, base);
    const host = PSDomQueries.HostElement(fixture);
    const options = Array.from(host.querySelectorAll('[data-testid="ps-protocol-metric"] option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['log-loss', 'brier']);
    const saved: EvaluationProtocolDraft[] = [];
    fixture.componentInstance.SaveRequested.subscribe((d) => saved.push(d));
    await changeMargin(fixture, 0.003);
    PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-save"]', HTMLButtonElement).click();
    expect(saved[0]?.promotion.margin).toBe(0.003);
  });

  it('shows the guard-field refusal and disables save when an agent changes the margin', async () => {
    const fixture = await render(agent, base);
    const host = await changeMargin(fixture, 0.003);
    expect(PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-guard-policy"]', HTMLSelectElement).value).toBe('non-agent');
    expect(host.querySelector('[data-testid="ps-protocol-refusals"]')?.textContent).toContain('An agent tool call cannot change the guard fields promotion');
    expect(PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-save"]', HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the human-only refusal when the author is not a user and the protocol is human-only', async () => {
    const fixture = await render({ kind: 'system', component: 'dom-test' }, { ...base, guardFieldsEditableBy: 'human-only' });
    const host = await changeMargin(fixture, 0.003);
    expect(host.querySelector('[data-testid="ps-protocol-refusals"]')?.textContent).toContain('only a version authored by a user may change promotion');
    expect(PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-save"]', HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a form problem and disables save until the form is valid again', async () => {
    const fixture = await render(human, base);
    let host = await changeMargin(fixture, -1);
    expect(host.querySelector('[data-testid="ps-protocol-refusals"]')?.textContent).toContain('The margin must be a number >= 0');
    expect(PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-save"]', HTMLButtonElement).disabled).toBe(true);
    host = await changeMargin(fixture, 0.01);
    expect(host.querySelector('[data-testid="ps-protocol-refusals"]')).toBeNull();
    expect(PSDomQueries.QueryElement(host, '[data-testid="ps-protocol-save"]', HTMLButtonElement).disabled).toBe(false);
  });
});
