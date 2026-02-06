import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { UserEntity, RoleEntity, UserRoleEntity } from '@memberjunction/core-entities';

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
  standalone: false,
  selector: 'mj-user-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.css']
})
export class UserDialogComponent implements OnInit, OnDestroy, OnChanges {
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
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Always clear state when data changes to prevent persistence bugs
    if (changes['data']) {
      this.selectedRoleIds.clear();
      this.existingUserRoles = [];
      
      if (this.data?.user && this.isEditMode) {
        this.loadUserData();
      } else {
        this.resetForm();
      }
    }
    
    // Reset form when dialog becomes visible and not in edit mode
    if (changes['visible'] && this.visible && !this.isEditMode) {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private resetForm(): void {
    this.userForm.reset({
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      title: '',
      type: 'User',
      isActive: true
    });
    this.selectedRoleIds.clear();
    this.error = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
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
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.selectedRoleIds.add(roleId);
    } else {
      this.selectedRoleIds.delete(roleId);
    }
  }

  public toggleRole(roleId: string): void {
    if (this.selectedRoleIds.has(roleId)) {
      this.selectedRoleIds.delete(roleId);
    } else {
      this.selectedRoleIds.add(roleId);
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