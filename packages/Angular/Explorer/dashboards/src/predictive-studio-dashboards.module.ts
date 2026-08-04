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

import { PSHomeComponent } from './PredictiveStudio/components/ps-home.component';
import { PSCatalogComponent } from './PredictiveStudio/components/ps-catalog.component';
import { PSPipelinesComponent } from './PredictiveStudio/components/ps-pipelines.component';
import { PSExperimentsComponent } from './PredictiveStudio/components/ps-experiments.component';
import { PSRegistryComponent } from './PredictiveStudio/components/ps-registry.component';
import { PSCompareComponent } from './PredictiveStudio/components/ps-compare.component';
import { PSProductionComponent } from './PredictiveStudio/components/ps-production.component';

import { PSPredictionsResourceComponent } from './PredictiveStudio/resources/ps-predictions-resource.component';
import { PSStudioResourceComponent } from './PredictiveStudio/resources/ps-studio-resource.component';
import { PSModelsResourceComponent } from './PredictiveStudio/resources/ps-models-resource.component';

/**
 * PredictiveStudioDashboardsModule — the lazy-loadable feature chunk for the Predictive Studio app.
 * Exported via a subpath in package.json (`./predictive-studio-dashboards.module`) so the lazy-config
 * generator + manifest map each Predictive Studio `BaseResourceComponent` DriverClass to this chunk.
 *
 * Predictive Studio is a **three-door** app — a business front door plus two analyst workbench doors —
 * each a `BaseResourceComponent` registered under its own DriverClass:
 *   - PredictiveStudioPredictionsResource  → business catalog + trust-gated workspace + "New prediction" copilot
 *   - PredictiveStudioStudioResource       → internal left-nav over ps-home / ps-pipelines / ps-catalog / ps-experiments / ps-compare
 *   - PredictiveStudioModelsResource       → internal left-nav over ps-registry / ps-production
 *
 * This consolidates the prior eight flat top-nav items (each its own resource) into three, so a business
 * user sees one door and analysts opt into the depth via the Studio / Models left-navs. The two
 * workbench hosts reuse the same standalone section panels (`ps-home`, `ps-pipelines`, …) the old
 * per-section resources hosted — only the wrapping changed.
 */
@NgModule({
  declarations: [
    PSPredictionsResourceComponent,
    PSStudioResourceComponent,
    PSModelsResourceComponent,
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
    PSPredictionsResourceComponent,
    PSStudioResourceComponent,
    PSModelsResourceComponent,
  ],
})
export class PredictiveStudioDashboardsModule {}

// Re-export the @RegisterClass-decorated classes from this subpath module so the lazy-config generator
// + manifest can reach them via the subpath .d.ts and map each DriverClass to this chunk. The three
// doors + their tree-shake-prevention loaders:
export { PSPredictionsResourceComponent, LoadPSPredictionsResource } from './PredictiveStudio/resources/ps-predictions-resource.component';
export { PSStudioResourceComponent, LoadPSStudioResource } from './PredictiveStudio/resources/ps-studio-resource.component';
export { PSModelsResourceComponent, LoadPSModelsResource } from './PredictiveStudio/resources/ps-models-resource.component';
