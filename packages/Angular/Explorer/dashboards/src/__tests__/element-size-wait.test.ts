import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElementHasSize, ElementSizeWait } from '../Home/element-size-wait';

/** A ResizeObserver double. `Report` calls back with one entry per size, for the element it observes. */
class FakeResizeObserver {
  public static Instances: FakeResizeObserver[] = [];
  public readonly Observed: Element[] = [];
  public Disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.Instances.push(this);
  }

  public observe(target: Element): void {
    this.Observed.push(target);
  }

  public unobserve(): void {
    // Not used by ElementSizeWait.
  }

  public disconnect(): void {
    this.Disconnected = true;
  }

  public Report(...sizes: Array<{ width: number; height: number }>): void {
    const entries = sizes.map(contentRect => ({ target: this.Observed[0], contentRect }) as unknown as ResizeObserverEntry);
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

/** A stand-in element with a fixed size (the node test environment has no DOM). */
const element = (width = 0, height = 0): HTMLElement => ({ getBoundingClientRect: () => ({ width, height }) }) as unknown as HTMLElement;

describe('ElementHasSize', () => {
  it('is true only when the element has both a width and a height', () => {
    expect(ElementHasSize(element(640, 360))).toBe(true);
    expect(ElementHasSize(element(0, 360))).toBe(false);
    expect(ElementHasSize(element(640, 0))).toBe(false);
    expect(ElementHasSize(element())).toBe(false);
  });
});

describe('ElementSizeWait', () => {
  beforeEach(() => {
    FakeResizeObserver.Instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('watches nothing until Watch', () => {
    const wait = new ElementSizeWait(() => undefined);
    expect(wait.IsWatching).toBe(false);
    expect(FakeResizeObserver.Instances).toHaveLength(0);
  });

  it('makes one observer when it watches the same element twice', () => {
    const wait = new ElementSizeWait(() => undefined);
    const body = element();

    wait.Watch(body);
    wait.Watch(body);

    expect(FakeResizeObserver.Instances).toHaveLength(1);
    expect(FakeResizeObserver.Instances[0].Observed).toEqual([body]);
    expect(wait.IsWatching).toBe(true);
  });

  it('disconnects the first observer when it watches a different element', () => {
    const wait = new ElementSizeWait(() => undefined);
    const first = element();
    const second = element();

    wait.Watch(first);
    wait.Watch(second);

    const [firstObserver, secondObserver] = FakeResizeObserver.Instances;
    expect(firstObserver.Disconnected).toBe(true);
    expect(secondObserver.Observed).toEqual([second]);
    expect(secondObserver.Disconnected).toBe(false);
  });

  it('calls back only for an entry that has a width and a height', () => {
    const onSize = vi.fn();
    const wait = new ElementSizeWait(onSize);
    wait.Watch(element());
    const observer = FakeResizeObserver.Instances[0];

    observer.Report({ width: 0, height: 0 });
    observer.Report({ width: 640, height: 0 }, { width: 0, height: 360 });
    expect(onSize).not.toHaveBeenCalled();

    observer.Report({ width: 640, height: 360 });
    expect(onSize).toHaveBeenCalledTimes(1);
  });

  it('disconnects on Stop, and a later Watch of the same element observes it again', () => {
    const wait = new ElementSizeWait(() => undefined);
    const body = element();
    wait.Watch(body);

    wait.Stop();
    expect(FakeResizeObserver.Instances[0].Disconnected).toBe(true);
    expect(wait.IsWatching).toBe(false);

    wait.Watch(body);
    expect(FakeResizeObserver.Instances).toHaveLength(2);
    expect(FakeResizeObserver.Instances[1].Observed).toEqual([body]);
    expect(wait.IsWatching).toBe(true);
  });
});
