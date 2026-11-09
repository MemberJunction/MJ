import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelFrameCapture } from '@memberjunction/ng-realtime-channels/dist/lib/channel-frame-capture';
import { FrameCaptureHook, ResetFrameCaptureHookWarning, type FrameCaptureEnabler } from '../lib/session/frame-capture-hook';

/** An enabler that registers a fake capturer, the way the real rasterizer chunk does. */
function registering(): { enabler: FrameCaptureEnabler; calls: () => number; removed: () => number } {
  let calls = 0;
  let removed = 0;
  return {
    enabler: async () => {
      calls++;
      ChannelFrameCapture.Instance.Register(async () => 'AAAA');
      return () => {
        removed++;
        ChannelFrameCapture.Instance.Register(null);
      };
    },
    calls: () => calls,
    removed: () => removed
  };
}

describe('frame-capture hook (loads the Phase 3 rasterizer lazily)', () => {
  beforeEach(() => {
    ResetFrameCaptureHookWarning();
    ChannelFrameCapture.Instance.Register(null);
  });
  afterEach(() => {
    ChannelFrameCapture.Instance.Register(null);
    vi.restoreAllMocks();
  });

  it('off loads nothing, registers nothing and says nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = registering();
    const hook = new FrameCaptureHook(fake.enabler);
    hook.Apply(false);
    expect(await hook.Ready()).toBe(false);
    expect(fake.calls()).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('on loads the rasterizer, registers it, and Ready() waits for that (so the mint cannot race it)', async () => {
    const fake = registering();
    const hook = new FrameCaptureHook(fake.enabler);
    hook.Apply(true);
    expect(await hook.Ready()).toBe(true);
    expect(ChannelFrameCapture.Instance.Capturer).not.toBeNull();
    hook.Apply(true); // idempotent
    expect(fake.calls()).toBe(1);
  });

  it('turning it off, or disposing, removes what it registered — and only that', async () => {
    const fake = registering();
    const hook = new FrameCaptureHook(fake.enabler);
    hook.Apply(true);
    await hook.Ready();
    hook.Apply(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.removed()).toBe(1);
    expect(ChannelFrameCapture.Instance.Capturer).toBeNull();
    hook.Apply(true);
    await hook.Ready();
    hook.Dispose();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.removed()).toBe(2);
  });

  it('turned off again while the chunk is still loading: it is removed the moment it arrives', async () => {
    let release: () => void = () => undefined;
    const removed = vi.fn();
    const hook = new FrameCaptureHook(
      () =>
        new Promise((resolve) => {
          release = () => resolve(removed);
        })
    );
    hook.Apply(true);
    hook.Apply(false);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('respects a capturer the host registered itself: nothing is loaded, nothing is replaced', async () => {
    const hostCapturer = async () => 'HOST';
    ChannelFrameCapture.Instance.Register(hostCapturer);
    const fake = registering();
    const hook = new FrameCaptureHook(fake.enabler);
    hook.Apply(true);
    expect(await hook.Ready()).toBe(true);
    expect(fake.calls()).toBe(0);
    expect(ChannelFrameCapture.Instance.Capturer).toBe(hostCapturer);
  });

  it('when the rasterizer cannot be loaded it says so ONCE, never throws, and the call carries on state-only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hook = new FrameCaptureHook(async () => {
      throw new Error('chunk 404');
    });
    hook.Apply(true);
    expect(await hook.Ready()).toBe(false);
    hook.Apply(false);
    hook.Apply(true);
    expect(await hook.Ready()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('chunk 404');
  });
});
