import { AfterViewInit, Component, Input } from '@angular/core';
import { IMetadataProvider, IRunViewProvider, LogError, Metadata, RoleInfo, RunView } from '@memberjunction/core';
import { ResourcePermissionEngine, ResourcePermissionEntity, UserEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  selector: 'mj-resource-permissions',
  templateUrl: './resource-permissions.component.html',
  styleUrls: ['./resource-permissions.component.css']
})
export class ResourcePermissionsComponent extends BaseAngularComponent implements AfterViewInit {
  @Input() ResourceTypeID!: string;
  @Input() ResourceRecordID!: string;
  @Input() ShowSaveButton: boolean = false;
  @Input() ShowUserErrorMessages: boolean = false;
  @Input() AllowAddPermissions: boolean = true;
  @Input() AllowEditPermissions: boolean = true;
  @Input() AllowDeletePermissions: boolean = true;

  // Define permission levels
  public permissionLevels = ['View', 'Edit', 'Owner']; // these are the possible permission levels

  public permissionTypes = ['User', 'Role'];

  public AllUsers: UserEntity[] = [];
  public AllRoles: RoleInfo[] = [];

  public SelectedUser: UserEntity | null = null;
  public SelectedRole: RoleInfo | null = null;
  public SelectedType: 'User' | 'Role' = 'Role';
  public SelectedPermissionLevel: 'View' | 'Edit' | 'Owner' = 'View';

  public async UpdateResourceRecordID(ResourceRecordID: string) {
    this.ResourceRecordID = ResourceRecordID;
    // now go through all of our permissions and update the ResourceRecordID
    for (const permission of this.resourcePermissions) {
      permission.ResourceRecordID = ResourceRecordID
    }
  }

  public resourcePermissions: ResourcePermissionEntity[] = [];
  async ngAfterViewInit() {
    if (!this.ResourceTypeID || !this.ResourceRecordID) {
      throw new Error('ResourceTypeID and ResourceRecordID must be set');
    }

    // load up the current permissions for the specified ResourceTypeID and ResourceRecordID
    const engine = this.GetEngine();
    await engine.Config();
    // now we can get the permissions for the specified resource
    const allResourcePermissions = engine.GetResourcePermissions(this.ResourceTypeID, this.ResourceRecordID);
    this.resourcePermissions = allResourcePermissions.filter((p) => p.Status === 'Approved'); // only include approved permissions in the UI, we don't show requested, rejected, revoked permissions here, just suppress them.
    
    const p = this.ProviderToUse;
    const rv = new RunView(<IRunViewProvider><any>p)
    const result = await rv.RunView<UserEntity>({
      EntityName: "Users",
      ResultType: "entity_object",
      OrderBy: "Name",
      ExtraFilter: "IsActive=1"
    });
    this.AllUsers = result.Results;
    this.AllRoles = p.Roles;

    if (this.AllUsers.length > 0)
      this.SelectedUser = this.AllUsers[0];
    if (this.AllRoles.length > 0)
      this.SelectedRole = this.AllRoles[0];
  }

  private _pendingDeletes: ResourcePermissionEntity[] = [];
  public deletePermission(permission: ResourcePermissionEntity) {
    this._pendingDeletes.push(permission);
    this.resourcePermissions = this.resourcePermissions.filter((p) => p !== permission);
  }

  private _pendingAdds: ResourcePermissionEntity[] = [];
  public async addPermission() {
    const p = this.ProviderToUse;
    const permission = await p.GetEntityObject<ResourcePermissionEntity>("Resource Permissions", p.CurrentUser);
    permission.ResourceTypeID = this.ResourceTypeID;
    permission.ResourceRecordID = this.ResourceRecordID;
    permission.Type = this.SelectedType;
    permission.Status = 'Approved';
    permission.PermissionLevel = this.SelectedPermissionLevel;
    if (this.SelectedType === 'User' && this.SelectedUser) {
      permission.UserID = this.SelectedUser.ID;
      permission.Set("User", this.SelectedUser.Name);// set the virtual field for display purposes
    }
    else if (this.SelectedType === 'Role' && this.SelectedRole) { 
      permission.RoleID = this.SelectedRole.ID;
      permission.Set("Role", this.SelectedRole.Name); // set the virtual field for display purposes
    }
    else {
      LogError('Invalid permission type or missing user/role');
      return;
    }
    this.resourcePermissions.push(permission);
  }

  public permissionAlreadyExists(): boolean {
    // check to see if the selection that the user currently has in place for the combination of TYPE + either USER or ROLE already exists
    // in our list of permissions
    for (const permission of this.resourcePermissions) {
      if (permission.Type === this.SelectedType) {
        if (this.SelectedType === 'User' && permission.UserID === this.SelectedUser?.ID) {
          return true;
        }
        else if (this.SelectedType === 'Role' && permission.RoleID === this.SelectedRole?.ID) {
          return true;
        }
      }
    }

    // if we get here, then the permission does not already exist
    return false;
  }

  public async SavePermissions(): Promise<boolean> {
    // first delete any permissions that were marked for deletion
    const p = this.ProviderToUse;
    const tg = await p.CreateTransactionGroup();
    for (const permission of this._pendingDeletes) {
      if (permission.IsSaved) {
        // only delete records previously saved, sometimes a user adds a new permission and deletes it before saving it
        permission.TransactionGroup = tg;
        permission.Delete(); // no await - we await the tg.submit below  
      }      
    }

    // next add new permissions by saving them in the transaction group
    for (const permission of this._pendingAdds) {
      if (this._pendingDeletes.includes(permission)) {
        // don't save a permission record that is new, if it was also marked for deletion
        permission.TransactionGroup = tg;
        permission.Save(); // no await - we await the tg.submit below
      }
    }

    // now save the existing permissions
    for (const permission of this.resourcePermissions) {
      // make sure not in the delete array
      if (!this._pendingDeletes.includes(permission)) {
        permission.TransactionGroup = tg;
        permission.Save(); // no await - we await the tg.submit below
      }
    }

    // now save the changes
    if (await tg.Submit()) {
      this._pendingDeletes = [];
      this._pendingAdds = [];
      const engine = this.GetEngine();
      await engine.RefreshAllItems(); // refresh the permissions cache
      return true;
    }
    else {
      // we had an error, show the user via SharedService
      if (this.ShowUserErrorMessages)
        MJNotificationService.Instance.CreateSimpleNotification('Error saving permissions', 'error', );
  
      LogError('Error saving permissions in the transaction group');
      return false;
    }
  }

  protected GetEngine(): ResourcePermissionEngine {
    return <ResourcePermissionEngine>ResourcePermissionEngine.GetProviderInstance(this.ProviderToUse, ResourcePermissionEngine);
  }
}
