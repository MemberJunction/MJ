import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { BaseEntity, Metadata } from '@memberjunction/global';
import { ApplicationEntity, RoleEntity, UserEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseNavigationComponent } from '@memberjunction/ng-shared';
import { filter } from 'rxjs/operators';

export enum SettingsItem {
  EntityPermissions = 'EntityPermissions',
  Users = 'Users',
  User = 'User',
  Roles = 'Roles',
  Role = 'Role',
  Applications = 'Applications',
  Application = 'Application',
  SqlLogging = 'SqlLogging',
}

@Component({
  selector: 'mj-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
@RegisterClass(BaseNavigationComponent, 'Settings')
export class SettingsComponent extends BaseNavigationComponent implements OnInit {
  public currentItem: SettingsItem = SettingsItem.Users;
  public baseRoute: string = '/settings';

  public selectedRoleID: string = '';
  public selectedUserID: string = '';
  public selectedApplicationName: string = '';
  public selectedApplicationID: string = '';

  public options = [
    { label: 'Users', value: SettingsItem.Users },
    { label: 'Roles', value: SettingsItem.Roles },
    { label: 'Applications', value: SettingsItem.Applications },
    { label: 'Entity Permissions', value: SettingsItem.EntityPermissions },
    { label: 'SQL Logging', value: SettingsItem.SqlLogging },
  ];

  public selectItem(item: SettingsItem | string, changeRoute: boolean = true) {
    if (typeof item === 'string') this.currentItem = SettingsItem[item as keyof typeof SettingsItem];
    else this.currentItem = item;

    if (changeRoute) this.changeRoute(item.toLowerCase());
  }

  changeRoute(subPath: string) {
    // Constructs a navigation path relative to the /settings base route
    this.router.navigate([this.baseRoute, subPath]);
  }

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {
    super();
  }

  ngOnInit() {
    // manually update the first time
    this.updateComponentStateBasedOnPath();

    // Listen to changes in the route
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.updateComponentStateBasedOnPath();
    });
  }

  updateComponentStateBasedOnPath() {
    // On each navigation end, access the current URL from window.location
    const fullPath = window.location.pathname + window.location.search;

    // Split the fullPath into segments and query string as needed
    const [path, queryString] = fullPath.split('?');
    const segments = path.split('/').filter((segment) => segment.length > 0);

    const firstSegment = segments.length > 1 ? segments[1] : '';
    switch (firstSegment.trim().toLowerCase()) {
      case 'entitypermissions':
        this.selectItem(SettingsItem.EntityPermissions, false);
        break;
      case 'applications':
        this.selectItem(SettingsItem.Applications, false);
        break;
      case 'application':
        this.selectedApplicationName = segments.length > 2 ? segments[2] : '';
        const md = new Metadata();
        this.selectedApplicationID = md.Applications.find((a) => a.Name === this.selectedApplicationName)?.ID ?? '';
        this.selectItem(SettingsItem.Application, false);
        break;
      case 'users':
        this.selectItem(SettingsItem.Users, false);
        break;
      case 'user':
        this.selectedUserID = segments.length > 2 ? segments[2] : '';
        this.selectItem(SettingsItem.User, false);
        break;
      case 'roles':
        this.selectItem(SettingsItem.Roles, false);
        break;
      case 'role':
        this.selectedRoleID = segments.length > 2 ? segments[2] : '';
        this.selectItem(SettingsItem.Role, false);
        break;
      case 'sqllogging':
        this.selectItem(SettingsItem.SqlLogging, false);
        break;
      default:
        break;
    }
  }

  public selectApplication(a: BaseEntity) {
    this.selectRoute('/settings/application', (<ApplicationEntity>a).Name);
  }
  public selectRole(r: BaseEntity) {
    this.selectRoute('/settings/role', (<RoleEntity>r).ID);
  }
  public selectUser(u: BaseEntity) {
    this.selectRoute('/settings/user', (<UserEntity>u).ID);
  }

  /**
   * Function that returns the appropriate Font Awesome icon for the user toggle button
   * based on the user's IsActive status
   */
  public getUserToggleIcon(record: BaseEntity): string {
    const user = record as UserEntity;
    return user.IsActive ? 'fa-user-lock' : 'fa-user-check';
  }

  /**
   * Function that returns the appropriate tooltip text for the user toggle button
   * based on the user's IsActive status
   */
  public getUserToggleTooltip(record: BaseEntity): string {
    const user = record as UserEntity;
    return user.IsActive ? 'Deactivate user' : 'Activate user';
  }

  /**
   * Handles toggling a user's activation status when the custom action is confirmed
   */
  public async toggleUserActivation(record: BaseEntity) {
    try {
      const user = record as UserEntity;
      // Get current status
      const currentlyActive = user.IsActive;
      const userName = user.Name;

      // Toggle the IsActive flag
      user.IsActive = !currentlyActive;

      if (await user.Save()) {
        MJNotificationService.Instance.CreateSimpleNotification(
          `User ${userName} has been ${currentlyActive ? 'deactivated' : 'activated'} successfully.`,
          'success',
          3000
        );

        // Refresh the user list
        this.selectItem(SettingsItem.Users);
      } else {
        MJNotificationService.Instance.CreateSimpleNotification(
          `Error ${currentlyActive ? 'deactivating' : 'activating'} user ${userName}`,
          'error',
          5000
        );
      }
    } catch (error) {
      console.error('Error toggling user activation:', error);
      MJNotificationService.Instance.CreateSimpleNotification('An error occurred while toggling user activation.', 'error', 5000);
    }
  }
  public selectRoute(route: string, value: any) {
    this.router.navigate([route, value]);
  }

  public leftNavItemSelected(option: { label: string; value: any }) {
    // if the currentItem matches it directly or if adding an S to the current item matches it, then return true
    // for example for Application/Applications we want to match so the left nav item is highlighted
    return option.value === this.currentItem || option.value === this.currentItem + 's';
  }

  /**
   * Returns the appropriate Font Awesome icon class for navigation items
   */
  public getNavIcon(settingsItem: SettingsItem): string {
    const iconMap: { [key in SettingsItem]: string } = {
      [SettingsItem.Users]: 'fa-solid fa-users',
      [SettingsItem.User]: 'fa-solid fa-user',
      [SettingsItem.Roles]: 'fa-solid fa-user-shield',
      [SettingsItem.Role]: 'fa-solid fa-shield-alt',
      [SettingsItem.Applications]: 'fa-solid fa-th-large',
      [SettingsItem.Application]: 'fa-solid fa-cube',
      [SettingsItem.EntityPermissions]: 'fa-solid fa-lock',
      [SettingsItem.SqlLogging]: 'fa-solid fa-database',
    };
    return iconMap[settingsItem] || 'fa-solid fa-cog';
  }

  /**
   * Returns badge text for navigation items (if applicable)
   */
  public getNavBadge(settingsItem: SettingsItem): string | null {
    switch (settingsItem) {
      case SettingsItem.SqlLogging:
        return 'Beta';
      default:
        return null;
    }
  }

  /**
   * Returns badge CSS class for navigation items
   */
  public getNavBadgeClass(settingsItem: SettingsItem): string {
    switch (settingsItem) {
      case SettingsItem.SqlLogging:
        return 'nav-badge-warning';
      default:
        return 'nav-badge';
    }
  }
}
