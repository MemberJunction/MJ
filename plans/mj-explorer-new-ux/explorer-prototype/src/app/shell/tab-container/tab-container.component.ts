import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, createComponent, EnvironmentInjector, ApplicationRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ShellService } from '../../core/services/shell.service';
import { TabState } from '../../core/models/app.interface';
import { Subscription } from 'rxjs';
import { LayoutConfig, ComponentItemConfig, ResolvedComponentItemConfig, ComponentContainer } from 'golden-layout';
import { VirtualLayout } from 'golden-layout';

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
            // Update URL for deep linking
            this.router.navigate([tab.Route], { skipLocationChange: false });
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
    console.log('🚀 Initializing Golden Layout, container:', container);

    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: []
      }
    };

    this.layout = new VirtualLayout(
      container,
      this.bindComponentEvent.bind(this),
      this.unbindComponentEvent.bind(this)
    );

    this.layout.loadLayout(config);
    this.isInitialized = true;
    console.log('✅ Golden Layout initialized');

    // Set initial size explicitly
    const rect = container.getBoundingClientRect();
    console.log('📐 Container dimensions:', rect.width, 'x', rect.height);
    this.layout.setSize(rect.width, rect.height);

    // Add existing tabs
    const tabs = this.shellService['tabs$'].value;
    console.log('📋 Adding existing tabs:', tabs);
    tabs.forEach((tab: TabState) => this.addTabToLayout(tab));

    // Force layout update after adding tabs
    setTimeout(() => {
      if (this.layout) {
        const rect = container.getBoundingClientRect();
        this.layout.setSize(rect.width, rect.height);
        console.log('🔄 Layout size updated after adding tabs');
      }
    }, 100);

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.layout) {
        const rect = container.getBoundingClientRect();
        this.layout.setSize(rect.width, rect.height);
      }
    });
  }

  private bindComponentEvent(
    container: ComponentContainer,
    itemConfig: ResolvedComponentItemConfig
  ): ComponentContainer.BindableComponent {
    const state = itemConfig.componentState as TabComponentState;
    console.log('🎨 Binding component for tab:', state);

    // Create container div for this tab's content
    const element = document.createElement('div');
    element.className = 'tab-content-container';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.overflow = 'auto';
    element.style.padding = '20px';
    element.style.background = 'white';
    element.style.border = '2px solid red';  // Debug: make it visible!

    // Add debug text FIRST to verify element is visible
    element.innerHTML = `<div style="padding: 20px; background: yellow; color: black; font-size: 24px; font-weight: bold;">
      DEBUG: Tab Content Container for ${state.title}
      <br>Route: ${state.route}
    </div>`;

    // Get the component type for this route
    const componentType = this.getComponentForRoute(state.route);
    console.log('📦 Component type for route', state.route, ':', componentType);

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

        // Clear debug text and add actual component
        element.innerHTML = '';
        element.appendChild(componentElement);

        // Store reference for cleanup
        this.componentRefs.set(state.tabId, componentRef);
        console.log('✅ Component created and attached successfully');
      } catch (error) {
        console.error('❌ Error creating component:', error);
        element.innerHTML = `<div style="padding: 20px; color: red; background: pink;">
          <h2>Error creating component</h2>
          <p>${error}</p>
        </div>`;
      }
    } else {
      // Fallback content if component not found
      console.warn('⚠️ No component found for route:', state.route);
      element.innerHTML = `<div style="padding: 20px; color: #666; background: lightblue;">
        <h2>${state.title}</h2>
        <p>Route: ${state.route}</p>
        <p>Component not found in ROUTE_COMPONENT_MAP</p>
      </div>`;
    }

    // Set tab title
    container.setTitle(state.title);

    // IMPORTANT: Append element to container's element
    container.element.appendChild(element);
    console.log('📍 Element appended to container.element');

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
      this.router.navigate([state.route], { skipLocationChange: false });
    });

    return {
      component: element,
      virtual: false  // Actual content renders in tabs!
    };
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
    if (!this.layout || !this.layout.rootItem) return;

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

    // Remove closed tabs
    currentItems.forEach((item: any) => {
      const state = item.container?.state as TabComponentState | undefined;
      if (state?.tabId && !tabs.find(t => t.Id === state.tabId)) {
        item.remove();
      }
    });
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
      this.layout.addComponent(componentConfig.componentType, componentConfig.componentState, componentConfig.title);
    } catch (error) {
      console.error('Failed to add tab to layout:', error);
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
