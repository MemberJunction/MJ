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
import { BikingDashboardResourceComponent } from './components/biking-dashboard-resource.component';
import { BikingRidesResourceComponent } from './components/biking-rides-resource.component';
import { BikingLocationsResourceComponent } from './components/biking-locations-resource.component';
import { BikingFleetResourceComponent } from './components/biking-fleet-resource.component';

// Services
import { BikingInstrumentationService } from './services/biking-instrumentation.service';

@NgModule({
  declarations: [
    BikingDashboardComponent,
    BikingDashboardResourceComponent,
    BikingRidesResourceComponent,
    BikingLocationsResourceComponent,
    BikingFleetResourceComponent
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
    BikingInstrumentationService
  ],
  exports: [
    BikingDashboardComponent,
    BikingDashboardResourceComponent,
    BikingRidesResourceComponent,
    BikingLocationsResourceComponent,
    BikingFleetResourceComponent
  ]
})
export class BikingModule { }

/**
 * Tree-shaking prevention - call this function to ensure the module is included
 */
export function LoadBikingModule(): void {
  // Force inclusion in production builds
}
