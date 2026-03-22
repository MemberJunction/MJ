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
// External generic modules (imported for backward compatibility with non-MJExplorer consumers)
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { AgentRequestsModule } from '@memberjunction/ng-agent-requests';
import { SharedPipesModule } from './shared/shared-pipes.module';
import { ActionsModule } from '@memberjunction/ng-actions';
import { AgentsModule } from '@memberjunction/ng-agents';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { VersionsModule } from '@memberjunction/ng-versions';
import { SchedulingModule } from '@memberjunction/ng-scheduling';
import { NgTreesModule } from '@memberjunction/ng-trees';

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
    IntegrationModule,
    // External generic modules (re-exported for backward compatibility)
    CredentialsModule,
    AgentRequestsModule,
    SharedPipesModule,
    ActionsModule,
    AgentsModule,
    MarkdownModule,
    VersionsModule,
    SchedulingModule,
    NgTreesModule
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
    IntegrationModule,
    // External generic modules (re-exported for backward compatibility)
    CredentialsModule,
    AgentRequestsModule,
    SharedPipesModule
  ]
})
export class DashboardsModule { }
