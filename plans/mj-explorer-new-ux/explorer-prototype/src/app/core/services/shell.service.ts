import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { IApp, TabRequest, TabState } from '../models/app.interface';
import { StorageService } from './storage.service';

/**
 * Shell service - coordinates between apps and manages tab state
 */
@Injectable({
  providedIn: 'root'
})
export class ShellService {
  private apps = new Map<string, IApp>();
  private activeApp$ = new BehaviorSubject<IApp | null>(null);
  private tabs$ = new BehaviorSubject<TabState[]>([]);
  private activeTabId$ = new BehaviorSubject<string | null>(null);

  constructor(
    private router: Router,
    private storage: StorageService
  ) {
    this.loadTabsFromStorage();
  }

  // App Registration
  RegisterApp(app: IApp): void {
    this.apps.set(app.Id, app);
  }

  GetApp(appId: string): IApp | null {
    return this.apps.get(appId) || null;
  }

  SetActiveApp(appId: string): void {
    const app = this.apps.get(appId);
    if (app) {
      this.activeApp$.next(app);
    }
  }

  GetActiveApp(): Observable<IApp | null> {
    return this.activeApp$.asObservable();
  }

  // Tab Management
  OpenTab(request: TabRequest): string {
    const tabId = this.generateTabId();
    const tab: TabState = {
      Id: tabId,
      AppId: request.AppId,
      Title: request.Title,
      Route: request.Route,
      Data: request.Data
    };

    const currentTabs = this.tabs$.value;
    currentTabs.push(tab);
    this.tabs$.next(currentTabs);
    this.activeTabId$.next(tabId);
    this.saveTabsToStorage();

    return tabId;
  }

  CloseTab(tabId: string): void {
    const currentTabs = this.tabs$.value;
    const filtered = currentTabs.filter(t => t.Id !== tabId);
    this.tabs$.next(filtered);

    // If closing active tab, activate the last tab
    if (this.activeTabId$.value === tabId && filtered.length > 0) {
      this.activeTabId$.next(filtered[filtered.length - 1].Id);
    } else if (filtered.length === 0) {
      this.activeTabId$.next(null);
    }

    this.saveTabsToStorage();
  }

  SetActiveTab(tabId: string): void {
    this.activeTabId$.next(tabId);
    this.saveTabsToStorage();
  }

  GetTabs(): Observable<TabState[]> {
    return this.tabs$.asObservable();
  }

  GetActiveTabId(): Observable<string | null> {
    return this.activeTabId$.asObservable();
  }

  HasTabs(): boolean {
    return this.tabs$.value.length > 0;
  }

  // Navigation
  Navigate(route: string): void {
    this.router.navigate([route]);
  }

  // Search handling
  HandleSearch(query: string): void {
    const activeApp = this.activeApp$.value;
    if (activeApp?.CanHandleSearch()) {
      activeApp.OnSearchRequested(query);
    } else {
      // Default global search
      console.log('Global search:', query);
    }
  }

  // Private helpers
  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private saveTabsToStorage(): void {
    this.storage.Save('tabs', this.tabs$.value);
    this.storage.Save('activeTabId', this.activeTabId$.value);
  }

  private loadTabsFromStorage(): void {
    const tabs = this.storage.Load<TabState[]>('tabs') || [];
    const activeTabId = this.storage.Load<string>('activeTabId');

    this.tabs$.next(tabs);
    if (activeTabId && tabs.some(t => t.Id === activeTabId)) {
      this.activeTabId$.next(activeTabId);
    }
  }
}
