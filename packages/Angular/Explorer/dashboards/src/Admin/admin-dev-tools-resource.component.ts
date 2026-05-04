import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { AdminSection, BaseAdminContainerComponent } from './base-admin-container.component';

/**
 * Admin → Developer Tools. Diagnostic and inspection sub-tools for developers.
 */
@RegisterClass(BaseResourceComponent, 'AdminDeveloperTools')
@Component({
    standalone: false,
    selector: 'mj-admin-dev-tools-resource',
    templateUrl: './admin-container.component.html',
    styleUrls: ['./admin-container.component.css']
})
export class AdminDevToolsResourceComponent extends BaseAdminContainerComponent {
    public readonly ContainerTitle = 'Developer Tools';
    public readonly ContainerIcon = 'fa-solid fa-screwdriver-wrench';
    public readonly ContainerSubtitle = 'Diagnostic and inspection tools for developers';

    public readonly Sections: AdminSection[] = [
        {
            id: 'graphql',
            label: 'GraphQL Console',
            icon: 'fa-solid fa-code',
            description: 'Run queries against the API',
            source: { kind: 'resource', driverClass: 'GraphQLConsoleInspector' }
        },
        {
            id: 'events',
            label: 'Event Monitor',
            icon: 'fa-solid fa-bolt',
            description: 'Live tail of MJ events',
            source: { kind: 'resource', driverClass: 'EventMonitorInspector' }
        },
        {
            id: 'classes',
            label: 'Class Registry',
            icon: 'fa-solid fa-cubes',
            description: 'All @RegisterClass entries',
            source: { kind: 'resource', driverClass: 'ClassRegistryInspector' }
        },
        {
            id: 'lazy',
            label: 'Lazy Loading',
            icon: 'fa-solid fa-puzzle-piece',
            description: 'Code-split chunk status',
            source: { kind: 'resource', driverClass: 'LazyModuleStatusInspector' }
        },
        {
            id: 'settings',
            label: 'Settings Explorer',
            icon: 'fa-solid fa-sliders',
            description: 'User and instance settings',
            source: { kind: 'resource', driverClass: 'SettingsExplorerInspector' }
        },
        {
            id: 'app-state',
            label: 'App State',
            icon: 'fa-solid fa-magnifying-glass-chart',
            description: 'Snapshot of user, provider, workspace',
            source: { kind: 'resource', driverClass: 'AppStateInspector' }
        },
        {
            id: 'layout',
            label: 'Layout',
            icon: 'fa-solid fa-table-columns',
            description: 'Workspace + Golden Layout config',
            source: { kind: 'resource', driverClass: 'LayoutInspector' }
        }
    ];
}
