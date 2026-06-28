import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageHeaderInteriorComponent,
  MJPageBodyComponent,
  MJPageBodyInteriorComponent,
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
import { PSProductionComponent } from './PredictiveStudio/components/ps-production.component';

import { PSHomeResourceComponent } from './PredictiveStudio/resources/ps-home-resource.component';
import { PSPipelinesResourceComponent } from './PredictiveStudio/resources/ps-pipelines-resource.component';
import { PSCatalogResourceComponent } from './PredictiveStudio/resources/ps-catalog-resource.component';
import { PSExperimentsResourceComponent } from './PredictiveStudio/resources/ps-experiments-resource.component';
import { PSRegistryResourceComponent } from './PredictiveStudio/resources/ps-registry-resource.component';
import { PSCompareResourceComponent } from './PredictiveStudio/resources/ps-compare-resource.component';
import { PSProductionResourceComponent } from './PredictiveStudio/resources/ps-production-resource.component';

/**
 * PredictiveStudioDashboardsModule — the lazy-loadable feature chunk for the Predictive Studio app.
 * Exported via a subpath in package.json (`./predictive-studio-dashboards.module`) so the lazy-config
 * generator + manifest map each Predictive Studio `BaseResourceComponent` DriverClass to this chunk.
 *
 * Predictive Studio is now a six-section top-nav app (the canonical MJ shape — mirrors AI
 * Administration). Each section is a `BaseResourceComponent` (`PS*ResourceComponent`) registered under
 * its own DriverClass and hosting one of the six standalone panels (`ps-home`, `ps-pipelines`, …):
 *   - PredictiveStudioHomeResource         → ps-home
 *   - PredictiveStudioPipelinesResource    → ps-pipelines
 *   - PredictiveStudioCatalogResource      → ps-catalog
 *   - PredictiveStudioExperimentsResource  → ps-experiments
 *   - PredictiveStudioRegistryResource     → ps-registry
 *   - PredictiveStudioCompareResource      → ps-compare
 *
 * The legacy monolithic `PredictiveStudioDashboardComponent` + its `PredictiveStudioResourceComponent`
 * wrapper are kept declared (no longer referenced by any Nav Item) for backward compatibility.
 */
@NgModule({
  declarations: [
    PredictiveStudioDashboardComponent,
    PredictiveStudioResourceComponent,
    PSHomeResourceComponent,
    PSPipelinesResourceComponent,
    PSCatalogResourceComponent,
    PSExperimentsResourceComponent,
    PSRegistryResourceComponent,
    PSCompareResourceComponent,
    PSProductionResourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageHeaderInteriorComponent,
    MJPageBodyComponent,
    MJPageBodyInteriorComponent,
    MJStatBadgeComponent,
    SharedGenericModule,
    ConversationsModule,
    PSHomeComponent,
    PSCatalogComponent,
    PSPipelinesComponent,
    PSExperimentsComponent,
    PSRegistryComponent,
    PSCompareComponent,
    PSProductionComponent,
  ],
  exports: [
    PredictiveStudioDashboardComponent,
    PredictiveStudioResourceComponent,
    PSHomeResourceComponent,
    PSPipelinesResourceComponent,
    PSCatalogResourceComponent,
    PSExperimentsResourceComponent,
    PSRegistryResourceComponent,
    PSCompareResourceComponent,
    PSProductionResourceComponent,
  ],
})
export class PredictiveStudioDashboardsModule {}

// Re-export the @RegisterClass-decorated classes from this subpath module so the lazy-config generator
// + manifest can reach them via the subpath .d.ts and map each DriverClass to this chunk.

// Legacy monolith (kept for backward compatibility; no longer referenced by any Nav Item).
export { PredictiveStudioDashboardComponent, LoadPredictiveStudioDashboard } from './PredictiveStudio/predictive-studio-dashboard.component';
export { PredictiveStudioResourceComponent, LoadPredictiveStudioResource } from './PredictiveStudio/predictive-studio-resource.component';

// The six top-nav section resources + their tree-shake-prevention loaders.
export { PSHomeResourceComponent, LoadPSHomeResource } from './PredictiveStudio/resources/ps-home-resource.component';
export { PSPipelinesResourceComponent, LoadPSPipelinesResource } from './PredictiveStudio/resources/ps-pipelines-resource.component';
export { PSCatalogResourceComponent, LoadPSCatalogResource } from './PredictiveStudio/resources/ps-catalog-resource.component';
export { PSExperimentsResourceComponent, LoadPSExperimentsResource } from './PredictiveStudio/resources/ps-experiments-resource.component';
export { PSRegistryResourceComponent, LoadPSRegistryResource } from './PredictiveStudio/resources/ps-registry-resource.component';
export { PSCompareResourceComponent, LoadPSCompareResource } from './PredictiveStudio/resources/ps-compare-resource.component';
export { PSProductionResourceComponent, LoadPSProductionResource } from './PredictiveStudio/resources/ps-production-resource.component';
