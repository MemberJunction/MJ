import { describe, it, expect, afterEach } from 'vitest';
import { MessageItemComponent } from './message-item.component';

/**
 * A stopped reply's look and its Continue control.
 *
 * The time pill names the stop with the time the run ran ("Stopped · 0:44") and takes the
 * neutral `stopped` state rather than the blue `complete` one; a "N steps kept" line shows what
 * the run kept; and on the last message of a conversation the viewer may write to, when the host
 * allows stopping (`AllowStopRun`), a Continue control sends the canned continuation through `SuggestedResponseSelected`, which the chat area
 * sends as the next message and the run chain resumes. Constructed off the prototype, as the
 * other message-item specs are. (Co-located as .dom.test.ts because importing the component pulls
 * the Angular graph the node project can't load.)
 */
describe('MessageItemComponent — a stopped reply', () => {
  let sent: Array<{ text: string; customInput?: string }> = [];
  const createdAt = new Date('2026-10-13T12:00:00Z');
  const updatedAt = new Date('2026-10-13T12:00:44Z');
  const item = (fields: Record<string, unknown>): MessageItemComponent => {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const message = { ID: 'm1', Status: 'Complete', Role: 'AI' };
    Object.assign(component as unknown as Record<string, unknown>, {
      message,
      AllMessages: [{ ID: 'u1', Role: 'User' }, message],
      AgentRun: { ID: 'run-1', Status: 'Cancelled', CancellationReason: 'User Request', __mj_CreatedAt: createdAt, __mj_UpdatedAt: updatedAt, Steps: [{}, {}] },
      _stableIsInProgressAIMessage: false,
      ReadOnly: false,
      SuggestedResponseSelected: { emit: (e: { text: string; customInput?: string }) => sent.push(e) },
      ...fields,
    });
    return component;
  };
  afterEach(() => { sent = []; });

  it('recognizes a stopped run, and the user-stopped one in particular', () => {
    expect(item({}).IsStoppedRun).toBe(true);
    expect(item({}).WasStoppedByUser).toBe(true);
    const timeout = item({ AgentRun: { ID: 'run-1', Status: 'Cancelled', CancellationReason: 'Timeout', __mj_CreatedAt: createdAt, __mj_UpdatedAt: updatedAt, Steps: [] } });
    expect(timeout.IsStoppedRun).toBe(true);
    expect(timeout.WasStoppedByUser).toBe(false);
    expect(item({ AgentRun: { ID: 'run-1', Status: 'Completed', __mj_CreatedAt: createdAt, __mj_UpdatedAt: updatedAt } }).IsStoppedRun).toBe(false);
    expect(item({ AgentRun: null }).IsStoppedRun).toBe(false);
  });

  it('the pill names the stop with the time the run ran', () => {
    expect(item({}).TimePillText).toBe('Stopped · 0:44');
  });

  it('says how many steps the stopped run kept, and nothing when it kept none', () => {
    expect(item({}).StoppedLineText).toBe('2 steps kept');
    expect(item({ AgentRun: { ID: 'run-1', Status: 'Cancelled', CancellationReason: 'User Request', Steps: [{}] } }).StoppedLineText).toBe('1 step kept');
    expect(item({ AgentRun: { ID: 'run-1', Status: 'Cancelled', CancellationReason: 'User Request', Steps: [] } }).StoppedLineText).toBeNull();
    expect(item({ AgentRun: { ID: 'run-1', Status: 'Completed', Steps: [{}, {}] } }).StoppedLineText).toBeNull();
  });

  it('offers Continue only on the last message, user-stopped, for a writer', () => {
    expect(item({}).CanContinueStoppedRun).toBe(true);
    expect(item({ ReadOnly: true }).CanContinueStoppedRun).toBe(false);
    const message = { ID: 'm1', Status: 'Complete', Role: 'AI' };
    expect(item({ message, AllMessages: [message, { ID: 'u2', Role: 'User' }] }).CanContinueStoppedRun).toBe(false);
    expect(item({ AgentRun: { ID: 'run-1', Status: 'Cancelled', CancellationReason: 'Timeout', Steps: [] } }).CanContinueStoppedRun).toBe(false);
  });

  it('offers no Continue when the host turns stopping off, but still shows the reply as stopped', () => {
    const off = item({ AllowStopRun: false });
    expect(off.CanContinueStoppedRun).toBe(false);
    expect(off.IsStoppedRun).toBe(true);
    expect(off.TimePillText).toBe('Stopped · 0:44');
    off.OnContinueClick();
    expect(sent).toHaveLength(0);
  });

  it('Continue sends the canned continuation as a suggested response, and does nothing when not offered', () => {
    item({}).OnContinueClick();
    expect(sent).toEqual([{ text: 'Continue where you left off' }]);
    expect(MessageItemComponent.ContinueMessage).toBe('Continue where you left off');
    item({ ReadOnly: true }).OnContinueClick();
    expect(sent).toHaveLength(1);
  });
});
