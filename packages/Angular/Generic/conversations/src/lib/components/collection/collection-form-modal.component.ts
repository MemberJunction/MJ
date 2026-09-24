import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, Metadata } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { CollectionPermissionService } from '../../services/collection-permission.service';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Modal for creating and editing collections
 */
@Component({
  standalone: false,
  selector: 'mj-collection-form-modal',
  template: `
    @if (isOpen) {
      <mj-dialog
        [Title]="collection?.ID ? 'Edit Collection' : 'New Collection'"
        (Close)="onCancel()"
        [Width]="500"
        [MinWidth]="300"
        [Visible]="true">
        <div class="collection-form">
          <div class="form-group">
            <label class="form-label">
              Name <span class="required">*</span>
            </label>
            <input
              type="text"
              class="k-textbox form-control"
              [(ngModel)]="formData.name"
              placeholder="Collection name"
              #nameInput
              (keydown.enter)="onSave()">
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea
              class="k-textarea form-control"
              [(ngModel)]="formData.description"
              placeholder="Optional description"
              rows="3">
            </textarea>
          </div>
          @if (parentCollection) {
            <div class="form-group">
              <label class="form-label">Parent Collection</label>
              <div class="parent-info">
                <i class="fas fa-folder"></i>
                <span>{{ parentCollection.Name }}</span>
              </div>
            </div>
          }
          @if (errorMessage) {
            <mj-alert Variant="error">{{ errorMessage }}</mj-alert>
          }
        </div>
        <mj-dialog-actions>
          <button mjButton (click)="onCancel()" [disabled]="isSaving">
            Cancel
          </button>
          <button mjButton
            variant="primary"
            (click)="onSave()"
            [disabled]="!canSave || isSaving">
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </mj-dialog-actions>
      </mj-dialog>
    }
    `,
  styles: [`
    .collection-form {
      padding: 20px 0;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--mj-text-primary);
    }

    .required {
      color: var(--mj-status-error);
    }

    .form-control {
      width: 100%;
    }

    .parent-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      color: var(--mj-text-muted);
    }

    .parent-info i {
      color: var(--mj-brand-primary);
    }
  `]
})
export class CollectionFormModalComponent extends BaseAngularComponent implements OnChanges  {
  @Input() IsOpen: boolean = false;

  /** @deprecated Use {@link IsOpen}. */
  @Input() set isOpen(value: boolean) {
    this.IsOpen = value;
  }
  /** @deprecated Use {@link IsOpen}. */
  get isOpen(): boolean {
    return this.IsOpen;
  }
  @Input() Collection?: MJCollectionEntity;

  /** @deprecated Use {@link Collection}. */
  @Input() set collection(value: MJCollectionEntity | undefined) {
    this.Collection = value;
  }
  /** @deprecated Use {@link Collection}. */
  get collection(): MJCollectionEntity | undefined {
    return this.Collection;
  }
  @Input() ParentCollection?: MJCollectionEntity;

  /** @deprecated Use {@link ParentCollection}. */
  @Input() set parentCollection(value: MJCollectionEntity | undefined) {
    this.ParentCollection = value;
  }
  /** @deprecated Use {@link ParentCollection}. */
  get parentCollection(): MJCollectionEntity | undefined {
    return this.ParentCollection;
  }
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  @Output() Saved = new EventEmitter<MJCollectionEntity>();

  /**
   * @deprecated Use {@link Saved}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (saved) keeps working. Must stay AFTER Saved: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() saved = this.Saved;
  @Output() cancelled = new EventEmitter<void>();

  public FormData = {
    name: '',
    description: ''
  };

  /** @deprecated Use {@link FormData}. */
  public get formData() {
    return this.FormData;
  }
  /** @deprecated Use {@link FormData}. */
  public set formData(value) {
    this.FormData = value;
  }

  public IsSaving: boolean = false;

  /** @deprecated Use {@link IsSaving}. */
  public get isSaving(): boolean {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  public set isSaving(value: boolean) {
    this.IsSaving = value;
  }
  public errorMessage: string = '';

  constructor(
    private toastService: ToastService,
    private permissionService: CollectionPermissionService
  ) {
  super();}

  ngOnChanges(changes: SimpleChanges) {
    // Bind provider-aware service to this component's provider on every input change pass.
    this.permissionService.Provider = this.ProviderToUse;

    if (changes['collection'] || changes['isOpen']) {
      if (this.IsOpen && this.Collection) {
        this.FormData.name = this.Collection.Name || '';
        this.FormData.description = this.Collection.Description || '';
      } else if (this.IsOpen && !this.Collection) {
        this.FormData = { name: '', description: '' };
      }
    }
  }

  get CanSave(): boolean {
    return this.FormData.name.trim().length > 0;
  }

  /** @deprecated Use {@link CanSave}. */
  get canSave(): boolean {
    return this.CanSave;
  }

  async OnSave(): Promise<void> {
    if (!this.CanSave) return;

    this.IsSaving = true;
    this.errorMessage = '';

    try {
      // Validate permissions before saving
      if (this.Collection) {
        // Editing existing collection - need Edit permission
        if (this.Collection.OwnerID && !UUIDsEqual(this.Collection.OwnerID, this.CurrentUser.ID)) {
          const permission = await this.permissionService.checkPermission(
            this.Collection.ID,
            this.CurrentUser.ID,
            this.CurrentUser
          );

          if (!permission?.canEdit) {
            this.errorMessage = 'You do not have Edit permission for this collection.';
            this.IsSaving = false;
            return;
          }
        }
      } else if (this.ParentCollection) {
        // Creating child collection - need Edit permission on parent
        if (this.ParentCollection.OwnerID && !UUIDsEqual(this.ParentCollection.OwnerID, this.CurrentUser.ID)) {
          const permission = await this.permissionService.checkPermission(
            this.ParentCollection.ID,
            this.CurrentUser.ID,
            this.CurrentUser
          );

          if (!permission?.canEdit) {
            this.errorMessage = 'You do not have Edit permission for the parent collection.';
            this.IsSaving = false;
            return;
          }
        }
      }

      const md = this.ProviderToUse;
      const collection = this.Collection ||
        await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.CurrentUser);

      collection.Name = this.FormData.name.trim();
      collection.Description = this.FormData.description.trim() || null;
      collection.EnvironmentID = this.EnvironmentId;

      // Set owner and parent relationship if creating new collection
      if (!this.Collection) {
        if (this.ParentCollection) {
          // Child collection inherits parent's owner to maintain permission hierarchy
          collection.ParentID = this.ParentCollection.ID;
          collection.OwnerID = this.ParentCollection.OwnerID || this.CurrentUser.ID;
        } else {
          // Root collection - current user becomes owner
          collection.OwnerID = this.CurrentUser.ID;
        }
      } else if (this.ParentCollection) {
        // Updating existing collection's parent
        collection.ParentID = this.ParentCollection.ID;
      }

      const saved = await collection.Save();
      if (saved) {
        // If creating new collection, set up permissions
        if (!this.Collection) {
          if (this.ParentCollection) {
            // Child collection - copy non-owner permissions from parent.
            // (The owner gets implicit full access via OwnerID; no self-share row is written.)
            await this.permissionService.copyParentPermissions(
              this.ParentCollection.ID,
              collection.ID,
              this.CurrentUser
            );
          }
          // Root collection: nothing to do. CollectionPermissionProvider treats OwnerID as
          // an implicit full-access grant — writing a self-share row was redundant and was
          // failing server-side auth on freshly-created collections.
        }

        this.toastService.success(
          this.Collection ? 'Collection updated successfully' : 'Collection created successfully'
        );
        this.Saved.emit(collection);
        this.resetForm();
      } else {
        this.errorMessage = collection.LatestResult?.CompleteMessage || 'Failed to save collection';
        this.toastService.error(this.errorMessage);
      }
    } catch (error) {
      console.error('Error saving collection:', error);
      this.errorMessage = 'An unexpected error occurred';
      this.toastService.error(this.errorMessage);
    } finally {
      this.IsSaving = false;
    }
  }

  /** @deprecated Use {@link OnSave}. */
  async onSave(): Promise<void> {
    return this.OnSave();
  }

  onCancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }

  private resetForm(): void {
    this.FormData = {
      name: '',
      description: ''
    };
    this.errorMessage = '';
  }
}
