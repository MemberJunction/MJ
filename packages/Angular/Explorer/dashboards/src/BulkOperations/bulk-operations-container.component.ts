import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { AdminSection, BaseAdminContainerComponent } from '../Admin/base-admin-container.component';

/**
 * Bulk Operations dashboard container — the left-nav shell for the Bulk Operations app. Reuses the proven
 * Admin container shell (template + base) and contributes two sections: Operations (author + run) and Run
 * History (audit). Each section hosts a thin resource component that renders the generic
 * `@memberjunction/ng-record-process-studio` UI.
 */
@RegisterClass(BaseResourceComponent, 'BulkOperationsContainer')
@Component({
    standalone: false,
    selector: 'mj-bulk-operations-container',
    templateUrl: '../Admin/admin-container.component.html',
    styleUrls: ['../Admin/admin-container.component.css'],
})
export class BulkOperationsContainerComponent extends BaseAdminContainerComponent {
    public readonly ContainerTitle = 'Bulk Operations';
    public readonly ContainerIcon = 'fa-solid fa-layer-group';
    public readonly ContainerSubtitle = 'Define and run rules-driven bulk operations across your data';

    public readonly Sections: AdminSection[] = [
        {
            id: 'operations',
            label: 'Operations',
            icon: 'fa-solid fa-wand-magic-sparkles',
            description: 'Create, edit, and run bulk operations',
            source: { kind: 'resource', driverClass: 'BulkOperationsOperations' },
        },
        {
            id: 'run-history',
            label: 'Run History',
            icon: 'fa-solid fa-clock-rotate-left',
            description: 'Past runs and their per-record results',
            source: { kind: 'resource', driverClass: 'BulkOperationsRunHistory' },
        },
    ];
}
