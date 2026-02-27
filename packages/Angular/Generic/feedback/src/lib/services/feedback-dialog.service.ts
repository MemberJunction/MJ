import { Injectable, Inject, ApplicationRef, ComponentRef, createComponent, EnvironmentInjector, EmbeddedViewRef } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { FeedbackFormComponent } from '../components/feedback-form.component';
import { FeedbackConfig, FEEDBACK_CONFIG } from '../feedback.config';
import { FeedbackCategory } from '../feedback.types';

/**
 * Options for opening the feedback dialog
 */
export interface FeedbackDialogOptions {
  /** Pre-select a category */
  prefilledCategory?: FeedbackCategory | string;
  /** Pre-fill the title */
  prefilledTitle?: string;
  /** Additional context data to include */
  contextData?: Record<string, unknown>;
  /** Current page/view name (for apps where URL doesn't change during navigation) */
  currentPage?: string;
}

/**
 * Lightweight dialog reference replacing Kendo's DialogRef
 */
export class FeedbackDialogRef {
  private resultSubject = new Subject<{ success: boolean }>();

  /** Observable that emits when the dialog closes */
  public Result: Observable<{ success: boolean }> = this.resultSubject.asObservable();

  constructor(private destroyFn: () => void) {}

  /** Close the dialog programmatically */
  Close(): void {
    this.destroyFn();
  }

  /** @internal Emit the result and complete */
  _emitResult(result: { success: boolean }): void {
    this.resultSubject.next(result);
    this.resultSubject.complete();
  }
}

/**
 * Service for managing the feedback dialog lifecycle
 */
@Injectable({
  providedIn: 'root'
})
export class FeedbackDialogService {
  private activeDialogRef: FeedbackDialogRef | null = null;
  private activeComponentRef: ComponentRef<FeedbackFormComponent> | null = null;

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector,
    @Inject(FEEDBACK_CONFIG) private config: FeedbackConfig
  ) {}

  /**
   * Open the feedback dialog
   * @param options - Dialog configuration options
   * @returns FeedbackDialogRef for the opened dialog
   */
  public OpenFeedbackDialog(options?: FeedbackDialogOptions): FeedbackDialogRef {
    // Close any existing dialog first
    this.closeActiveDialog();

    // Create the component dynamically
    const componentRef = createComponent(FeedbackFormComponent, {
      environmentInjector: this.injector
    });

    // Configure the component instance
    const instance = componentRef.instance;

    if (options?.prefilledCategory) {
      instance.PrefilledCategory = options.prefilledCategory;
    }

    if (options?.prefilledTitle) {
      instance.PrefilledTitle = options.prefilledTitle;
    }

    if (options?.contextData) {
      instance.ContextData = options.contextData;
    }

    if (options?.currentPage) {
      instance.CurrentPage = options.currentPage;
    }

    // Attach to Angular's change detection
    this.appRef.attachView(componentRef.hostView);

    // Add to DOM
    const hostElement = (componentRef.hostView as EmbeddedViewRef<unknown>).rootNodes[0] as HTMLElement;
    document.body.appendChild(hostElement);

    // Create the dialog ref with a cleanup function
    const dialogRef = new FeedbackDialogRef(() => {
      this.destroyComponent(componentRef, hostElement);
    });

    // Listen for dialog close from the form component
    instance.DialogClosed.subscribe((result: { success: boolean }) => {
      dialogRef._emitResult(result);
      this.destroyComponent(componentRef, hostElement);
    });

    // Track active dialog
    this.activeDialogRef = dialogRef;
    this.activeComponentRef = componentRef;

    return dialogRef;
  }

  /**
   * Open dialog pre-configured for bug reporting
   */
  public OpenBugReportDialog(options?: Omit<FeedbackDialogOptions, 'prefilledCategory'>): FeedbackDialogRef {
    return this.OpenFeedbackDialog({
      ...options,
      prefilledCategory: 'bug'
    });
  }

  /**
   * Open dialog pre-configured for feature requests
   */
  public OpenFeatureRequestDialog(options?: Omit<FeedbackDialogOptions, 'prefilledCategory'>): FeedbackDialogRef {
    return this.OpenFeedbackDialog({
      ...options,
      prefilledCategory: 'feature'
    });
  }

  /**
   * Close all open feedback dialogs
   */
  public CloseAllDialogs(): void {
    this.closeActiveDialog();
  }

  /**
   * Clean up a component and remove from DOM
   */
  private destroyComponent(componentRef: ComponentRef<FeedbackFormComponent>, hostElement: HTMLElement): void {
    if (this.activeComponentRef === componentRef) {
      this.activeComponentRef = null;
      this.activeDialogRef = null;
    }
    if (!componentRef.hostView.destroyed) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }
    if (hostElement.parentNode) {
      hostElement.parentNode.removeChild(hostElement);
    }
  }

  /**
   * Close the active dialog if one exists
   */
  private closeActiveDialog(): void {
    if (this.activeComponentRef && this.activeDialogRef) {
      try {
        const instance = this.activeComponentRef.instance;
        if (instance.DialogEl?.nativeElement?.open) {
          instance.DialogEl.nativeElement.close();
        }
      } catch {
        // Dialog might already be closed
      }
      if (!this.activeComponentRef.hostView.destroyed) {
        const hostElement = (this.activeComponentRef.hostView as EmbeddedViewRef<unknown>).rootNodes[0] as HTMLElement;
        this.destroyComponent(this.activeComponentRef, hostElement);
      }
    }
  }
}
