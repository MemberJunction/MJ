import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, capture, click } from '@memberjunction/ng-test-utils';
import { RealtimeSessionTimelineCardComponent } from './realtime-session-timeline-card.component';
import type {
  RealtimeSessionTimelineGroup,
  RealtimeSessionTimelineMeta,
} from '../../utils/realtime-session-timeline';

/**
 * DOM spec for <mj-realtime-session-timeline-card> — the ONE collapsed element a
 * realtime session becomes in the conversation message list. Pure inputs → template:
 * covers the agent-aware title, the status/close-reason chip states (+ error/live
 * styling), turn-count pluralization, the last-turn preview role mapping, and the
 * OpenRequested emission from both the Open button and the whole-card click.
 */
describe('RealtimeSessionTimelineCardComponent (DOM)', () => {
  const makeGroup = (overrides: Partial<RealtimeSessionTimelineGroup> = {}): RealtimeSessionTimelineGroup => ({
    SessionID: 'sess-1',
    StartedAt: new Date('2026-05-01T10:00:00'),
    EndedAt: new Date('2026-05-01T10:20:00'),
    TurnCount: 4,
    DetailCount: 6,
    LastTurnRole: 'Assistant',
    LastTurnPreview: 'Here is the summary you asked for.',
    ...overrides,
  });

  const makeMeta = (overrides: Partial<RealtimeSessionTimelineMeta> = {}): RealtimeSessionTimelineMeta => ({
    SessionID: 'sess-1',
    AgentName: 'Sage',
    Status: 'Closed',
    CloseReason: 'Explicit',
    ClosedAt: new Date('2026-05-01T10:20:00'),
    ...overrides,
  });

  const render = (group: RealtimeSessionTimelineGroup, meta: RealtimeSessionTimelineMeta | null = null, userName?: string) =>
    renderComponentFixture(RealtimeSessionTimelineCardComponent, {
      inputs: { Group: group, Meta: meta, ...(userName ? { UserName: userName } : {}) },
    });

  it('renders the generic title when no meta is available, and no status chip', () => {
    const f = render(makeGroup());
    expect(text(f, '.session-card__title')).toBe('Realtime session');
    expect(query(f, '.session-card__chip')).toBeNull();
  });

  it('renders the agent-aware title when the meta carries an agent name', () => {
    const f = render(makeGroup(), makeMeta());
    expect(text(f, '.session-card__title')).toBe('Realtime session · Sage');
  });

  it('shows a humanized close-reason chip for a closed session', () => {
    expect(text(render(makeGroup(), makeMeta({ CloseReason: 'Explicit' })), '.session-card__chip')).toBe('Ended');
    expect(text(render(makeGroup(), makeMeta({ CloseReason: 'Janitor' })), '.session-card__chip')).toBe('Timed out');
    expect(text(render(makeGroup(), makeMeta({ CloseReason: null })), '.session-card__chip')).toBe('Closed');
  });

  it('styles an error close with the error chip modifier', () => {
    const f = render(makeGroup(), makeMeta({ CloseReason: 'Error' }));
    const chip = query(f, '.session-card__chip');
    expect(chip?.textContent?.trim()).toBe('Error');
    expect(chip?.classList.contains('session-card__chip--error')).toBe(true);
  });

  it('shows a Live chip with the live modifier for an active session', () => {
    const f = render(makeGroup(), makeMeta({ Status: 'Active', CloseReason: null }));
    const chip = query(f, '.session-card__chip');
    expect(chip?.textContent?.trim()).toBe('Live');
    expect(chip?.classList.contains('session-card__chip--live')).toBe(true);
  });

  it('pluralizes the turn count', () => {
    expect(text(render(makeGroup({ TurnCount: 1 })), '.session-card__turns')).toBe('1 turn');
    expect(text(render(makeGroup({ TurnCount: 4 })), '.session-card__turns')).toBe('4 turns');
  });

  it('renders the last-turn preview with the mapped speaker name', () => {
    const userTurn = render(makeGroup({ LastTurnRole: 'User', LastTurnPreview: 'thanks!' }), null, 'Barnatt');
    expect(text(userTurn, '.session-card__preview-role')).toBe('Barnatt:');
    const agentTurn = render(makeGroup());
    expect(text(agentTurn, '.session-card__preview-role')).toBe('Agent:');
    expect(text(agentTurn, '.session-card__preview')).toContain('Here is the summary you asked for.');
  });

  it('omits the preview block when there is no last turn', () => {
    const f = render(makeGroup({ LastTurnPreview: null, LastTurnRole: null }));
    expect(query(f, '.session-card__preview')).toBeNull();
  });

  it('emits OpenRequested exactly once with the session id when the Open button is clicked', () => {
    const f = render(makeGroup());
    const opened = capture(f.componentInstance.OpenRequested);
    click(f, '.session-card__open');
    // stopPropagation on the button click keeps the whole-card handler from double-firing
    expect(opened).toEqual(['sess-1']);
  });

  it('emits OpenRequested when the card body itself is clicked', () => {
    const f = render(makeGroup());
    const opened = capture(f.componentInstance.OpenRequested);
    click(f, '.session-card');
    expect(opened).toEqual(['sess-1']);
  });
});
