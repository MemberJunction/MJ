import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import {
  MediaStageComponent,
  MediaStagePipActionsDirective,
  MediaStageSurfaceDirective,
  type MediaStagePipRectChange,
  type MediaStageSurface,
} from './media-stage.component';
import type { MediaPipRect } from '@memberjunction/ai-realtime-client/media';

/**
 * A surface's content: records each creation and destruction, so a test can tell a move from a re-creation, and the
 * visibility its template is given.
 */
@Component({
  selector: 'mj-test-surface',
  standalone: true,
  template: '<span class="surface-content">{{ Key }}</span>',
})
class TestSurfaceComponent implements OnInit, OnDestroy {
  public static Created: string[] = [];
  public static Destroyed: string[] = [];
  /** The latest visibility and placement each surface was given, by key. */
  public static Visibility = new Map<string, boolean>();
  public static Placements = new Map<string, string>();
  @Input() public Key = '';
  @Input()
  public set Visible(value: boolean) {
    TestSurfaceComponent.Visibility.set(this.Key, value);
  }
  @Input()
  public set Placement(value: string) {
    TestSurfaceComponent.Placements.set(this.Key, value);
  }
  public ngOnInit(): void {
    TestSurfaceComponent.Created.push(this.Key);
  }
  public ngOnDestroy(): void {
    TestSurfaceComponent.Destroyed.push(this.Key);
  }
}

@Component({
  standalone: true,
  imports: [MediaStageComponent, MediaStageSurfaceDirective, MediaStagePipActionsDirective, TestSurfaceComponent],
  template: `
    <mj-media-stage [Surfaces]="Surfaces" [TabSlot]="Slot" [StageSlot]="StageSlot" [ActiveTabKey]="ActiveTabKey" [PipRects]="PipRects" (PipRectChange)="Changes.push($event)">
      <ng-template mjMediaStageSurface let-key let-visible="Visible" let-placement="Placement">
        <mj-test-surface [Key]="key" [Visible]="visible" [Placement]="placement"></mj-test-surface>
      </ng-template>
      <ng-template mjMediaStagePipActions let-key>
        <button type="button" class="pip-action">{{ key }} actions</button>
      </ng-template>
    </mj-media-stage>
  `,
})
class StageHostComponent {
  @Input() public Surfaces: MediaStageSurface[] = [];
  @Input() public ActiveTabKey: string | null = null;
  @Input() public Slot: HTMLElement | null = null;
  @Input() public StageSlot: HTMLElement | null = null;
  @Input() public PipRects: ReadonlyMap<string, MediaPipRect> = new Map();
  public readonly Changes: MediaStagePipRectChange[] = [];
}

/** An element whose box the test sets and moves: jsdom lays nothing out. */
function slotAt(left: number, top: number, width: number, height: number) {
  let box = { left, top, width, height };
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box });
  return Object.assign(element, {
    Move: (l: number, t: number, w: number, h: number): void => {
      box = { left: l, top: t, width: w, height: h };
    },
  });
}

/** The stage's own box: jsdom lays nothing out, so a stage with no box would count as off screen. */
let stageBox = { left: 0, top: 0, width: 1000, height: 800 };

/** ResizeObserver callbacks the stage registered, so a test can report a size change. */
let resizeCallbacks: ResizeObserverCallback[] = [];

class FakeResizeObserver {
  public constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}

describe('MediaStageComponent (DOM)', () => {
  let queued: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    TestSurfaceComponent.Created = [];
    TestSurfaceComponent.Destroyed = [];
    TestSurfaceComponent.Visibility = new Map();
    TestSurfaceComponent.Placements = new Map();
    stageBox = { left: 0, top: 0, width: 1000, height: 800 };
    resizeCallbacks = [];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const b = this.tagName === 'MJ-MEDIA-STAGE' ? stageBox : { left: 0, top: 0, width: 0, height: 0 };
      return new DOMRect(b.left, b.top, b.width, b.height);
    });
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    queued = new Map();
    nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queued.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Reports a size change to the stage, as the browser does when an ancestor is hidden or shown. */
  const resized = (): void => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver));

  /** Runs every queued animation frame once. */
  const step = (): void => {
    const callbacks = [...queued.values()];
    queued.clear();
    callbacks.forEach((callback) => callback(0));
  };

  const render = async (inputs: Partial<StageHostComponent>) => {
    const f = renderComponentFixture(StageHostComponent, { inputs: { ...inputs } });
    await Promise.resolve();
    f.detectChanges();
    return f;
  };

  const set = (f: Awaited<ReturnType<typeof render>>, inputs: Partial<StageHostComponent>): void => {
    for (const [name, value] of Object.entries(inputs)) {
      f.componentRef.setInput(name, value);
    }
    f.detectChanges();
  };

  const box = (f: Awaited<ReturnType<typeof render>>, key: string): HTMLElement => query(f, `[data-surface="${key}"]`) as HTMLElement;
  const isHidden = (f: Awaited<ReturnType<typeof render>>, key: string): boolean => box(f, key).classList.contains('stage-surface--hidden');

  it('creates each surface once, with its key', async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }, { Key: 'browser', Placement: 'hidden' }] });
    expect(TestSurfaceComponent.Created).toEqual(['whiteboard', 'browser']);
    expect(box(f, 'whiteboard').textContent).toContain('whiteboard');
  });

  it("covers the slot with the active tab's surface and keeps other tab surfaces out of sight", async () => {
    const f = await render({
      Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }, { Key: 'browser', Placement: 'tab' }],
      ActiveTabKey: 'whiteboard',
      Slot: slotAt(500, 40, 300, 400),
    });
    const whiteboard = box(f, 'whiteboard');
    expect(isHidden(f, 'whiteboard')).toBe(false);
    expect([whiteboard.style.left, whiteboard.style.top, whiteboard.style.width, whiteboard.style.height]).toEqual(['500px', '40px', '300px', '400px']);
    expect(isHidden(f, 'browser')).toBe(true);
  });

  it('fills the stage with a stage surface', async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'stage' }], Slot: slotAt(500, 40, 300, 400) });
    expect(box(f, 'whiteboard').classList.contains('stage-surface--stage')).toBe(true);
    expect(isHidden(f, 'whiteboard')).toBe(false);
    expect(box(f, 'whiteboard').style.left).toBe('');
  });

  describe("the host's stage slot", () => {
    const place = (element: HTMLElement) => [element.style.left, element.style.top, element.style.width, element.style.height];

    it('covers the stage slot with a stage surface instead of filling the stage', async () => {
      const f = await render({ Surfaces: [{ Key: 'avatar', Placement: 'stage' }], StageSlot: slotAt(40, 60, 300, 400) });
      const avatar = box(f, 'avatar');
      expect(place(avatar)).toEqual(['40px', '60px', '300px', '400px']);
      expect(avatar.classList.contains('stage-surface--stage')).toBe(true);
      expect(avatar.classList.contains('stage-surface--in-slot')).toBe(true);
      expect(isHidden(f, 'avatar')).toBe(false);
    });

    it('leaves picture-in-picture and tab surfaces where they are', async () => {
      const f = await render({
        Surfaces: [
          { Key: 'avatar', Placement: 'stage' },
          { Key: 'board', Placement: 'tab' },
          { Key: 'camera', Placement: 'pip', PipIndex: 0 },
        ],
        ActiveTabKey: 'board',
        Slot: slotAt(500, 40, 300, 400),
        StageSlot: slotAt(40, 60, 300, 400),
      });
      expect(place(box(f, 'board'))).toEqual(['500px', '40px', '300px', '400px']);
      expect(box(f, 'camera').classList.contains('stage-surface--in-slot')).toBe(false);
      expect(isHidden(f, 'camera')).toBe(false);
    });

    it('keeps a stage surface out of sight while its slot has no size, and fills the stage again without a slot', async () => {
      const f = await render({ Surfaces: [{ Key: 'avatar', Placement: 'stage' }], StageSlot: slotAt(0, 0, 0, 0) });
      expect(isHidden(f, 'avatar')).toBe(true);
      set(f, { StageSlot: null });
      expect(isHidden(f, 'avatar')).toBe(false);
      expect(box(f, 'avatar').classList.contains('stage-surface--in-slot')).toBe(false);
      expect(box(f, 'avatar').style.left).toBe('');
      expect(TestSurfaceComponent.Created).toEqual(['avatar']);
    });

    it('measures the stage slot again once the pass is over, as when its size comes from its own bindings', async () => {
      const slot = slotAt(0, 0, 0, 0);
      const f = await render({ Surfaces: [{ Key: 'avatar', Placement: 'stage' }] });
      set(f, { StageSlot: slot });
      slot.Move(40, 60, 300, 400);
      await Promise.resolve();
      f.detectChanges();
      expect(place(box(f, 'avatar'))).toEqual(['40px', '60px', '300px', '400px']);
      expect(isHidden(f, 'avatar')).toBe(false);
    });

    it('follows the stage slot as it moves', async () => {
      const slot = slotAt(40, 60, 300, 400);
      const f = await render({ Surfaces: [{ Key: 'avatar', Placement: 'stage' }], StageSlot: slot });
      slot.Move(20, 80, 200, 260);
      step();
      f.detectChanges();
      expect(place(box(f, 'avatar'))).toEqual(['20px', '80px', '200px', '260px']);
    });
  });

  it("keeps a surface's content as its placement changes, and tells it each placement", async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard', Slot: slotAt(500, 40, 300, 400) });
    expect(TestSurfaceComponent.Placements.get('whiteboard')).toBe('tab');
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'stage' }] });
    expect(TestSurfaceComponent.Placements.get('whiteboard')).toBe('stage');
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'pip' }] });
    expect(TestSurfaceComponent.Placements.get('whiteboard')).toBe('pip');
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'hidden' }] });
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }] });
    expect(TestSurfaceComponent.Created).toEqual(['whiteboard']);
    expect(TestSurfaceComponent.Destroyed).toEqual([]);
    expect(isHidden(f, 'whiteboard')).toBe(false);
  });

  it('drops a surface when it leaves the list', async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }, { Key: 'browser', Placement: 'tab' }] });
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }] });
    expect(TestSurfaceComponent.Destroyed).toEqual(['browser']);
  });

  it('keeps tab surfaces out of sight with no slot, or a slot with no size', async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard' });
    expect(isHidden(f, 'whiteboard')).toBe(true);
    set(f, { Slot: slotAt(0, 0, 0, 0) });
    expect(isHidden(f, 'whiteboard')).toBe(true);
    expect(TestSurfaceComponent.Destroyed).toEqual([]);
  });

  it('shows the active tab surface over a slot that arrives after the stage is up', async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard' });
    set(f, { Slot: slotAt(500, 40, 300, 400) });
    expect(isHidden(f, 'whiteboard')).toBe(false);
    expect(box(f, 'whiteboard').style.left).toBe('500px');
  });

  it('follows the slot as it moves after a change, as when the panel slides in', async () => {
    const slot = slotAt(548, 40, 300, 400);
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard', Slot: slot });
    expect(box(f, 'whiteboard').style.left).toBe('548px');
    slot.Move(500, 40, 300, 400);
    step();
    f.detectChanges();
    expect(box(f, 'whiteboard').style.left).toBe('500px');
  });

  it('follows the slot without entering Angular until its box changes', async () => {
    const slot = slotAt(548, 40, 300, 400);
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard', Slot: slot });
    const run = vi.spyOn(TestBed.inject(NgZone), 'run');
    step();
    step();
    expect(run).not.toHaveBeenCalled();
    slot.Move(500, 40, 300, 400);
    step();
    expect(run).toHaveBeenCalledTimes(1);
    f.detectChanges();
    expect(box(f, 'whiteboard').style.left).toBe('500px');
  });

  it('tells each surface whether it is on screen', async () => {
    const f = await render({
      Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }, { Key: 'browser', Placement: 'tab' }],
      ActiveTabKey: 'whiteboard',
      Slot: slotAt(500, 40, 300, 400),
    });
    expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ whiteboard: true, browser: false });
    set(f, { ActiveTabKey: 'browser' });
    expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ whiteboard: false, browser: true });
  });

  it('puts every surface out of sight while the stage itself has no size, and back when it has one again', async () => {
    const f = await render({
      Surfaces: [{ Key: 'whiteboard', Placement: 'stage' }, { Key: 'browser', Placement: 'tab' }],
      ActiveTabKey: 'browser',
      Slot: slotAt(500, 40, 300, 400),
    });
    expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ whiteboard: true, browser: true });
    stageBox = { left: 0, top: 0, width: 0, height: 0 };
    resized();
    f.detectChanges();
    expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ whiteboard: false, browser: false });
    expect(isHidden(f, 'whiteboard')).toBe(true);
    stageBox = { left: 0, top: 0, width: 1000, height: 800 };
    resized();
    f.detectChanges();
    expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ whiteboard: true, browser: true });
    expect(TestSurfaceComponent.Created).toEqual(['whiteboard', 'browser']);
  });

  describe('picture-in-picture', () => {
    const bar = (f: Awaited<ReturnType<typeof render>>, key: string) => box(f, key).querySelector('.stage-pip-bar') as HTMLElement;
    const place = (element: HTMLElement) => [element.style.left, element.style.top, element.style.width, element.style.height];
    const pointer = (target: Element, type: string, x: number, y: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    const key = (target: Element, name: string, shiftKey = false) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
    const pips = (): MediaStageSurface[] => [
      { Key: 'a', Placement: 'pip', Label: 'Alpha', PipIndex: 0 },
      { Key: 'b', Placement: 'pip', PipIndex: 1 },
    ];

    it('stacks boxes upward from the bottom-right corner, newest in the corner, each on screen with its bar', async () => {
      const f = await render({ Surfaces: pips() });
      expect(place(box(f, 'a'))).toEqual(['664px', '584px', '320px', '200px']);
      expect(place(box(f, 'b'))).toEqual(['664px', '376px', '320px', '200px']);
      expect(bar(f, 'a').querySelector('.stage-pip-title')?.textContent?.trim()).toBe('Alpha');
      expect(bar(f, 'b').querySelector('.stage-pip-title')?.textContent?.trim()).toBe('b');
      expect(bar(f, 'a').querySelector('.pip-action')?.textContent?.trim()).toBe('a actions');
      expect(Object.fromEntries(TestSurfaceComponent.Visibility)).toEqual({ a: true, b: true });
    });

    it('puts a box where the user put it, as fractions of the stage', async () => {
      const f = await render({ Surfaces: pips(), PipRects: new Map([['a', { X: 0.1, Y: 0.1, W: 0.3, H: 0.25 }]]) });
      expect(place(box(f, 'a'))).toEqual(['100px', '80px', '300px', '200px']);
    });

    it('drags a box by its bar, keeping it inside the stage, and reports where it ended', async () => {
      const f = await render({ Surfaces: pips() });
      pointer(bar(f, 'a'), 'pointerdown', 700, 600);
      pointer(bar(f, 'a'), 'pointermove', 600, 550);
      expect(place(box(f, 'a'))).toEqual(['564px', '534px', '320px', '200px']);
      pointer(bar(f, 'a'), 'pointerup', 600, 550);
      f.detectChanges();
      expect(f.componentInstance.Changes).toEqual([{ Key: 'a', Rect: { X: 0.564, Y: 0.6675, W: 0.32, H: 0.25 } }]);
      expect(place(box(f, 'a'))).toEqual(['564px', '534px', '320px', '200px']);
      expect(box(f, 'a').classList.contains('stage-surface--top')).toBe(true);
    });

    it('resizes a box from its corner, up to the stage edge', async () => {
      const f = await render({ Surfaces: pips() });
      const corner = box(f, 'a').querySelector('.stage-pip-resize') as HTMLElement;
      pointer(corner, 'pointerdown', 980, 780);
      pointer(corner, 'pointermove', 1020, 810);
      pointer(corner, 'pointerup', 1020, 810);
      f.detectChanges();
      expect(f.componentInstance.Changes).toEqual([{ Key: 'a', Rect: { X: 0.664, Y: 0.73, W: 0.336, H: 0.27 } }]);
    });

    it('reports nothing for a press that does not move the box', async () => {
      const f = await render({ Surfaces: pips() });
      pointer(bar(f, 'a'), 'pointerdown', 700, 600);
      pointer(bar(f, 'a'), 'pointerup', 700, 600);
      expect(f.componentInstance.Changes).toEqual([]);
    });

    it('does not drag from a button in the bar', async () => {
      const f = await render({ Surfaces: pips() });
      const action = bar(f, 'a').querySelector('.pip-action') as HTMLElement;
      pointer(action, 'pointerdown', 700, 600);
      pointer(bar(f, 'a'), 'pointermove', 600, 550);
      pointer(bar(f, 'a'), 'pointerup', 600, 550);
      expect(f.componentInstance.Changes).toEqual([]);
      expect(place(box(f, 'a'))).toEqual(['664px', '584px', '320px', '200px']);
    });

    it('moves a focused bar with the arrow keys and resizes it with Shift, but leaves keys meant for its buttons alone', async () => {
      const f = await render({ Surfaces: pips() });
      key(bar(f, 'b'), 'ArrowLeft');
      key(bar(f, 'b'), 'ArrowUp', true);
      f.detectChanges();
      expect(f.componentInstance.Changes.map((c) => c.Rect)).toEqual([
        { X: 0.648, Y: 0.47, W: 0.32, H: 0.25 },
        { X: 0.648, Y: 0.47, W: 0.32, H: 0.23 },
      ]);
      expect(box(f, 'b').classList.contains('stage-surface--top')).toBe(true);
      key(bar(f, 'b').querySelector('.pip-action') as HTMLElement, 'ArrowDown');
      expect(f.componentInstance.Changes).toHaveLength(2);
    });

    it('names each bar for assistive technology and points it at the shared hint', async () => {
      const f = await render({ Surfaces: pips() });
      const hint = query(f, '.stage-pip-hint') as HTMLElement;
      expect(bar(f, 'a').getAttribute('aria-label')).toBe('Alpha, picture-in-picture');
      expect(bar(f, 'a').getAttribute('aria-describedby')).toBe(hint.id);
      expect(hint.textContent).toContain('Arrow keys move it');
    });
  });
});
