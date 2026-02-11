import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, inject, HostListener, ChangeDetectorRef, NgZone, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Metadata, RunView } from '@memberjunction/core';
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
  standalone: false,
  selector: 'mj-permission-dialog',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './permission-dialog.component.html',
  styleUrls: ['./permission-dialog.component.css']
})
export class PermissionDialogComponent implements OnInit, OnDestroy, OnChanges {
  @Input() data: PermissionDialogData | null = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<PermissionDialogResult>();

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private metadata = new Metadata();

  public permissionForm: FormGroup;
  public isLoading = false;
  public error: string | null = null;
  public rolePermissions: RolePermissions[] = [];
  public availableRoles: RoleEntity[] = [];

  constructor() {
    this.permissionForm = this.fb.group({});
  }

  ngOnInit(): void {
    // Initial setup
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('Permission dialog ngOnChanges called:', changes);
    
    if (changes['visible'] && this.visible) {
      this.resetDialog();
      // Load data when dialog becomes visible and we have data
      if (this.data) {
        console.log('Dialog became visible, loading permission data');
        this.loadPermissionData();
      }
    }
    
    if (changes['data'] && this.data && this.visible) {
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
    if (this.visible) {
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
    if (!this.data) return;

    console.log('Loading permission data for entity:', this.data.entity.Name);
    console.log('Existing permissions:', this.data.existingPermissions);
    console.log('Available roles:', this.data.roles);

    // Initialize role permissions from existing data
    this.rolePermissions = [];
    const existingRoleIds = new Set<string>();

    // Process existing permissions
    for (const permission of this.data.existingPermissions) {
      const role = this.data.roles.find(r => r.ID === permission.RoleID);
      if (role) {
        console.log(`Processing permission for role ${role.Name}:`, {
          canCreate: permission.CanCreate,
          canRead: permission.CanRead,
          canUpdate: permission.CanUpdate,
          canDelete: permission.CanDelete
        });
        
        this.rolePermissions.push({
          roleId: role.ID,
          roleName: role.Name || '',
          entityPermission: permission,
          isNew: false
        });
        existingRoleIds.add(role.ID);
      }
    }

    console.log('Loaded role permissions:', this.rolePermissions);

    // Set available roles (those not already configured)
    this.availableRoles = this.data.roles.filter(role => !existingRoleIds.has(role.ID));
    
    console.log('Available roles for adding:', this.availableRoles.map(r => r.Name));
    
    // Trigger change detection to update the UI
    this.cdr.detectChanges();
  }

  public async addRolePermission(role: RoleEntity): Promise<void> {
    // Create new EntityPermission entity
    const entityPermission = await this.metadata.GetEntityObject<EntityPermissionEntity>('Entity Permissions');
    entityPermission.NewRecord();
    entityPermission.EntityID = this.data!.entity.ID;
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
    this.cdr.detectChanges();
  }

  public removeRolePermission(rolePermission: RolePermissions): void {
    // Add back to available roles if not new
    if (!rolePermission.isNew) {
      const role = this.data?.roles.find(r => r.ID === rolePermission.roleId);
      if (role) {
        this.availableRoles.push(role);
        this.availableRoles.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
      }
    } else {
      // Add back to available roles
      const role = this.data?.roles.find(r => r.ID === rolePermission.roleId);
      if (role) {
        this.availableRoles.push(role);
        this.availableRoles.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
      }
    }

    // Remove from role permissions
    this.rolePermissions = this.rolePermissions.filter(rp => rp.roleId !== rolePermission.roleId);
    this.cdr.detectChanges();
  }

  public async onSubmit(): Promise<void> {
    if (!this.data || !this.hasChanges) return;

    this.isLoading = true;
    this.error = null;

    try {
      // Process each role permission
      for (const rolePermission of this.rolePermissions) {
        if (rolePermission.isNew || rolePermission.entityPermission.Dirty) {
          await this.saveRolePermission(rolePermission);
        }
      }

      this.result.emit({ action: 'save', entity: this.data.entity });

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

  private async saveRolePermission(rolePermission: RolePermissions): Promise<void> {
    // Save the entity directly - it already has all the values bound
    const saveResult = await rolePermission.entityPermission.Save();
    if (!saveResult) {
      throw new Error(rolePermission.entityPermission.LatestResult?.Message || `Failed to save permissions for role ${rolePermission.roleName}`);
    }
  }

  public onCancel(): void {
    this.result.emit({ action: 'cancel' });
  }
}