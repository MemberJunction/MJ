import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MediaStageComponent, MediaStageSurfaceDirective, type MediaStageSurface } from './media-stage.component';

/** A surface's content: records each creation and destruction, so a test can tell a move from a re-creation. */
@Component({
  selector: 'mj-test-surface',
  standalone: true,
  template: '<span class="surface-content">{{ Key }}</span>',
})
class TestSurfaceComponent implements OnInit, OnDestroy {
  public static Created: string[] = [];
  public static Destroyed: string[] = [];
  @Input() public Key = '';
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
      <ng-template mjMediaStageSurface let-key><mj-test-surface [Key]="key"></mj-test-surface></ng-template>
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

describe('MediaStageComponent (DOM)', () => {
  let queued: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    TestSurfaceComponent.Created = [];
    TestSurfaceComponent.Destroyed = [];
    queued = new Map();
    nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queued.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  });

  afterEach(() => vi.unstubAllGlobals());

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
});
