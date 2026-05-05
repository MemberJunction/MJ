import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { AdminSection, BaseAdminContainerComponent } from './base-admin-container.component';

/**
 * Admin → Identity & Access. Users, roles, app-role assignments,
 * entity permissions, and API keys.
 */
@RegisterClass(BaseResourceComponent, 'AdminIdentityAccess')
@Component({
    standalone: false,
    selector: 'mj-admin-identity-access',
    templateUrl: './admin-container.component.html',
    styleUrls: ['./admin-container.component.css']
})
export class AdminIdentityAccessComponent extends BaseAdminContainerComponent {
    public readonly ContainerTitle = 'Identity & Access';
    public readonly ContainerIcon = 'fa-solid fa-shield-halved';
    public readonly ContainerSubtitle = 'Users, roles, permissions, and API keys';

    public readonly Sections: AdminSection[] = [
        {
            id: 'users',
            label: 'Users',
            icon: 'fa-solid fa-users',
            description: 'Manage user accounts',
            source: { kind: 'dashboard', dashboardName: 'User Management' }
        },
        {
            id: 'roles',
            label: 'Roles',
            icon: 'fa-solid fa-user-shield',
            description: 'Define roles and assignments',
            source: { kind: 'dashboard', dashboardName: 'Role Management' }
        },
        {
            id: 'apps',
            label: 'Apps',
            icon: 'fa-solid fa-th-large',
            description: 'Application configuration',
            source: { kind: 'dashboard', dashboardName: 'Application Management' }
        },
        {
            id: 'app-roles',
            label: 'App Roles',
            icon: 'fa-solid fa-people-roof',
            description: 'Role assignments per application',
            source: { kind: 'resource', driverClass: 'ApplicationRolesResource' }
        },
        {
            id: 'permissions',
            label: 'Permissions',
            icon: 'fa-solid fa-lock',
            description: 'Entity-level access and audit',
            source: { kind: 'dashboard', dashboardName: 'Entity Permissions' }
        },
        {
            id: 'api-keys',
            label: 'API Keys',
            icon: 'fa-solid fa-key',
            description: 'API authentication and scopes',
            source: { kind: 'resource', driverClass: 'APIKeysResource' }
        }
    ];
}
