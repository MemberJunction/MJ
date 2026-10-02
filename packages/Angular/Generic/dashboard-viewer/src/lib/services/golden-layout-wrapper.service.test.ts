import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoldenLayoutWrapperService } from './golden-layout-wrapper.service';

/**
 * The size GoldenLayoutWrapperService gives Golden Layout. Golden Layout is a double that records
 * each setSize call; the container reports an on-screen size and a layout size, as an element
 * inside a scaled host does (jsdom reports 0 for both).
 */

const { setSizeCalls } = vi.hoisted(() => ({ setSizeCalls: [] as Array<[number, number]> }));

vi.mock('golden-layout', () => {
  class VirtualLayout {
    public resizeWithContainerAutomatically = false;
    public rootItem = null;
    public on(): void {}
    public loadLayout(): void {}
    public saveLayout(): { root: undefined } {
      return { root: undefined };
    }
    public setSize(width: number, height: number): void {
      setSizeCalls.push([width, height]);
    }
    public destroy(): void {}
  }
  return { VirtualLayout, LayoutConfig: { fromResolved: (config: unknown) => config } };
});

/** The container's layout size (offsetWidth / offsetHeight). */
let layoutSize = { width: 750, height: 450 };

/** A layout container in a host shown at 80%: 600 × 360 on screen, laid out at `layoutSize`. */
function scaledContainer(): HTMLElement {
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 360, width: 600, height: 360, toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(container, 'offsetWidth', { configurable: true, get: () => layoutSize.width });
  Object.defineProperty(container, 'offsetHeight', { configurable: true, get: () => layoutSize.height });
  return container;
}

describe('GoldenLayoutWrapperService: the size it gives Golden Layout', () => {
  beforeEach(() => {
    setSizeCalls.length = 0;
    layoutSize = { width: 750, height: 450 };
  });

  it("lays out at the container's layout size, not its on-screen size, in a host shown at 80%", () => {
    const service = new GoldenLayoutWrapperService();

    service.Initialize(scaledContainer(), null, () => undefined);

    expect(setSizeCalls).toEqual([[750, 450]]);
  });

  it('UpdateSize gives Golden Layout the layout size too, and follows it when the container grows', () => {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined);
    setSizeCalls.length = 0;

    service.UpdateSize();
    layoutSize = { width: 900, height: 500 };
    service.UpdateSize();

    expect(setSizeCalls).toEqual([[750, 450], [900, 500]]);
  });

  it('UpdateSize changes nothing while the container has no layout size', () => {
    const service = new GoldenLayoutWrapperService();
    service.Initialize(scaledContainer(), null, () => undefined);
    setSizeCalls.length = 0;

    layoutSize = { width: 0, height: 0 };
    service.UpdateSize();

    expect(setSizeCalls).toEqual([]);
  });
});
