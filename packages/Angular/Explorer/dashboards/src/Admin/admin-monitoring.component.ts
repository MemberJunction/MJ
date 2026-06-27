import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { AdminSection, BaseAdminContainerComponent } from './base-admin-container.component';

/**
 * Admin → Monitoring. System health, SQL execution logs, and outbound
 * communication delivery monitoring.
 */
@RegisterClass(BaseResourceComponent, 'AdminMonitoring')
@Component({
    standalone: false,
    selector: 'mj-admin-monitoring',
    templateUrl: './admin-container.component.html',
    styleUrls: ['./admin-container.component.css']
})
export class AdminMonitoringComponent extends BaseAdminContainerComponent {
    public readonly ContainerTitle = 'Monitoring';
    public readonly ContainerIcon = 'fa-solid fa-stethoscope';
    public readonly ContainerSubtitle = 'System health and query execution logs';

    // Communication Monitor intentionally NOT included here — outbound delivery
    // monitoring belongs in the Communications app, not in the Admin app.
    public readonly Sections: AdminSection[] = [
        {
            id: 'diagnostics',
            label: 'Diagnostics',
            icon: 'fa-solid fa-stethoscope',
            description: 'Runtime health and connectivity',
            source: { kind: 'resource', driverClass: 'SystemDiagnosticsResource' }
        },
        {
            id: 'sql-logging',
            label: 'SQL Logging',
            icon: 'fa-solid fa-file-code',
            description: 'Captured SQL execution logs',
            source: { kind: 'dashboard', dashboardName: 'SQL Logging' }
        }
    ];
}
