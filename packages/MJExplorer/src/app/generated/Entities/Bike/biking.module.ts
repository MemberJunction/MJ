import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Modules
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

// MemberJunction Modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Dashboard Components
import { BikingDashboardComponent } from './biking-dashboard.component';

// Resource Components
import { BikingDashboardResourceComponent, LoadBikingDashboardResource } from './components/biking-dashboard-resource.component';
import { BikingRidesResourceComponent, LoadBikingRidesResource } from './components/biking-rides-resource.component';
import { BikingLocationsResourceComponent, LoadBikingLocationsResource } from './components/biking-locations-resource.component';
import { BikingFleetResourceComponent, LoadBikingFleetResource } from './components/biking-fleet-resource.component';
import { BikingFindResourceComponent, LoadBikingFindResource } from './components/biking-find-resource.component';
import { BikingRouteRecommendationsResourceComponent, LoadBikingRouteRecommendationsResource } from './components/biking-route-recommendations-resource.component';

// Services
import { BikingInstrumentationService } from './services/biking-instrumentation.service';
import { RouteRecommendationService } from './services/route-recommendation.service';

@NgModule({
  declarations: [
    BikingDashboardComponent,
    BikingDashboardResourceComponent,
    BikingRidesResourceComponent,
    BikingLocationsResourceComponent,
    BikingFleetResourceComponent,
    BikingFindResourceComponent,
    BikingRouteRecommendationsResourceComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ButtonsModule,
    DropDownsModule,
    InputsModule,
    DateInputsModule,
    LayoutModule,
    IndicatorsModule,
    SharedGenericModule,
    ContainerDirectivesModule
  ],
  providers: [
    BikingInstrumentationService,
    RouteRecommendationService
  ],
  exports: [
    BikingDashboardComponent,
    BikingDashboardResourceComponent,
    BikingRidesResourceComponent,
    BikingLocationsResourceComponent,
    BikingFleetResourceComponent,
    BikingFindResourceComponent,
    BikingRouteRecommendationsResourceComponent
  ]
})
export class BikingModule { }

/**
 * Tree-shaking prevention - call this function to ensure the module is included
 */
export function LoadBikingModule(): void {
  // Force inclusion in production builds by referencing all resource loaders
  LoadBikingDashboardResource();
  LoadBikingRidesResource();
  LoadBikingLocationsResource();
  LoadBikingFleetResource();
  LoadBikingFindResource();
  LoadBikingRouteRecommendationsResource();
}
