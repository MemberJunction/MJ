import {
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  computed,
  contentChild,
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
import {
  DispatchMJElementEvent,
  MJAfterEvent,
  MJBeforeEvent,
  SanitizeAxisSlug,
} from '../types/events';

let nextLayerId = 0;
let nextLayerTitleId = 0;

type BooleanInputValue = boolean | string | null | undefined;

function optionalModalBoolean(value: BooleanInputValue): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return booleanAttribute(value);
}

@Directive({
  selector: '[mjLayerHeader]',
  standalone: true,
  host: { class: 'mj-layer-header' },
})
export class MJLayerHeaderDirective {}

@Directive({
  selector: '[mjLayerTitle]',
  standalone: true,
  host: {
    class: 'mj-layer-title',
    '[attr.id]': 'TitleId',
  },
})
export class MJLayerTitleDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly TitleId =
    this.el.nativeElement.getAttribute('id') || `mj-layer-title-${++nextLayerTitleId}`;
}

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
 * Uses standard MJ PascalCase inputs (`[Open]`, `[Kind]`, `[AllowPhoneSheet]`);
 * the Angular Elements entry maps kebab-case HTML attributes onto these properties automatically.
 */
@Component({
  selector: 'mj-layer',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="mj-layer-staging" aria-hidden="true">
      <div
        #layerPanel
        [class]="panelClasses()"
        tabindex="-1"
        [attr.role]="ariaRole()"
        [attr.aria-modal]="ariaModal()"
        [attr.aria-label]="Label() || null"
        [attr.aria-labelledby]="ariaLabelledBy()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class MJLayerComponent implements OnDestroy {
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly layerService = inject(MJLayerService);
  private readonly announcer = inject(MJAnnouncerService);
  private readonly layerId = `mj-layer-${++nextLayerId}`;

  private readonly layerPanel = viewChild<ElementRef<HTMLElement>>('layerPanel');
  private readonly titleDirective = contentChild(MJLayerTitleDirective);
  private readonly lightDomTitleId = signal<string | null>(null);

  public readonly Kind = input<string>('dialog');
  public readonly Placement = input<string>('center');
  public readonly Modal = input<boolean | undefined, BooleanInputValue>(undefined, {
    transform: optionalModalBoolean,
  });
  public readonly Closeable = input(true, { transform: booleanAttribute });
  public readonly Size = input<string>('md');
  public readonly Open = input(false, { transform: booleanAttribute });
  public readonly AllowPhoneSheet = input(true, { transform: booleanAttribute });
  public readonly Anchor = input<string | HTMLElement | null>(null);
  public readonly Label = input<string>('');
  public readonly AnnounceOnOpen = input<string>('');

  public readonly BeforeOpen = output<MJBeforeEvent<'open'>>();
  public readonly BeforeClose = output<MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'>>();
  public readonly AfterOpen = output<MJAfterEvent<'open'>>();
  public readonly AfterClose = output<MJAfterEvent<'escape' | 'backdrop' | 'programmatic'>>();

  private readonly isOpenState = signal(false);
  private isCurrentlyOpen = false;

  protected readonly safeKind = computed(() => SanitizeAxisSlug(this.Kind(), 'dialog'));
  protected readonly safePlacement = computed(() => SanitizeAxisSlug(this.Placement(), 'center'));
  protected readonly safeSize = computed(() => SanitizeAxisSlug(this.Size(), 'md'));

  protected readonly effectiveModal = computed(() => {
    const explicit = this.Modal();
    if (explicit !== undefined) {
      return explicit;
    }
    const kind = this.safeKind();
    return kind !== 'popover' && kind !== 'menu' && kind !== 'tooltip' && kind !== 'toast';
  });

  protected readonly panelClasses = computed(() => {
    const classes = [
      'mj-layer-panel',
      'mj-surface-overlay',
      `mj-layer-kind-${this.safeKind()}`,
      `mj-layer-placement-${this.safePlacement()}`,
      `mj-layer-size-${this.safeSize()}`,
    ];
    if (this.AllowPhoneSheet()) {
      classes.push('mj-layer-phone-sheet');
    }
    return classes.join(' ');
  });

  protected readonly ariaRole = computed(() => {
    const kind = this.safeKind();
    if (kind === 'menu') {
      return 'menu';
    }
    if (kind === 'toast') {
      return 'status';
    }
    if (kind === 'tooltip') {
      return 'tooltip';
    }
    return 'dialog';
  });

  protected readonly ariaModal = computed(() => {
    const kind = this.safeKind();
    if (kind === 'menu' || kind === 'toast' || kind === 'tooltip') {
      return null;
    }
    return this.effectiveModal() ? 'true' : null;
  });

  protected readonly ariaLabelledBy = computed(() => {
    if (this.Label()) {
      return null;
    }
    return this.titleDirective()?.TitleId ?? this.lightDomTitleId();
  });

  constructor() {
    afterNextRender(() => {
      const panelEl = this.layerPanel()?.nativeElement;
      if (panelEl) {
        this.syncLightDomTitleId(panelEl);
      }
    });

    effect(() => {
      this.isOpenState.set(this.Open());
    });

    effect(() => {
      const shouldBeOpen = this.isOpenState();
      const panelEl = this.layerPanel()?.nativeElement;

      if (shouldBeOpen && panelEl && !this.isCurrentlyOpen) {
        untracked(() => {
          const before: MJBeforeEvent<'open'> = { Cancel: false, Reason: 'open' };
          this.BeforeOpen.emit(before);
          DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-open', before);
          if (before.Cancel) {
            this.isCurrentlyOpen = false;
            this.isOpenState.set(false);
            return;
          }

          this.isCurrentlyOpen = true;
          this.syncLightDomTitleId(panelEl);
          this.layerService.Open({
            Id: this.layerId,
            PanelElement: panelEl,
            Kind: this.safeKind(),
            Placement: this.safePlacement(),
            Modal: this.effectiveModal(),
            Closeable: this.Closeable(),
            AllowPhoneSheet: this.AllowPhoneSheet(),
            Anchor: this.Anchor(),
            OnRequestClose: (reason) => this.RequestClose(reason),
          });
          const announcement = this.AnnounceOnOpen();
          if (announcement) {
            void this.announcer.Announce(announcement, 'polite');
          }
          const after: MJAfterEvent<'open'> = { Reason: 'open' };
          this.AfterOpen.emit(after);
          DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-open', after);
        });
      } else if (!shouldBeOpen && this.isCurrentlyOpen) {
        this.isCurrentlyOpen = false;
        this.layerService.Close(this.layerId);
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
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-close', before);
    if (before.Cancel) {
      return;
    }

    this.isCurrentlyOpen = false;
    this.isOpenState.set(false);
    this.layerService.Close(this.layerId);

    const after: MJAfterEvent<'escape' | 'backdrop' | 'programmatic'> = { Reason: reason };
    this.AfterClose.emit(after);
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-close', after);
  }

  ngOnDestroy(): void {
    this.isCurrentlyOpen = false;
    this.layerService.Close(this.layerId);
  }

  private syncLightDomTitleId(panelEl: HTMLElement): void {
    const titleEl = panelEl.querySelector<HTMLElement>(
      '.mj-layer-title, [mj-layer-title], [mjlayertitle]'
    );
    if (titleEl) {
      if (!titleEl.id) {
        titleEl.id = `${this.layerId}-title`;
      }
      this.lightDomTitleId.set(titleEl.id);
    } else {
      this.lightDomTitleId.set(null);
    }
  }
}
