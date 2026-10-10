import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RemoteBrowserSurfaceComponent, type RemoteBrowserSnapshotView } from './remote-browser-surface.component';

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
