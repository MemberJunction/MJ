import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, createComponent, EnvironmentInjector, ApplicationRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ShellService } from '../../core/services/shell.service';
import { TabState } from '../../core/models/app.interface';
import { Subscription } from 'rxjs';
import { LayoutConfig, ComponentItemConfig, ResolvedComponentItemConfig, ComponentContainer, ResolvedLayoutConfig, LayoutConfig as GLLayoutConfig } from 'golden-layout';
import { VirtualLayout, LayoutConfig as GoldenLayoutConfigClass } from 'golden-layout';

// Import all the components we might need to render
import { ChatComponent } from '../../apps/conversations/chat/chat.component';
import { CollectionsComponent } from '../../apps/conversations/collections/collections.component';
import { TasksComponent } from '../../apps/conversations/tasks/tasks.component';
import { SettingsComponent } from '../../apps/settings/settings.component';
import { CrmDashboardComponent } from '../../apps/crm/dashboard/dashboard.component';
import { ContactsComponent } from '../../apps/crm/contacts/contacts.component';
import { ContactDetailComponent } from '../../apps/crm/contact-detail/contact-detail.component';
import { CompaniesComponent } from '../../apps/crm/companies/companies.component';
import { OpportunitiesComponent } from '../../apps/crm/opportunities/opportunities.component';

interface TabComponentState {
  tabId: string;
  title: string;
  route: string;
}

// Map routes to components
const ROUTE_COMPONENT_MAP: { [key: string]: any } = {
  '/conversations/chat': ChatComponent,
  '/conversations/collections': CollectionsComponent,
  '/conversations/tasks': TasksComponent,
  '/settings': SettingsComponent,
  '/crm/dashboard': CrmDashboardComponent,
  '/crm/contacts': ContactsComponent,
  '/crm/contact': ContactDetailComponent,
  '/crm/companies': CompaniesComponent,
  '/crm/opportunities': OpportunitiesComponent
};

@Component({
  selector: 'app-tab-container',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './tab-container.component.html',
  styleUrls: ['./tab-container.component.scss']
})
export class TabContainerComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('layoutContainer', { static: false }) layoutContainerRef!: ElementRef;

  private layout: VirtualLayout | null = null;
  private subscriptions: Subscription[] = [];
  private isInitialized = false;
  private componentRefs = new Map<string, any>();

  constructor(
    private shellService: ShellService,
    private router: Router,
    private environmentInjector: EnvironmentInjector,
    private appRef: ApplicationRef
  ) {}

  ngOnInit(): void {
    // Subscribe to tabs and update Golden Layout
    this.subscriptions.push(
      this.shellService.GetTabs().subscribe(tabs => {
        if (this.isInitialized && this.layout) {
          this.updateLayout(tabs);
        }
      })
    );

    // Subscribe to active tab
    this.subscriptions.push(
      this.shellService.GetActiveTabId().subscribe(tabId => {
        if (tabId) {
          const tabs = this.shellService['tabs$'].value;
          const tab = tabs.find((t: TabState) => t.Id === tabId);
          if (tab && this.layout) {
            this.focusTab(tabId);
            // Update URL for deep linking only if it's different
            const currentUrl = this.router.url;
            if (currentUrl !== tab.Route) {
              this.router.navigate([tab.Route], { skipLocationChange: false });
            }
          }
        }
      })
    );
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initializeGoldenLayout(), 0);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Clean up all component refs
    this.componentRefs.forEach(compRef => {
      this.appRef.detachView(compRef.hostView);
      compRef.destroy();
    });
    this.componentRefs.clear();

    if (this.layout) {
      this.layout.destroy();
    }
  }

  private initializeGoldenLayout(): void {
    const container = this.layoutContainerRef.nativeElement;

    this.layout = new VirtualLayout(
      container,
      this.bindComponentEvent.bind(this),
      this.unbindComponentEvent.bind(this)
    );

    // Try to load saved layout configuration
    const savedConfig = this.shellService.LoadLayoutConfig();
    const tabs = this.shellService['tabs$'].value;

    // Check if saved config has actual content (not just empty root)
    const savedConfigHasContent = savedConfig?.root?.content && savedConfig.root.content.length > 0;

    if (savedConfigHasContent && tabs.length > 0) {
      // Restore saved layout with existing tabs
      try {
        this.layout.loadLayout(savedConfig);
        this.isInitialized = true;
      } catch (error) {
        console.warn('Failed to restore saved layout, using default:', error);
        this.loadDefaultLayout(tabs);
      }
    } else {
      // Start with empty layout and add tabs
      this.loadDefaultLayout(tabs);
    }

    // Set initial size explicitly
    const rect = container.getBoundingClientRect();
    this.layout.setSize(rect.width, rect.height);

    // Force layout update after loading
    setTimeout(() => {
      if (this.layout) {
        const rect = container.getBoundingClientRect();
        this.layout.setSize(rect.width, rect.height);
      }
    }, 100);

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.layout) {
        const rect = container.getBoundingClientRect();
        this.layout.setSize(rect.width, rect.height);
      }
    });

    // Save layout configuration whenever it changes
    this.layout.on('stateChanged', () => {
      this.saveLayoutConfig();
    });
  }

  private loadDefaultLayout(tabs: TabState[]): void {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: []
      }
    };

    this.layout!.loadLayout(config);
    this.isInitialized = true;

    // Add existing tabs
    tabs.forEach((tab: TabState) => this.addTabToLayout(tab));
  }

  private saveLayoutConfig(): void {
    if (this.layout) {
      try {
        const resolvedConfig = this.layout.saveLayout();
        // Convert ResolvedLayoutConfig to LayoutConfig for storage
        const config = GoldenLayoutConfigClass.fromResolved(resolvedConfig);
        this.shellService.SaveLayoutConfig(config);
      } catch (error) {
        console.warn('Failed to save layout config:', error);
      }
    }
  }

  private bindComponentEvent(
    container: ComponentContainer,
    itemConfig: ResolvedComponentItemConfig
  ): ComponentContainer.BindableComponent {
    const state = itemConfig.componentState as TabComponentState;

    // Create container div for this tab's content
    const element = document.createElement('div');
    element.className = 'tab-content-container';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.overflow = 'auto';

    // Get the component type for this route
    const componentType = this.getComponentForRoute(state.route);

    if (componentType) {
      try {
        // Create the Angular component dynamically
        const componentRef = createComponent(componentType, {
          environmentInjector: this.environmentInjector
        });

        // Attach to Angular's change detection
        this.appRef.attachView(componentRef.hostView);

        // Append component's DOM to our container
        const componentElement = componentRef.location.nativeElement;
        element.appendChild(componentElement);

        // Store reference for cleanup
        this.componentRefs.set(state.tabId, componentRef);
      } catch (error) {
        console.error('Error creating component:', error);
        element.innerHTML = `<div style="padding: 20px; color: red;">
          <h2>Error creating component</h2>
          <p>${error}</p>
        </div>`;
      }
    } else {
      // Fallback content if component not found
      element.innerHTML = `<div style="padding: 20px; color: #666;">
        <h2>${state.title}</h2>
        <p>Route: ${state.route}</p>
        <p>Component not found in ROUTE_COMPONENT_MAP</p>
      </div>`;
    }

    // Set tab title
    container.setTitle(state.title);

    // IMPORTANT: Append element to container's element
    container.element.appendChild(element);

    // Handle tab close
    container.on('destroy', () => {
      const compRef = this.componentRefs.get(state.tabId);
      if (compRef) {
        this.appRef.detachView(compRef.hostView);
        compRef.destroy();
        this.componentRefs.delete(state.tabId);
      }
      this.shellService.CloseTab(state.tabId);
    });

    // Handle tab activation
    container.on('show', () => {
      this.shellService.SetActiveTab(state.tabId);
      // Router navigation handled by activeTabId subscription
    });

    // Handle double-click on tab header to toggle permanent status
    // We need to wait for the tab element to be created, then attach the listener
    setTimeout(() => {
      const tabElement = this.findTabElement(container);
      if (tabElement) {
        tabElement.addEventListener('dblclick', (e: Event) => {
          e.stopPropagation();
          this.shellService.ToggleTabPermanent(state.tabId);
          this.updateTabStyle(tabElement, state.tabId);
        });
        // Set initial style based on permanent status
        this.updateTabStyle(tabElement, state.tabId);
      }
    }, 100);

    return {
      component: element,
      virtual: false  // Actual content renders in tabs!
    };
  }

  private findTabElement(container: ComponentContainer): HTMLElement | null {
    // Golden Layout tab elements have the class 'lm_tab'
    // Find the tab that corresponds to this container
    const allTabs = document.querySelectorAll('.lm_tab');
    for (let i = 0; i < allTabs.length; i++) {
      const tab = allTabs[i] as HTMLElement;
      // The tab title should match our container title
      const titleElement = tab.querySelector('.lm_title');
      if (titleElement && titleElement.textContent === container.title) {
        return tab;
      }
    }
    return null;
  }

  private updateTabStyle(tabElement: HTMLElement, tabId: string): void {
    const tabs = this.shellService['tabs$'].value;
    const tab = tabs.find(t => t.Id === tabId);
    // VSCode behavior: only italic changes, font-weight stays constant
    if (tab?.IsPermanent) {
      tabElement.style.fontStyle = 'normal';
    } else {
      tabElement.style.fontStyle = 'italic';
    }
  }

  private unbindComponentEvent(container: ComponentContainer): void {
    const state = container.state as TabComponentState;
    if (state && state.tabId) {
      const compRef = this.componentRefs.get(state.tabId);
      if (compRef) {
        this.appRef.detachView(compRef.hostView);
        compRef.destroy();
        this.componentRefs.delete(state.tabId);
      }
    }
  }

  private getComponentForRoute(route: string): any {
    // Try exact match first
    if (ROUTE_COMPONENT_MAP[route]) {
      return ROUTE_COMPONENT_MAP[route];
    }

    // Try to match pattern (e.g., /crm/contact/123 -> /crm/contact)
    for (const pattern in ROUTE_COMPONENT_MAP) {
      if (route.startsWith(pattern)) {
        return ROUTE_COMPONENT_MAP[pattern];
      }
    }

    return null;
  }

  private updateLayout(tabs: TabState[]): void {
    if (!this.layout) return;

    // If layout has no root item (all tabs were closed), add all tabs as new
    if (!this.layout.rootItem) {
      tabs.forEach(tab => this.addTabToLayout(tab));
      return;
    }

    // Get current component items
    const getAllComponents = (item: any): any[] => {
      let components: any[] = [];
      if (item.type === 'component') {
        components.push(item);
      } else if (item.contentItems) {
        for (const child of item.contentItems) {
          components = components.concat(getAllComponents(child));
        }
      }
      return components;
    };

    const currentItems = getAllComponents(this.layout.rootItem);
    const currentTabIds = currentItems
      .map((item: any) => {
        const state = item.container?.state as TabComponentState | undefined;
        return state?.tabId;
      })
      .filter((id: string | undefined): id is string => !!id);

    // Find new tabs
    const newTabs = tabs.filter(tab => !currentTabIds.includes(tab.Id));

    // Add new tabs
    newTabs.forEach(tab => this.addTabToLayout(tab));

    // Check for tabs with updated routes (temporary tab content replacement)
    currentItems.forEach((item: any) => {
      const state = item.container?.state as TabComponentState | undefined;
      if (state?.tabId) {
        const updatedTab = tabs.find(t => t.Id === state.tabId);
        if (updatedTab && (updatedTab.Route !== state.route || updatedTab.Title !== state.title)) {
          // Tab content has changed - need to recreate the component
          this.recreateTabContent(item, updatedTab);
        }
      }
    });

    // Remove closed tabs
    currentItems.forEach((item: any) => {
      const state = item.container?.state as TabComponentState | undefined;
      if (state?.tabId && !tabs.find(t => t.Id === state.tabId)) {
        try {
          item.remove();
        } catch (error) {
          console.warn('Failed to remove item:', state.tabId, error);
        }
      }
    });
  }

  private recreateTabContent(item: any, updatedTab: TabState): void {
    const container = item.container;
    if (!container) return;

    // Update the state
    const state = container.state as TabComponentState;
    state.route = updatedTab.Route;
    state.title = updatedTab.Title;

    // Update the tab title
    container.setTitle(updatedTab.Title);

    // Clean up old component
    const oldCompRef = this.componentRefs.get(state.tabId);
    if (oldCompRef) {
      this.appRef.detachView(oldCompRef.hostView);
      oldCompRef.destroy();
      this.componentRefs.delete(state.tabId);
    }

    // Clear the container
    const containerElement = container.element;
    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }

    // Create new component
    const element = document.createElement('div');
    element.className = 'tab-content-container';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.overflow = 'auto';

    const componentType = this.getComponentForRoute(updatedTab.Route);
    if (componentType) {
      try {
        const componentRef = createComponent(componentType, {
          environmentInjector: this.environmentInjector
        });
        this.appRef.attachView(componentRef.hostView);
        element.appendChild(componentRef.location.nativeElement);
        this.componentRefs.set(state.tabId, componentRef);
      } catch (error) {
        console.error('Error recreating component:', error);
        element.innerHTML = `<div style="padding: 20px; color: red;">
          <h2>Error recreating component</h2>
          <p>${error}</p>
        </div>`;
      }
    }

    containerElement.appendChild(element);
  }

  private addTabToLayout(tab: TabState): void {
    if (!this.layout) return;

    const componentConfig: ComponentItemConfig = {
      type: 'component',
      componentType: 'TabContent',
      componentState: {
        tabId: tab.Id,
        title: tab.Title,
        route: tab.Route
      } as TabComponentState,
      title: tab.Title
    };

    try {
      // Check if layout has any content - if not, we need to reset it first
      // This happens when all tabs were closed
      if (!this.layout.rootItem ||
          (this.layout.rootItem.contentItems && this.layout.rootItem.contentItems.length === 0)) {
        // Reset to a fresh layout before adding the component
        const config: LayoutConfig = {
          root: {
            type: 'row',
            content: []
          }
        };
        this.layout.loadLayout(config);
      }

      this.layout.addComponent(componentConfig.componentType, componentConfig.componentState, componentConfig.title);
    } catch (error) {
      console.error('Failed to add tab to layout:', error);
      // Try resetting layout and adding again
      try {
        const config: LayoutConfig = {
          root: {
            type: 'row',
            content: []
          }
        };
        this.layout.loadLayout(config);
        this.layout.addComponent(componentConfig.componentType, componentConfig.componentState, componentConfig.title);
      } catch (retryError) {
        console.error('Failed to add tab even after layout reset:', retryError);
      }
    }
  }

  private focusTab(tabId: string): void {
    if (!this.layout || !this.layout.rootItem) return;

    // Find the component item with matching tabId
    const findComponent = (item: any): any => {
      if (item.type === 'component') {
        const state = item.container?.state as TabComponentState | undefined;
        if (state?.tabId === tabId) {
          return item;
        }
      } else if (item.contentItems) {
        for (const child of item.contentItems) {
          const found = findComponent(child);
          if (found) return found;
        }
      }
      return null;
    };

    const tabItem = findComponent(this.layout.rootItem);
    if (tabItem && tabItem.parent?.type === 'stack') {
      tabItem.parent.setActiveContentItem(tabItem);
    }
  }
}
