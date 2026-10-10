import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MediaSharePanel } from './components/media-controls.component';
import { SharePanelRegistry } from './share-panel-registry';

/** Makes the browser look as desktop Chrome does to the registry: `getDisplayMedia`, plus Element and/or Region Capture. */
function stubSupport(apis: { Display?: boolean; Element?: boolean; Region?: boolean } = { Display: true, Region: true }): void {
  if (apis.Display) {
    const getDisplayMedia = async (): Promise<MediaStream> => {
      throw new Error('No picker in these tests.');
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
  }
  const target = { fromElement: async () => ({}) };
  if (apis.Element) {
    vi.stubGlobal('RestrictionTarget', target);
  }
  if (apis.Region) {
    vi.stubGlobal('CropTarget', target);
  }
}

/** An `IntersectionObserver` whose reports the test makes. */
class FakeIntersectionObserver {
  public static Last: FakeIntersectionObserver | null = null;
  public readonly Observed = new Set<Element>();
  public Disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.Last = this;
  }
  public observe(element: Element): void {
    this.Observed.add(element);
  }
  public unobserve(element: Element): void {
    this.Observed.delete(element);
  }
  public disconnect(): void {
    this.Disconnected = true;
    this.Observed.clear();
  }
  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Reports the element on screen (a 200×100 overlap), touching the viewport's edge (no area) or off screen. */
  public Report(element: Element, where: 'on' | 'edge' | 'off'): void {
    const size = where === 'on' ? { width: 200, height: 100 } : { width: 0, height: 0 };
    const entry = { target: element, isIntersecting: where !== 'off', intersectionRect: size } as unknown as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

/** DOM spec for the share-panel registry: what a Share menu offers under "This panel", and when. */
describe('SharePanelRegistry (DOM)', () => {
  let page: HTMLElement;

  beforeEach(() => {
    page = document.createElement('div');
    document.body.appendChild(page);
    // The DOM test setup installs an IntersectionObserver that never reports; most tests here run without one.
    vi.stubGlobal('IntersectionObserver', undefined);
  });

  afterEach(() => {
    page.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
    FakeIntersectionObserver.Last = null;
  });

  /** A new element at the end of `parent`. */
  const element = (parent: Element = page): HTMLElement => parent.appendChild(document.createElement('section'));

  /** Every list the registry offers a menu inside `host`, from now on. */
  const offers = (registry: SharePanelRegistry, host: Element): Array<readonly MediaSharePanel[]> => {
    const lists: Array<readonly MediaSharePanel[]> = [];
    registry.PanelsFor$(host).subscribe((panels) => lists.push(panels));
    return lists;
  };

  /** Lets the registry's queued changes reach its streams. */
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('is supported with getDisplayMedia and Element or Region Capture, and only then', () => {
    expect(new SharePanelRegistry().Supported).toBe(false);
    stubSupport({ Display: true });
    expect(new SharePanelRegistry().Supported).toBe(false);
    stubSupport({ Display: true, Region: true });
    expect(new SharePanelRegistry().Supported).toBe(true);
    vi.stubGlobal('CropTarget', undefined);
    stubSupport({ Display: true, Element: true });
    expect(new SharePanelRegistry().Supported).toBe(true);
    Reflect.deleteProperty(navigator, 'mediaDevices');
    expect(new SharePanelRegistry().Supported).toBe(false);
  });

  it('offers nothing where the browser cannot share a single panel, though it keeps what was registered', () => {
    const registry = new SharePanelRegistry();
    const board = element();
    const { Key } = registry.Register(board, 'Whiteboard');
    expect(offers(registry, element())).toEqual([[]]);
    expect(registry.Get(Key)).toEqual({ Key, Label: 'Whiteboard', Icon: null, Element: board });
  });

  it('offers every panel in page order, by its label and icon, when the browser cannot tell what is on screen', () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const main = element();
    const board = element();
    const later = registry.Register(board, 'Whiteboard', 'fa-solid fa-chalkboard');
    const earlier = registry.Register(main, 'Main content');
    expect(offers(registry, element())).toEqual([
      [
        { Key: earlier.Key, Label: 'Main content' },
        { Key: later.Key, Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' },
      ],
    ]);
  });

  it("leaves out a panel that holds the menu's host, and keeps one inside it", () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const main = element();
    const call = element(main);
    const board = element(call);
    registry.Register(main, 'Main content');
    const inside = registry.Register(board, 'Whiteboard');
    expect(offers(registry, call)).toEqual([[{ Key: inside.Key, Label: 'Whiteboard' }]]);
  });

  it('gives every registration its own key, so two panels may have the same label', () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const first = registry.Register(element(), 'Whiteboard');
    const second = registry.Register(element(), 'Whiteboard');
    expect(first.Key).not.toBe(second.Key);
    expect(offers(registry, element())[0].map((panel) => panel.Key)).toEqual([first.Key, second.Key]);
  });

  it('renames a panel or changes its icon, and offers a list again only when it changes', async () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const panel = registry.Register(element(), 'Whiteboard');
    const lists = offers(registry, element());
    for (const [label, icon] of [['Whiteboard', null], ['Board', null], ['Board', 'fa-solid fa-chalkboard']] as const) {
      panel.Update(label, icon);
      await settle();
    }
    expect(registry.Get(panel.Key)?.Label).toBe('Board');
    expect(lists).toEqual([
      [{ Key: panel.Key, Label: 'Whiteboard' }],
      [{ Key: panel.Key, Label: 'Board' }],
      [{ Key: panel.Key, Label: 'Board', Icon: 'fa-solid fa-chalkboard' }],
    ]);
  });

  it('offers a new list when one panel takes the place of another with the same name', async () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const first = registry.Register(element(), 'Whiteboard');
    const lists = offers(registry, element());
    first.Unregister();
    const second = registry.Register(element(), 'Whiteboard');
    await settle();
    expect(lists).toEqual([[{ Key: first.Key, Label: 'Whiteboard' }], [{ Key: second.Key, Label: 'Whiteboard' }]]);
  });

  it('takes a panel off at once, and reports it to the streams once, after the work under way', async () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const panel = registry.Register(element(), 'Whiteboard');
    const removed: string[] = [];
    registry.Removed$.subscribe((key) => removed.push(key));
    const lists = offers(registry, element());

    panel.Unregister();
    panel.Unregister();
    panel.Update('Board', null);
    expect(registry.Get(panel.Key)).toBeNull();
    expect([removed, lists.length]).toEqual([[], 1]);
    await settle();
    expect(removed).toEqual([panel.Key]);
    expect(lists).toEqual([[{ Key: panel.Key, Label: 'Whiteboard' }], []]);
  });

  it('offers one list for the panels registered in one go', async () => {
    stubSupport();
    const registry = new SharePanelRegistry();
    const lists = offers(registry, element());
    const first = registry.Register(element(), 'Main content');
    const second = registry.Register(element(), 'Whiteboard');
    await settle();
    expect(lists).toEqual([
      [],
      [
        { Key: first.Key, Label: 'Main content' },
        { Key: second.Key, Label: 'Whiteboard' },
      ],
    ]);
  });

  describe('with an IntersectionObserver', () => {
    beforeEach(() => {
      stubSupport();
      vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    });

    it('offers a panel only while it overlaps the viewport with some area', async () => {
      const registry = new SharePanelRegistry();
      const board = element();
      const panel = registry.Register(board, 'Whiteboard');
      const observer = FakeIntersectionObserver.Last;
      const lists = offers(registry, element());
      expect(observer?.Observed.has(board)).toBe(true);

      for (const where of ['on', 'edge', 'on', 'off'] as const) {
        observer?.Report(board, where);
        await settle();
      }
      expect(lists).toEqual([[], [{ Key: panel.Key, Label: 'Whiteboard' }], [], [{ Key: panel.Key, Label: 'Whiteboard' }], []]);
    });

    it('watches all panels with one observer, stops watching an element no panel uses, and disconnects with the app', () => {
      const registry = new SharePanelRegistry();
      const board = element();
      const first = registry.Register(board, 'Whiteboard');
      const second = registry.Register(board, 'Board');
      const observer = FakeIntersectionObserver.Last;
      registry.Register(element(), 'Main content');
      expect(FakeIntersectionObserver.Last).toBe(observer);

      first.Unregister();
      expect(observer?.Observed.has(board)).toBe(true);
      second.Unregister();
      expect(observer?.Observed.has(board)).toBe(false);
      registry.ngOnDestroy();
      expect(observer?.Disconnected).toBe(true);
    });

    it('watches nothing where the browser cannot share a single panel', () => {
      Reflect.deleteProperty(navigator, 'mediaDevices');
      const registry = new SharePanelRegistry();
      registry.Register(element(), 'Whiteboard');
      expect(FakeIntersectionObserver.Last).toBeNull();
    });
  });
});
