import { describe, it, expect, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, queryAll, text, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MLExperimentResultsViewerComponent } from './ml-experiment-results-viewer.component';

/**
 * DOM coverage for the ML Experiment Results viewer's leaderboard labels: a search's inner-fold scores are labelled
 * with the rows' own metric, never the artifact's target metric, and only the winner carries the "optimistic" tag.
 */

/** Test double at the entity boundary: the viewer reads only the version's Content and Name. */
const version = (content: object): MJArtifactVersionEntity =>
  ({ Content: JSON.stringify(content), Name: 'Results' }) as unknown as MJArtifactVersionEntity;

const searchRow = (rank: number, algorithm: string, score: number, isWinner: boolean, metricName = 'log-loss') => ({
  rank, algorithm, score, metricName, innerLower: score - 0.03, innerUpper: score + 0.03, optimistic: true, isWinner,
});

function render(content: object) {
  return renderComponentFixture(MLExperimentResultsViewerComponent, {
    imports: [CommonModule, StubLoadingComponent],
    declarations: [MLExperimentResultsViewerComponent],
    inputs: { artifactVersion: version(content) },
    autoDetect: true,
  });
}

afterEach(() => TestBed.resetTestingModule());

describe('MLExperimentResultsViewerComponent (DOM) — leaderboard labels', () => {
  it("labels a search's score column and hero with the rows' metric, not the artifact's TargetMetric, and tags only the winner optimistic", () => {
    const f = render({ TargetMetric: 'auc', GateOutcome: 'model', Leaderboard: [searchRow(1, 'lr-c01', 0.331, false), searchRow(2, 'lr-c1', 0.332, true), searchRow(3, 'xgb', 0.335, false)] });
    const headers = queryAll(f, '.lb-table thead th').map((th) => th.textContent?.trim());
    expect(headers).toEqual(['#', 'Algorithm', 'Feature set', 'log-loss', '95% interval']);
    expect(text(f, '.hero-metric-label')).toBe('log-loss · winner');
    const rows = queryAll(f, '.lb-table tbody tr');
    expect(rows.map((r) => r.querySelector('.lb-optimistic') !== null)).toEqual([false, true, false]);
    expect(rows[0].textContent).toContain('[0.301, 0.361]');
    expect(f.nativeElement.textContent).not.toContain('auc');
  });

  it("names each row's own metric when the rows disagree, under a neutral column label", () => {
    const f = render({ TargetMetric: 'auc', GateOutcome: 'model', Leaderboard: [searchRow(1, 'a', 0.33, true, 'log-loss'), searchRow(2, 'b', 0.2, false, 'brier')] });
    expect(queryAll(f, '.lb-table thead th')[3].textContent?.trim()).toBe('Score');
    expect(queryAll(f, '.lb-row-metric').map((e) => e.textContent?.trim())).toEqual(['log-loss', 'brier']);
    expect(text(f, '.hero-metric-label')).toBe('log-loss · winner');
  });

  it("keeps the artifact's target metric for rows that state no metric (an older artifact)", () => {
    const f = render({ targetMetric: 'AUC', leaderboard: [{ rank: 1, algorithm: 'XGBoost', score: 0.81, cvScore: 0.79 }] });
    expect(queryAll(f, '.lb-table thead th')[3].textContent?.trim()).toBe('AUC');
    expect(queryAll(f, '.lb-optimistic')).toHaveLength(0);
    expect(f.nativeElement.textContent).not.toContain('0.790');
  });
});

describe('MLExperimentResultsViewerComponent (DOM) — the stored gate outcome', () => {
  const leaderboard = [searchRow(1, 'lr-c01', 0.331, false), searchRow(2, 'xgb', 0.332, true)];
  const reason = 'Neither the model nor any simple baseline beats the flat guess on log-loss: no signal.';

  it('crowns no winner on a search whose stored outcome is no-signal, and titles the card by the outcome and its reason', () => {
    const f = render({ Leaderboard: leaderboard, GateOutcome: 'no-signal', GateReason: reason });
    expect(queryAll(f, '.crown')).toHaveLength(0);
    expect(queryAll(f, '.lb-table tbody tr.is-winner')).toHaveLength(0);
    expect(queryAll(f, '.rank.gold')).toHaveLength(0);
    expect(f.nativeElement.textContent).not.toContain('Winning Model');
    expect(f.nativeElement.textContent).not.toContain('winner');
    expect(text(f, '.col-side .section-title')).toBe('No model shipped');
    expect(text(f, '.gate-reason')).toBe(reason);
  });

  it('titles the card "Kept a simple baseline" without a crown when the gate kept a baseline', () => {
    const f = render({ Leaderboard: leaderboard, GateOutcome: 'keep-simple-baseline', GateReason: 'The simple baseline glm is kept.', BestModel: { ID: 'm1', Name: 'Renewal (v1)', Version: 1 } });
    expect(queryAll(f, '.crown')).toHaveLength(0);
    expect(queryAll(f, '.lb-table tbody tr.is-winner')).toHaveLength(0);
    expect(text(f, '.col-side .section-title')).toBe('Kept a simple baseline');
    expect(text(f, '.winner-name')).toBe('Renewal (v1)');
    expect(text(f, '.gate-reason')).toBe('The simple baseline glm is kept.');
  });

  it('crowns the finalist only when the stored outcome ships it', () => {
    const f = render({ Leaderboard: leaderboard, GateOutcome: 'model', GateReason: 'The model beats the flat guess.' });
    expect(queryAll(f, '.crown')).toHaveLength(1);
    expect(queryAll(f, '.lb-table tbody tr.is-winner')).toHaveLength(1);
    expect(text(f, '.col-side .section-title')).toBe('Winning Model');
    expect(text(f, '.hero-metric-label')).toBe('log-loss · winner');
  });
});

describe('MLExperimentResultsViewerComponent (DOM) — no stored outcome', () => {
  const leaderboard = [searchRow(1, 'lr-c01', 0.331, false), searchRow(2, 'xgb', 0.332, true)];

  for (const [label, extra] of [['null', { GateOutcome: null }], ['absent', {}]] as const) {
    it(`crowns nothing and titles the card "Not evaluated" when GateOutcome is ${label}`, () => {
      const f = render({ Leaderboard: leaderboard, ...extra });
      expect(queryAll(f, '.crown')).toHaveLength(0);
      expect(queryAll(f, '.lb-table tbody tr.is-winner')).toHaveLength(0);
      expect(queryAll(f, '.hero-metric')).toHaveLength(0);
      expect(f.nativeElement.textContent).not.toContain('Winning Model');
      expect(f.nativeElement.textContent).not.toContain('winner');
      expect(text(f, '.col-side .section-title')).toBe('Not evaluated');
    });
  }
});

describe('MLExperimentResultsViewerComponent (DOM) — the optimistic tag', () => {
  const note = (f: ReturnType<typeof render>): string => queryAll(f, '.lb-optimistic')[0]?.getAttribute('title') || '';

  it('says the winner was the best of several tries when the search had several candidates and the finalist shipped', () => {
    const f = render({ Leaderboard: [searchRow(1, 'lr', 0.331, false), searchRow(2, 'xgb', 0.332, true)], GateOutcome: 'model' });
    expect(note(f)).toContain('best of several tries');
  });

  it('does not call the finalist the winner when the gate did not ship it', () => {
    const f = render({ Leaderboard: [searchRow(1, 'lr', 0.331, false), searchRow(2, 'xgb', 0.332, true)], GateOutcome: 'keep-simple-baseline' });
    expect([note(f).includes('best of several tries'), note(f).includes('did not ship')]).toEqual([false, true]);
  });

  it('does not claim a selection when the search had one candidate', () => {
    const f = render({ Leaderboard: [searchRow(1, 'xgb', 0.332, true)], GateOutcome: 'model' });
    expect([note(f).includes('best of several tries'), note(f).includes('only candidate')]).toEqual([false, true]);
  });
});

describe('MLExperimentResultsViewerComponent (DOM) — the outcome card subtitle', () => {
  const rows = [{ ...searchRow(1, 'lr', 0.331, false), featureSet: 'Pipeline feature set' }, { ...searchRow(2, 'xgb', 0.332, true), featureSet: 'Pipeline feature set' }];
  const subtitle = (f: ReturnType<typeof render>): string | null => queryAll(f, '.winner-head .muted')[0]?.textContent?.trim() ?? null;

  it("names the shipped finalist's feature set and version when the gate shipped it", () => {
    const f = render({ Leaderboard: rows, GateOutcome: 'model', BestModel: { ID: 'm2', Name: 'Renewal (v2)', Version: 2 } });
    expect(subtitle(f)).toBe('Pipeline feature set · 2');
  });

  it("says the kept baseline is not the search's finalist, never naming the finalist's feature set", () => {
    const f = render({ Leaderboard: rows, GateOutcome: 'keep-simple-baseline', BestModel: { ID: 'm1', Name: 'Renewal (v1)', Version: 1 } });
    expect(subtitle(f)).toBe("A simple baseline, not the search's finalist");
  });

  it('shows no subtitle when the gate shipped nothing', () => {
    const f = render({ Leaderboard: rows, GateOutcome: 'no-signal', GateReason: 'No signal.' });
    expect([subtitle(f), f.nativeElement.textContent.includes('Pipeline feature set · ')]).toEqual([null, false]);
  });
});

describe('MLExperimentResultsViewerComponent (DOM) — the tag on a lone candidate', () => {
  const tagText = (f: ReturnType<typeof render>): string => queryAll(f, '.lb-optimistic')[0]?.textContent?.trim() || '';

  it('tags a lone candidate "only candidate", never optimistic', () => {
    expect(tagText(render({ Leaderboard: [searchRow(1, 'xgb', 0.332, true)], GateOutcome: 'model' }))).toBe('only candidate');
  });

  it('tags the finalist of several candidates "optimistic"', () => {
    expect(tagText(render({ Leaderboard: [searchRow(1, 'lr', 0.331, false), searchRow(2, 'xgb', 0.332, true)], GateOutcome: 'model' }))).toBe('optimistic');
  });
});
