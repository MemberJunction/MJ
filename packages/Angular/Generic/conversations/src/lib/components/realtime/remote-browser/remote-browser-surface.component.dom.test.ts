import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import {
  ComputeFittedFrameSize,
  RemoteBrowserSurfaceComponent,
  type RemoteBrowserSnapshotView,
  type RemoteBrowserViewportSize,
} from './remote-browser-surface.component';

/**
 * DOM spec for the remote browser surface's snapshot poll: it runs while the surface is bound and on screen, pauses
 * out of sight (`Visible`), resumes at once when shown, and never runs while the server pushes frames.
 */
describe('RemoteBrowserSurfaceComponent: snapshot poll (DOM)', () => {
  const POLL_MS = 700;
  let fetches: number;
  const fetch = async (): Promise<RemoteBrowserSnapshotView | null> => {
    fetches++;
    return { ScreenshotBase64: null, CurrentUrl: 'https://example.com/' };
  };

  beforeEach(() => {
    fetches = 0;
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  const render = (inputs: { Visible?: boolean; Streaming?: boolean } = {}) =>
    renderComponentFixture(RemoteBrowserSurfaceComponent, { inputs: { Fetch: fetch, ...inputs } });

  it('polls at once and then every 700 ms while on screen', async () => {
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(fetches).toBe(3);
  });

  it('pauses the poll out of sight and polls again at once when shown', async () => {
    const f = render();
    await vi.advanceTimersByTimeAsync(0);
    f.componentRef.setInput('Visible', false);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetches).toBe(1);
    f.componentRef.setInput('Visible', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetches).toBe(3);
  });

  it('does not poll when it starts out of sight, until it is shown', async () => {
    const f = render({ Visible: false });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetches).toBe(0);
    f.componentRef.setInput('Visible', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
  });

  it('never polls while the server pushes frames, whatever its visibility', async () => {
    const f = render({ Streaming: true });
    f.componentRef.setInput('Visible', false);
    f.componentRef.setInput('Visible', true);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetches).toBe(0);
  });

  it('stops polling when destroyed', async () => {
    const f = render();
    await vi.advanceTimersByTimeAsync(0);
    f.destroy();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetches).toBe(1);
  });
});

describe('RemoteBrowserSurfaceComponent: usable drawer viewport measurement & aspect-ratio fitting (DOM)', () => {
  type ResizeCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
  let resizeCallback: ResizeCallback | null = null;
  let observedElement: Element | null = null;
  let disconnected = false;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    resizeCallback = null;
    observedElement = null;
    disconnected = false;
    vi.useFakeTimers();

    class FakeResizeObserver {
      constructor(cb: ResizeCallback) {
        resizeCallback = cb;
      }
      public observe(el: Element): void {
        observedElement = el;
      }
      public unobserve(): void { /* unused */ }
      public disconnect(): void {
        disconnected = true;
      }
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
  });

  it('ComputeFittedFrameSize fits the frame inside the usable viewport at its exact aspect ratio (including scaling up when maximized)', () => {
    // 1:1 match in a narrow drawer
    expect(ComputeFittedFrameSize(540, 760, 540, 760)).toEqual({ Width: 540, Height: 760 });
    // Maximized pane (1600 × 900) showing a 1280 × 720 stream frame scales up proportionally to fill 1600 × 900
    expect(ComputeFittedFrameSize(1600, 900, 1280, 720)).toEqual({ Width: 1600, Height: 900 });
    // Wider viewport (1600 × 800) with a 1280 × 800 (16:10) frame fits height (800) and scales width to 1280
    expect(ComputeFittedFrameSize(1600, 800, 1280, 800)).toEqual({ Width: 1280, Height: 800 });
    expect(ComputeFittedFrameSize(0, 800, 1280, 720)).toBeNull();
  });

  it('attaches a ResizeObserver to the usable drawer area below the toolbar, sends its size on the first frame, and debounces divider drags / maximize to the latest size', async () => {
    const f = renderComponentFixture(RemoteBrowserSurfaceComponent, {
      inputs: { Streaming: true, Visible: true },
    });
    const emitted: RemoteBrowserViewportSize[] = [];
    const sub = f.componentInstance.ViewportResize.subscribe((size: RemoteBrowserViewportSize) => emitted.push(size));

    const viewportEl = f.nativeElement.querySelector('.rb-viewport') as HTMLElement;
    expect(observedElement).toBe(viewportEl);
    Object.defineProperty(viewportEl, 'clientWidth', { value: 540, configurable: true });
    Object.defineProperty(viewportEl, 'clientHeight', { value: 760, configurable: true });

    // First frame arrives -> sends initial usable drawer size immediately without waiting for debounce
    const applySnapshot = (
      f.componentInstance as unknown as { applySnapshot(view: RemoteBrowserSnapshotView | null): void }
    ).applySnapshot.bind(f.componentInstance);
    applySnapshot({ ScreenshotBase64: 'QUJD', CurrentUrl: 'https://example.com/form' });
    expect(emitted).toEqual([{ Width: 540, Height: 760 }]);

    // User drags the divider across several intermediate widths, then maximizes to 1440 × 820:
    // updates are debounced and only the latest size is emitted once settled.
    resizeCallback?.([{ contentRect: { width: 580, height: 760 } }]);
    await vi.advanceTimersByTimeAsync(40);
    resizeCallback?.([{ contentRect: { width: 640, height: 760 } }]);
    await vi.advanceTimersByTimeAsync(40);
    resizeCallback?.([{ contentRect: { width: 1440, height: 820 } }]);
    expect(emitted).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(120);
    expect(emitted).toEqual([
      { Width: 540, Height: 760 },
      { Width: 1440, Height: 820 },
    ]);

    // Repeat of identical dimensions is deduplicated
    resizeCallback?.([{ contentRect: { width: 1440, height: 820 } }]);
    await vi.advanceTimersByTimeAsync(150);
    expect(emitted).toHaveLength(2);

    sub.unsubscribe();
    f.destroy();
    expect(disconnected).toBe(true);
  });
});

