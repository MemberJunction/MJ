import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { MJArtifactEntity, MJArtifactTypeEntity, MJArtifactVersionEntity, MJCollectionEntity } from '@memberjunction/core-entities';
import { ToastService } from '../../services/toast.service';
import { CollectionPermissionService } from '../../services/collection-permission.service';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Modal for creating new artifacts and adding them to collections
 */
@Component({
  standalone: false,
  selector: 'mj-artifact-create-modal',
  template: `
    @if (isOpen) {
      <kendo-dialog
        title="Create Artifact"
        (close)="onCancel()"
        [width]="600"
        [minWidth]="400">
        <div class="artifact-form">
          <div class="form-group">
            <label class="form-label">
              Name <span class="required">*</span>
            </label>
            <input
              type="text"
              class="k-textbox form-control"
              [(ngModel)]="formData.name"
              placeholder="Artifact name"
              #nameInput>
          </div>
          <div class="form-group">
            <label class="form-label">
              Type <span class="required">*</span>
            </label>
            <kendo-dropdownlist
              [data]="artifactTypes"
              [(ngModel)]="formData.selectedType"
              textField="Name"
              valueField="ID"
              [valuePrimitive]="false"
              class="form-control"
              [loading]="isLoadingTypes">
            </kendo-dropdownlist>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea
              class="k-textarea form-control"
              [(ngModel)]="formData.description"
              placeholder="Optional description"
              rows="2">
            </textarea>
          </div>
          <div class="form-group">
            <label class="form-label">
              Content <span class="required">*</span>
            </label>
            <textarea
              class="k-textarea form-control content-area"
              [(ngModel)]="formData.content"
              placeholder="Paste your content here..."
              rows="12">
            </textarea>
            <div class="content-hint">
              <i class="fas fa-info-circle"></i>
              Paste or type the artifact content. The content will be saved as version 1.
            </div>
          </div>
          @if (errorMessage) {
            <div class="form-error">
              <i class="fas fa-exclamation-circle"></i>
              {{ errorMessage }}
            </div>
          }
        </div>
        <kendo-dialog-actions>
          <button kendoButton (click)="onCancel()" [disabled]="isSaving">
            Cancel
          </button>
          <button kendoButton
            [primary]="true"
            (click)="onSave()"
            [disabled]="!canSave || isSaving">
            {{ isSaving ? 'Creating...' : 'Create Artifact' }}
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
    }
    `,
  styles: [`
    .artifact-form {
      padding: 20px 0;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #333;
    }

    .required {
      color: #DC2626;
    }

    .form-control {
      width: 100%;
    }

    .content-area {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .content-hint {
      display: flex;
      align-items: start;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 12px;
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-radius: 6px;
      font-size: 13px;
      color: #1e40af;
    }

    .content-hint i {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .form-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #FEE2E2;
      border: 1px solid #FCA5A5;
      border-radius: 6px;
      color: #DC2626;
      font-size: 14px;
    }

    .form-error i {
      flex-shrink: 0;
    }
  `]
})
export class ArtifactCreateModalComponent implements OnChanges {
  @Input() isOpen: boolean = false;
  @Input() collectionId!: string;
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  @Output() saved = new EventEmitter<MJArtifactEntity>();
  @Output() cancelled = new EventEmitter<void>();

  public formData = {
    name: '',
    description: '',
    content: '',
    selectedType: null as MJArtifactTypeEntity | null
  };

  public artifactTypes: MJArtifactTypeEntity[] = [];
  public isLoadingTypes: boolean = false;
  public isSaving: boolean = false;
  public errorMessage: string = '';

  constructor(
    private toastService: ToastService,
    private permissionService: CollectionPermissionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen'] && this.isOpen) {
      this.resetForm();
      this.loadArtifactTypes();
    }
  }

  get canSave(): boolean {
    return this.formData.name.trim().length > 0 &&
           this.formData.content.trim().length > 0 &&
           this.formData.selectedType !== null;
  }

  private async loadArtifactTypes(): Promise<void> {
    this.isLoadingTypes = true;
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJArtifactTypeEntity>(
        {
          EntityName: 'MJ: Artifact Types',
          ExtraFilter: 'IsEnabled=1',
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success && result.Results) {
        this.artifactTypes = result.Results;
        // Default to "Text" or first type
        const textType = this.artifactTypes.find(t => t.Name === 'Text' || t.Name === 'Markdown');
        if (textType) {
          this.formData.selectedType = textType;
        } else if (this.artifactTypes.length > 0) {
          this.formData.selectedType = this.artifactTypes[0];
        }
      }
    } catch (error) {
      console.error('Error loading artifact types:', error);
      this.toastService.error('Failed to load artifact types');
    } finally {
      this.isLoadingTypes = false;
      this.cdr.detectChanges(); // zone.js 0.15: async RunView doesn't trigger CD
    }
  }

  async onSave(): Promise<void> {
    if (!this.canSave) return;

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // Validate permission to add artifacts to collection
      const md = new Metadata();
      const collection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
      await collection.Load(this.collectionId);

      // Check if user has Edit permission on collection
      if (collection.OwnerID && !UUIDsEqual(collection.OwnerID, this.currentUser.ID)) {
        const permission = await this.permissionService.checkPermission(
          this.collectionId,
          this.currentUser.ID,
          this.currentUser
        );

        if (!permission?.canEdit) {
          this.errorMessage = 'You do not have Edit permission to add artifacts to this collection.';
          this.isSaving = false;
          return;
        }
      }

      // Step 1: Create the artifact
      const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.currentUser);
      artifact.Name = this.formData.name.trim();
      artifact.Description = this.formData.description.trim() || null;
      artifact.TypeID = this.formData.selectedType!.ID;
      artifact.EnvironmentID = this.environmentId;
      artifact.UserID = this.currentUser.ID;

      const artifactSaved = await artifact.Save();
      if (!artifactSaved) {
        this.errorMessage = artifact.LatestResult?.Message || 'Failed to create artifact';
        this.toastService.error(this.errorMessage);
        return;
      }

      // Step 2: Create the first version
      const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.currentUser);
      version.ArtifactID = artifact.ID;
      version.VersionNumber = 1;
      version.Content = this.formData.content.trim();
      version.UserID = this.currentUser.ID;
      version.Name = this.formData.name.trim(); // Version inherits name
      version.Description = this.formData.description.trim() || null;

      const versionSaved = await version.Save();
      if (!versionSaved) {
        // Rollback: delete the artifact if version creation fails
        await artifact.Delete();
        this.errorMessage = version.LatestResult?.Message || 'Failed to create artifact version';
        this.toastService.error(this.errorMessage);
        return;
      }

      // Step 3: Add to collection
      const collectionArtifact = await md.GetEntityObject('MJ: Collection Artifacts', this.currentUser);
      (collectionArtifact as any).CollectionID = this.collectionId;
      (collectionArtifact as any).ArtifactVersionID = version.ID;

      const collectionLinkSaved = await collectionArtifact.Save();
      if (!collectionLinkSaved) {
        // Rollback: delete version and artifact if collection link fails
        await version.Delete();
        await artifact.Delete();
        this.errorMessage = 'Failed to add artifact to collection';
        this.toastService.error(this.errorMessage);
        return;
      }

      this.toastService.success('Artifact created successfully');
      this.saved.emit(artifact);
      this.resetForm();
    } catch (error) {
      console.error('Error creating artifact:', error);
      this.errorMessage = 'An unexpected error occurred';
      this.toastService.error(this.errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  onCancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }

  private resetForm(): void {
    this.formData = {
      name: '',
      description: '',
      content: '',
      selectedType: this.artifactTypes.length > 0 ? this.artifactTypes[0] : null
    };
    this.errorMessage = '';
  }
}
