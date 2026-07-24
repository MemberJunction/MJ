import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSCompareComponent } from './ps-compare.component';

/**
 * DOM coverage for <ps-compare> — the side-by-side run comparison. The engine is an @Input; a minimal
 * fake supplies `Sessions` + `IterationRowsForSession` (used to count scored iterations and build the
 * compare columns). A session is comparable only when it has ≥2 scored iterations, so we drive both the
 * empty state (no comparable sessions) and the populated grid (one session with 2 scored rows).
 * Standalone (self-imports CommonModule + FormsModule).
 */

type Row = ReturnType<PredictiveStudioEngine['IterationRowsForSession']>[number];

const scoredRow = (id: string, score: number, algo: string): Row =>
  ({
    ID: id,
    ExperimentSessionID: 's1',
    Sequence: 1,
    Label: null,
    Status: 'Completed',
    Score: score,
    ComputeCost: 1,
    TokensUsed: null,
    Rationale: null,
    AlgorithmName: algo,
  } as unknown as Row);

const makeEngine = (rowsBySession: Record<string, Row[]>) =>
  ({
    Sessions: Object.keys(rowsBySession).map((id) => ({ ID: id, Name: `Session ${id}` })),
    IterationRowsForSession: (id: string) => rowsBySession[id] ?? [],
  } as unknown as PredictiveStudioEngine);

const render = (engine: PredictiveStudioEngine) => renderComponentFixture(PSCompareComponent, { inputs: { engine } });

describe('PSCompareComponent (DOM)', () => {
  it('shows the empty state when no session has ≥2 scored iterations', () => {
    const fixture = render(makeEngine({ s1: [scoredRow('i1', 0.9, 'XGBoost')] }));
    expect(query(fixture, '[data-testid="ps-compare-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-compare-session"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nothing to compare yet');
  });

  it('renders the session picker when a comparable session exists', () => {
    const fixture = render(makeEngine({ s1: [scoredRow('i1', 0.9, 'XGBoost'), scoredRow('i2', 0.8, 'Ridge')] }));
    expect(query(fixture, '[data-testid="ps-compare-empty"]')).toBeNull();
    expect(query(fixture, '[data-testid="ps-compare-session"]')).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="ps-compare-session"] option').length).toBe(1);
  });

  it('renders the side-by-side layout with a column per top run', () => {
    const fixture = render(makeEngine({ s1: [scoredRow('i1', 0.9, 'XGBoost'), scoredRow('i2', 0.8, 'Ridge')] }));
    const layout = query(fixture, '[data-testid="ps-compare-layout-side"]');
    expect(layout).not.toBeNull();
    expect(layout?.textContent).toContain('XGBoost');
    expect(layout?.textContent).toContain('Ridge');
  });

  it('only lists sessions with ≥2 scored iterations in the picker', () => {
    const fixture = render(
      makeEngine({
        s1: [scoredRow('i1', 0.9, 'XGBoost'), scoredRow('i2', 0.8, 'Ridge')],
        s2: [scoredRow('i3', 0.7, 'MLP')], // only one scored → excluded
      }),
    );
    expect(queryAll(fixture, '[data-testid="ps-compare-session"] option').length).toBe(1);
  });
});
