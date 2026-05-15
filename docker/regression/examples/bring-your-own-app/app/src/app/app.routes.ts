import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  { path: '', redirectTo: '/counter', pathMatch: 'full' },
  { path: 'counter', loadComponent: () => import('./counter/counter.component').then(m => m.CounterComponent) },
  { path: 'contact', loadComponent: () => import('./contact/contact.component').then(m => m.ContactComponent) },
];
