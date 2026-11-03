import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { ImportanceDisplay } from '@memberjunction/predictive-studio-core';
import { PSModelDetailComponent } from './ps-model-detail.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the Feature Importance card and the leakage gate of <ps-model-detail>. A tree model's split /
 * impurity importances are hidden behind {@link ImportanceDisplay.HiddenNote}; nothing else on the page (the caption
 * or the leakage gate) may name the top split feature or its value.
 */

/** The model members the detail reads. */
type ModelDouble = Pick<
  MJMLModelEntity,
  'ID' | 'Version' | 'Status' | 'Algorithm' | 'Pipeline' | 'TargetVariable' | 'Metrics' | 'HoldoutMetrics' | 'FeatureImportance' | 'Lineage'
>;

const TREE_LINEAGE = JSON.stringify({ evaluation: { ImportanceKind: 'split_or_impurity' } });
const LINEAR_LINEAGE = JSON.stringify({ evaluation: { ImportanceKind: 'coefficient' } });

const makeModel = (over: Partial<ModelDouble>): ModelDouble => ({
  ID: 'm1',
  Version: 2,
  Status: 'Draft',
  Algorithm: 'XGBoost',
  Pipeline: 'Renewal',
  TargetVariable: 'Renewed',
  Metrics: '{"AUC":0.9}',
  HoldoutMetrics: '{"AUC":0.85}',
  FeatureImportance: JSON.stringify({ MemberSinceDays: 0.72, AutoRenew: 0.2 }),
  Lineage: TREE_LINEAGE,
  ...over,
});

// The component's input is the generated entity class; the double carries only the members it reads.
const render = (model: ModelDouble) =>
  renderComponentFixture(PSModelDetailComponent, { inputs: { Model: model as unknown as MJMLModelEntity } });

describe('PSModelDetailComponent (DOM) — importance containment', () => {
  it('a tree model shows the hidden note, no bars, no caption and no top-feature name', () => {
    const fixture = render(makeModel({ Lineage: TREE_LINEAGE }));
    const text: string = fixture.nativeElement.textContent;
    expect(query(fixture, '[data-testid="ps-importance-hidden"]')?.textContent).toContain(ImportanceDisplay.HiddenNote);
    expect(queryAll(fixture, '.ps-fbar').length).toBe(0);
    expect(query(fixture, '[data-testid="ps-importance-caption"]')).toBeNull();
    expect(text).not.toContain('Member Since Days');
    expect(text).not.toContain('MemberSinceDays');
    expect(text).not.toContain('0.720');
  });

  it("a tree model's leakage flag still raises, phrased as a split share", () => {
    const fixture = render(makeModel({ Lineage: TREE_LINEAGE }));
    const gate = query(fixture, '[data-testid="ps-leakage-gate"]');
    expect(gate?.classList.contains('warn')).toBe(true);
    expect(gate?.textContent).toContain("A single feature's split share is at or above the");
    expect(gate?.textContent).toContain('Sign-off with a reason is required');
  });

  it('a linear model shows its bars, caption and the top feature in the gate', () => {
    const fixture = render(makeModel({ Lineage: LINEAR_LINEAGE }));
    expect(query(fixture, '[data-testid="ps-importance-hidden"]')).toBeNull();
    expect(queryAll(fixture, '.ps-fbar').length).toBe(2);
    expect(query(fixture, '[data-testid="ps-importance-caption"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-leakage-gate"]')?.textContent).toContain('Member Since Days');
  });
});

describe('PSModelDetailComponent (DOM) — the performance tiles', () => {
  // each tile's lines (title | value | caption): Angular drops the whitespace between them, so they are read one by one
  const tiles = (model: ModelDouble): string[] =>
    queryAll(render(model), '.metric-pair .mtile').map((t) => Array.from(t.children).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).join(' | '));

  it("titles a kept baseline's tiles by the metric it stores and shows its holdout score, never \"AUC\"", () => {
    const shown = tiles(makeModel({ Metrics: '{}', HoldoutMetrics: '{"log-loss":0.3674}' }));
    expect(shown[1]).toContain('Holdout Log Loss | 0.367');
    expect(shown.join(' ')).not.toContain('AUC');
  });

  it("captions the train tile of a model trained under an Evaluation Protocol as the inner-CV estimate", () => {
    const shown = tiles(makeModel({ Metrics: '{"mase":0.9}', HoldoutMetrics: '{"mase":0.82}', Lineage: JSON.stringify({ evaluationProtocolId: 'EP-1' }) }));
    expect(shown[0]).toContain('inner-CV estimate');
    expect(shown[0]).not.toContain('in-sample');
  });

  it('keeps the in-sample caption for an older model trained without a protocol', () => {
    expect(tiles(makeModel({}))[0]).toContain('in-sample');
  });
});
