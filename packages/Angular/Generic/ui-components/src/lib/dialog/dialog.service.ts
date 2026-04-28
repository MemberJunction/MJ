import {
  Injectable,
  ComponentRef,
  Type,
  ViewContainerRef,
  ApplicationRef,
  Injector,
  createComponent,
  inject
} from '@angular/core';
import { Subject, Observable } from 'rxjs';

/**
 * Result returned when a dialog action button is clicked.
 */
export interface MJDialogAction {
  text: string;
  primary?: boolean;
  themeColor?: string;
}

/**
 * Options for opening a dialog programmatically.
 */
export interface MJDialogSettings {
  /** Dialog title */
  title?: string;
  /** Content: either a string message or a Component class */
  content?: string | Type<unknown>;
  /** Action buttons shown in the footer */
  actions?: MJDialogAction[];
  /** Dialog width in pixels */
  width?: number;
  /** Dialog minimum width in pixels */
  minWidth?: number;
  /** Dialog height in pixels */
  height?: number;
  /** ViewContainerRef to attach the dialog to (for proper DI context) */
  appendTo?: ViewContainerRef;
}

/**
 * Reference to an open dialog. Used to access content instance and subscribe to results.
 */
export class MJDialogRef {
  private resultSubject = new Subject<unknown>();
  private containerRef: ComponentRef<MJDialogContainerComponent> | null = null;

  /** The content component instance (when content is a Component class) */
  Content: { instance: Record<string, unknown> } | null = null;

  /** Observable that emits when the dialog is closed */
  get Result(): Observable<unknown> {
    return this.resultSubject.asObservable();
  }

  /** @internal */
  SetContainerRef(ref: ComponentRef<MJDialogContainerComponent>): void {
    this.containerRef = ref;
  }

  /** Close the dialog with a result */
  Close(result?: unknown): void {
    this.resultSubject.next(result);
    this.resultSubject.complete();
    this.containerRef?.location.nativeElement.remove();
    this.containerRef?.destroy();
  }
}

/**
 * Internal container component that wraps dialog content.
 * This is dynamically created by MJDialogService.
 */
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-dialog-container-internal',
  standalone: true,
  template: `
    <div class="mj-dialog-backdrop" (click)="OnBackdropClick()">
      <div class="mj-dialog-container"
        [style.width]="Width ? Width + 'px' : '450px'"
        [style.min-width]="MinWidth ? MinWidth + 'px' : null"
        [style.height]="Height ? Height + 'px' : null"
        (click)="$event.stopPropagation()"
        role="dialog"
        aria-modal="true">

        @if (Title) {
          <div class="mj-dialog-titlebar">
            <h3 class="mj-dialog-title">{{ Title }}</h3>
            <button class="mj-dialog-close" (click)="OnCloseClick()" aria-label="Close">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        }

        <div class="mj-dialog-body">
          @if (StringContent) {
            <p>{{ StringContent }}</p>
          }
          <div #contentHost></div>
        </div>

        @if (Actions && Actions.length > 0) {
          <div class="mj-dialog-actions">
            @for (action of Actions; track action.text) {
              <button
                class="mj-btn"
                [class.mj-btn--primary]="action.primary"
                [class.mj-btn--danger]="action.themeColor === 'error'"
                (click)="OnActionClick(action)">
                {{ action.text }}
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .mj-dialog-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--mj-bg-overlay);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mj-dialog-container {
      background: var(--mj-bg-surface);
      border-radius: var(--mj-radius-lg);
      box-shadow: var(--mj-shadow-xl, 0 20px 60px color-mix(in srgb, var(--mj-text-primary) 30%, transparent));
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      max-width: 90vw;
      overflow: hidden;
    }

    .mj-dialog-titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-card);
    }

    .mj-dialog-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-primary);
    }

    .mj-dialog-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--mj-text-muted);
      border-radius: var(--mj-radius-sm);
      transition: var(--mj-transition-colors);
    }
    .mj-dialog-close:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    .mj-dialog-body {
      flex: 1;
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .mj-dialog-body > p {
      padding: 20px;
    }

    .mj-dialog-body > div {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .mj-dialog-body p {
      margin: 0;
      color: var(--mj-text-primary);
      line-height: 1.5;
    }

    .mj-dialog-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--mj-border-default);
    }

    .mj-btn {
      padding: 8px 16px;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: var(--mj-transition-colors);
    }
    .mj-btn:hover { background: var(--mj-bg-surface-hover); }
    .mj-btn--primary {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-color: var(--mj-brand-primary);
    }
    .mj-btn--primary:hover { background: var(--mj-brand-primary-hover); }
    .mj-btn--danger {
      background: var(--mj-status-error);
      color: var(--mj-text-inverse);
      border-color: var(--mj-status-error);
    }

    @media (max-width: 767px) {
      .mj-dialog-container {
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }
    }
  `]
})
export class MJDialogContainerComponent {
  @Input() Title = '';
  @Input() StringContent = '';
  @Input() Width: number | null = null;
  @Input() MinWidth: number | null = null;
  @Input() Height: number | null = null;
  @Input() Actions: MJDialogAction[] = [];
  @Output() ActionClicked = new EventEmitter<MJDialogAction>();
  @Output() CloseClicked = new EventEmitter<void>();

  OnBackdropClick(): void {
    this.CloseClicked.emit();
  }

  OnCloseClick(): void {
    this.CloseClicked.emit();
  }

  OnActionClick(action: MJDialogAction): void {
    this.ActionClicked.emit(action);
  }
}

/**
 * MJDialogService — Programmatic dialog opening. Replaces Kendo `DialogService`.
 *
 * @example
 * ```typescript
 * // Simple confirm
 * const dialogRef = this.dialogService.Open({
 *   title: 'Confirm',
 *   content: 'Are you sure?',
 *   actions: [
 *     { text: 'OK', primary: true },
 *     { text: 'Cancel' }
 *   ]
 * });
 * dialogRef.Result.subscribe(result => { ... });
 *
 * // Component content
 * const dialogRef = this.dialogService.Open({
 *   content: MyDialogComponent,
 *   width: 500
 * });
 * dialogRef.Content.instance.someInput = 'value';
 * dialogRef.Result.subscribe(result => { ... });
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MJDialogService {
  private appRef = inject(ApplicationRef);
  private injector = inject(Injector);

  /**
   * Open a dialog programmatically.
   *
   * Kendo-compatible API: accepts `content` as string or Component class,
   * returns a ref with `.Content.instance` and `.Result` observable.
   */
  Open(settings: MJDialogSettings): MJDialogRef {
    const dialogRef = new MJDialogRef();
    const injector = settings.appendTo?.injector ?? this.injector;

    const containerRef = this.createContainer(injector);
    this.configureContainer(containerRef, settings, dialogRef);
    this.attachToDOM(containerRef, settings);
    this.attachContentComponent(containerRef, settings, dialogRef, injector);

    containerRef.changeDetectorRef.detectChanges();
    return dialogRef;
  }

  private createContainer(injector: Injector): ComponentRef<MJDialogContainerComponent> {
    return createComponent(MJDialogContainerComponent, {
      environmentInjector: this.appRef.injector,
      elementInjector: injector
    });
  }

  private configureContainer(
    containerRef: ComponentRef<MJDialogContainerComponent>,
    settings: MJDialogSettings,
    dialogRef: MJDialogRef
  ): void {
    containerRef.instance.Title = settings.title ?? '';
    containerRef.instance.Width = settings.width ?? null;
    containerRef.instance.MinWidth = settings.minWidth ?? null;
    containerRef.instance.Height = settings.height ?? null;
    containerRef.instance.Actions = settings.actions ?? [];

    if (typeof settings.content === 'string') {
      containerRef.instance.StringContent = settings.content;
    }

    containerRef.instance.CloseClicked.subscribe(() => dialogRef.Close(undefined));
    containerRef.instance.ActionClicked.subscribe((action: MJDialogAction) => dialogRef.Close(action));
    dialogRef.SetContainerRef(containerRef);
  }

  private attachToDOM(containerRef: ComponentRef<MJDialogContainerComponent>, settings: MJDialogSettings): void {
    if (settings.appendTo) {
      settings.appendTo.insert(containerRef.hostView);
    } else {
      document.body.appendChild(containerRef.location.nativeElement);
      this.appRef.attachView(containerRef.hostView);
    }
  }

  private attachContentComponent(
    containerRef: ComponentRef<MJDialogContainerComponent>,
    settings: MJDialogSettings,
    dialogRef: MJDialogRef,
    injector: Injector
  ): void {
    if (!settings.content || typeof settings.content === 'string') return;

    const contentHost = containerRef.location.nativeElement.querySelector('.mj-dialog-body div');
    if (!contentHost) return;

    const contentRef = createComponent(settings.content as Type<unknown>, {
      environmentInjector: this.appRef.injector,
      elementInjector: injector,
      hostElement: contentHost
    });
    this.appRef.attachView(contentRef.hostView);
    dialogRef.Content = { instance: contentRef.instance as Record<string, unknown> };
  }

  /**
   * Kendo-compatible alias — lowercase `open` for easier migration.
   */
  open(settings: MJDialogSettings): MJDialogRef {
    return this.Open(settings);
  }
}
