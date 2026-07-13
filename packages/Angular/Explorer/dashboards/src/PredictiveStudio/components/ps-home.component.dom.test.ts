import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../predictive-studio.engine';
import { PSHomeComponent } from './ps-home.component';

/**
 * DOM coverage for <ps-home> — the Predictive Studio landing panel: hero + KPI strip, three entry
 * paths (data / template / agent), and navigate / askAgent outputs. The engine is an @Input (not a
 * singleton), so a minimal fake covers what rebuild() reads; with no provider input the on-demand
 * scoring-run load is skipped. Standalone (self-imports mjButton). data-testid hooks for targeting.
 */

const ENGINE = {
  Models: [],
  RunningSessions: [],
  Iterations: [],
  ModelDisplayName: () => '',
  AlgorithmName: () => '',
} as unknown as PredictiveStudioEngine;

const render = () => renderComponentFixture(PSHomeComponent, { inputs: { engine: ENGINE } });

describe('PSHomeComponent (DOM)', () => {
  it('renders the hero with the KPI strip', () => {
    const fixture = render();
    expect(query(fixture, '[data-testid="ps-home-hero"]')?.textContent).toContain('Build a predictive model');
    const kpiLabels = queryAll(fixture, '.hero-stats .l').map((e) => e.textContent?.trim());
    expect(kpiLabels).toEqual(expect.arrayContaining(['Published', 'Active Experiments', 'Best Holdout AUC', 'Scored this week']));
  });

  it('renders the three entry-path cards', () => {
    const fixture = render();
    expect(query(fixture, '[data-testid="ps-home-path-data"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-home-path-template"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-home-path-agent"]')).not.toBeNull();
  });

  it('emits navigate("pipelines") from the "Start from data" path', () => {
    const fixture = render();
    const nav = capture(fixture.componentInstance.navigate);
    (query(fixture, '[data-testid="ps-home-path-data"]') as HTMLElement).click();
    expect(nav).toEqual(['pipelines']);
  });

  it('emits navigate("catalog") from the template path', () => {
    const fixture = render();
    const nav = capture(fixture.componentInstance.navigate);
    (query(fixture, '[data-testid="ps-home-path-template"]') as HTMLElement).click();
    expect(nav).toEqual(['catalog']);
  });

  it('emits askAgent when the agent path is clicked', () => {
    const fixture = render();
    const asked = capture(fixture.componentInstance.askAgent);
    (query(fixture, '[data-testid="ps-home-path-agent"]') as HTMLElement).click();
    expect(asked.length).toBe(1);
    expect(typeof asked[0]).toBe('string');
  });
});
