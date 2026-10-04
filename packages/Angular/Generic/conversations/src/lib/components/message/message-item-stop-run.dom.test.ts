import { describe, it, expect, vi, afterEach } from 'vitest';
import { MessageItemComponent, STOP_RETRY_AFTER_MS } from './message-item.component';

/**
 * The Stop control's render gate and click behavior.
 *
 * `CanStopRun` mirrors the template: shown only for an AI reply still In-Progress in a
 * conversation the viewer may write to. `OnStopClick` emits once and flips `IsStopping`, which
 * the template reads to disable the button and show "Stopping…"; `ngDoCheck` clears it when the
 * message leaves In-Progress. Constructed off the prototype — pure derived state, and a full
 * render needs the whole component graph. (Co-located as .dom.test.ts because importing the
 * component pulls the Angular graph the node project can't load.)
 */
describe('MessageItemComponent — Stop control', () => {
  const item = (fields: Record<string, unknown>): MessageItemComponent => {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
      message: { ID: 'm1', Status: 'In-Progress', Role: 'AI' },
      _stableIsInProgressAIMessage: true,
      ReadOnly: false,
      IsStopping: false,
      StopClicked: { emit: (msg: unknown) => emitted.push(msg) },
      ...fields,
    });
    return component;
  };
  let emitted: unknown[] = [];

  it('is offered for an in-progress AI reply the viewer may write to', () => {
    emitted = [];
    expect(item({}).CanStopRun).toBe(true);
  });

  it('is hidden once the reply is no longer in progress', () => {
    expect(item({ _stableIsInProgressAIMessage: false }).CanStopRun).toBe(false);
  });

  it('is hidden for a read-only viewer', () => {
    expect(item({ ReadOnly: true }).CanStopRun).toBe(false);
  });

  it('a click emits the message once and enters the stopping state; a second click is ignored', () => {
    emitted = [];
    const component = item({});
    component.OnStopClick();
    component.OnStopClick();
    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { ID: string }).ID).toBe('m1');
    expect(component.IsStopping).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers Stop again after the retry window if the run is still in progress', () => {
    vi.useFakeTimers();
    emitted = [];
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
    emitted = [];
    const component = item({ ReadOnly: true });
    component.OnStopClick();
    expect(emitted).toHaveLength(0);
    expect(component.IsStopping).toBe(false);
  });
});
