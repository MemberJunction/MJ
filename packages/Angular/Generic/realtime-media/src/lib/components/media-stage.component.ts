import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  TemplateRef,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { MediaPipRect, MediaPlacement } from '@memberjunction/ai-realtime-client/media';
import {
  DefaultPipBox,
  MovePipBox,
  PipBoxToRect,
  PipRectToBox,
  ResizePipBox,
  PIP_KEY_STEP,
  type MediaStageBox,
  type MediaStageSize,
} from '../pip-geometry';

/**
 * Where `mj-media-stage` shows a surface: filling the stage (or over the host's stage slot), in a picture-in-picture
 * box over it, over the tab slot while the surface's tab is the active one, or out of sight.
 */
export type MediaStagePlacement = MediaPlacement;

/** One surface on the stage. */
export interface MediaStageSurface {
  /** Stable key (a channel key). The surface's content is created once per key and kept while the key is listed. */
  Key: string;
  Placement: MediaStagePlacement;
  /** The surface's name, shown on its picture-in-picture bar. Defaults to the key. */
  Label?: string;
  /**
   * Where a picture-in-picture box stacks until the user moves it: 0, the newest, sits in the stage's bottom-right
   * corner and the others stack upward.
   */
  PipIndex?: number;
}

/** A picture-in-picture box the user moved or resized, as fractions of the stage. */
export interface MediaStagePipRectChange {
  Key: string;
  Rect: MediaPipRect;
}

/** What the picture-in-picture bar's actions template receives: the surface's key, as `let-key`. */
export interface MediaStagePipActionsContext {
  $implicit: string;
}

/**
 * What a surface template receives: its key, as `let-key`; whether it is on screen, as `let-visible="Visible"`; and
 * its placement, as `let-placement="Placement"`.
 */
export interface MediaStageSurfaceContext {
  $implicit: string;
  /** Whether the surface is on screen now: its placement shows it and the stage itself is on screen. */
  Visible: boolean;
  /** Where the surface is placed. */
  Placement: MediaStagePlacement;
}

/** Marks the host's template for a surface's content: `<ng-template mjMediaStageSurface let-key>`. */
@Directive({
  selector: 'ng-template[mjMediaStageSurface]',
  standalone: true,
})
export class MediaStageSurfaceDirective {
  public readonly Template = inject<TemplateRef<MediaStageSurfaceContext>>(TemplateRef);

  public static ngTemplateContextGuard(_directive: MediaStageSurfaceDirective, context: unknown): context is MediaStageSurfaceContext {
    return true;
  }
}

/**
 * Marks the host's template for the buttons on a picture-in-picture box's bar, such as a "Move to…" menu:
 * `<ng-template mjMediaStagePipActions let-key>`.
 */
@Directive({
  selector: 'ng-template[mjMediaStagePipActions]',
  standalone: true,
})
export class MediaStagePipActionsDirective {
  public readonly Template = inject<TemplateRef<MediaStagePipActionsContext>>(TemplateRef);

  public static ngTemplateContextGuard(_directive: MediaStagePipActionsDirective, context: unknown): context is MediaStagePipActionsContext {
    return true;
  }
}

/** How long to follow the tab slot frame by frame after it changes, to ride out the panel's slide-in. */
const SETTLE_MS = 600;

/** The arrow keys, as a direction to move or resize a picture-in-picture box in. */
const ARROW_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** A drag or a resize of a picture-in-picture box, from the pointer going down until it comes up. */
interface PipGesture {
  Key: string;
  Kind: 'move' | 'resize';
  StartX: number;
  StartY: number;
  StartBox: MediaStageBox;
  Box: MediaStageBox;
  /** The element that holds the pointer and its listeners. */
  Handle: HTMLElement;
  /** The surface's box element, styled directly while the pointer moves. */
  Surface: HTMLElement;
}

let nextStageId = 0;

/**
 * `mj-media-stage`: shows each surface where its placement says, without ever moving it in the DOM. Every surface's
 * content is created once, in this layer, and a change of placement only changes where and how big it is, so a
 * whiteboard keeps its view, a stream keeps playing and nothing reloads.
 *
 * The host positions the stage over the area it covers (it fills its positioned parent). A `stage` surface fills
 * it, or covers {@link StageSlot} when the host gives one (such as the agent's place in a call); a `tab` surface
 * covers {@link TabSlot}, an element the host's tab panel keeps for the active tab. Both slots are followed as they
 * resize or slide; a `pip` surface floats in a box the user drags by its bar, resizes from
 * its corner, or moves with the arrow keys, stacked in the bottom-right corner until moved ({@link PipRects},
 * {@link PipRectChange}); any other surface stays alive, out of sight. So does every surface while the stage itself
 * has no size (a hidden ancestor). Each surface's template learns whether it is on screen (`Visible`), so the host
 * can tell the surface to pause work nobody sees.
 */
@Component({
  selector: 'mj-media-stage',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="stage-pip-hint" [id]="PipHintId">Drag to move. Arrow keys move it; Shift and the arrow keys resize it.</span>
    @for (surface of Surfaces; track surface.Key) {
      <div
        class="stage-surface"
        [attr.data-surface]="surface.Key"
        [class.stage-surface--stage]="surface.Placement === 'stage'"
        [class.stage-surface--in-slot]="surface.Placement === 'stage' && StageSlot !== null"
        [class.stage-surface--pip]="surface.Placement === 'pip'"
        [class.stage-surface--top]="surface.Key === TopPipKey"
        [class.stage-surface--hidden]="!IsShown(surface)"
        [style.left.px]="BoxFor(surface)?.Left ?? null"
        [style.top.px]="BoxFor(surface)?.Top ?? null"
        [style.width.px]="BoxFor(surface)?.Width ?? null"
        [style.height.px]="BoxFor(surface)?.Height ?? null"
      >
        @if (surface.Placement === 'pip') {
          <div
            class="stage-pip-bar"
            tabindex="0"
            role="group"
            [attr.aria-label]="(surface.Label || surface.Key) + ', picture-in-picture'"
            [attr.aria-describedby]="PipHintId"
            (pointerdown)="StartPipGesture(surface, 'move', $event)"
            (keydown)="OnPipKey(surface, $event)"
          >
            <span class="stage-pip-title">{{ surface.Label || surface.Key }}</span>
            @if (PipActions) {
              <ng-container [ngTemplateOutlet]="PipActions.Template" [ngTemplateOutletContext]="{ $implicit: surface.Key }"></ng-container>
            }
          </div>
        }
        @if (SurfaceTemplate) {
          <ng-container
            [ngTemplateOutlet]="SurfaceTemplate.Template"
            [ngTemplateOutletContext]="{ $implicit: surface.Key, Visible: IsShown(surface), Placement: surface.Placement }"
          ></ng-container>
        }
        @if (surface.Placement === 'pip') {
          <div class="stage-pip-resize" aria-hidden="true" (pointerdown)="StartPipGesture(surface, 'resize', $event)"></div>
        }
      </div>
    }
  `,
  styleUrls: ['./media-stage.component.css'],
})
export class MediaStageComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private tabSlot: HTMLElement | null = null;
  private slotRect: MediaStageBox | null = null;
  private stageSlot: HTMLElement | null = null;
  private stageSlotRect: MediaStageBox | null = null;
  /** The stage's size, once measured; picture-in-picture boxes are placed in it. */
  private stageSize: MediaStageSize | null = null;
  /** Whether the stage itself has a size; a hidden ancestor (a minimized call) puts every surface out of sight. */
  private stageShown = true;
  /** Where the user put each picture-in-picture box, as fractions of the stage. */
  private pipRects = new Map<string, MediaPipRect>();
  private gesture: PipGesture | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private settleFrame: number | null = null;
  private settleUntil = 0;
  private viewReady = false;
  private destroyed = false;

  /** The surfaces, each with its placement. */
  @Input() public Surfaces: readonly MediaStageSurface[] = [];

  /** The key of the surface whose tab is active; only it shows over {@link TabSlot}. */
  @Input() public ActiveTabKey: string | null = null;

  /** The element the active tab's surface covers, or `null` when no tab is showing. */
  @Input()
  public set TabSlot(value: HTMLElement | null) {
    if (value === this.tabSlot) {
      return;
    }
    this.unobserve(this.tabSlot);
    this.tabSlot = value;
    this.observe(value);
    if (this.viewReady) {
      this.settle();
    }
  }
  public get TabSlot(): HTMLElement | null {
    return this.tabSlot;
  }

  /**
   * The element a `stage` surface covers instead of filling the stage, or `null` (the default) to fill it. It is followed
   * like {@link TabSlot}, and while it has no size the stage surface is out of sight.
   */
  @Input()
  public set StageSlot(value: HTMLElement | null) {
    if (value === this.stageSlot) {
      return;
    }
    this.unobserve(this.stageSlot);
    this.stageSlot = value;
    this.observe(value);
    if (this.viewReady) {
      this.settle();
    }
  }
  public get StageSlot(): HTMLElement | null {
    return this.stageSlot;
  }

  /**
   * Where the user put picture-in-picture boxes, by key, as fractions of the stage (what the host saved). A box with
   * no entry stacks in the corner by its {@link MediaStageSurface.PipIndex}. Setting this replaces every box.
   */
  @Input()
  public set PipRects(value: ReadonlyMap<string, MediaPipRect>) {
    this.pipRects = new Map(value);
  }
  public get PipRects(): ReadonlyMap<string, MediaPipRect> {
    return this.pipRects;
  }

  /** The user moved or resized a picture-in-picture box: the host saves it. */
  @Output() public PipRectChange = new EventEmitter<MediaStagePipRectChange>();

  /** The host's template for a surface's content. */
  @ContentChild(MediaStageSurfaceDirective) public SurfaceTemplate?: MediaStageSurfaceDirective;

  /** The host's template for the buttons on a picture-in-picture bar. */
  @ContentChild(MediaStagePipActionsDirective) public PipActions?: MediaStagePipActionsDirective;

  /** The picture-in-picture box the user touched last; it sits above the others. */
  public TopPipKey: string | null = null;

  /** The id of the hint that tells a keyboard user how to move and resize a picture-in-picture box. */
  public readonly PipHintId = `mj-media-stage-pip-hint-${++nextStageId}`;

  public ngAfterViewInit(): void {
    this.viewReady = true;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(this.host.nativeElement);
      this.observe(this.tabSlot);
      this.observe(this.stageSlot);
    }
    // The view was just checked; measuring now would change it inside the same pass.
    queueMicrotask(() => this.settle());
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.endGesture();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.settleFrame !== null) {
      cancelAnimationFrame(this.settleFrame);
      this.settleFrame = null;
    }
  }

  /** Whether a surface is on screen. */
  public IsShown(surface: MediaStageSurface): boolean {
    if (!this.stageShown) {
      return false;
    }
    if (surface.Placement === 'stage') {
      return this.stageSlot === null || this.stageSlotRect !== null;
    }
    return surface.Placement === 'pip' || this.TabRectFor(surface) !== null;
  }

  /**
   * The box of a surface placed by geometry (over the stage slot or the tab slot, or picture-in-picture), or `null` when
   * it has none (a stage surface with no slot fills the stage).
   */
  public BoxFor(surface: MediaStageSurface): MediaStageBox | null {
    if (surface.Placement === 'pip') {
      return this.pipBoxFor(surface);
    }
    if (surface.Placement === 'stage') {
      return this.stageSlotRect;
    }
    return this.TabRectFor(surface);
  }

  /** The box of a surface shown over the tab slot, or `null` when it isn't. */
  public TabRectFor(surface: MediaStageSurface): MediaStageBox | null {
    return surface.Placement === 'tab' && surface.Key === this.ActiveTabKey ? this.slotRect : null;
  }

  /**
   * The pointer went down on a picture-in-picture bar (`move`) or its corner (`resize`). The box follows the pointer
   * outside Angular and is committed once, when the pointer comes up. A press on a button in the bar is not a drag.
   */
  public StartPipGesture(surface: MediaStageSurface, kind: 'move' | 'resize', event: PointerEvent): void {
    const handle = event.currentTarget;
    const box = this.pipBoxFor(surface);
    if (event.button !== 0 || !box || !(handle instanceof HTMLElement) || !(handle.parentElement instanceof HTMLElement)) {
      return;
    }
    if (kind === 'move' && event.target instanceof Element && event.target.closest('button, a, input, [role="menuitem"]')) {
      return;
    }
    event.preventDefault();
    this.endGesture();
    this.TopPipKey = surface.Key;
    this.gesture = {
      Key: surface.Key,
      Kind: kind,
      StartX: event.clientX,
      StartY: event.clientY,
      StartBox: box,
      Box: box,
      Handle: handle,
      Surface: handle.parentElement,
    };
    handle.setPointerCapture?.(event.pointerId);
    this.zone.runOutsideAngular(() => {
      handle.addEventListener('pointermove', this.onPointerMove);
      handle.addEventListener('pointerup', this.onPointerUp);
      handle.addEventListener('pointercancel', this.onPointerUp);
    });
  }

  /** The arrow keys move a focused picture-in-picture bar's box; with Shift they resize it. */
  public OnPipKey(surface: MediaStageSurface, event: KeyboardEvent): void {
    const direction = ARROW_DIRECTIONS[event.key];
    const box = this.pipBoxFor(surface);
    if (!direction || !box || !this.stageSize || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const [dx, dy] = [direction[0] * PIP_KEY_STEP, direction[1] * PIP_KEY_STEP];
    const next = event.shiftKey ? ResizePipBox(box, dx, dy, this.stageSize) : MovePipBox(box, dx, dy, this.stageSize);
    this.TopPipKey = surface.Key;
    this.commitPip(surface.Key, next);
  }

  /** Where a picture-in-picture box is: mid-drag, where the user put it, or stacked in the corner. */
  private pipBoxFor(surface: MediaStageSurface): MediaStageBox | null {
    if (!this.stageSize) {
      return null;
    }
    if (this.gesture?.Key === surface.Key) {
      return this.gesture.Box;
    }
    const rect = this.pipRects.get(surface.Key);
    return rect ? PipRectToBox(rect, this.stageSize) : DefaultPipBox(surface.PipIndex ?? 0, this.stageSize);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || !this.stageSize) {
      return;
    }
    const dx = event.clientX - gesture.StartX;
    const dy = event.clientY - gesture.StartY;
    gesture.Box = gesture.Kind === 'move' ? MovePipBox(gesture.StartBox, dx, dy, this.stageSize) : ResizePipBox(gesture.StartBox, dx, dy, this.stageSize);
    applyBox(gesture.Surface, gesture.Box);
  };

  private readonly onPointerUp = (): void => {
    const gesture = this.gesture;
    this.endGesture();
    if (gesture) {
      this.zone.run(() => this.commitPip(gesture.Key, gesture.Box, gesture.StartBox));
    }
  };

  /** Keeps a box where the user put it and tells the host, unless it did not move. Always re-renders. */
  private commitPip(key: string, box: MediaStageBox, from?: MediaStageBox): void {
    if (this.stageSize && (!from || !sameRect(box, from))) {
      const rect = PipBoxToRect(box, this.stageSize);
      this.pipRects.set(key, rect);
      this.PipRectChange.emit({ Key: key, Rect: rect });
    }
    this.cdr.markForCheck();
  }

  private endGesture(): void {
    const gesture = this.gesture;
    if (!gesture) {
      return;
    }
    this.gesture = null;
    gesture.Handle.removeEventListener('pointermove', this.onPointerMove);
    gesture.Handle.removeEventListener('pointerup', this.onPointerUp);
    gesture.Handle.removeEventListener('pointercancel', this.onPointerUp);
  }

  /**
   * Measures now and again once the current change detection pass is over (a slot's own bindings, such as the class that
   * gives it its size, can update after the stage's inputs in the same pass), then follows the slot frame by frame for a
   * moment, so a sliding panel is tracked.
   */
  private settle(): void {
    this.measure();
    queueMicrotask(() => {
      if (!this.destroyed) {
        this.measure();
      }
    });
    this.settleUntil = performance.now() + SETTLE_MS;
    if (this.settleFrame !== null || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const follow = (): void => {
        this.settleFrame = null;
        this.measure();
        if (performance.now() < this.settleUntil) {
          this.settleFrame = requestAnimationFrame(follow);
        }
      };
      this.settleFrame = requestAnimationFrame(follow);
    });
  }

  /**
   * Reads whether the stage is on screen and the slot's box relative to it; a slot with no size (hidden) counts as no
   * slot. Runs outside Angular while following the slot, and enters it only when something changed.
   */
  private measure(): void {
    const stage = this.host.nativeElement.getBoundingClientRect();
    const shown = stage.width > 0 && stage.height > 0;
    const size = shown ? { Width: stage.width, Height: stage.height } : this.stageSize;
    const next = readSlotRect(this.tabSlot, stage);
    const nextStageSlot = readSlotRect(this.stageSlot, stage);
    if (
      shown === this.stageShown &&
      sameRect(next, this.slotRect) &&
      sameRect(nextStageSlot, this.stageSlotRect) &&
      sameSize(size, this.stageSize)
    ) {
      return;
    }
    this.zone.run(() => {
      this.stageShown = shown;
      this.slotRect = next;
      this.stageSlotRect = nextStageSlot;
      this.stageSize = size;
      this.cdr.markForCheck();
    });
  }

  private observe(element: HTMLElement | null): void {
    if (element && this.resizeObserver) {
      this.resizeObserver.observe(element);
    }
  }

  private unobserve(element: HTMLElement | null): void {
    if (element && this.resizeObserver) {
      this.resizeObserver.unobserve(element);
    }
  }
}

/** A slot's box relative to the stage, or `null` for no slot, or one with no size (hidden). */
function readSlotRect(slot: HTMLElement | null, stage: DOMRect): MediaStageBox | null {
  if (!slot) {
    return null;
  }
  const box = slot.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }
  return { Left: box.left - stage.left, Top: box.top - stage.top, Width: box.width, Height: box.height };
}

function sameRect(a: MediaStageBox | null, b: MediaStageBox | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.Left === b.Left && a.Top === b.Top && a.Width === b.Width && a.Height === b.Height;
}

function sameSize(a: MediaStageSize | null, b: MediaStageSize | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.Width === b.Width && a.Height === b.Height;
}

/** Styles a surface's box directly, while a gesture moves it outside Angular. */
function applyBox(element: HTMLElement, box: MediaStageBox): void {
  element.style.left = `${box.Left}px`;
  element.style.top = `${box.Top}px`;
  element.style.width = `${box.Width}px`;
  element.style.height = `${box.Height}px`;
}
