import {
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MJLayerService } from '../services/layer.service';
import { MJAnnouncerService } from '../services/announcer.service';
import { MJAfterEvent, MJBeforeEvent, dispatchMJElementEvent } from '../types/events';

let nextLayerId = 0;

@Directive({
  selector: '[mjLayerHeader]',
  standalone: true,
  host: { class: 'mj-layer-header' },
})
export class MJLayerHeaderDirective {}

@Directive({
  selector: '[mjLayerTitle]',
  standalone: true,
  host: { class: 'mj-layer-title' },
})
export class MJLayerTitleDirective {}

@Directive({
  selector: '[mjLayerBody]',
  standalone: true,
  host: { class: 'mj-layer-body' },
})
export class MJLayerBodyDirective {}

@Directive({
  selector: '[mjLayerFooter]',
  standalone: true,
  host: { class: 'mj-layer-footer' },
})
export class MJLayerFooterDirective {}

/**
 * Wave 0 overlay primitive for dialog, sheet, popover, menu, tooltip, and toast.
 * Delegates LIFO Escape, focus trap/restore, and ref-counted scroll lock to MJLayerService.
 */
@Component({
  selector: 'mj-layer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (Open()) {
      @if (Modal()) {
        <div
          class="mj-layer-backdrop"
          (click)="OnBackdropClick()"
        ></div>
      }
      <div
        class="mj-layer-host"
        [attr.data-kind]="Kind()"
        [attr.data-placement]="Placement()"
        [attr.data-allow-phone-sheet]="AllowPhoneSheet()"
      >
        <div
          #layerPanel
          class="mj-layer mj-surface-overlay"
          tabindex="-1"
          [attr.role]="ariaRole()"
          [attr.aria-modal]="Modal() ? 'true' : null"
          [attr.aria-label]="Label() || null"
          [attr.data-kind]="Kind()"
          [attr.data-size]="Size()"
        >
          <ng-content />
        </div>
      </div>
    }
  `,
})
export class MJLayerComponent implements OnDestroy {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly layerService = inject(MJLayerService);
  private readonly announcer = inject(MJAnnouncerService);
  private readonly layerId = `mj-layer-${++nextLayerId}`;

  private readonly layerPanel = viewChild<ElementRef<HTMLElement>>('layerPanel');

  public readonly Kind = input<string>('dialog');
  public readonly Placement = input<string>('center');
  public readonly Modal = input(true, { transform: booleanAttribute });
  public readonly Closeable = input(true, { transform: booleanAttribute });
  public readonly Size = input<string>('md');
  public readonly Open = input(false, { transform: booleanAttribute });
  public readonly AllowPhoneSheet = input(true, { transform: booleanAttribute });
  public readonly Label = input<string>('');
  public readonly AnnounceOnOpen = input<string>('');

  public readonly BeforeClose = output<MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'>>();
  public readonly AfterOpen = output<MJAfterEvent<'open'>>();
  public readonly AfterClose = output<MJAfterEvent<'escape' | 'backdrop' | 'programmatic'>>();

  protected readonly ariaRole = computed(() => {
    const kind = this.Kind();
    if (kind === 'toast') {
      return 'status';
    }
    if (kind === 'tooltip') {
      return 'tooltip';
    }
    return 'dialog';
  });

  constructor() {
    effect(() => {
      const isOpen = this.Open();
      const panel = this.layerPanel()?.nativeElement;
      if (isOpen && panel) {
        this.layerService.Register({
          Id: this.layerId,
          Container: panel,
          Modal: this.Modal(),
          Closeable: this.Closeable(),
          OnRequestClose: (reason) => this.RequestClose(reason),
        });
        const announcement = this.AnnounceOnOpen();
        if (announcement) {
          void this.announcer.Announce(announcement, 'polite');
        }
        const after: MJAfterEvent<'open'> = { Reason: 'open' };
        this.AfterOpen.emit(after);
        dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-open', after);
      } else {
        this.layerService.Unregister(this.layerId);
      }
    });
  }

  /** Requests closing the layer, honoring cancelable BeforeClose guards. */
  public RequestClose(reason: 'escape' | 'backdrop' | 'programmatic' = 'programmatic'): void {
    const before: MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'> = {
      Cancel: false,
      Reason: reason,
    };
    this.BeforeClose.emit(before);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-close', before);
    if (before.Cancel) {
      return;
    }

    this.layerService.Unregister(this.layerId);
    const after: MJAfterEvent<'escape' | 'backdrop' | 'programmatic'> = { Reason: reason };
    this.AfterClose.emit(after);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-close', after);
  }

  protected OnBackdropClick(): void {
    if (this.Closeable() && this.layerService.IsTopmost(this.layerId)) {
      this.RequestClose('backdrop');
    }
  }

  ngOnDestroy(): void {
    this.layerService.Unregister(this.layerId);
  }
}
