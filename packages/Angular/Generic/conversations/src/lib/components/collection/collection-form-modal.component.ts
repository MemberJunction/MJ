import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { UserInfo, Metadata } from '@memberjunction/core';
import { MJCollectionEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';
import { CollectionPermissionService } from '../../services/collection-permission.service';

/**
 * Modal for creating and editing collections
 */
@Component({
  standalone: false,
  selector: 'mj-collection-form-modal',
  template: `
    @if (isOpen) {
      <kendo-dialog
        [title]="collection?.ID ? 'Edit Collection' : 'New Collection'"
        (close)="onCancel()"
        [width]="500"
        [minWidth]="300">
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
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
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
      color: #333;
    }

    .required {
      color: #DC2626;
    }

    .form-control {
      width: 100%;
    }

    .parent-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
    }

    .parent-info i {
      color: #1e40af;
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
export class CollectionFormModalComponent implements OnChanges {
  @Input() isOpen: boolean = false;
  @Input() collection?: MJCollectionEntity;
  @Input() parentCollection?: MJCollectionEntity;
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  @Output() saved = new EventEmitter<MJCollectionEntity>();
  @Output() cancelled = new EventEmitter<void>();

  public formData = {
    name: '',
    description: ''
  };

  public isSaving: boolean = false;
  public errorMessage: string = '';

  constructor(
    private toastService: ToastService,
    private permissionService: CollectionPermissionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['collection'] || changes['isOpen']) {
      if (this.isOpen && this.collection) {
        this.formData.name = this.collection.Name || '';
        this.formData.description = this.collection.Description || '';
      } else if (this.isOpen && !this.collection) {
        this.formData = { name: '', description: '' };
      }
    }
  }

  get canSave(): boolean {
    return this.formData.name.trim().length > 0;
  }

  async onSave(): Promise<void> {
    if (!this.canSave) return;

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // Validate permissions before saving
      if (this.collection) {
        // Editing existing collection - need Edit permission
        if (this.collection.OwnerID && this.collection.OwnerID !== this.currentUser.ID) {
          const permission = await this.permissionService.checkPermission(
            this.collection.ID,
            this.currentUser.ID,
            this.currentUser
          );

          if (!permission?.canEdit) {
            this.errorMessage = 'You do not have Edit permission for this collection.';
            this.isSaving = false;
            return;
          }
        }
      } else if (this.parentCollection) {
        // Creating child collection - need Edit permission on parent
        if (this.parentCollection.OwnerID && this.parentCollection.OwnerID !== this.currentUser.ID) {
          const permission = await this.permissionService.checkPermission(
            this.parentCollection.ID,
            this.currentUser.ID,
            this.currentUser
          );

          if (!permission?.canEdit) {
            this.errorMessage = 'You do not have Edit permission for the parent collection.';
            this.isSaving = false;
            return;
          }
        }
      }

      const md = new Metadata();
      const collection = this.collection ||
        await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);

      collection.Name = this.formData.name.trim();
      collection.Description = this.formData.description.trim() || null;
      collection.EnvironmentID = this.environmentId;

      // Set owner and parent relationship if creating new collection
      if (!this.collection) {
        if (this.parentCollection) {
          // Child collection inherits parent's owner to maintain permission hierarchy
          collection.ParentID = this.parentCollection.ID;
          collection.OwnerID = this.parentCollection.OwnerID || this.currentUser.ID;
        } else {
          // Root collection - current user becomes owner
          collection.OwnerID = this.currentUser.ID;
        }
      } else if (this.parentCollection) {
        // Updating existing collection's parent
        collection.ParentID = this.parentCollection.ID;
      }

      const saved = await collection.Save();
      if (saved) {
        // If creating new collection, set up permissions
        if (!this.collection) {
          if (this.parentCollection) {
            // Child collection - copy all permissions from parent (including owner)
            await this.permissionService.copyParentPermissions(
              this.parentCollection.ID,
              collection.ID,
              this.currentUser
            );
          } else {
            // Root collection - create owner permission for current user
            await this.permissionService.createOwnerPermission(
              collection.ID,
              this.currentUser.ID,
              this.currentUser
            );
          }
        }

        this.toastService.success(
          this.collection ? 'Collection updated successfully' : 'Collection created successfully'
        );
        this.saved.emit(collection);
        this.resetForm();
      } else {
        this.errorMessage = collection.LatestResult?.Message || 'Failed to save collection';
        this.toastService.error(this.errorMessage);
      }
    } catch (error) {
      console.error('Error saving collection:', error);
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
      description: ''
    };
    this.errorMessage = '';
  }
}
