import { NgModule } from '@angular/core';

// Feature modules — each declares and exports its own components
import { CoreDashboardsModule } from './core-dashboards.module';
import { AIDashboardsModule } from './ai-dashboards.module';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';
import { ActionsDashboardsModule } from './actions-dashboards.module';
import { TestingDashboardsModule } from './testing-dashboards.module';
import { SchedulingDashboardsModule } from './scheduling-dashboards.module';
import { CommunicationDashboardsModule } from './communication-dashboards.module';
import { CredentialsDashboardsModule } from './credentials-dashboards.module';
import { DataExplorerDashboardsModule } from './data-explorer-dashboards.module';
import { ListsDashboardsModule } from './lists-dashboards.module';
import { ComponentStudioDashboardsModule } from './component-studio-dashboards.module';
// Existing standalone modules
import { MCPModule } from './MCP';
import { IntegrationModule } from './Integration/integration.module';

/**
 * DashboardsModule — backward-compatible wrapper that imports and re-exports
 * all feature modules. Non-MJExplorer consumers can continue importing this
 * single module to get everything.
 *
 * MJExplorer itself will switch to importing individual feature modules
 * for lazy loading in a later phase.
 */
@NgModule({
  imports: [
    CoreDashboardsModule,
    AIDashboardsModule,
    SharedDashboardWidgetsModule,
    ActionsDashboardsModule,
    TestingDashboardsModule,
    SchedulingDashboardsModule,
    CommunicationDashboardsModule,
    CredentialsDashboardsModule,
    DataExplorerDashboardsModule,
    ListsDashboardsModule,
    ComponentStudioDashboardsModule,
    MCPModule,
    IntegrationModule
  ],
  exports: [
    CoreDashboardsModule,
    AIDashboardsModule,
    SharedDashboardWidgetsModule,
    ActionsDashboardsModule,
    TestingDashboardsModule,
    SchedulingDashboardsModule,
    CommunicationDashboardsModule,
    CredentialsDashboardsModule,
    DataExplorerDashboardsModule,
    ListsDashboardsModule,
    ComponentStudioDashboardsModule,
    MCPModule,
    IntegrationModule
  ]
})
export class DashboardsModule { }
