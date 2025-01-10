import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from '@auth0/auth0-angular';
import { NoAccessComponent } from './no-access/no-access.component';
import { EntityListComponent } from './entity-list/entity-list.component';
import { SkipComponent } from './skip/skip.component';

const routes: Routes = [
  {
    path: 'entity-list',
    component: EntityListComponent,
    canActivate: [AuthGuard], // Protect this route
    data: { breadcrumb: 'entity-list' }
  },
  {
    path: 'skip',
    component: SkipComponent,
    canActivate: [AuthGuard], // Protect this route
    data: { breadcrumb: 'skip' }
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
