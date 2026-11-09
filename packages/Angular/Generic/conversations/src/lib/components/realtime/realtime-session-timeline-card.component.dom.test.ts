import { describe, it, expect } from 'vitest';
import { RenderComponentFixture, Query, QueryAll, Text, Capture, Click } from '@memberjunction/ng-test-utils';
import { RealtimeSessionTimelineCardComponent } from './realtime-session-timeline-card.component';
import type {
  RealtimeSessionTimelineGroup,
  RealtimeSessionTimelineMeta,
} from '../../utils/realtime-session-timeline';

/**
 * DOM spec for <mj-realtime-session-timeline-card> — the ONE collapsed element a realtime session
 * becomes in the conversation message list. Pure inputs → template: covers the header (title and
 * start time), the status pill and its tone, the duration and message count, who said the quoted
 * line, the error and live states, and the OpenRequested emission from both the button and the
 * bubble.
 */
describe('RealtimeSessionTimelineCardComponent (DOM)', () => {
  const VIEWER_ID = 'AAAA1111-0000-0000-0000-000000000001';

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
    StartedAt: new Date('2026-05-01T10:00:00'),
    UserID: VIEWER_ID,
    UserName: 'Barnatt',
    ...overrides,
  });

  const render = (
    group: RealtimeSessionTimelineGroup,
    meta: RealtimeSessionTimelineMeta | null = null,
    currentUserID: string | null = null
  ) =>
    RenderComponentFixture(RealtimeSessionTimelineCardComponent, {
      inputs: { Group: group, Meta: meta, CurrentUserID: currentUserID },
    });

  it('renders "Voice call" with no status when no meta is available', () => {
    const f = render(makeGroup());
    expect(Text(f, '.call__title')).toBe('Voice call');
    expect(Query(f, '.call__status')).toBeNull();
  });

  it('names the agent in the header and shows when the call started', () => {
    const f = render(makeGroup(), makeMeta());
    expect(Text(f, '.call__title')).toBe('Voice call with Sage');
    expect(Text(f, '.call__time')).toContain('10:00');
  });

  it('shows a humanized status with its tone for a closed call', () => {
    const ended = Query(render(makeGroup(), makeMeta({ CloseReason: 'Explicit' })), '.call__status');
    expect(ended?.textContent?.trim()).toBe('Ended');
    expect(ended?.getAttribute('data-tone')).toBe('neutral');
    expect(Text(render(makeGroup(), makeMeta({ CloseReason: 'Janitor' })), '.call__status')).toBe('Timed out');
    expect(Text(render(makeGroup(), makeMeta({ CloseReason: null })), '.call__status')).toBe('Closed');
  });

  it('marks an error close on the status and the icon', () => {
    const f = render(makeGroup(), makeMeta({ CloseReason: 'Error' }));
    expect(Query(f, '.call__status')?.getAttribute('data-tone')).toBe('error');
    expect(Query(f, '.call')?.classList.contains('call--error')).toBe(true);
    expect(Query(f, '.call__icon i')?.classList.contains('fa-phone-slash')).toBe(true);
  });

  it('marks a live call, drops the duration and offers to view it', () => {
    const f = render(makeGroup(), makeMeta({ Status: 'Active', CloseReason: null, ClosedAt: null }));
    expect(Text(f, '.call__status')).toBe('Live');
    expect(Query(f, '.call__status')?.getAttribute('data-tone')).toBe('live');
    expect(Query(f, '.call')?.classList.contains('call--live')).toBe(true);
    expect(Query(f, '.call__duration')).toBeNull();
    expect(Text(f, '.call__open')).toBe('View call');
  });

  it('shows how long the call ran and how much was said', () => {
    const f = render(makeGroup(), makeMeta());
    expect(Text(f, '.call__duration')).toBe('20 min');
    expect(Text(f, '.call__count')).toBe('4 messages');
    expect(Text(render(makeGroup({ TurnCount: 1 })), '.call__count')).toBe('1 message');
  });

  it('quotes the last line under the name of whoever said it', () => {
    const agentLine = render(makeGroup(), makeMeta());
    expect(Text(agentLine, '.call__speaker')).toBe('Sage');
    expect(Text(agentLine, '.call__quote-text')).toBe('Here is the summary you asked for.');

    const ownLine = render(makeGroup({ LastTurnRole: 'User', LastTurnPreview: 'thanks!' }), makeMeta(), VIEWER_ID);
    expect(Text(ownLine, '.call__speaker')).toBe('You');

    const theirLine = render(makeGroup({ LastTurnRole: 'User', LastTurnPreview: 'thanks!' }), makeMeta(), 'SOMEONE-ELSE');
    expect(Text(theirLine, '.call__speaker')).toBe('Barnatt');
  });

  it('omits the quote when there is no last line', () => {
    const f = render(makeGroup({ LastTurnPreview: null, LastTurnRole: null }));
    expect(Query(f, '.call__quote')).toBeNull();
  });

  it('labels the whole row for screen readers and keeps the icons out of it', () => {
    const f = render(makeGroup(), makeMeta());
    expect(Query(f, '.call')?.getAttribute('aria-label')).toBe('Voice call with Sage, Ended, 20 min, 4 messages');
    expect(Query(f, '.call__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(QueryAll(f, '.call__fact i').every(i => i.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('emits OpenRequested exactly once with the session id when the button is clicked', () => {
    const f = render(makeGroup());
    const opened = Capture(f.componentInstance.OpenRequested);
    Click(f, '.call__open');
    // stopPropagation on the button click keeps the bubble's handler from double-firing
    expect(opened).toEqual(['sess-1']);
  });

  it('emits OpenRequested when the bubble itself is clicked', () => {
    const f = render(makeGroup());
    const opened = Capture(f.componentInstance.OpenRequested);
    Click(f, '.call__bubble');
    expect(opened).toEqual(['sess-1']);
  });
});
