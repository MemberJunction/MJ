import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ConversationsModule } from '@memberjunction/ng-conversations';

import { PredictiveStudioDashboardComponent } from './PredictiveStudio/predictive-studio-dashboard.component';
import { PredictiveStudioResourceComponent } from './PredictiveStudio/predictive-studio-resource.component';
import { PSHomeComponent } from './PredictiveStudio/components/ps-home.component';
import { PSCatalogComponent } from './PredictiveStudio/components/ps-catalog.component';
import { PSPipelinesComponent } from './PredictiveStudio/components/ps-pipelines.component';
import { PSExperimentsComponent } from './PredictiveStudio/components/ps-experiments.component';
import { PSRegistryComponent } from './PredictiveStudio/components/ps-registry.component';
import { PSCompareComponent } from './PredictiveStudio/components/ps-compare.component';

/**
 * PredictiveStudioDashboardsModule — the lazy-loadable feature chunk for the Predictive Studio
 * Explorer dashboard. Exported via a subpath in package.json
 * (`./predictive-studio-dashboards.module`) so the lazy-config generator maps
 * `BaseDashboard::PredictiveStudioDashboard` to this chunk.
 *
 * The dashboard shell is NgModule-declared (`standalone: false`); the six panels are standalone
 * components imported here.
 */
@NgModule({
  declarations: [PredictiveStudioDashboardComponent, PredictiveStudioResourceComponent],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJStatBadgeComponent,
    SharedGenericModule,
    ConversationsModule,
    PSHomeComponent,
    PSCatalogComponent,
    PSPipelinesComponent,
    PSExperimentsComponent,
    PSRegistryComponent,
    PSCompareComponent,
  ],
  exports: [PredictiveStudioDashboardComponent, PredictiveStudioResourceComponent],
})
export class PredictiveStudioDashboardsModule {}

// Re-export the @RegisterClass-decorated dashboard from this subpath module so the lazy-config
// generator can reach it via the subpath .d.ts and map BaseDashboard::PredictiveStudioDashboard
// to this chunk. (Same pattern as ComponentStudioDashboardsModule.)
export { PredictiveStudioDashboardComponent, LoadPredictiveStudioDashboard } from './PredictiveStudio/predictive-studio-dashboard.component';
// Re-export the BaseResourceComponent wrapper (registered BaseResourceComponent::PredictiveStudioDashboard,
// the nav-item DriverClass the shell resolver looks up) + its tree-shake-prevention loader.
export { PredictiveStudioResourceComponent, LoadPredictiveStudioResource } from './PredictiveStudio/predictive-studio-resource.component';
