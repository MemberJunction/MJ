import { describe, it, expect, vi, afterEach } from 'vitest';
import { CreateDomFrameCapturer, EnableChannelFrameCapture, type DomRasterizer } from './dom-frame-capture';
import { ChannelFrameCapture } from './channel-frame-capture';

/** A real DOM element with a layout size (jsdom does no layout, so the sizes are declared) and `descendants` children. */
function makeElement(width = 800, height = 600, descendants = 3): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  for (let i = 0; i < descendants; i++) {
    element.appendChild(document.createElement('span'));
  }
  document.body.appendChild(element);
  return element;
}

const JPEG = (payload: string): string => `data:image/jpeg;base64,${payload}`;

describe('CreateDomFrameCapturer (DOM, fake rasterizer)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    ChannelFrameCapture.Instance.Register(null);
    vi.restoreAllMocks();
  });

  it('rasterizes the element and returns the JPEG without the data-URL prefix', async () => {
    const rasterize = vi.fn<DomRasterizer>(async () => JPEG('QUJD'));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize });
    expect(await capture(makeElement())).toBe('QUJD');
    expect(rasterize).toHaveBeenCalledTimes(1);
  });

  it('scales a large element so its longest edge is at most MaxEdgePx, and never scales a small one up', async () => {
    const seen: number[] = [];
    const rasterize: DomRasterizer = async (_el, options) => {
      seen.push(options.pixelRatio);
      return JPEG('x');
    };
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize, MaxEdgePx: 500 });
    await capture(makeElement(2000, 1000));
    await capture(makeElement(300, 200));
    expect(seen).toEqual([0.25, 1]);
  });

  it('passes quality, skips fonts, and paints the nearest ancestor background behind transparent areas', async () => {
    const parent = document.createElement('section');
    parent.style.backgroundColor = 'rgb(10, 20, 30)';
    document.body.appendChild(parent);
    const element = makeElement();
    parent.appendChild(element);
    let received: Parameters<DomRasterizer>[1] | undefined;
    const capture = CreateDomFrameCapturer({ Quality: 0.4, Rasterize: async (_el, options) => ((received = options), JPEG('x')) });
    await capture(element);
    expect(received).toMatchObject({ quality: 0.4, skipFonts: true, backgroundColor: 'rgb(10, 20, 30)' });
  });

  it('returns null, without calling the rasterizer, for an element with no size (a hidden pane)', async () => {
    const rasterize = vi.fn<DomRasterizer>(async () => JPEG('x'));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize });
    expect(await capture(makeElement(0, 0))).toBeNull();
    expect(await capture(makeElement(800, 0))).toBeNull();
    expect(rasterize).not.toHaveBeenCalled();
  });

  it('refuses a subtree too large to clone without freezing the page', async () => {
    const rasterize = vi.fn<DomRasterizer>(async () => JPEG('x'));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize, MaxNodes: 5 });
    expect(await capture(makeElement(800, 600, 6))).toBeNull();
    expect(await capture(makeElement(800, 600, 5))).toBe('x');
    expect(rasterize).toHaveBeenCalledTimes(1);
  });

  it('takes one capture at a time: a request while one is in flight yields no frame instead of piling up', async () => {
    let release: (value: string) => void = () => undefined;
    const rasterize = vi.fn<DomRasterizer>(() => new Promise<string>((resolve) => (release = resolve)));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize });
    const element = makeElement();
    const first = capture(element);
    expect(await capture(element)).toBeNull();
    release(JPEG('FIRST'));
    expect(await first).toBe('FIRST');
    expect(rasterize).toHaveBeenCalledTimes(1);
    release = () => undefined;
    rasterize.mockResolvedValueOnce(JPEG('SECOND'));
    expect(await capture(element)).toBe('SECOND'); // free again
  });

  it('a security failure (cross-origin image, tainted canvas) degrades to state-only for the rest of the session with ONE logged reason', async () => {
    const reported: string[] = [];
    const rasterize = vi.fn<DomRasterizer>(async () => {
      const error = new Error("Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported.");
      error.name = 'SecurityError';
      throw error;
    });
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize, OnDegraded: (reason) => reported.push(reason) });
    const element = makeElement();
    expect(await capture(element)).toBeNull();
    expect(await capture(element)).toBeNull();
    expect(await capture(element)).toBeNull();
    expect(rasterize).toHaveBeenCalledTimes(1); // not retried: it cannot succeed
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('state only');
    expect(reported[0]).toContain('cross-origin');
  });

  it('a timeout costs a frame; repeated timeouts disable capture, reported once', async () => {
    const reported: string[] = [];
    const rasterize = vi.fn<DomRasterizer>(() => new Promise<string>(() => undefined));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize, TimeoutMs: 10, MaxConsecutiveFailures: 2, OnDegraded: (reason) => reported.push(reason) });
    const element = makeElement();
    expect(await capture(element)).toBeNull();
    expect(reported).toEqual([]);
    expect(await capture(element)).toBeNull();
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('longer than 10 ms');
    expect(await capture(element)).toBeNull();
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it('a success resets the failure count, so isolated hiccups never disable capture', async () => {
    const reported: string[] = [];
    const rasterize = vi
      .fn<DomRasterizer>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(JPEG('OK'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(JPEG('OK2'));
    const capture = CreateDomFrameCapturer({ Rasterize: rasterize, MaxConsecutiveFailures: 2, OnDegraded: (reason) => reported.push(reason) });
    const element = makeElement();
    expect(await capture(element)).toBeNull();
    expect(await capture(element)).toBe('OK');
    expect(await capture(element)).toBeNull();
    expect(await capture(element)).toBe('OK2');
    expect(reported).toEqual([]);
  });

  it('a rasterizer that returns something that is not a JPEG data URL yields no frame', async () => {
    const capture = CreateDomFrameCapturer({ Rasterize: async () => 'data:image/png;base64,AAA' });
    expect(await capture(makeElement())).toBeNull();
  });

  it('never throws, whatever the rasterizer does', async () => {
    const capture = CreateDomFrameCapturer({
      Rasterize: () => {
        throw new Error('synchronous');
      },
      OnDegraded: () => undefined,
    });
    await expect(capture(makeElement())).resolves.toBeNull();
  });

  it('with the real library in a DOM that cannot rasterize it degrades quietly: no frame, no throw, one reason', async () => {
    // jsdom prints "not implemented" for the pseudo-element styles the library asks for; ask it the supported question only.
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => computed(element));
    const reported: string[] = [];
    const capture = CreateDomFrameCapturer({ TimeoutMs: 100, MaxConsecutiveFailures: 1, OnDegraded: (reason) => reported.push(reason) });
    const element = makeElement();
    await expect(capture(element)).resolves.toBeNull();
    await expect(capture(element)).resolves.toBeNull();
    expect(reported).toHaveLength(1);
  });
});

describe('EnableChannelFrameCapture', () => {
  afterEach(() => ChannelFrameCapture.Instance.Register(null));

  it('is opt-in: nothing is registered until a host asks', () => {
    expect(ChannelFrameCapture.Instance.Capturer).toBeNull();
  });

  it('registers the default rasterizer with the channel, and the returned function removes it', () => {
    const disable = EnableChannelFrameCapture();
    expect(ChannelFrameCapture.Instance.Capturer).not.toBeNull();
    disable();
    expect(ChannelFrameCapture.Instance.Capturer).toBeNull();
  });

  it('passes its options through (a host or an embeddable element can tune it)', async () => {
    const rasterize = vi.fn<DomRasterizer>(async () => JPEG('Z'));
    EnableChannelFrameCapture({ Rasterize: rasterize });
    const capturer = ChannelFrameCapture.Instance.Capturer;
    expect(await capturer?.(makeElement())).toBe('Z');
  });
});
