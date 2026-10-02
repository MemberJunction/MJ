import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ChangeDetectorRef, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
import { MJEntityPermissionEntity, MJEntityEntity, MJRoleEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface PermissionDialogData {
  entity: MJEntityEntity;
  roles: MJRoleEntity[];
  existingPermissions: MJEntityPermissionEntity[];
}

export interface PermissionDialogResult {
  action: 'save' | 'cancel';
  entity?: MJEntityEntity;
}

interface RolePermissions {
  roleId: string;
  roleName: string;
  entityPermission: MJEntityPermissionEntity;
  isNew: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-permission-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './permission-dialog.component.html',
  styleUrls: ['./permission-dialog.component.css']
})
export class PermissionDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges {
  @Input() Data: PermissionDialogData | null = null;

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: PermissionDialogData | null) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): PermissionDialogData | null {
    return this.Data;
  }
  @Input() Visible = false;

  /** @deprecated Use {@link Visible}. */
  @Input() set visible(value: PermissionDialogComponent['Visible']) {
    this.Visible = value;
  }
  /** @deprecated Use {@link Visible}. */
  get visible(): PermissionDialogComponent['Visible'] {
    return this.Visible;
  }
  @Output() Result = new EventEmitter<PermissionDialogResult>();

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
  public PermissionForm: FormGroup;

  /** @deprecated Use {@link PermissionForm}. */
  public get permissionForm(): FormGroup {
    return this.PermissionForm;
  }
  /** @deprecated Use {@link PermissionForm}. */
  public set permissionForm(value: FormGroup) {
    this.PermissionForm = value;
  }
  public isLoading = false;
  public error: string | null = null;
  public RolePermissions: RolePermissions[] = [];

  /** @deprecated Use {@link RolePermissions}. */
  public get rolePermissions(): RolePermissions[] {
    return this.RolePermissions;
  }
  /** @deprecated Use {@link RolePermissions}. */
  public set rolePermissions(value: RolePermissions[]) {
    this.RolePermissions = value;
  }
  public AvailableRoles: MJRoleEntity[] = [];

  /** @deprecated Use {@link AvailableRoles}. */
  public get availableRoles(): MJRoleEntity[] {
    return this.AvailableRoles;
  }
  /** @deprecated Use {@link AvailableRoles}. */
  public set availableRoles(value: MJRoleEntity[]) {
    this.AvailableRoles = value;
  }

  constructor() {
    super();
    this.PermissionForm = this.fb.group({});
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('Permission dialog ngOnChanges called:', changes);
    
    if (changes['visible'] && this.Visible) {
      this.resetDialog();
      // Load data when dialog becomes visible and we have data
      if (this.Data) {
        console.log('Dialog became visible, loading permission data');
        this.loadPermissionData();
      }
    }
    
    if (changes['data'] && this.Data && this.Visible) {
      console.log('Data changed while dialog is visible, reloading permission data');
      this.loadPermissionData();
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private resetDialog(): void {
    this.error = null;
    this.isLoading = false;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.Visible) {
      this.onCancel();
    }
  }

  public get HasChanges(): boolean {
    return this.RolePermissions.some(rp => rp.isNew || rp.entityPermission.Dirty);
  }

  /** @deprecated Use {@link HasChanges}. */
  public get hasChanges(): boolean {
    return this.HasChanges;
  }

  public HasEntityChanges(rolePermission: RolePermissions): boolean {
    return rolePermission.isNew || rolePermission.entityPermission.Dirty;
  }

  /** @deprecated Use {@link HasEntityChanges}. */
  public hasEntityChanges(rolePermission: RolePermissions): boolean {
    return this.HasEntityChanges(rolePermission);
  }

  private loadPermissionData(): void {
    if (!this.Data) return;

    console.log('Loading permission data for entity:', this.Data.entity.Name);
    console.log('Existing permissions:', this.Data.existingPermissions);
    console.log('Available roles:', this.Data.roles);

    // Initialize role permissions from existing data
    this.RolePermissions = [];
    const existingRoleIds = new Set<string>();

    // Process existing permissions
    for (const permission of this.Data.existingPermissions) {
      const role = this.Data.roles.find(r => UUIDsEqual(r.ID, permission.RoleID));
      if (role) {
        console.log(`Processing permission for role ${role.Name}:`, {
          canCreate: permission.CanCreate,
          canRead: permission.CanRead,
          canUpdate: permission.CanUpdate,
          canDelete: permission.CanDelete
        });
        
        this.RolePermissions.push({
          roleId: role.ID,
          roleName: role.Name || '',
          entityPermission: permission,
          isNew: false
        });
        existingRoleIds.add(role.ID);
      }
    }

    console.log('Loaded role permissions:', this.RolePermissions);

    // Set available roles (those not already configured)
    this.AvailableRoles = this.Data.roles.filter(role => !existingRoleIds.has(role.ID));
    
    console.log('Available roles for adding:', this.AvailableRoles.map(r => r.Name));
    
    // Trigger change detection to update the UI
    this.cdr.detectChanges();
  }

  public async AddRolePermission(role: MJRoleEntity): Promise<void> {
    // Create new EntityPermission entity
    const entityPermission = await this.metadata.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions');
    entityPermission.NewRecord();
    entityPermission.EntityID = this.Data!.entity.ID;
    entityPermission.RoleID = role.ID;
    entityPermission.CanCreate = false;
    entityPermission.CanRead = true; // Default to read access
    entityPermission.CanUpdate = false;
    entityPermission.CanDelete = false;

    // Add new role permission
    this.RolePermissions.push({
      roleId: role.ID,
      roleName: role.Name || '',
      entityPermission: entityPermission,
      isNew: true
    });

    // Remove from available roles
    this.AvailableRoles = this.AvailableRoles.filter(r => !UUIDsEqual(r.ID, role.ID));
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link AddRolePermission}. */
  public async addRolePermission(role: MJRoleEntity): Promise<void> {
    return this.AddRolePermission(role);
  }

  public RemoveRolePermission(rolePermission: RolePermissions): void {
    // Add back to available roles if not new
    if (!rolePermission.isNew) {
      const role = this.Data?.roles.find(r => UUIDsEqual(r.ID, rolePermission.roleId));
      if (role) {
        this.AvailableRoles.push(role);
        this.AvailableRoles.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
      }
    } else {
      // Add back to available roles
      const role = this.Data?.roles.find(r => UUIDsEqual(r.ID, rolePermission.roleId));
      if (role) {
        this.AvailableRoles.push(role);
        this.AvailableRoles.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
      }
    }

    // Remove from role permissions
    this.RolePermissions = this.RolePermissions.filter(rp => rp.roleId !== rolePermission.roleId);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link RemoveRolePermission}. */
  public removeRolePermission(rolePermission: RolePermissions): void {
    return this.RemoveRolePermission(rolePermission);
  }

  public async OnSubmit(): Promise<void> {
    if (!this.Data || !this.HasChanges) return;

    this.isLoading = true;
    this.error = null;

    try {
      // Process each role permission
      for (const rolePermission of this.RolePermissions) {
        if (rolePermission.isNew || rolePermission.entityPermission.Dirty) {
          await this.saveRolePermission(rolePermission);
        }
      }

      this.Result.emit({ action: 'save', entity: this.Data.entity });

    } catch (error: unknown) {
      console.error('Error saving permissions:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'An unexpected error occurred while saving permissions';
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

  private async saveRolePermission(rolePermission: RolePermissions): Promise<void> {
    // Save the entity directly - it already has all the values bound
    const saveResult = await rolePermission.entityPermission.Save();
    if (!saveResult) {
      throw new Error(rolePermission.entityPermission.LatestResult?.Message || `Failed to save permissions for role ${rolePermission.roleName}`);
    }
  }

  public onCancel(): void {
    this.Result.emit({ action: 'cancel' });
  }
}