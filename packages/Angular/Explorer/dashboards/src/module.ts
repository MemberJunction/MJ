import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HelloDashboardComponent } from './demo/hello-dashboard.component';

@NgModule({
  declarations: [
    HelloDashboardComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    HelloDashboardComponent
  ]
})
export class DashboardsModule { }