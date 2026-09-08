import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJAccordionModule } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, text, capture, click } from '@memberjunction/ng-test-utils';
import { RealtimeDelegationCardComponent } from './realtime-delegation-card.component';
import type { RealtimeDelegationCardVM } from './realtime-session-state';
import type { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * DOM spec for <mj-realtime-delegation-card>. Renders one delegation two ways off the
 * Card @Input: a compact WORKING card (progress bar, step label, cancel + dev links)
 * and a collapsed DONE/FAILED accordion chip (result preview, provenance, artifacts).
 * Covers the working/done branch selection, step + detail lines, determinate vs
 * indeterminate progress, the DevMode-gated "Open run" link, and the cancel / open-run /
 * open-artifact outputs. The real MJAccordionModule is imported (it is DOM, not media).
 */
describe('RealtimeDelegationCardComponent (DOM)', () => {
  const workingCard = (overrides: Partial<RealtimeDelegationCardVM> = {}): RealtimeDelegationCardVM => ({
    CallID: 'call-1',
    AgentName: 'Sage',
    LatestMessage: 'Fetching the latest figures',
    LatestStep: 'action_execution',
    Done: false,
    Success: false,
    StartedAt: 1000,
    ...overrides,
  });

  const doneCard = (overrides: Partial<RealtimeDelegationCardVM> = {}): RealtimeDelegationCardVM => ({
    CallID: 'call-2',
    AgentName: 'Sage',
    LatestMessage: 'done',
    LatestStep: 'action_execution',
    Done: true,
    Success: true,
    Result: 'The renewal rate is 87%.',
    StartedAt: 1000,
    FinishedAt: 5000,
    ...overrides,
  });

  const artifact: ParsedDelegationArtifact = {
    ArtifactID: 'a1',
    ArtifactVersionID: 'v1',
    Name: 'Renewal Report',
  };

  const render = (card: RealtimeDelegationCardVM, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(RealtimeDelegationCardComponent, {
      imports: [CommonModule, MJAccordionModule, RealtimeDelegationCardComponent],
      inputs: { Card: card, ...inputs },
    });

  it('renders the working card with the friendly step label', () => {
    const f = render(workingCard());
    expect(query(f, '.work-card')).not.toBeNull();
    expect(text(f, '.work-card__step')).toBe('Running actions');
    expect(text(f, '.work-card__title')).toContain('Sage is working…');
  });

  // One render per test (TestBed single-use) — each state is its own spec.
  it('shows the raw detail line when it differs from the step label', () => {
    const differs = render(workingCard({ LatestMessage: 'Querying the CRM' }));
    expect(text(differs, '.work-card__detail')).toBe('Querying the CRM');
  });

  it('suppresses the raw detail line when the step label falls back to the message', () => {
    // Unknown step → FriendlyStepLabel falls back to the message, so the detail line is suppressed.
    const same = render(workingCard({ LatestStep: 'mystery_step', LatestMessage: 'Working on it' }));
    expect(query(same, '.work-card__detail')).toBeNull();
  });

  it('renders a determinate progress fill when a percentage is supplied', () => {
    const determinate = render(workingCard({ Percentage: 40 }));
    const fill = determinate.nativeElement.querySelector('.work-progress__fill') as HTMLElement;
    expect(fill.style.width).toBe('40%');
    expect(query(determinate, '.work-progress--indeterminate')).toBeNull();
  });

  it('renders an indeterminate progress bar when no percentage is supplied', () => {
    const indeterminate = render(workingCard());
    expect(query(indeterminate, '.work-progress--indeterminate')).not.toBeNull();
    expect(query(indeterminate, '.work-progress__fill--slide')).not.toBeNull();
  });

  it('emits CancelRequested with the call id from the working card ✕', () => {
    const f = render(workingCard());
    const cancels = capture(f.componentInstance.CancelRequested);
    click(f, '.cancel-work');
    expect(cancels).toEqual(['call-1']);
  });

  it('hides the dev "Open run" link when DevMode is off, even with a RunID', () => {
    expect(query(render(workingCard({ RunID: 'r1' })), '.dev-link')).toBeNull();
  });

  it('shows the dev "Open run" link only when DevMode is on and a RunID is known', () => {
    expect(query(render(workingCard({ RunID: 'r1' }), { DevMode: true }), '.dev-link')).not.toBeNull();
  });

  it('emits OpenRunRequested with the run id from the working dev link', () => {
    const f = render(workingCard({ RunID: 'run-99' }), { DevMode: true });
    const runs = capture(f.componentInstance.OpenRunRequested);
    click(f, '.dev-link');
    expect(runs).toEqual(['run-99']);
  });

  it('renders the done state as an accordion chip with the result preview and via-badge', () => {
    const f = render(doneCard());
    expect(query(f, '.work-card')).toBeNull();
    expect(query(f, '.done-accordion')).not.toBeNull();
    expect(text(f, '.done-chip__preview')).toContain('The renewal rate is 87%.');
    expect(text(f, '.via-badge')).toContain('via Sage');
    expect(query(f, '.done-chip__mark')?.classList.contains('fa-check')).toBe(true);
  });

  it('marks a failed done card with the failed modifier and ✗ mark', () => {
    const f = render(doneCard({ Success: false, Result: 'The query timed out.' }));
    expect(query(f, '.done-accordion--failed')).not.toBeNull();
    expect(query(f, '.done-chip__mark')?.classList.contains('fa-xmark')).toBe(true);
  });

  it('renders artifact "View" chips and emits OpenArtifactRequested when one is clicked', () => {
    const f = render(doneCard({ Artifacts: [artifact] }));
    const artifacts = capture(f.componentInstance.OpenArtifactRequested);
    click(f, '.artifact-link');
    expect(artifacts).toEqual([artifact]);
  });
});
