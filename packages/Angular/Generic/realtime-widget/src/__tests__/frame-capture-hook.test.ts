import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractiveComponentFrameCapture } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-frame-capture';
import { ApplyFrameCapturePreference, ResetFrameCaptureHookWarning } from '../lib/session/frame-capture-hook';

describe('frame-capture hook (the Phase 2 seam)', () => {
  beforeEach(() => {
    ResetFrameCaptureHookWarning();
    InteractiveComponentFrameCapture.Instance.Register(null);
  });
  afterEach(() => {
    InteractiveComponentFrameCapture.Instance.Register(null);
    vi.restoreAllMocks();
  });

  it('off does nothing and says nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(ApplyFrameCapturePreference(false)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('on with no rasterizer registered yet says so, once, and reports that pixels are not available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(ApplyFrameCapturePreference(true)).toBe(false);
    expect(ApplyFrameCapturePreference(true)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('no component rasterizer');
  });

  it('on with a rasterizer registered (what Phase 2 will do) is honoured quietly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    InteractiveComponentFrameCapture.Instance.Register(async () => 'AAAA');
    expect(ApplyFrameCapturePreference(true)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
