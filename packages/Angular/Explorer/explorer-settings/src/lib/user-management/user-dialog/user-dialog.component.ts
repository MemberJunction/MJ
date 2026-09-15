import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ViewEncapsulation, ChangeDetectorRef, NgZone } from '@angular/core';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { MJUserEntity, MJRoleEntity, MJUserRoleEntity } from '@memberjunction/core-entities';

import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EnrolledRow, serverRefusalReasons } from '../transaction-group-refusals';
export interface UserDialogData {
  user?: MJUserEntity;
  mode: 'create' | 'edit';
  availableRoles: MJRoleEntity[];
}

export interface UserDialogResult {
  action: 'save' | 'cancel';
  user?: MJUserEntity;
}

@Component({
  standalone: false,
  selector: 'mj-user-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.css']
})
export class UserDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges {
  @Input() Data: UserDialogData | null = null;

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: UserDialogData | null) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): UserDialogData | null {
    return this.Data;
  }
  @Input() Visible = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: UserDialogComponent['Visible']) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): UserDialogComponent['Visible'] {
    return this.Visible;
  }
  @Output() Result = new EventEmitter<UserDialogResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() result = this.Result;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private get metadata() { return this.ProviderToUse; }
  public UserForm: FormGroup;

  /** @deprecated Use {@link UserForm}. */
  public get userForm(): FormGroup {
    return this.UserForm;
  }
  /** @deprecated Use {@link UserForm}. */
  public set userForm(value: FormGroup) {
    this.UserForm = value;
  }
  public isLoading = false;
  public error: string | null = null;
  public SelectedRoleIds = new Set<string>();

  /** @deprecated Use {@link SelectedRoleIds}. */
  public get selectedRoleIds() {
    return this.SelectedRoleIds;
  }
  /** @deprecated Use {@link SelectedRoleIds}. */
  public set selectedRoleIds(value) {
    this.SelectedRoleIds = value;
  }
  public ExistingUserRoles: MJUserRoleEntity[] = [];

  /** @deprecated Use {@link ExistingUserRoles}. */
  public get existingUserRoles(): MJUserRoleEntity[] {
    return this.ExistingUserRoles;
  }
  /** @deprecated Use {@link ExistingUserRoles}. */
  public set existingUserRoles(value: MJUserRoleEntity[]) {
    this.ExistingUserRoles = value;
  }

  constructor() {
    super();
    this.UserForm = this.fb.group({
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
      this.SelectedRoleIds.clear();
      this.ExistingUserRoles = [];
      
      if (this.Data?.user && this.IsEditMode) {
        this.loadUserData();
      } else {
        this.resetForm();
      }
    }
    
    // Reset form when dialog becomes visible and not in edit mode
    if (changes['visible'] && this.Visible && !this.IsEditMode) {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private resetForm(): void {
    this.UserForm.reset({
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      title: '',
      type: 'User',
      isActive: true
    });
    this.SelectedRoleIds.clear();
    this.error = null;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.Visible) {
      this.onCancel();
    }
  }

  public get WindowTitle(): string {
    return this.IsEditMode ? 'Edit User' : 'Create New User';
  }

  /** @deprecated Use {@link WindowTitle}. */
  public get windowTitle(): string {
    return this.WindowTitle;
  }

  public get IsEditMode(): boolean {
    return this.Data?.mode === 'edit';
  }

  /** @deprecated Use {@link IsEditMode}. */
  public get isEditMode(): boolean {
    return this.IsEditMode;
  }

  private async loadUserData(): Promise<void> {
    if (!this.Data?.user) return;

    const user = this.Data.user;
    this.UserForm.patchValue({
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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJUserRoleEntity>({
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID='${userId}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.ExistingUserRoles = result.Results;
        // Pre-select existing roles
        for (const userRole of this.ExistingUserRoles) {
          this.SelectedRoleIds.add(userRole.RoleID);
        }
      }
    } catch (error) {
      console.warn('Failed to load existing user roles:', error);
    }
  }

  public OnRoleToggle(roleId: string, event: Event): void {
    event.stopPropagation();
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.SelectedRoleIds.add(roleId);
    } else {
      this.SelectedRoleIds.delete(roleId);
    }
  }

  /** @deprecated Use {@link OnRoleToggle}. */
  public onRoleToggle(roleId: string, event: Event): void {
    return this.OnRoleToggle(roleId, event);
  }

  public ToggleRole(roleId: string): void {
    if (this.SelectedRoleIds.has(roleId)) {
      this.SelectedRoleIds.delete(roleId);
    } else {
      this.SelectedRoleIds.add(roleId);
    }
  }

  /** @deprecated Use {@link ToggleRole}. */
  public toggleRole(roleId: string): void {
    return this.ToggleRole(roleId);
  }

  public async OnSubmit(): Promise<void> {
    if (this.UserForm.invalid) {
      this.markFormGroupTouched(this.UserForm);
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      let user: MJUserEntity;

      if (this.IsEditMode && this.Data?.user) {
        // Edit existing user
        user = this.Data.user;
      } else {
        // Create new user
        user = await this.metadata.GetEntityObject<MJUserEntity>('MJ: Users');
        user.NewRecord();
      }

      // Update user properties
      const formValue = this.UserForm.value;
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

      this.Result.emit({ action: 'save', user });

    } catch (error: unknown) {
      console.error('Error saving user:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'An unexpected error occurred';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link OnSubmit}. */
  public async onSubmit(): Promise<void> {
    return this.OnSubmit();
  }

  private async updateUserRoles(userId: string): Promise<void> {
    try {
      // Get current role IDs from existing UserRole entities
      const existingRoleIds = new Set(this.ExistingUserRoles.map(ur => ur.RoleID));

      // Determine roles to add and remove
      const rolesToAdd = Array.from(this.SelectedRoleIds).filter(roleId => !existingRoleIds.has(roleId));
      const rolesToRemove = this.ExistingUserRoles.filter(userRole => !this.SelectedRoleIds.has(userRole.RoleID));

      if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
        return;
      }

      // Batch all role deletes and adds into one transactional GraphQL call
      const tg = await this.metadata.CreateTransactionGroup();

      // Each Delete()/Save() only ENROLS the row in the group; the write is deferred to Submit().
      // A false return therefore means the row was refused CLIENT-side and never enrolled — so
      // submitting anyway writes a PARTIAL change, or an empty one whose Submit() returns true for
      // having nothing to do, and either way the dialog closes reporting success. Same rule and
      // same reason as `UserManagementComponent.executeBulkRoleAssign`, where the transaction-group
      // semantics — and why the server-side #4282 guard is NOT what this catches — are set out in full.
      const refusals: string[] = [];
      // Enrolled rows are kept so the SERVER's reason can be read back off them below; without
      // that, the reason #4309 puts on LatestResult has nobody left to read it.
      const enrolled: EnrolledRow[] = [];

      for (const userRole of rolesToRemove) {
        userRole.TransactionGroup = tg;
        if (!await userRole.Delete()) {
          refusals.push(`Remove ${this.describeRole(userRole.RoleID)}: ${userRole.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        else {
          enrolled.push({ label: `Remove ${this.describeRole(userRole.RoleID)}`, entity: userRole });
        }
      }

      for (const roleId of rolesToAdd) {
        const userRole = await this.metadata.GetEntityObject<MJUserRoleEntity>('MJ: User Roles');
        userRole.NewRecord();
        userRole.UserID = userId;
        userRole.RoleID = roleId;
        userRole.TransactionGroup = tg;
        if (!await userRole.Save()) {
          refusals.push(`Add ${this.describeRole(roleId)}: ${userRole.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        else {
          enrolled.push({ label: `Add ${this.describeRole(roleId)}`, entity: userRole });
        }
      }

      if (refusals.length > 0) {
        // Nothing was written: the refused rows never enrolled, and the rest are still only queued
        // because Submit() is not reached.
        throw new Error(`Failed to update user roles — no role changes were made.\n${refusals.join('\n')}`);
      }

      if (!await tg.Submit()) {
        // Every row enrolled, so this is a SERVER-side refusal (or a rollback). Since #4309 the
        // server says which row and why, and that reason is now on each entity's LatestResult.
        const reasons = serverRefusalReasons(enrolled);
        throw new Error(reasons.length > 0
          ? `Failed to update user roles — all changes have been rolled back.\n${reasons.join('\n')}`
          : 'Failed to update user roles — all changes have been rolled back');
      }
    } catch (error) {
      console.error('Error updating user roles:', error);
      throw error;
    }
  }

  /** Names a role for a refusal message; falls back to the ID when the catalog has no match. */
  private describeRole(roleId: string): string {
    return this.Data?.availableRoles.find(r => UUIDsEqual(r.ID, roleId))?.Name ?? roleId;
  }

  public onCancel(): void {
    this.Result.emit({ action: 'cancel' });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}