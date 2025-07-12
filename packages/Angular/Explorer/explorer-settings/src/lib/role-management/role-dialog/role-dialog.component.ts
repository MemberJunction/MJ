import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { RoleEntity } from '@memberjunction/core-entities';
import { WindowModule } from '@progress/kendo-angular-dialog';

export interface RoleDialogData {
  role?: RoleEntity;
  mode: 'create' | 'edit';
}

export interface RoleDialogResult {
  action: 'save' | 'cancel';
  role?: RoleEntity;
}

@Component({
  selector: 'mj-role-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WindowModule],
  template: `
    <kendo-window
      *ngIf="visible"
      [title]="windowTitle"
      [width]="700"
      [height]="500"
      [resizable]="false"
      [draggable]="true"
      [keepContent]="true"
      (close)="onCancel()"
      kendoWindowContainer>
      
      <kendo-window-titlebar>
        <div class="mj-modal-title">
          <i class="fa-solid fa-shield-halved"></i>
          {{ isEditMode ? 'Edit Role' : 'Create New Role' }}
        </div>
      </kendo-window-titlebar>

        <form [formGroup]="roleForm" (ngSubmit)="onSubmit()">
          <div class="mj-modal-body">
            @if (error) {
              <div class="mj-alert mj-alert-error">
                <i class="fa-solid fa-exclamation-triangle"></i>
                {{ error }}
              </div>
            }

            <div class="mj-form-grid">
              <!-- Basic Information -->
              <div class="mj-form-section">
                <h4 class="mj-section-title">Role Information</h4>
                
                <div class="mj-form-field">
                  <label class="mj-field-label" for="name">Role Name *</label>
                  <input 
                    id="name"
                    type="text" 
                    class="mj-input" 
                    formControlName="name"
                    placeholder="Sales Manager"
                    [class.mj-input-error]="roleForm.get('name')?.invalid && roleForm.get('name')?.touched"
                  />
                  @if (roleForm.get('name')?.invalid && roleForm.get('name')?.touched) {
                    <div class="mj-field-error">
                      @if (roleForm.get('name')?.errors?.['required']) {
                        Role name is required
                      }
                      @if (roleForm.get('name')?.errors?.['maxlength']) {
                        Role name cannot exceed 50 characters
                      }
                    </div>
                  }
                </div>

                <div class="mj-form-field">
                  <label class="mj-field-label" for="description">Description</label>
                  <textarea 
                    id="description"
                    class="mj-textarea" 
                    formControlName="description"
                    placeholder="Describe the role's purpose and responsibilities..."
                    rows="4"
                  ></textarea>
                  <div class="mj-field-hint">
                    Provide a clear description of what this role is for and what permissions it should have.
                  </div>
                </div>

                @if (isEditMode) {
                  <div class="mj-form-field">
                    <label class="mj-field-label" for="directoryId">Directory ID</label>
                    <input 
                      id="directoryId"
                      type="text" 
                      class="mj-input" 
                      formControlName="directoryId"
                      placeholder="External directory identifier"
                    />
                    <div class="mj-field-hint">
                      External directory identifier for syncing with Active Directory or other systems.
                    </div>
                  </div>
                }
              </div>

              <!-- Role Type Info -->
              <div class="mj-form-section">
                <h4 class="mj-section-title">Role Type</h4>
                <div class="mj-role-type-info">
                  @if (isSystemRole) {
                    <div class="mj-alert mj-alert-warning">
                      <i class="fa-solid fa-shield-halved"></i>
                      <div>
                        <strong>System Role</strong>
                        <p>This is a system-defined role. Some properties may be limited for editing to maintain system integrity.</p>
                      </div>
                    </div>
                  } @else {
                    <div class="mj-alert mj-alert-info">
                      <i class="fa-solid fa-user-tag"></i>
                      <div>
                        <strong>Custom Role</strong>
                        <p>This is a custom role that can be fully configured and modified.</p>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Permissions Preview -->
              @if (isEditMode) {
                <div class="mj-form-section">
                  <h4 class="mj-section-title">Permissions</h4>
                  <div class="mj-permissions-preview">
                    <div class="mj-alert mj-alert-info">
                      <i class="fa-solid fa-info-circle"></i>
                      <div>
                        <strong>Permission Management</strong>
                        <p>Role permissions can be managed in the <strong>Permissions</strong> tab of the settings dashboard.</p>
                      </div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="mj-modal-footer">
            <button type="button" class="mj-btn mj-btn-secondary" (click)="onCancel()">
              <i class="fa-solid fa-times"></i>
              Cancel
            </button>
            <button 
              type="submit" 
              class="mj-btn mj-btn-primary" 
              [disabled]="roleForm.invalid || isLoading"
            >
              @if (isLoading) {
                <i class="fa-solid fa-spinner fa-spin"></i>
                Saving...
              } @else {
                <i class="fa-solid fa-save"></i>
                {{ isEditMode ? 'Update Role' : 'Create Role' }}
              }
            </button>
          </div>
        </form>
    </kendo-window>
  `,
  styleUrls: ['./role-dialog.component.scss']
})
export class RoleDialogComponent implements OnInit, OnDestroy {
  @Input() data: RoleDialogData | null = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<RoleDialogResult>();

  private fb = inject(FormBuilder);
  private metadata = new Metadata();

  public roleForm: FormGroup;
  public isLoading = false;
  public error: string | null = null;

  constructor() {
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      description: [''],
      directoryId: ['']
    });
  }

  ngOnInit(): void {
    if (this.data?.role && this.isEditMode) {
      this.loadRoleData();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.visible) {
      this.onCancel();
    }
  }

  public get windowTitle(): string {
    return this.isEditMode ? 'Edit Role' : 'Create New Role';
  }

  public get isEditMode(): boolean {
    return this.data?.mode === 'edit';
  }

  public get isSystemRole(): boolean {
    if (!this.data?.role) return false;
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(this.data.role.Name || '');
  }

  private loadRoleData(): void {
    if (!this.data?.role) return;

    const role = this.data.role;
    this.roleForm.patchValue({
      name: role.Name,
      description: role.Description,
      directoryId: role.DirectoryID
    });

    // Disable name editing for system roles
    if (this.isSystemRole) {
      this.roleForm.get('name')?.disable();
    }
  }

  public async onSubmit(): Promise<void> {
    if (this.roleForm.invalid) {
      this.markFormGroupTouched(this.roleForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let role: RoleEntity;

      if (this.isEditMode && this.data?.role) {
        // Edit existing role
        role = this.data.role;
      } else {
        // Create new role
        role = await this.metadata.GetEntityObject<RoleEntity>('Roles');
        role.NewRecord();
      }

      // Update role properties
      const formValue = this.roleForm.value;
      
      // Only update name if not a system role
      if (!this.isSystemRole) {
        role.Name = formValue.name;
      }
      
      role.Description = formValue.description;
      role.DirectoryID = formValue.directoryId || null;

      // Save role
      const saveResult = await role.Save();
      if (!saveResult) {
        throw new Error(role.LatestResult?.Message || 'Failed to save role');
      }

      this.result.emit({ action: 'save', role });

    } catch (error: any) {
      console.error('Error saving role:', error);
      this.error = error.message || 'An unexpected error occurred';
    } finally {
      this.isLoading = false;
    }
  }

  public onCancel(): void {
    this.result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}