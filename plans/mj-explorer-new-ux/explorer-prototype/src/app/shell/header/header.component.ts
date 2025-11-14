import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ShellService } from '../../core/services/shell.service';
import { IApp, NavItem, Breadcrumb } from '../../core/models/app.interface';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  activeApp: IApp | null = null;
  navItems: NavItem[] = [];
  breadcrumbs: Breadcrumb[] = [];
  navigationType: 'list' | 'breadcrumb' | null = null;
  searchQuery = '';
  showUserMenu = false;
  showAppSwitcher = false; // TODO: Implement app switcher dropdown

  constructor(private shellService: ShellService) {}

  ngOnInit(): void {
    this.shellService.GetActiveApp().subscribe(app => {
      this.activeApp = app;
      if (app) {
        this.navigationType = app.GetNavigationType();
        if (this.navigationType === 'list') {
          this.navItems = app.GetNavItems();
          this.breadcrumbs = [];
        } else {
          this.breadcrumbs = app.GetBreadcrumbs();
          this.navItems = [];
        }
      }
    });
  }

  OnSearch(): void {
    if (this.searchQuery.trim()) {
      this.shellService.HandleSearch(this.searchQuery);
    }
  }

  ToggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  OnNavigate(route: string): void {
    this.shellService.Navigate(route);
  }

  ToggleAppSwitcher(): void {
    // TODO: Show dropdown menu with all registered apps
    // User clicks logo → Shows list of all apps
    // Click app → Navigate to that app's default route
    this.showAppSwitcher = !this.showAppSwitcher;
  }

  GetAllApps(): IApp[] {
    // TODO: Get all registered apps from ShellService
    // return this.shellService.GetAllApps();
    return [];
  }
}
