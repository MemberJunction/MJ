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
  signal,
  untracked,
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
 * Wave 0 overlay primitive rendered via CDK Overlay + DomPortal (MJLayerService).
 * Keeps its panel connected inside `.mj-layer-staging` while closed so nested
 * Angular Elements (<mj-surface>, <mj-row>) are never destroyed on disconnect.
 */
@Component({
  selector: 'mj-layer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="mj-layer-staging" aria-hidden="true">
      <div
        #layerPanel
        class="mj-layer-panel mj-surface-overlay"
        tabindex="-1"
        [attr.role]="ariaRole()"
        [attr.aria-modal]="modal() ? 'true' : null"
        [attr.aria-label]="label() || null"
        [attr.data-kind]="kind()"
        [attr.data-placement]="placement()"
        [attr.data-size]="size()"
        [attr.data-allow-phone-sheet]="allowPhoneSheet()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class MJLayerComponent implements OnDestroy {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly layerService = inject(MJLayerService);
  private readonly announcer = inject(MJAnnouncerService);
  private readonly layerId = `mj-layer-${++nextLayerId}`;

  private readonly layerPanel = viewChild<ElementRef<HTMLElement>>('layerPanel');

  public readonly kind = input<string>('dialog');
  public readonly placement = input<string>('center');
  public readonly modal = input(true, { transform: booleanAttribute });
  public readonly closeable = input(true, { transform: booleanAttribute });
  public readonly size = input<string>('md');
  public readonly open = input(false, { transform: booleanAttribute });
  public readonly allowPhoneSheet = input(true, { transform: booleanAttribute });
  public readonly anchor = input<string | HTMLElement | null>(null);
  public readonly label = input<string>('');
  public readonly announceOnOpen = input<string>('');

  public readonly beforeClose = output<MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'>>();
  public readonly afterOpen = output<MJAfterEvent<'open'>>();
  public readonly afterClose = output<MJAfterEvent<'escape' | 'backdrop' | 'programmatic'>>();

  private readonly isOpenState = signal(false);
  private isCurrentlyOpen = false;

  protected readonly ariaRole = computed(() => {
    const kind = this.kind();
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
      this.isOpenState.set(this.open());
    });

    effect(() => {
      const shouldBeOpen = this.isOpenState();
      const panelEl = this.layerPanel()?.nativeElement;

      if (shouldBeOpen && panelEl && !this.isCurrentlyOpen) {
        this.isCurrentlyOpen = true;
        untracked(() => {
          this.layerService.Open({
            Id: this.layerId,
            PanelElement: panelEl,
            Kind: this.kind(),
            Placement: this.placement(),
            Modal: this.modal(),
            Closeable: this.closeable(),
            AllowPhoneSheet: this.allowPhoneSheet(),
            Anchor: this.anchor(),
            OnRequestClose: (reason) => this.RequestClose(reason),
          });
          const announcement = this.announceOnOpen();
          if (announcement) {
            void this.announcer.Announce(announcement, 'polite');
          }
          const after: MJAfterEvent<'open'> = { Reason: 'open' };
          this.afterOpen.emit(after);
          dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-open', after);
        });
      } else if (!shouldBeOpen && this.isCurrentlyOpen) {
        this.isCurrentlyOpen = false;
        this.layerService.Close(this.layerId);
      }
    });
  }

  /** Requests closing the layer, honoring cancelable beforeClose guards. */
  public RequestClose(reason: 'escape' | 'backdrop' | 'programmatic' = 'programmatic'): void {
    const before: MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'> = {
      Cancel: false,
      Reason: reason,
    };
    this.beforeClose.emit(before);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-close', before);
    if (before.Cancel) {
      return;
    }

    this.isCurrentlyOpen = false;
    this.isOpenState.set(false);
    this.layerService.Close(this.layerId);

    const after: MJAfterEvent<'escape' | 'backdrop' | 'programmatic'> = { Reason: reason };
    this.afterClose.emit(after);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-close', after);
  }

  ngOnDestroy(): void {
    this.isCurrentlyOpen = false;
    this.layerService.Close(this.layerId);
  }
}
