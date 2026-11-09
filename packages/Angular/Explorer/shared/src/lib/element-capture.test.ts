import { describe, it, expect, vi } from 'vitest';
import { CaptureElementJpeg, ComputePixelRatio, StripDataUrlPrefix } from './element-capture';

/** An element with no owner document, so its border widths read as 0. */
function fakeElement(width: number, height: number, nodes: number): HTMLElement {
  return {
    clientWidth: width,
    clientHeight: height,
    getElementsByTagName: () => ({ length: nodes }),
  } as unknown as HTMLElement;
}

/** An element whose computed style gives these property values, for example `{ 'border-left-width': '4px' }`. */
function styledElement(width: number, height: number, style: Record<string, string>): HTMLElement {
  const computed = { getPropertyValue: (name: string) => style[name] ?? '' };
  return {
    clientWidth: width,
    clientHeight: height,
    getElementsByTagName: () => ({ length: 1 }),
    ownerDocument: { defaultView: { getComputedStyle: () => computed } },
  } as unknown as HTMLElement;
}

describe('ComputePixelRatio', () => {
  it('is 1 when the element fits', () => expect(ComputePixelRatio(800, 1280)).toBe(1));
  it('scales a wide element down', () => expect(ComputePixelRatio(2560, 1280)).toBe(0.5));
  it('never returns 0', () => expect(ComputePixelRatio(0, 1280)).toBe(1));
  it('is 1 for a max width that is not a positive number', () => {
    for (const maxWidth of [0, -5, Number.NaN]) expect(ComputePixelRatio(2560, maxWidth)).toBe(1);
  });
});

describe('StripDataUrlPrefix', () => {
  it('removes the prefix', () => expect(StripDataUrlPrefix('data:image/jpeg;base64,AAAA')).toBe('AAAA'));
  it('leaves raw base64 alone', () => expect(StripDataUrlPrefix('AAAA')).toBe('AAAA'));
  it('returns an empty string for an empty data URL', () => expect(StripDataUrlPrefix('data:,')).toBe(''));
});

describe('CaptureElementJpeg', () => {
  it('returns base64 and the scaled size', async () => {
    const capture = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const out = await CaptureElementJpeg(fakeElement(2560, 1000, 10), { maxWidth: 1280 }, capture);
    expect(out).toEqual({ Base64: 'AAAA', MimeType: 'image/jpeg', Width: 1280, Height: 500 });
    expect(capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pixelRatio: 0.5, quality: 0.7 }));
  });
  it('rejects a zero-size element', async () => {
    await expect(CaptureElementJpeg(fakeElement(0, 0, 1), {}, vi.fn())).rejects.toThrow(/no size/);
  });
  it('rejects a tree with too many nodes', async () => {
    await expect(CaptureElementJpeg(fakeElement(100, 100, 50), { maxNodes: 10 }, vi.fn())).rejects.toThrow(/nodes/);
  });
  it('rejects on timeout', async () => {
    const never = vi.fn().mockReturnValue(new Promise<string>(() => {}));
    await expect(CaptureElementJpeg(fakeElement(100, 100, 1), { timeoutMs: 10 }, never)).rejects.toThrow(/timed out/);
  });
  it('does not start a capture for a tree with too many nodes', async () => {
    const capture = vi.fn();
    await expect(CaptureElementJpeg(fakeElement(100, 100, 50), { maxNodes: 10 }, capture)).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
  it('uses the defaults for option values that are not positive numbers', async () => {
    const capture = vi.fn((): Promise<string> => new Promise((resolve) => setTimeout(() => resolve('data:image/jpeg;base64,AAAA'), 20)));
    const out = await CaptureElementJpeg(fakeElement(2560, 1000, 10), { maxWidth: 0, quality: 5, timeoutMs: 0, maxNodes: 0 }, capture);
    expect(out.Width).toBe(1280);
    expect(capture).toHaveBeenCalledWith(expect.anything(), { quality: 0.7, pixelRatio: 0.5 });
  });
  it('turns a failure that is not an Error into an Error with a clear message', async () => {
    // html-to-image rejects with the image's error Event when the browser cannot draw the element.
    const capture = vi.fn().mockRejectedValue(new Event('error'));
    const result = CaptureElementJpeg(fakeElement(100, 100, 1), {}, capture);
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.toThrow(/capture failed: the browser could not draw the element/);
  });
  it('keeps the message of a capture Error', async () => {
    const capture = vi.fn().mockRejectedValue(new Error('the canvas is tainted'));
    await expect(CaptureElementJpeg(fakeElement(100, 100, 1), {}, capture)).rejects.toThrow(/capture failed: the canvas is tainted/);
  });
  it('rejects a capture that returns no image data', async () => {
    const capture = vi.fn().mockResolvedValue('data:,');
    await expect(CaptureElementJpeg(fakeElement(100, 100, 1), {}, capture)).rejects.toThrow(/no image data/);
  });
  it('rounds the size down, as the canvas does, when the scale is not a whole number', async () => {
    const capture = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const out = await CaptureElementJpeg(fakeElement(1500, 1003, 10), { maxWidth: 1280 }, capture);
    expect(out).toMatchObject({ Width: 1280, Height: 855 });
    expect(capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pixelRatio: 1280 / 1500 }));
  });
  it('counts the borders in the size and in the scale, as html-to-image does', async () => {
    const capture = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const style = { 'border-left-width': '4px', 'border-right-width': '6px', 'border-top-width': '4px', 'border-bottom-width': '6px' };
    const out = await CaptureElementJpeg(styledElement(2550, 990, style), { maxWidth: 1280 }, capture);
    expect(out).toMatchObject({ Width: 1280, Height: 500 });
    expect(capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pixelRatio: 0.5 }));
  });
  it('keeps a bordered element at its size when it fits', async () => {
    const capture = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const style = { 'border-left-width': '1px', 'border-right-width': '1px', 'border-top-width': '1px', 'border-bottom-width': '1px' };
    const out = await CaptureElementJpeg(styledElement(1278, 718, style), { maxWidth: 1280 }, capture);
    expect(out).toMatchObject({ Width: 1280, Height: 720 });
    expect(capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pixelRatio: 1 }));
  });
  it('counts a border width that is missing or not a number as 0', async () => {
    const capture = vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA');
    const style = { 'border-left-width': 'medium', 'border-right-width': '', 'border-top-width': '2.5px' };
    const out = await CaptureElementJpeg(styledElement(1000, 500, style), {}, capture);
    expect(out).toMatchObject({ Width: 1000, Height: 502 });
  });
});
