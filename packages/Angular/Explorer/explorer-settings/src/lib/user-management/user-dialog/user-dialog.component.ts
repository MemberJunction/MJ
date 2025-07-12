import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { UserEntity, RoleEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { WindowModule } from '@progress/kendo-angular-dialog';

export interface UserDialogData {
  user?: UserEntity;
  mode: 'create' | 'edit';
  availableRoles: RoleEntity[];
}

export interface UserDialogResult {
  action: 'save' | 'cancel';
  user?: UserEntity;
}

@Component({
  selector: 'mj-user-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WindowModule],
  template: `
    <kendo-window
      *ngIf="visible"
      [title]="windowTitle"
      [width]="800"
      [height]="600"
      [resizable]="false"
      [draggable]="true"
      [keepContent]="true"
      (close)="onCancel()"
      kendoWindowContainer>
      
      <kendo-window-titlebar>
        <div class="mj-modal-title">
          <i class="fa-solid fa-user"></i>
          {{ isEditMode ? 'Edit User' : 'Create New User' }}
        </div>
      </kendo-window-titlebar>

        <form [formGroup]="userForm" (ngSubmit)="onSubmit()">
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
                <h4 class="mj-section-title">Basic Information</h4>
                
                <div class="mj-form-field">
                  <label class="mj-field-label" for="name">Username/Email *</label>
                  <input 
                    id="name"
                    type="email" 
                    class="mj-input" 
                    formControlName="name"
                    placeholder="john@company.com"
                    [class.mj-input-error]="userForm.get('name')?.invalid && userForm.get('name')?.touched"
                  />
                  @if (userForm.get('name')?.invalid && userForm.get('name')?.touched) {
                    <div class="mj-field-error">
                      @if (userForm.get('name')?.errors?.['required']) {
                        Username/Email is required
                      }
                      @if (userForm.get('name')?.errors?.['email']) {
                        Please enter a valid email address
                      }
                    </div>
                  }
                </div>

                <div class="mj-form-row">
                  <div class="mj-form-field">
                    <label class="mj-field-label" for="firstName">First Name</label>
                    <input 
                      id="firstName"
                      type="text" 
                      class="mj-input" 
                      formControlName="firstName"
                      placeholder="John"
                    />
                  </div>
                  
                  <div class="mj-form-field">
                    <label class="mj-field-label" for="lastName">Last Name</label>
                    <input 
                      id="lastName"
                      type="text" 
                      class="mj-input" 
                      formControlName="lastName"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div class="mj-form-field">
                  <label class="mj-field-label" for="email">Email Address *</label>
                  <input 
                    id="email"
                    type="email" 
                    class="mj-input" 
                    formControlName="email"
                    placeholder="john@company.com"
                    [class.mj-input-error]="userForm.get('email')?.invalid && userForm.get('email')?.touched"
                  />
                  @if (userForm.get('email')?.invalid && userForm.get('email')?.touched) {
                    <div class="mj-field-error">
                      @if (userForm.get('email')?.errors?.['required']) {
                        Email address is required
                      }
                      @if (userForm.get('email')?.errors?.['email']) {
                        Please enter a valid email address
                      }
                    </div>
                  }
                </div>

                <div class="mj-form-field">
                  <label class="mj-field-label" for="title">Title</label>
                  <input 
                    id="title"
                    type="text" 
                    class="mj-input" 
                    formControlName="title"
                    placeholder="Software Engineer"
                  />
                </div>
              </div>

              <!-- User Type & Status -->
              <div class="mj-form-section">
                <h4 class="mj-section-title">User Settings</h4>
                
                <div class="mj-form-row">
                  <div class="mj-form-field">
                    <label class="mj-field-label" for="type">User Type</label>
                    <select id="type" class="mj-select" formControlName="type">
                      <option value="User">User</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>
                  
                  <div class="mj-form-field">
                    <div class="mj-checkbox-field">
                      <input 
                        id="isActive"
                        type="checkbox" 
                        class="mj-checkbox" 
                        formControlName="isActive"
                      />
                      <label class="mj-checkbox-label" for="isActive">
                        <span class="mj-checkbox-custom"></span>
                        Active User
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Role Assignment -->
              <div class="mj-form-section">
                <h4 class="mj-section-title">Role Assignment</h4>
                <p class="mj-section-description">Select the roles to assign to this user</p>
                
                <div class="mj-roles-grid">
                  @for (role of data?.availableRoles; track role.ID) {
                    <div class="mj-role-item">
                      <div class="mj-checkbox-field">
                        <input 
                          type="checkbox" 
                          class="mj-checkbox" 
                          [id]="'role-' + role.ID"
                          [checked]="selectedRoleIds.has(role.ID)"
                          (change)="onRoleToggle(role.ID, $event)"
                        />
                        <label class="mj-checkbox-label" [for]="'role-' + role.ID">
                          <span class="mj-checkbox-custom"></span>
                          <div class="mj-role-info">
                            <span class="mj-role-name">{{ role.Name }}</span>
                            @if (role.Description) {
                              <span class="mj-role-description">{{ role.Description }}</span>
                            }
                          </div>
                        </label>
                      </div>
                    </div>
                  }
                </div>
              </div>
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
              [disabled]="userForm.invalid || isLoading"
            >
              @if (isLoading) {
                <i class="fa-solid fa-spinner fa-spin"></i>
                Saving...
              } @else {
                <i class="fa-solid fa-save"></i>
                {{ isEditMode ? 'Update User' : 'Create User' }}
              }
            </button>
          </div>
        </form>
    </kendo-window>
  `,
  styleUrls: ['./user-dialog.component.scss']
})
export class UserDialogComponent implements OnInit, OnDestroy {
  @Input() data: UserDialogData | null = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<UserDialogResult>();

  private fb = inject(FormBuilder);
  private metadata = new Metadata();

  public userForm: FormGroup;
  public isLoading = false;
  public error: string | null = null;
  public selectedRoleIds = new Set<string>();
  public existingUserRoles: UserRoleEntity[] = [];

  constructor() {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.email]],
      firstName: [''],
      lastName: [''],
      email: ['', [Validators.required, Validators.email]],
      title: [''],
      type: ['User', Validators.required],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    if (this.data?.user && this.isEditMode) {
      this.loadUserData();
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
    return this.isEditMode ? 'Edit User' : 'Create New User';
  }

  public get isEditMode(): boolean {
    return this.data?.mode === 'edit';
  }

  private async loadUserData(): Promise<void> {
    if (!this.data?.user) return;

    const user = this.data.user;
    this.userForm.patchValue({
      name: user.Name,
      firstName: user.FirstName,
      lastName: user.LastName,
      email: user.Email,
      title: user.Title,
      type: user.Type,
      isActive: user.IsActive
    });

    // Load existing user roles
    await this.loadExistingUserRoles(user.ID);
  }

  private async loadExistingUserRoles(userId: string): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<UserRoleEntity>({
        EntityName: 'User Roles',
        ExtraFilter: `UserID='${userId}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.existingUserRoles = result.Results;
        // Pre-select existing roles
        for (const userRole of this.existingUserRoles) {
          this.selectedRoleIds.add(userRole.RoleID);
        }
      }
    } catch (error) {
      console.warn('Failed to load existing user roles:', error);
    }
  }

  public onRoleToggle(roleId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.selectedRoleIds.add(roleId);
    } else {
      this.selectedRoleIds.delete(roleId);
    }
  }

  public async onSubmit(): Promise<void> {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let user: UserEntity;

      if (this.isEditMode && this.data?.user) {
        // Edit existing user
        user = this.data.user;
      } else {
        // Create new user
        user = await this.metadata.GetEntityObject<UserEntity>('Users');
        user.NewRecord();
      }

      // Update user properties
      const formValue = this.userForm.value;
      user.Name = formValue.name;
      user.FirstName = formValue.firstName;
      user.LastName = formValue.lastName;
      user.Email = formValue.email;
      user.Title = formValue.title;
      user.Type = formValue.type;
      user.IsActive = formValue.isActive;

      // Save user
      const saveResult = await user.Save();
      if (!saveResult) {
        throw new Error(user.LatestResult?.Message || 'Failed to save user');
      }

      // Handle role assignments
      await this.updateUserRoles(user.ID);

      this.result.emit({ action: 'save', user });

    } catch (error: any) {
      console.error('Error saving user:', error);
      this.error = error.message || 'An unexpected error occurred';
    } finally {
      this.isLoading = false;
    }
  }

  private async updateUserRoles(userId: string): Promise<void> {
    try {
      // Get current role IDs from existing UserRole entities
      const existingRoleIds = new Set(this.existingUserRoles.map(ur => ur.RoleID));
      
      // Determine roles to add and remove
      const rolesToAdd = Array.from(this.selectedRoleIds).filter(roleId => !existingRoleIds.has(roleId));
      const rolesToRemove = this.existingUserRoles.filter(userRole => !this.selectedRoleIds.has(userRole.RoleID));
      
      // Remove unselected roles
      for (const userRole of rolesToRemove) {
        try {
          await userRole.Delete();
        } catch (error) {
          console.warn('Failed to remove role:', userRole.RoleID, error);
        }
      }
      
      // Add new selected roles
      for (const roleId of rolesToAdd) {
        try {
          const userRole = await this.metadata.GetEntityObject<UserRoleEntity>('User Roles');
          userRole.NewRecord();
          userRole.UserID = userId;
          userRole.RoleID = roleId;
          
          const saveResult = await userRole.Save();
          if (!saveResult) {
            console.warn('Failed to assign role:', roleId, userRole.LatestResult?.Message);
          }
        } catch (error) {
          console.warn('Failed to assign role:', roleId, error);
        }
      }
    } catch (error) {
      console.error('Error updating user roles:', error);
      throw error;
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