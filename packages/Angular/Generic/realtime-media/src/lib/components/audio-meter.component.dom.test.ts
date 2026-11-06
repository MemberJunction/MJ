import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, queryAll } from '@memberjunction/ng-test-utils';
import { MediaAudioMeterComponent } from './audio-meter.component';

/**
 * Animation frames are stepped by hand: `requestAnimationFrame` queues the callback and `cancelAnimationFrame`
 * removes it, and each step runs every queued frame once. Angular's scheduler queues frames here too, so the
 * tests watch the level reader rather than counting frame calls.
 */
describe('MediaAudioMeterComponent (DOM)', () => {
  let queued: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    queued = new Map();
    nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queued.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  });

  afterEach(() => vi.unstubAllGlobals());

  const step = (): void => {
    const callbacks = [...queued.values()];
    queued.clear();
    callbacks.forEach((callback) => callback(0));
  };
  const render = (inputs: Record<string, unknown>) => renderComponentFixture(MediaAudioMeterComponent, { inputs });
  const heights = (fixture: ReturnType<typeof render>): number[] =>
    queryAll(fixture, '.meter__bar').map((bar) => parseInt((bar as HTMLElement).style.height, 10));

  /** A level reader that counts its reads. */
  const reader = (level: number): { Read: () => number; Reads: () => number } => {
    let reads = 0;
    return {
      Read: () => {
        reads++;
        return level;
      },
      Reads: () => reads,
    };
  };

  it('renders one bar per BarCount, seven by default', () => {
    expect(queryAll(render({}), '.meter__bar')).toHaveLength(7);
    expect(queryAll(render({ Settings: { BarCount: 3 } }), '.meter__bar')).toHaveLength(3);
  });

  it('raises the bars with the level, tallest in the middle', () => {
    const f = render({ Level: () => 1, Settings: { BarCount: 3, Attack: 1 } });
    step();
    const [left, middle, right] = heights(f);
    expect(middle).toBeGreaterThan(left);
    expect(middle).toBeGreaterThan(right);
    expect(middle).toBeGreaterThan(10);
  });

  it('keeps every bar at the floor while silent', () => {
    const f = render({ Level: () => 0, Settings: { BarCount: 3 } });
    step();
    expect(heights(f)).toEqual([10, 10, 10]);
  });

  it('applies the attack: a slower attack rises less in one frame', () => {
    const fast = render({ Level: () => 1, Settings: { BarCount: 1, Attack: 1 } });
    const slow = render({ Level: () => 1, Settings: { BarCount: 1, Attack: 0.2 } });
    step();
    expect(heights(slow)[0]).toBeLessThan(heights(fast)[0]);
  });

  it('reads the level once per frame, and stops polling when Level is cleared', () => {
    const level = reader(0.5);
    const f = render({ Level: level.Read });
    step();
    step();
    expect(level.Reads()).toBe(2);
    f.componentRef.setInput('Level', null);
    f.detectChanges();
    step();
    step();
    expect(level.Reads()).toBe(2);
    // Nothing is left polling: a running meter always has its next frame queued.
    expect(queued.size).toBe(0);
  });

  it('stops reading when destroyed', () => {
    const level = reader(0.5);
    const f = render({ Level: level.Read });
    step();
    f.destroy();
    step();
    expect(level.Reads()).toBe(1);
  });
});
