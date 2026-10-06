import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  TemplateRef,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * Where `mj-media-stage` shows a surface: filling the stage, over the tab slot while the surface's tab is the
 * active one, or out of sight. Picture-in-picture arrives with the "Move to…" menu.
 */
export type MediaStagePlacement = 'stage' | 'tab' | 'hidden';

/** One surface on the stage. */
export interface MediaStageSurface {
  /** Stable key (a channel key). The surface's content is created once per key and kept while the key is listed. */
  Key: string;
  Placement: MediaStagePlacement;
}

/** What a surface template receives: its key, as `let-key`. */
export interface MediaStageSurfaceContext {
  $implicit: string;
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

/** A surface's box, relative to the stage. */
interface StageRect {
  Left: number;
  Top: number;
  Width: number;
  Height: number;
}

/** How long to follow the tab slot frame by frame after it changes, to ride out the panel's slide-in. */
const SETTLE_MS = 600;

/**
 * `mj-media-stage`: shows each surface where its placement says, without ever moving it in the DOM. Every surface's
 * content is created once, in this layer, and a change of placement only changes where and how big it is, so a
 * whiteboard keeps its view, a stream keeps playing and nothing reloads.
 *
 * The host positions the stage over the area it covers (it fills its positioned parent). A `stage` surface fills
 * it; a `tab` surface covers {@link TabSlot}, an element the host's tab panel keeps for the active tab, and is
 * followed as the panel resizes or slides; any other surface stays alive, out of sight.
 */
@Component({
  selector: 'mj-media-stage',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (surface of Surfaces; track surface.Key) {
      <div
        class="stage-surface"
        [attr.data-surface]="surface.Key"
        [class.stage-surface--stage]="surface.Placement === 'stage'"
        [class.stage-surface--hidden]="!IsShown(surface)"
        [style.left.px]="TabRectFor(surface)?.Left ?? null"
        [style.top.px]="TabRectFor(surface)?.Top ?? null"
        [style.width.px]="TabRectFor(surface)?.Width ?? null"
        [style.height.px]="TabRectFor(surface)?.Height ?? null"
      >
        @if (SurfaceTemplate) {
          <ng-container [ngTemplateOutlet]="SurfaceTemplate.Template" [ngTemplateOutletContext]="{ $implicit: surface.Key }"></ng-container>
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
  private slotRect: StageRect | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private settleFrame: number | null = null;
  private settleUntil = 0;
  private viewReady = false;

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

  /** The host's template for a surface's content. */
  @ContentChild(MediaStageSurfaceDirective) public SurfaceTemplate?: MediaStageSurfaceDirective;

  public ngAfterViewInit(): void {
    this.viewReady = true;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.zone.run(() => this.measure()));
      this.resizeObserver.observe(this.host.nativeElement);
      this.observe(this.tabSlot);
    }
    // The view was just checked; measuring now would change it inside the same pass.
    queueMicrotask(() => this.settle());
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.settleFrame !== null) {
      cancelAnimationFrame(this.settleFrame);
      this.settleFrame = null;
    }
  }

  /** Whether a surface is on screen. */
  public IsShown(surface: MediaStageSurface): boolean {
    return surface.Placement === 'stage' || this.TabRectFor(surface) !== null;
  }

  /** The box of a surface shown over the tab slot, or `null` when it isn't. */
  public TabRectFor(surface: MediaStageSurface): StageRect | null {
    return surface.Placement === 'tab' && surface.Key === this.ActiveTabKey ? this.slotRect : null;
  }

  /** Measures now, then follows the slot frame by frame for a moment, so a sliding panel is tracked. */
  private settle(): void {
    this.measure();
    this.settleUntil = performance.now() + SETTLE_MS;
    if (this.settleFrame !== null || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const follow = (): void => {
        this.settleFrame = null;
        this.zone.run(() => this.measure());
        if (performance.now() < this.settleUntil) {
          this.settleFrame = requestAnimationFrame(follow);
        }
      };
      this.settleFrame = requestAnimationFrame(follow);
    });
  }

  /** Reads the slot's box relative to the stage; a slot with no size (hidden) counts as no slot. */
  private measure(): void {
    const next = this.readSlotRect();
    if (sameRect(next, this.slotRect)) {
      return;
    }
    this.slotRect = next;
    this.cdr.markForCheck();
  }

  private readSlotRect(): StageRect | null {
    if (!this.tabSlot) {
      return null;
    }
    const stage = this.host.nativeElement.getBoundingClientRect();
    const slot = this.tabSlot.getBoundingClientRect();
    if (slot.width <= 0 || slot.height <= 0) {
      return null;
    }
    return { Left: slot.left - stage.left, Top: slot.top - stage.top, Width: slot.width, Height: slot.height };
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

function sameRect(a: StageRect | null, b: StageRect | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.Left === b.Left && a.Top === b.Top && a.Width === b.Width && a.Height === b.Height;
}
