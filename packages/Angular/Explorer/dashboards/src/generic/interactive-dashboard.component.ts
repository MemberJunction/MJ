import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  OnInit
} from '@angular/core';
import { BaseDashboard } from './base-dashboard';
import { ComponentSpec } from '@memberjunction/interactivecomponents';
import { LogError, CompositeKey } from '@memberjunction/core';

/**
 * Dashboard component that renders Interactive Components for dashboards.
 * This component extends BaseDashboard and uses the MJReactComponent
 * wrapper to render React-based dashboard implementations.
 */
@Component({
  selector: 'mj-interactive-dashboard',
  template: `
    <div class="interactive-dashboard-container" #dashboardContainer>
      @if (componentSpec) {
        <mj-react-component
          [component]="componentSpec"
          [enableLogging]="false"
          (componentEvent)="onComponentEvent($event)"
          (openEntityRecord)="onOpenEntityRecord($event)"
          (userSettingsChanged)="onUserSettingsChanged($event)">
        </mj-react-component>
      }
      @if (!componentSpec && !loading) {
        <div class="error-message">
          <i class="fa-solid fa-exclamation-triangle"></i>
          <p>No component specification provided for this dashboard.</p>
        </div>
      }
      @if (loading) {
        <div class="loading-message">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <p>Loading dashboard...</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .interactive-dashboard-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .error-message,
    .loading-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #666;
      text-align: center;
    }
    .error-message i {
      font-size: 48px;
      color: #dc3545;
      margin-bottom: 16px;
    }
    .loading-message i {
      font-size: 48px;
      color: #5B4FE9;
      margin-bottom: 16px;
    }
    .error-message p,
    .loading-message p {
      font-size: 16px;
      margin: 0;
    }
  `]
})
export class InteractiveDashboardComponent extends BaseDashboard implements OnInit {
  /**
   * The component specification for the Interactive Component to render
   */
  @Input() componentSpec!: ComponentSpec;

  @ViewChild('dashboardContainer') dashboardContainer!: ElementRef;

  public loading: boolean = true;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  async ngOnInit() {
    // Call parent ngOnInit
    await super.ngOnInit();

    // Validate that we have required inputs
    if (!this.componentSpec) {
      LogError('InteractiveDashboardComponent: No componentSpec provided');
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // The MJReactComponent will handle loading the component
    // We just need to provide the spec
    this.loading = false;
    this.cdr.detectChanges();

    // Emit loading complete
    this.LoadingComplete.emit();
  }

  /**
   * Initialize the dashboard
   * Required by BaseDashboard
   */
  protected initDashboard(): void {
    // Interactive Components handle their own initialization
    // Nothing to do here
  }

  /**
   * Load data for the dashboard
   * Required by BaseDashboard
   */
  protected loadData(): void {
    // Interactive Components manage their own data loading
    // Nothing to do here
  }

  /**
   * Handle events emitted from the React component
   */
  public onComponentEvent(event: any): void {
    if (!event || !event.type) {
      return;
    }

    switch (event.type) {
      case 'interaction':
        // Pass through interaction events to parent
        this.Interaction.emit(event.payload);
        break;

      case 'error':
        this.handleErrorEvent(event.payload);
        break;

      case 'refresh':
        // Component requesting a refresh
        this.Refresh();
        break;

      default:
        // Log unknown events
        console.log('InteractiveDashboardComponent: Unhandled event type:', event.type, event.payload);
    }
  }

  /**
   * Handle error event from the React component
   */
  private handleErrorEvent(payload: any): void {
    const errorMessage = payload?.error || payload?.message || 'An error occurred in the dashboard component';

    LogError('InteractiveDashboardComponent: Error from React component', null, payload);

    // Emit error event to parent
    this.Error.emit(new Error(errorMessage));
  }

  /**
   * Handle navigation to another entity record
   */
  public onOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
    if (!event || !event.entityName || !event.key) {
      return;
    }

    // Emit to parent container
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.key
    });
  }

  /**
   * Handle user settings changes from the React component
   */
  public onUserSettingsChanged(event: any): void {
    if (!event || !event.settings) {
      return;
    }

    // Emit user state changed event to parent
    // The parent (TabbedDashboardComponent) will handle persisting to Dashboard User State
    this.UserStateChanged.emit(event.settings);
  }

  /**
   * Get the dashboard data to pass to the React component.
   * This is exposed as a public property that can be accessed by the template.
   */
  public get dashboardData(): any {
    if (!this.Config) {
      return null;
    }

    return {
      // Provide dashboard configuration
      dashboard: {
        id: this.Config.dashboard.ID,
        name: this.Config.dashboard.Name,
        description: this.Config.dashboard.Description,
        // Include any other relevant dashboard fields
      },

      // Provide user state (for restoring saved preferences/filters/etc)
      userState: this.Config.userState || {},

      // Provide application context if dashboard is scoped to an application
      applicationId: this.Config.dashboard.ApplicationID
    };
  }

  /**
   * Override SetVisible to notify the React component when visibility changes
   */
  public override SetVisible(visible: boolean): void {
    super.SetVisible(visible);

    // The React component can handle visibility changes if needed
    // This could trigger things like pausing/resuming polling, animations, etc.
  }

  /**
   * Override Refresh to reload the dashboard data
   */
  public override Refresh(): void {
    // Interactive Components manage their own refresh logic
    // We could emit a refresh event here if needed
    super.Refresh();
  }
}
