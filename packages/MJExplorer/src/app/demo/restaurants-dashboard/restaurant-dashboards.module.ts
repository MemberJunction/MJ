import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Modules
import { LayoutModule } from '@progress/kendo-angular-layout';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';

// MJ Modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// Components
import { RestaurantDashboardComponent, LoadRestaurantDashboard } from './restaurant-dashboard.component';
import { RestaurantOverviewComponent, LoadRestaurantOverview } from './components/restaurant-overview/restaurant-overview.component';
import { RestaurantVisitsComponent, LoadRestaurantVisits } from './components/restaurant-visits/restaurant-visits.component';
import { RestaurantAnalyticsComponent, LoadRestaurantAnalytics } from './components/restaurant-analytics/restaurant-analytics.component';

// Services
import { RestaurantInstrumentationService } from './services/restaurant-instrumentation.service';

@NgModule({
  declarations: [
    RestaurantDashboardComponent,
    RestaurantOverviewComponent,
    RestaurantVisitsComponent,
    RestaurantAnalyticsComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    // Kendo UI
    LayoutModule,
    GridModule,
    DropDownsModule,
    DateInputsModule,
    ButtonsModule,
    InputsModule,
    // MJ
    SharedGenericModule
  ],
  providers: [
    RestaurantInstrumentationService
  ],
  exports: [
    RestaurantDashboardComponent,
    RestaurantOverviewComponent,
    RestaurantVisitsComponent,
    RestaurantAnalyticsComponent
  ]
})
export class RestaurantDashboardsModule {
  constructor() {
    // Tree-shaking prevention
    LoadRestaurantDashboard();
    LoadRestaurantOverview();
    LoadRestaurantVisits();
    LoadRestaurantAnalytics();
  }
}
