import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ReactComponentEvent, MJReactComponent } from '@memberjunction/ng-react';
import { CompositeKey } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import {
  ComponentStudioStateService,
  ComponentError
} from '../../services/component-studio-state.service';

/**
 * Viewport size preset for the component preview
 */
export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

interface ViewportPreset {
  Size: ViewportSize;
  Label: string;
  Icon: string;
  MaxWidth: string;
}

/**
 * Component Preview - TOP section of CENTER panel.
 * Renders the live React component preview with toolbar controls.
 */
@Component({
  selector: 'mj-component-preview',
  templateUrl: './component-preview.component.html',
  styleUrls: ['./component-preview.component.css']
})
export class ComponentPreviewComponent implements OnInit, OnDestroy {

  @ViewChild('reactComponent') ReactComponentRef?: MJReactComponent;

  @Output() AskAIToFix = new EventEmitter<ComponentError>();

  // --- Viewport ---
  public ActiveViewport: ViewportSize = 'desktop';

  public readonly ViewportPresets: ViewportPreset[] = [
    { Size: 'mobile', Label: 'Mobile (375px)', Icon: 'fa-mobile-screen', MaxWidth: '375px' },
    { Size: 'tablet', Label: 'Tablet (768px)', Icon: 'fa-tablet-screen-button', MaxWidth: '768px' },
    { Size: 'desktop', Label: 'Desktop (100%)', Icon: 'fa-desktop', MaxWidth: '100%' }
  ];

  // --- Local spec for refresh cycle ---
  public LocalComponentSpec: ComponentSpec | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.syncSpecFromState();

    this.State.StateChanged
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.syncSpecFromState();
        this.cdr.detectChanges();
      });

    this.State.RefreshComponent
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshPreview();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // TOOLBAR ACTIONS
  // ============================================================

  public RunSelectedComponent(): void {
    if (this.State.SelectedComponent) {
      this.State.RunComponent(this.State.SelectedComponent);
    }
  }

  public StopComponent(): void {
    MJReactComponent.forceClearRegistries();
    this.State.StopComponent();
  }

  public RefreshComponent(): void {
    if (this.State.SelectedComponent && this.State.IsRunning) {
      MJReactComponent.forceClearRegistries();
      this.refreshPreview();
    }
  }

  public SetViewport(size: ViewportSize): void {
    this.ActiveViewport = size;
    this.cdr.detectChanges();
  }

  public SendErrorToAI(): void {
    if (this.State.CurrentError) {
      this.AskAIToFix.emit(this.State.CurrentError);
      this.State.SendErrorToAI.emit(this.State.CurrentError);
    }
  }

  // ============================================================
  // VIEWPORT HELPERS
  // ============================================================

  public GetActivePreset(): ViewportPreset {
    return this.ViewportPresets.find(p => p.Size === this.ActiveViewport) || this.ViewportPresets[2];
  }

  public GetPreviewContainerMaxWidth(): string {
    return this.GetActivePreset().MaxWidth;
  }

  // ============================================================
  // REACT COMPONENT EVENTS
  // ============================================================

  public OnComponentEvent(event: ReactComponentEvent): void {
    if (event.type === 'error') {
      this.State.CurrentError = {
        type: event.payload?.source || 'Component Error',
        message: event.payload?.error || 'An error occurred while rendering the component',
        technicalDetails: event.payload?.errorInfo || event.payload
      };
      this.cdr.detectChanges();
    }
  }

  public OnOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
    SharedService.Instance.OpenEntityRecord(event.entityName, event.key);
  }

  // ============================================================
  // STATE HELPERS
  // ============================================================

  public GetComponentName(): string {
    if (!this.State.SelectedComponent) return '';
    return this.State.GetComponentName(this.State.SelectedComponent);
  }

  public GetComponentDescription(): string | undefined {
    if (!this.State.SelectedComponent) return undefined;
    return this.State.GetComponentDescription(this.State.SelectedComponent);
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  private syncSpecFromState(): void {
    this.LocalComponentSpec = this.State.ComponentSpec;
  }

  /**
   * Refresh the preview by nulling the spec, detecting changes,
   * then restoring the spec after a short delay.
   */
  private refreshPreview(): void {
    if (!this.State.SelectedComponent) return;

    const spec = this.State.GetComponentSpec(this.State.SelectedComponent);

    // Null out to force React to unmount
    this.LocalComponentSpec = null;
    this.cdr.detectChanges();

    // Re-set after a brief pause to force fresh mount
    setTimeout(() => {
      this.LocalComponentSpec = spec;
      this.State.ComponentSpec = spec;
      this.State.CurrentError = null;
      try {
        this.cdr.detectChanges();
      } catch (error) {
        console.error('Error during refresh detectChanges:', error);
      }
    }, 10);
  }
}
