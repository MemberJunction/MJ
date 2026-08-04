import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSExperimentsComponent } from './ps-experiments.component';

/**
 * DOM coverage for <ps-experiments> — the kanban + leaderboard for the active experiment session. The
 * engine is an @Input; a minimal fake supplies `Sessions` + `IterationRowsForSession`. The active
 * session is the first Running one (else most recent), so we drive: the empty state (no sessions), the
 * populated header/kanban (a Running session → Pause + Cancel visible), and a Paused session (Resume
 * visible). Clicking a control opens the shared <ps-confirm-modal> (no Remote Op runs). Standalone.
 */

type Row = ReturnType<PredictiveStudioEngine['IterationRowsForSession']>[number];

const makeEngine = (sessions: Array<{ ID: string; Name: string; Status: string; Budget?: string | null }>, rows: Row[] = []) =>
  ({
    Sessions: sessions,
    IterationRowsForSession: () => rows,
  } as unknown as PredictiveStudioEngine);

const render = (engine: PredictiveStudioEngine) => renderComponentFixture(PSExperimentsComponent, { inputs: { engine } });

describe('PSExperimentsComponent (DOM)', () => {
  it('shows the empty state when there are no sessions', () => {
    const fixture = render(makeEngine([]));
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-panel"]')?.textContent).toContain('No experiment sessions yet');
  });

  it('renders the session header + kanban columns for a running session', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Retention search', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-empty"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Retention search');
    expect(query(fixture, '[data-testid="ps-kanban-col-running"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-kanban-col-completed"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-kanban-col-pruned"]')).not.toBeNull();
  });

  it('shows Pause + Cancel (not Resume) for a Running session', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-pause"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-cancel"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-resume"]')).toBeNull();
  });

  it('shows Resume (not Pause) for a Paused session', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Paused', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-resume"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="ps-experiments-pause"]')).toBeNull();
  });

  it('shows the empty-leaderboard note when the session has no scored iterations', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-experiments-leaderboard"]')?.textContent).toContain('No scored iterations yet');
  });

  it('opens the confirm modal when Pause is clicked', () => {
    const fixture = render(makeEngine([{ ID: 's1', Name: 'Run', Status: 'Running', Budget: null }]));
    expect(query(fixture, '[data-testid="ps-confirm-modal"]')).toBeNull();
    (query(fixture, '[data-testid="ps-experiments-pause"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="ps-confirm-modal"]')).not.toBeNull();
  });
});
