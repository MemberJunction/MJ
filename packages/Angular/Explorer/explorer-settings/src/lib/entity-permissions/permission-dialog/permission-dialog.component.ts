import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { EntityPermissionEntity, EntityEntity, RoleEntity } from '@memberjunction/core-entities';

export interface PermissionDialogData {
  entity: EntityEntity;
  roles: RoleEntity[];
  existingPermissions: EntityPermissionEntity[];
}

export interface PermissionDialogResult {
  action: 'save' | 'cancel';
  entity?: EntityEntity;
}

interface RolePermissions {
  roleId: string;
  roleName: string;
  entityPermission: EntityPermissionEntity;
  isNew: boolean;
}

@Component({
  selector: 'mj-permission-dialog',
  templateUrl: './permission-dialog.component.html',
  styleUrls: ['./permission-dialog.component.css']
})
export class PermissionDialogComponent implements OnInit, OnDestroy {
  private _data: PermissionDialogData | null = null;
  private _visible = false;

  @Input()
  set data(value: PermissionDialogData | null) {
    const previousValue = this._data;
    this._data = value;
    if (value && value !== previousValue && this._visible) {
      this.onDataChanged(value);
    }
  }
  get data(): PermissionDialogData | null {
    return this._data;
  }

  @Input()
  set visible(value: boolean) {
    const previousValue = this._visible;
    this._visible = value;
    if (value && !previousValue) {
      this.onDialogOpened();
    }
  }
  get visible(): boolean {
    return this._visible;
  }

  @Output() result = new EventEmitter<PermissionDialogResult>();

  public permissionForm: FormGroup;
  public isLoading = false;
  public isSaving = false;
  public error: string | null = null;
  public rolePermissions: RolePermissions[] = [];
  public availableRoles: RoleEntity[] = [];

  private metadata = new Metadata();

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.permissionForm = this.fb.group({});
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private onDialogOpened(): void {
    this.resetDialog();
    if (this._data) {
      this.loadPermissionData();
    }
  }

  private onDataChanged(data: PermissionDialogData): void {
    this.loadPermissionData();
  }

  private resetDialog(): void {
    this.error = null;
    this.isLoading = false;
    this.isSaving = false;
    this.rolePermissions = [];
    this.availableRoles = [];
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this._visible) {
      this.onCancel();
    }
  }

  public get hasChanges(): boolean {
    return this.rolePermissions.some(rp => rp.isNew || rp.entityPermission.Dirty);
  }

  public hasEntityChanges(rolePermission: RolePermissions): boolean {
    return rolePermission.isNew || rolePermission.entityPermission.Dirty;
  }

  private loadPermissionData(): void {
    if (!this._data) {
      return;
    }

    try {
      this.isLoading = true;

      // Initialize role permissions from existing data
      this.rolePermissions = [];
      const existingRoleIds = new Set<string>();

      // Process existing permissions
      for (const permission of this._data.existingPermissions) {
        const role = this._data.roles.find(r => r.ID === permission.RoleID);
        if (role) {
          this.rolePermissions.push({
            roleId: role.ID,
            roleName: role.Name || '',
            entityPermission: permission,
            isNew: false
          });
          existingRoleIds.add(role.ID);
        }
      }

      // Set available roles (those not already configured)
      this.availableRoles = this._data.roles.filter(role => !existingRoleIds.has(role.ID));

      this.isLoading = false;

      // Trigger change detection to update the UI
      Promise.resolve().then(() => this.cdr.detectChanges());
    } catch (error) {
      console.error('Error loading permission data:', error);
      this.error = 'Failed to load permission data. Please try again.';
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  public async addRolePermission(role: RoleEntity): Promise<void> {
    if (!this._data) {
      return;
    }

    try {
      // Create new EntityPermission entity
      const entityPermission = await this.metadata.GetEntityObject<EntityPermissionEntity>('Entity Permissions');
      entityPermission.NewRecord();
      entityPermission.EntityID = this._data.entity.ID;
      entityPermission.RoleID = role.ID;
      entityPermission.CanCreate = false;
      entityPermission.CanRead = true; // Default to read access
      entityPermission.CanUpdate = false;
      entityPermission.CanDelete = false;

      // Add new role permission
      this.rolePermissions.push({
        roleId: role.ID,
        roleName: role.Name || '',
        entityPermission: entityPermission,
        isNew: true
      });

      // Remove from available roles
      this.availableRoles = this.availableRoles.filter(r => r.ID !== role.ID);

      Promise.resolve().then(() => this.cdr.detectChanges());
    } catch (error) {
      console.error('Error adding role permission:', error);
      this.error = 'Failed to add role permission. Please try again.';
      this.cdr.detectChanges();
    }
  }

  public removeRolePermission(rolePermission: RolePermissions): void {
    // Add back to available roles
    const role = this._data?.roles.find(r => r.ID === rolePermission.roleId);
    if (role) {
      this.availableRoles.push(role);
      this.availableRoles.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }

    // Remove from role permissions
    this.rolePermissions = this.rolePermissions.filter(rp => rp.roleId !== rolePermission.roleId);

    Promise.resolve().then(() => this.cdr.detectChanges());
  }

  public async onSubmit(): Promise<void> {
    if (!this._data || !this.hasChanges) {
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.cdr.detectChanges();

    try {
      // Process each role permission
      for (const rolePermission of this.rolePermissions) {
        if (rolePermission.isNew || rolePermission.entityPermission.Dirty) {
          await this.saveRolePermission(rolePermission);
        }
      }

      this.result.emit({ action: 'save', entity: this._data.entity });
    } catch (error: any) {
      console.error('Error saving permissions:', error);
      this.error = error.message || 'An unexpected error occurred while saving permissions';
      this.cdr.detectChanges();
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  private async saveRolePermission(rolePermission: RolePermissions): Promise<void> {
    // Save the entity directly - it already has all the values bound
    const saveResult = await rolePermission.entityPermission.Save();
    if (!saveResult) {
      throw new Error(
        rolePermission.entityPermission.LatestResult?.Message ||
        `Failed to save permissions for role ${rolePermission.roleName}`
      );
    }
  }

  public onCancel(): void {
    if (this.hasChanges) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) {
        return;
      }
    }
    this.result.emit({ action: 'cancel' });
  }
}
