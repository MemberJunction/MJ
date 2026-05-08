import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { AdminSection, BaseAdminContainerComponent } from './base-admin-container.component';

/**
 * Admin → Data & Schema. ERD viewer, query browser, and the database
 * designer wizard. Order matters here: ERD first (overview), then Query
 * Browser (read), then Database Designer (write).
 */
@RegisterClass(BaseResourceComponent, 'AdminDataSchema')
@Component({
    standalone: false,
    selector: 'mj-admin-data-schema',
    templateUrl: './admin-container.component.html',
    styleUrls: ['./admin-container.component.css']
})
export class AdminDataSchemaComponent extends BaseAdminContainerComponent {
    public readonly ContainerTitle = 'Data & Schema';
    public readonly ContainerIcon = 'fa-solid fa-database';
    public readonly ContainerSubtitle = 'Schema visualization, queries, and database design';

    public readonly Sections: AdminSection[] = [
        {
            id: 'erd',
            label: 'ERD',
            icon: 'fa-solid fa-diagram-project',
            description: 'Entity-relationship diagram',
            source: { kind: 'dashboard', dashboardName: 'ERD' }
        },
        {
            id: 'query-browser',
            label: 'Query Browser',
            icon: 'fa-solid fa-magnifying-glass',
            description: 'Browse and run stored queries',
            source: { kind: 'resource', driverClass: 'QueryBrowserResource' }
        },
        {
            id: 'database-designer',
            label: 'Database Designer',
            icon: 'fa-solid fa-wand-magic-sparkles',
            description: 'Create entities and fields',
            source: { kind: 'resource', driverClass: 'DatabaseDesignerDashboard' }
        }
    ];
}
