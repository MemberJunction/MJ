import { describe, it, expect, vi, afterEach } from 'vitest';
import { MessageItemComponent, STOP_RETRY_AFTER_MS } from './message-item.component';
import type { BeforeStopClickedEventArgs } from '../../events/chat-events';

/**
 * The Stop control's render gate and click behavior.
 *
 * `CanStopRun` mirrors the template: shown only for an AI reply still In-Progress, in a
 * conversation the viewer may write to, when the host allows stopping (`AllowStopRun`).
 * A click fires the cancelable `BeforeStopClicked` first; a listener that cancels keeps the
 * run going and the control available. Otherwise the item enters its stopping state and emits
 * `StopRequested`; `ngDoCheck` clears the state when the message leaves In-Progress, and a
 * retry window re-offers the control if the stop did not take. Constructed off the prototype,
 * as the other message-item specs are. (Co-located as .dom.test.ts because importing the
 * component pulls the Angular graph the node project can't load.)
 */
describe('MessageItemComponent — Stop control', () => {
  let requested: unknown[] = [];
  let before: BeforeStopClickedEventArgs[] = [];
  let cancelNext = false;

  const item = (fields: Record<string, unknown>): MessageItemComponent => {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
      message: { ID: 'm1', Status: 'In-Progress', Role: 'AI' },
      AgentRun: { ID: 'run-1' },
      _stableIsInProgressAIMessage: true,
      ReadOnly: false,
      AllowStopRun: true,
      IsStopping: false,
      BeforeStopClicked: {
        emit: (e: BeforeStopClickedEventArgs) => {
          before.push(e);
          if (cancelNext) {
            e.Cancel = true;
          }
        },
      },
      StopRequested: { emit: (msg: unknown) => requested.push(msg) },
      ...fields,
    });
    return component;
  };

  afterEach(() => {
    requested = [];
    before = [];
    cancelNext = false;
    vi.useRealTimers();
  });

  it('is offered for an in-progress AI reply the viewer may write to', () => {
    expect(item({}).CanStopRun).toBe(true);
  });

  it('is hidden once the reply is no longer in progress', () => {
    expect(item({ _stableIsInProgressAIMessage: false }).CanStopRun).toBe(false);
  });

  it('is hidden for a read-only viewer', () => {
    expect(item({ ReadOnly: true }).CanStopRun).toBe(false);
  });

  it('is hidden when the host turns stopping off, even for a writer', () => {
    expect(item({ AllowStopRun: false }).CanStopRun).toBe(false);
  });

  it('a click fires BeforeStopClicked with the reply and run ids, then StopRequested once; a second click is ignored', () => {
    const component = item({});
    component.OnStopClick();
    component.OnStopClick();

    expect(before).toHaveLength(1);
    expect(before[0].ConversationDetailId).toBe('m1');
    expect(before[0].AgentRunId).toBe('run-1');
    expect(requested).toHaveLength(1);
    expect((requested[0] as { ID: string }).ID).toBe('m1');
    expect(component.IsStopping).toBe(true);
  });

  it('reports a null run id when the chat has not seen the run row yet', () => {
    item({ AgentRun: null }).OnStopClick();
    expect(before[0].AgentRunId).toBeNull();
    expect(requested).toHaveLength(1); // still requested; the host resolves it by detail id
  });

  it('a listener that cancels BeforeStopClicked keeps the run going and the control available', () => {
    cancelNext = true;
    const component = item({});
    component.OnStopClick();

    expect(before).toHaveLength(1);
    expect(requested).toHaveLength(0);
    expect(component.IsStopping).toBe(false);
    expect(component.CanStopRun).toBe(true);
  });

  it('offers Stop again after the retry window if the run is still in progress', () => {
    vi.useFakeTimers();
    const component = item({});
    component.OnStopClick();
    expect(component.IsStopping).toBe(true);

    vi.advanceTimersByTime(STOP_RETRY_AFTER_MS - 1);
    expect(component.IsStopping).toBe(true);
    vi.advanceTimersByTime(1);
    expect(component.IsStopping).toBe(false);
    expect(component.CanStopRun).toBe(true);
  });

  it('a click while the control is not offered does nothing', () => {
    const component = item({ ReadOnly: true });
    component.OnStopClick();
    expect(before).toHaveLength(0);
    expect(requested).toHaveLength(0);
    expect(component.IsStopping).toBe(false);
  });
});
