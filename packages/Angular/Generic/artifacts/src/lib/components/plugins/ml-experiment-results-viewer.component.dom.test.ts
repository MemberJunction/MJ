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
    const f = render({ TargetMetric: 'auc', Leaderboard: [searchRow(1, 'lr-c01', 0.331, false), searchRow(2, 'lr-c1', 0.332, true), searchRow(3, 'xgb', 0.335, false)] });
    const headers = queryAll(f, '.lb-table thead th').map((th) => th.textContent?.trim());
    expect(headers).toEqual(['#', 'Algorithm', 'Feature set', 'log-loss', '95% interval']);
    expect(text(f, '.hero-metric-label')).toBe('log-loss · winner');
    const rows = queryAll(f, '.lb-table tbody tr');
    expect(rows.map((r) => r.querySelector('.lb-optimistic') !== null)).toEqual([false, true, false]);
    expect(rows[0].textContent).toContain('[0.301, 0.361]');
    expect(f.nativeElement.textContent).not.toContain('auc');
  });

  it("names each row's own metric when the rows disagree, under a neutral column label", () => {
    const f = render({ TargetMetric: 'auc', Leaderboard: [searchRow(1, 'a', 0.33, true, 'log-loss'), searchRow(2, 'b', 0.2, false, 'brier')] });
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
