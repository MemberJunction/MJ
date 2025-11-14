/**
 * Core interfaces for the shell/app architecture
 */

export interface IApp {
  // Identity
  Id: string;
  Name: string;
  Icon: string;
  Route: string;

  // Navigation style
  GetNavigationType(): 'list' | 'breadcrumb';

  // List navigation (tabs/options)
  GetNavItems(): NavItem[];

  // Breadcrumb navigation
  GetBreadcrumbs(): Breadcrumb[];

  // Chrome extension points
  CanHandleSearch(): boolean;
  OnSearchRequested(query: string): void;

  // Tab management
  RequestNewTab(title: string, route: string, data?: any): void;
  HandleRoute(segments: string[]): void;
}

export interface NavItem {
  Label: string;
  Route: string;
  Icon?: string;
  Badge?: number;
}

export interface Breadcrumb {
  Label: string;
  Route?: string; // null/undefined = current page (not clickable)
  Icon?: string;
}

export interface TabRequest {
  AppId: string;
  Title: string;
  Route: string;
  Data?: any;
}

export interface TabState {
  Id: string;
  AppId: string;
  Title: string;
  Route: string;
  Data?: any;
  IsPermanent?: boolean; // VSCode-style: false = temporary (gets replaced), true = permanent (stays)
}
