import {
  Component,
  ElementRef,
  ChangeDetectorRef,
  ViewChild,
  AfterViewInit,
  Input
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BaseFormComponent } from './base-form-component';
import { SharedService } from '@memberjunction/ng-shared';
import { ComponentSpec } from '@memberjunction/interactivecomponents';
import { LogError } from '@memberjunction/core';

/**
 * Form component that renders Interactive Components for entity forms.
 * This component extends BaseFormComponent and uses the MJReactComponent
 * wrapper to render React-based form implementations.
 */
@Component({
  selector: 'mj-interactive-form',
  template: `
    <div class="interactive-form-container" #formContainer>
      @if (componentSpec) {
        <mj-react-component
          [component]="componentSpec"
          [enableLogging]="false"
          (componentEvent)="onComponentEvent($event)"
          (openEntityRecord)="onOpenEntityRecord($event)">
        </mj-react-component>
      }
      @if (!componentSpec && !loading) {
        <div class="error-message">
          <i class="fa-solid fa-exclamation-triangle"></i>
          <p>No component specification provided for this form.</p>
        </div>
      }
      @if (loading) {
        <div class="loading-message">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <p>Loading form...</p>
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
    .interactive-form-container {
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
export class InteractiveFormComponent extends BaseFormComponent implements AfterViewInit {
  /**
   * The component specification for the Interactive Component to render
   */
  @Input() componentSpec!: ComponentSpec;

  @ViewChild('formContainer') formContainer!: ElementRef;

  public loading: boolean = true;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  async ngAfterViewInit() {
    super.ngAfterViewInit();

    // Validate that we have required inputs
    if (!this.componentSpec) {
      LogError('InteractiveFormComponent: No componentSpec provided');
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    if (!this.record) {
      LogError('InteractiveFormComponent: No record provided');
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    // The MJReactComponent will handle loading the component
    // We just need to provide the spec
    this.loading = false;
    this.cdr.detectChanges();
  }

  /**
   * Handle events emitted from the React component
   */
  public onComponentEvent(event: any): void {
    if (!event || !event.type) {
      return;
    }

    switch (event.type) {
      case 'save':
        this.handleSaveEvent(event.payload);
        break;

      case 'cancel':
        this.handleCancelEvent();
        break;

      case 'delete':
        this.handleDeleteEvent();
        break;

      case 'editModeChanged':
        this.handleEditModeChanged(event.payload);
        break;

      case 'error':
        this.handleErrorEvent(event.payload);
        break;

      default:
        // Pass through other events
        console.log('InteractiveFormComponent: Unhandled event type:', event.type, event.payload);
    }
  }

  /**
   * Handle save event from the React component
   */
  private async handleSaveEvent(payload: any): Promise<void> {
    if (!this.record) {
      return;
    }

    try {
      // If the payload contains field updates, apply them to the record
      if (payload && typeof payload === 'object') {
        const fieldsToUpdate = payload.fields || payload;
        for (const [fieldName, value] of Object.entries(fieldsToUpdate)) {
          if (this.record.Fields.find(f => f.Name === fieldName)) {
            this.record.Set(fieldName, value);
          }
        }
      }

      // Save the record
      const saveResult = await this.record.Save();

      if (saveResult) {
        // Notify that save was successful
        this.sharedService.CreateSimpleNotification(
          `${this.record.EntityInfo.Name} saved successfully`,
          'success',
          3000
        );

        // Exit edit mode
        this.EndEditMode();
      } else {
        // Show error message
        const errorMsg = this.record.LatestResult?.ErrorMessage || 'Failed to save record';
        this.sharedService.CreateSimpleNotification(errorMsg, 'error', 5000);

        LogError('InteractiveFormComponent: Save failed', null, this.record.LatestResult?.Errors);
      }
    } catch (error) {
      LogError('InteractiveFormComponent: Error during save', null, error);
      this.sharedService.CreateSimpleNotification(
        'An error occurred while saving',
        'error',
        5000
      );
    }
  }

  /**
   * Handle cancel event from the React component
   */
  private handleCancelEvent(): void {
    if (!this.record) {
      return;
    }

    // Reset record to last saved state
    this.record.Reset();

    // Exit edit mode
    this.EndEditMode();

    // Notify user
    this.sharedService.CreateSimpleNotification(
      'Changes cancelled',
      'info',
      2000
    );
  }

  /**
   * Handle delete event from the React component
   */
  private async handleDeleteEvent(): Promise<void> {
    if (!this.record) {
      return;
    }

    // Show delete confirmation dialog
    this.showDeleteDialog = true;

    // The BaseFormComponent handles the actual delete logic
    // through its delete confirmation dialog
  }

  /**
   * Handle edit mode change event from the React component
   */
  private handleEditModeChanged(payload: any): void {
    const newEditMode = payload?.editMode;

    if (typeof newEditMode === 'boolean') {
      if (newEditMode) {
        this.StartEditMode();
      } else {
        this.EndEditMode();
      }
    }
  }

  /**
   * Handle error event from the React component
   */
  private handleErrorEvent(payload: any): void {
    const errorMessage = payload?.error || payload?.message || 'An error occurred in the form component';

    LogError('InteractiveFormComponent: Error from React component', null, payload);

    this.sharedService.CreateSimpleNotification(
      errorMessage,
      'error',
      5000
    );
  }

  /**
   * Handle navigation to another entity record
   */
  public onOpenEntityRecord(event: { entityName: string; key: any }): void {
    if (!event || !event.entityName || !event.key) {
      return;
    }

    // Use SharedService to open the entity record
    SharedService.Instance.OpenEntityRecord(event.entityName, event.key);
  }

  /**
   * Get the form data to pass to the React component.
   * This is exposed as a public property that can be accessed by the template.
   */
  public get formData(): any {
    if (!this.record) {
      return null;
    }

    return {
      // Provide the full record data
      record: this.record.GetAll(),

      // Provide metadata about the entity
      metadata: {
        entityName: this.record.EntityInfo.Name,
        entityID: this.record.EntityInfo.ID,
        fields: this.record.EntityInfo.Fields.map(f => ({
          name: f.Name,
          displayName: f.DisplayName,
          description: f.Description,
          type: f.Type,
          isRequired: f.AllowsNull === false,
          isPrimaryKey: f.IsPrimaryKey,
          isUnique: f.IsUnique,
          defaultValue: f.DefaultValue,
          relatedEntityID: f.RelatedEntityID,
          relatedEntityNameField: f.RelatedEntityNameFieldMap
        }))
      },

      // Provide edit mode and permissions
      editMode: this.EditMode,
      userPermissions: this.userPermissions,

      // Provide the primary key
      primaryKey: this.record.PrimaryKey.ToString()
    };
  }
}
