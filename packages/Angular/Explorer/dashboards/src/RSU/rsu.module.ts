import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { UDTCreatorComponent, LoadUDTCreator } from './components/udt-creator/udt-creator.component';
import { RSUDashboardComponent, LoadRSUDashboard } from './components/rsu-dashboard/rsu-dashboard.component';

@NgModule({
  declarations: [
    UDTCreatorComponent,
    RSUDashboardComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
  ],
  exports: [
    UDTCreatorComponent,
    RSUDashboardComponent,
  ],
})
export class RSUModule {}

export function LoadRSUModule() {
  LoadUDTCreator();
  LoadRSUDashboard();
}
