import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { IApp, NavItem, Breadcrumb } from '../../core/models/app.interface';
import { ShellService } from '../../core/services/shell.service';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SettingsApp implements IApp {
  Id = 'settings';
  Name = 'Settings';
  Icon = 'fa-solid fa-gear';
  Route = '/settings';
  Color = '#616161'; // Gray - neutral, utility

  private currentRoute = '';
  private shellService!: ShellService;

  constructor(private router: Router) {
    // Track route changes to update breadcrumbs
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentRoute = event.urlAfterRedirects;
      });
  }

  Initialize(shellService: ShellService): void {
    this.shellService = shellService;
  }

  GetNavigationType(): 'list' | 'breadcrumb' {
    return 'breadcrumb';
  }

  GetNavItems(): NavItem[] {
    return []; // Not used for breadcrumb navigation
  }

  GetBreadcrumbs(): Breadcrumb[] {
    const breadcrumbs: Breadcrumb[] = [];

    if (this.currentRoute.includes('/settings/profile')) {
      breadcrumbs.push(
        { Label: 'User Preferences', Route: '/settings' },
        { Label: 'Profile', Route: undefined }
      );
    } else if (this.currentRoute.includes('/settings/notifications')) {
      breadcrumbs.push(
        { Label: 'User Preferences', Route: '/settings' },
        { Label: 'Notifications', Route: undefined }
      );
    } else if (this.currentRoute.includes('/settings/appearance')) {
      breadcrumbs.push(
        { Label: 'User Preferences', Route: '/settings' },
        { Label: 'Appearance', Route: undefined }
      );
    } else if (this.currentRoute === '/settings' || this.currentRoute === '/settings/') {
      breadcrumbs.push({ Label: 'User Preferences', Route: undefined });
    }

    return breadcrumbs;
  }

  CanHandleSearch(): boolean {
    return false; // Use default search
  }

  OnSearchRequested(query: string): void {
    // Not implemented
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
    console.log('Settings handling route:', segments);
  }
}
