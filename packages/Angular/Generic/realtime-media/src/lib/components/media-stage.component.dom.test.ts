import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MediaStageComponent, MediaStageSurfaceDirective, type MediaStageSurface } from './media-stage.component';

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
  /** The latest visibility each surface was given, by key. */
  public static Visibility = new Map<string, boolean>();
  @Input() public Key = '';
  @Input()
  public set Visible(value: boolean) {
    TestSurfaceComponent.Visibility.set(this.Key, value);
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
  imports: [MediaStageComponent, MediaStageSurfaceDirective, TestSurfaceComponent],
  template: `
    <mj-media-stage [Surfaces]="Surfaces" [TabSlot]="Slot" [ActiveTabKey]="ActiveTabKey">
      <ng-template mjMediaStageSurface let-key let-visible="Visible">
        <mj-test-surface [Key]="key" [Visible]="visible"></mj-test-surface>
      </ng-template>
    </mj-media-stage>
  `,
})
class StageHostComponent {
  @Input() public Surfaces: MediaStageSurface[] = [];
  @Input() public ActiveTabKey: string | null = null;
  @Input() public Slot: HTMLElement | null = null;
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

  it("keeps a surface's content as its placement changes", async () => {
    const f = await render({ Surfaces: [{ Key: 'whiteboard', Placement: 'tab' }], ActiveTabKey: 'whiteboard', Slot: slotAt(500, 40, 300, 400) });
    set(f, { Surfaces: [{ Key: 'whiteboard', Placement: 'stage' }] });
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
});
