import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { PredictiveStudioPromoteModelOperation, type MJMLModelEntity, type PredictiveStudioPromoteModelInput, type PredictiveStudioPromoteModelOutput } from '@memberjunction/core-entities';
import type { RemoteOpResult } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
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

  it("never shows another metric's number under the primary metric's title when the train metrics lack it", () => {
    // Holdout stores only log-loss, so the tiles are titled Log Loss; the train metrics store AUC alone.
    const shown = tiles(makeModel({ Metrics: '{"AUC":0.9}', HoldoutMetrics: '{"log-loss":0.3674}' }));
    expect(shown[0]).toContain('Train Log Loss | —');
    expect(shown[0]).not.toContain('0.900');
  });

  it("captions the train tile of a model trained under an Evaluation Protocol as the inner-CV estimate", () => {
    const shown = tiles(makeModel({ Metrics: '{"mase":0.9}', HoldoutMetrics: '{"mase":0.82}', Lineage: JSON.stringify({ evaluationProtocolId: 'EP-1' }) }));
    expect(shown[0]).toContain('inner-CV estimate');
    expect(shown[0]).not.toContain('in-sample');
  });

  it('keeps the in-sample caption for an older model trained without a protocol', () => {
    expect(tiles(makeModel({}))[0]).toContain('in-sample');
  });

  it('lists only holdout metrics in the stat bar beside the holdout tile, never the training metrics', () => {
    const fixture = render(makeModel({ Metrics: '{"AUC":0.9,"Accuracy":0.95,"F1":0.93}', HoldoutMetrics: null }));
    expect(query(fixture, '.stat-bar')).toBeNull();
  });
});

describe('PSModelDetailComponent (DOM) — lifecycle transitions through PredictiveStudio.PromoteModel', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A model double whose Load re-reads `stored` (what the lifecycle gate wrote), counting the reloads. */
  const transitionModel = (status: MJMLModelEntity['Status'], stored: { Status: MJMLModelEntity['Status']; Loads: number }) => {
    const model = { ...makeModel({ ID: 'C1E2D3F4-0000-4000-8000-0000000000A1', Status: status }), LatestResult: null, Load: async () => { stored.Loads += 1; model.Status = stored.Status; return true; } };
    return model;
  };

  /** Records every PromoteModel call the component makes and answers with `output`. */
  const recordOperations = (output: PredictiveStudioPromoteModelOutput): PredictiveStudioPromoteModelInput[] => {
    const sentOperations: PredictiveStudioPromoteModelInput[] = [];
    vi.spyOn(PredictiveStudioPromoteModelOperation.prototype, 'Execute').mockImplementation(async (input: PredictiveStudioPromoteModelInput): Promise<RemoteOpResult<PredictiveStudioPromoteModelOutput>> => {
      sentOperations.push(input);
      return { Success: true, ResultCode: 'SUCCESS', Output: output };
    });
    return sentOperations;
  };

  /** Lets the component's awaited operation, reload and notification finish (each is a resolved promise in these tests). */
  const settle = async (f: ReturnType<typeof render>): Promise<void> => {
    for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    f.detectChanges();
  };
  const click = async (f: ReturnType<typeof render>, selector: string): Promise<void> => {
    (query(f, selector) as HTMLButtonElement | null)?.click();
    await settle(f);
  };
  const type = async (f: ReturnType<typeof render>, selector: string, text: string): Promise<void> => {
    const area = query(f, selector) as HTMLTextAreaElement;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    await settle(f);
  };

  it('the publish button sends transition publish', async () => {
    const stored = { Status: 'Published' as MJMLModelEntity['Status'], Loads: 0 };
    const model = transitionModel('Validated', stored);
    const sentOperations = recordOperations({ applied: true, status: 'Published' });
    vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
    const fixture = render(model);
    await click(fixture, '[data-action="publish"]');
    await click(fixture, '[data-testid="ps-transition-confirm"]');
    expect(sentOperations[0]).toMatchObject({ modelId: model.ID, transition: 'publish' });
  });

  it('reloads the model through its provider after an applied transition and shows the status the gate wrote', async () => {
    const stored = { Status: 'Published' as MJMLModelEntity['Status'], Loads: 0 };
    const model = transitionModel('Validated', stored);
    recordOperations({ applied: true, status: 'Published' });
    const notes = vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
    const fixture = render(model);
    const emitted: string[] = [];
    fixture.componentInstance.StatusChanged.subscribe((e) => emitted.push(e.newStatus));
    await click(fixture, '[data-action="publish"]');
    await click(fixture, '[data-testid="ps-transition-confirm"]');
    expect([stored.Loads, model.Status, emitted, query(fixture, '[data-testid="ps-confirm-modal"]')]).toEqual([1, 'Published', ['Published'], null]);
    expect(notes.mock.calls[0]?.[1]).toBe('success');
  });

  it('offers exactly the transitions the lifecycle table allows from each status', () => {
    const offered = (status: MJMLModelEntity['Status']) =>
      queryAll(render(transitionModel(status, { Status: status, Loads: 0 })), '[data-action]').map((b) => b.getAttribute('data-action'));
    expect([offered('Draft'), offered('Validated'), offered('KeepBaseline'), offered('Published'), offered('Archived'), offered('Unevaluated')]).toEqual([
      ['evaluate'], ['publish', 'archive'], ['publish', 'archive'], ['archive'], ['rollback'], ['archive'],
    ]);
  });

  it('an archive or a rollback needs a reason before it can be confirmed, and sends it', async () => {
    const stored = { Status: 'Archived' as MJMLModelEntity['Status'], Loads: 0 };
    const model = transitionModel('Published', stored);
    const sentOperations = recordOperations({ applied: true, status: 'Archived' });
    vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
    const fixture = render(model);
    await click(fixture, '[data-action="archive"]');
    expect((query(fixture, '[data-testid="ps-transition-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    await type(fixture, '[data-testid="ps-transition-reason"]', 'superseded');
    await click(fixture, '[data-testid="ps-transition-confirm"]');
    expect(sentOperations).toEqual([{ modelId: model.ID, transition: 'archive', reason: 'superseded' }]);
  });

  it("a refusal is shown with the gate's refusal kind; the model is not reloaded and nothing is emitted", async () => {
    const stored = { Status: 'Validated' as MJMLModelEntity['Status'], Loads: 0 };
    const model = transitionModel('Validated', stored);
    recordOperations({ applied: false, status: 'Validated', refusal: { kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] } });
    const notes = vi.spyOn(MJNotificationService.prototype, 'CreateSimpleNotification').mockImplementation(() => undefined);
    const fixture = render(model);
    const emitted: string[] = [];
    fixture.componentInstance.StatusChanged.subscribe((e) => emitted.push(e.newStatus));
    await click(fixture, '[data-action="publish"]');
    await click(fixture, '[data-testid="ps-transition-confirm"]');
    expect([stored.Loads, model.Status, emitted]).toEqual([0, 'Validated', []]);
    expect([notes.mock.calls[0]?.[0], notes.mock.calls[0]?.[1]]).toEqual([expect.stringContaining('unacknowledged-leakage-flags'), 'error']);
  });
});
