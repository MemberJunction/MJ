import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { IApp, NavItem, Breadcrumb } from '../../core/models/app.interface';
import { ShellService } from '../../core/services/shell.service';

@Injectable({
  providedIn: 'root'
})
export class CrmApp implements IApp {
  Id = 'crm';
  Name = 'CRM';
  Icon = 'fa-solid fa-briefcase';
  Route = '/crm';
  Color = '#2e7d32'; // Green - growth, relationships

  private shellService!: ShellService;

  constructor(private router: Router) {}

  Initialize(shellService: ShellService): void {
    this.shellService = shellService;
  }

  GetNavigationType(): 'list' | 'breadcrumb' {
    return 'list';
  }

  GetNavItems(): NavItem[] {
    return [
      {
        Label: 'Dashboard',
        Route: '/crm/dashboard',
        Icon: 'fa-solid fa-chart-line'
      },
      {
        Label: 'Contacts',
        Route: '/crm/contacts',
        Icon: 'fa-solid fa-user',
        Badge: 42
      },
      {
        Label: 'Companies',
        Route: '/crm/companies',
        Icon: 'fa-solid fa-building',
        Badge: 15
      },
      {
        Label: 'Opportunities',
        Route: '/crm/opportunities',
        Icon: 'fa-solid fa-handshake',
        Badge: 8
      }
    ];
  }

  GetBreadcrumbs(): Breadcrumb[] {
    return []; // Not used for list navigation
  }

  CanHandleSearch(): boolean {
    return true;
  }

  OnSearchRequested(query: string): void {
    console.log('CRM app searching for:', query);
    // Custom search within CRM data
  }

  RequestNewTab(title: string, route: string, data?: any): void {
    if (this.shellService) {
      this.shellService.OpenTab({
        AppId: this.Id,
        Title: title,
        Route: route,
        Data: data
      });
    }
  }

  HandleRoute(segments: string[]): void {
    console.log('CRM handling route:', segments);
  }
}
