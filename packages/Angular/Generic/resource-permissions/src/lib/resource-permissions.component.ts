import { AfterViewInit, Component, Input } from '@angular/core';
import { IMetadataProvider, IRunViewProvider, LogError, Metadata, RoleInfo, RunView } from '@memberjunction/core';
import { ResourcePermissionEngine, ResourcePermissionEntity, UserEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Visual component used to display and manage permissions for a resource. You can wrap this in a dialog or display anywhere else within
 * an Angular application or component.
 */
@Component({
  selector: 'mj-resource-permissions',
  templateUrl: './resource-permissions.component.html',
  styleUrls: ['./resource-permissions.component.css']
})
export class ResourcePermissionsComponent extends BaseAngularComponent implements AfterViewInit {
  /**
   * Required: the ID of the resource type record for the specified resource that the permissions are being set for.
   */
  @Input() ResourceTypeID!: string;
  /**
   * Required: the record ID of the resource that the permissions are being set for.
   */ 
  @Input() ResourceRecordID!: string;
  /**
   * If set to true, the component will show a Save button to the user and persist the changes to the 
   * database when the user clicks the Save button. By default this is off to allow users of the component
   * to wrap the component as desired, and handle the save themselves.
   */
  @Input() ShowSaveButton: boolean = false;
  /**
   * If set to true, the component will show the permission levels to the user. By default this is on. If you have 
   * a Resource Type or run-time use case where levels are not relevant, you can turn this off.
   */
  @Input() ShowPermissionLevels: boolean = true;
  /**
   * By default, this component will not show any error messages to the user. 
   * If you want to show error messages to the user, set this to true. The component will always throw exceptions when error occur internally.
   */
  @Input() ShowUserErrorMessages: boolean = false;
  /**
   * Allows you to determine if the user is able to add new permissions for the resource.
   */
  @Input() AllowAddPermissions: boolean = true;
  /**
   * Allows you to determine if the user is able to edit existing permissions for the resource.
   */
  @Input() AllowEditPermissions: boolean = true;
  /**
   * Allows you to determine if the user is able to delete existing permissions for the resource.
   */
  @Input() AllowDeletePermissions: boolean = true;

  /**
   * List of possible permission levels that can be set for the resource. An array of strings, defaults to ['View', 'Edit', 'Owner']
   */
  @Input() PermissionLevels = ['View', 'Edit', 'Owner']; // these are the possible permission levels

  /**
   * Specifies the types of permissions the UI will allow settings for. An array of strings, defaults to ['User', 'Role']
   */
  @Input() PermissionTypes = ['User', 'Role'];

  /**
   * This optional input allows you to exclude certain roles from the list of roles that can be selected for permissions. If existing permissions have been created with roles that are in this list they will still be displayed, 
   * but the user will not be able to add new permissions with these roles. This is an array of strings with the NAMES of the roles.
   */
  @Input() ExcludedRoleNames: string[] = [];

  /**
   * This optional input allows you to exclude certain users from the list of users that can be selected for permissions. If existing permissions have been created with users that are in this list they will still be displayed, 
   * but the user will not be able to add new permissions with these users. This is an array of strings with EMAILS.
   */
  @Input() ExcludedUserEmails: string[] = [];

  public AllUsers: UserEntity[] = [];
  public AllRoles: RoleInfo[] = [];

  public SelectedUser: UserEntity | null = null;
  public SelectedRole: RoleInfo | null = null;
  public SelectedType: 'User' | 'Role' = 'Role';
  public SelectedPermissionLevel: 'View' | 'Edit' | 'Owner' = 'View';

  public _Loading: boolean = false;

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

    this._Loading = true;
    // load up the current permissions for the specified ResourceTypeID and ResourceRecordID
    const engine = this.GetEngine();
    await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
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
    // filter out any users that are in the ExcludedUserEmails list
    this.AllUsers = result.Results.filter((u) => !this.ExcludedUserEmails.includes(u.Email));
    // filter out any roles that are in the ExcludedRoleNames list
    this.AllRoles = p.Roles.filter((r) => !this.ExcludedRoleNames.includes(r.Name));

    if (this.AllUsers.length > 0)
      this.SelectedUser = this.AllUsers[0];
    if (this.AllRoles.length > 0)
      this.SelectedRole = this.AllRoles[0];

    this._Loading = false;
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
    this._Loading = true;
    const p = this.ProviderToUse;
    const tg = await p.CreateTransactionGroup();
    for (const permission of this._pendingDeletes) {
      if (permission.IsSaved) {
        // only delete records previously saved, sometimes a user adds a new permission and deletes it before saving it
        permission.TransactionGroup = tg;
        if (!await permission.Delete()) { // we use await here because the promise will resolve before the actual save occurs --- the internals will not call the network until tg.Submit() below
          // validation errors come back here
          if (this.ShowUserErrorMessages)
            MJNotificationService.Instance.CreateSimpleNotification('Error saving permissions', 'error', 2500);

          LogError('Error deleting permission record in the transaction group: ' + permission.LatestResult.CompleteMessage);
          return false;
        }  
      }      
    }

    // next add new permissions by saving them in the transaction group
    for (const permission of this._pendingAdds) {
      if (this._pendingDeletes.includes(permission)) {
        // don't save a permission record that is new, if it was also marked for deletion
        permission.TransactionGroup = tg;
        if (!await permission.Save()) { 
          // validation errors come back here
          if (this.ShowUserErrorMessages)
            MJNotificationService.Instance.CreateSimpleNotification('Error saving permissions', 'error', 2500);

          LogError('Error saving permission record in the transaction group: ' + permission.LatestResult.CompleteMessage);          
          return false;
        }
      }
    }

    // now save the existing permissions
    for (const permission of this.resourcePermissions) {
      // make sure not in the delete array
      if (!this._pendingDeletes.includes(permission)) {
        permission.TransactionGroup = tg;
        if (!await permission.Save()) {  
          // validation errors come back here
          if (this.ShowUserErrorMessages)
            MJNotificationService.Instance.CreateSimpleNotification('Error saving permissions', 'error', 2500);

          LogError('Error saving permission record in the transaction group: ' + permission.LatestResult.CompleteMessage);
          return false;
        }
      }
    }

    // now save the changes
    if (await tg.Submit()) {
      this._Loading = false;
      this._pendingDeletes = [];
      this._pendingAdds = [];
      const engine = this.GetEngine();
      await engine.RefreshAllItems(); // refresh the permissions cache
      return true;
    }
    else {
      // we had an error, show the user via SharedService
      this._Loading = false;
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
