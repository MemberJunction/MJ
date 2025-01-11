import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from '@auth0/auth0-angular';
import { NoAccessComponent } from './no-access/no-access.component';
import { SkipComponent } from './skip/skip.component';
import { ReportListComponent } from './report-list/report-list.component';
import { SingleReportComponent } from './single-report/single-report.component';

const routes: Routes = [
  {
    path: 'chat/:conversationId',
    component: SkipComponent,
    canActivate: [AuthGuard], // Protect this route
    data: { breadcrumb: 'skip' }
  },
  { 
    path: 'report-list',
    component: ReportListComponent,
    canActivate: [AuthGuard], // Protect this route
    data: { breadcrumb: 'report-list' }
  },
  { 
    path: 'report/:id',
    component: SingleReportComponent,
    canActivate: [AuthGuard], // Protect this route
    data: { breadcrumb: 'report' }
  },
  { 
    path: '',
    component: HomeComponent,
    data: { breadcrumb: 'Home' }
  },
  { 
    path: 'no-access',
    component: NoAccessComponent
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    scrollPositionRestoration: 'enabled',
    anchorScrolling: 'enabled',
  })],
  exports: [RouterModule] 
})
export class AppRoutingModule {}
