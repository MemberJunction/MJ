import {
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
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
 * Wave 0 overlay primitive rendered via CDK Overlay (MJLayerService).
 * Uses two-way `open` model so Escape/backdrop dismissal cannot leave a zombie DOM panel.
 */
@Component({
  selector: 'mj-layer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-template #layerTemplate>
      <div
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
    </ng-template>
  `,
})
export class MJLayerComponent implements OnDestroy {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly layerService = inject(MJLayerService);
  private readonly announcer = inject(MJAnnouncerService);
  private readonly layerId = `mj-layer-${++nextLayerId}`;

  private readonly layerTemplate = viewChild<TemplateRef<unknown>>('layerTemplate');

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
      const template = this.layerTemplate();

      if (shouldBeOpen && template && !this.isCurrentlyOpen) {
        this.isCurrentlyOpen = true;
        untracked(() => {
          this.layerService.Open({
            Id: this.layerId,
            Template: template,
            ViewContainerRef: this.viewContainerRef,
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
