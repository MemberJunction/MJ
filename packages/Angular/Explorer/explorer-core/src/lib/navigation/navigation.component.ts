import { Component, ElementRef, ViewChild, OnInit, OnDestroy, HostListener, HostBinding, AfterViewInit, Renderer2, Input, ChangeDetectorRef } from '@angular/core';
import { Location } from '@angular/common';
import { Router, NavigationEnd, Event, NavigationSkipped, ActivatedRoute } from '@angular/router';
import { DrawerItem, DrawerSelectEvent, DrawerComponent, DrawerMode } from "@progress/kendo-angular-layout";
import { Metadata, ApplicationInfo, EntityInfo, RunView, RunViewParams, LogError, TransactionGroupBase, ApplicationEntityInfo, LogStatus, BaseEntity } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { WorkspaceEntity, WorkspaceItemEntity, UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

import { Title } from '@angular/platform-browser';
import { ItemType, TreeItem } from '../../generic/Item.types';
import { MJTabStripComponent, TabClosedEvent, TabContextMenuEvent, TabEvent } from '@memberjunction/ng-tabstrip';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import { EntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { LoadEntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
// Prevent tree-shaking of EntityCommunicationsEngineClient
LoadEntityCommunicationsEngineClient();

export interface Tab {
  id?: string;
  label?: string;
  icon?: string;
  data?: any;
  labelLoading: boolean;
  contentLoading: boolean;
  workspaceItem?: any;
}

@Component({
  selector: 'mj-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.css']
})
export class NavigationComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() applicationName!: string

  public drawerItems: DrawerItem[] = [{
    text: 'Loading...',
    icon: 'k-i-apps',
  }];

  public mode: DrawerMode = 'push';
  public mini = true;
  public viewsList: ViewInfo[] = [];

  public selectedDrawerItem: DrawerItem | null = null;
  public selectedApp: ApplicationInfo | null = null;
  public selectedEntity: EntityInfo | null = null;
  public selectedView: UserViewEntityExtended | null = null;
  public loading: boolean = true;
  public loader: boolean = false;
  public tabs: any[] = [];
  public closedTabs: any[] = []; // should always be empty after using it
  private tabQueryParams: any = {};
  private workSpace: WorkspaceEntity | undefined = undefined;
  private workSpaceItems: WorkspaceItemEntity[] = [];
  public panelItems: TreeItem[] = [];

  public showExpansionPanel: boolean = false;

  private routeSub: Subscription | null = null;
  @HostBinding('class.mobile-screen') isMobileScreen: boolean = false;
  private resizeTimeout: any;

  @ViewChild(DrawerComponent, { static: false }) drawer!: DrawerComponent;
  @ViewChild('mjTabstrip', { static: false }) mjTabStrip!: MJTabStripComponent;
  @ViewChild('drawerWrapper', { static: false }) drawerWrapper!: ElementRef;
  @ViewChild('container', { static: true, read: ElementRef }) container !: ElementRef;

  @HostListener('window:resize')
  onWindowResize(): void {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.checkViewportSize();
    }, 200); // Adjust the debounce time as needed
  }

  @HostListener('document:click')
  onClick(): void {
    this.contextMenuVisible = false;
  }

  contextMenuStyle: any = {};
  contextMenuVisible: boolean = false;


  // Inject the authentication service into your component through the constructor
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    public sharedService: SharedService,
    private location: Location,
    private renderer: Renderer2,
    private titleService: Title,
    private cdr: ChangeDetectorRef
  ) {
    this.tabs = [];
  }

 


  private _contextMenuSelectedTabIndex: number = -1;
  public handleTabContextMenu(event: TabContextMenuEvent): void {
    event.mouseEvent.preventDefault();

    this._contextMenuSelectedTabIndex = event.index;
    const mouseX = event.mouseEvent.clientX;
    const mouseY = event.mouseEvent.clientY;

    this.contextMenuStyle = {
      top: mouseY + 'px',
      left: mouseX + 'px'
    };
    this.contextMenuVisible = true;
  }

  public async handleContextMenuOption(option: number): Promise<void> {
    this.closedTabs = [];
    switch (option) {
      case 1:
      // Close All
      this.closedTabs = this.closedTabs.concat(this.tabs);
      this.tabs = [];
      break;
    case 2:
      // Close Others
      // the _contextMenuSelectedTabIndex is the index of the tab that was right-clicked on and it INCLUDES the home tab so we have to adjust it
      // keep just that item 
      if (this._contextMenuSelectedTabIndex > 0) {
        this.closedTabs = this.tabs.filter((tab, index) => index !== this._contextMenuSelectedTabIndex - 1);
        this.tabs = [this.tabs[this._contextMenuSelectedTabIndex - 1]];
      }
      break;
    case 3:
      // Close Tabs to the Right
      const currentTabIndex = this._contextMenuSelectedTabIndex - 1; // because the HOME tab is not in the array so we have to offset by 1 here for our data structure
      this.closedTabs = this.tabs.slice(currentTabIndex + 1); // close everything to right
      this.tabs = this.tabs.slice(0, currentTabIndex + 1);
      break;
    default:
      // Handle other options if needed
      break;
    }
    this.contextMenuVisible = false;
    
    // CRITICAL: Force immediate change detection after tab array modifications
    // This ensures Angular immediately processes component destruction for closed tabs
    await this.waitForDomUpdate();
    
    const md = new Metadata();
    const transGroup = await md.CreateTransactionGroup();
    for (let i = 0; i < this.closedTabs.length; ++i) {
      const tab = this.closedTabs[i];
      await this.removeWorkspaceItem(tab, transGroup);
    }
    transGroup.Submit(); // INTENTIONALLY NOT USING AWAIT here - let's let the database updates for workspace edits happen in the background, no need to wait
    await this.waitForDomUpdate(); // make sure the DOM is updated before we do anything else so that the tab control knows about the changes from our data structure changes ABOVE

    if (this.activeTabIndex > this.tabs.length) // DO NOT add 1 here because in this case, the array boundary is the max for the tab control
      this.activeTabIndex = this.tabs.length; // don't subtract 1 here because the activeTabIndex is relative to the full set of tabs and the this.tabs array doesn't include the HOME tab
    else
      this.activeTabIndex = this.activeTabIndex; // this is a hack to force the tab control to update the selected tab

    if (this.activeTabIndex === 0) {
      // in this situation we have the home tab showing, so we need to update the URL path based on what's selected in the drawer
      let url = this.selectedDrawerItem ? (<any>this.selectedDrawerItem).path : '/home';
      this.router.navigate([url]);
      //this.location.go(url); // update the browser URL if needed  
      this._mostRecentURL = url;
    }
  }

  private checkViewportSize(): void {
    this.isMobileScreen = window.innerWidth <= 840;
  }

  ngAfterViewInit(): void {
    MJGlobal.Instance.GetEventListener(true) // true gets us replay of past events so we can "catch up" as needed
      .subscribe(event => {
        this.handleEvent(event, event.args);
      });

    this.route.queryParams.subscribe(params => {
      // what we want to do here is CACHE the params for the CURRENT tab so we have them 
      // to throw back in the URL whenever the tab gets clicked on again in the future
      this.tabQueryParams['tab_' + this.activeTabIndex] = params;
    });
  }

  private _loggedIn: boolean = false;
  private _earlyEvents: { event: MJEvent; args: any }[]  = [];
  protected async handleEvent(event: MJEvent, args: any) {
      // event handler
      switch (event.event) {
        case MJEventType.LoggedIn:
          await this.loadApp();
          await this.loadWorkspace();
          this._loggedIn = true;
          // check for early events and replay them now that we're logged in
          for (let i = 0; i < this._earlyEvents.length; ++i) {
            const e = this._earlyEvents[i];
            this.handleEvent(e.event, e.args); // recursve call to handle the event
          }
          this._earlyEvents.length = 0; // clear the array

          // resize everything after a short delay
          setTimeout(() => {
            this.sharedService.InvokeManualResize();
          }, 100);

          this.checkForBaseURL();
          break;
        case MJEventType.ComponentEvent:
          if (!this._loggedIn) {
            // we're not logged in yet, so queue up the event to be handled later
            this._earlyEvents.push({event, args});
          }
          else {
            // we're logged in so go ahead and handle normally
            switch (event.eventCode) {
              case EventCodes.ViewNotifications: 
                this.setActiveTabToHome();
                break;
              case EventCodes.ViewCreated:
              case EventCodes.AddDashboard:
              case EventCodes.AddReport:
              case EventCodes.AddQuery:
              case EventCodes.EntityRecordClicked:
              case EventCodes.ViewClicked:
              case EventCodes.ViewClicked:
              case EventCodes.RunSearch:
              case EventCodes.ListCreated:
              case EventCodes.ListClicked:
                  // another component requested that we add something to our tab structure
                this.AddOrSelectTab(<ResourceData>event.args);
                break;
              case EventCodes.CloseCurrentTab:
                if(this.mjTabStrip && this.activeTabIndex > 0) {
                  this.mjTabStrip.CloseTab(this.activeTabIndex);
                }
                else{
                  LogError("no active tab to close or tabstrip not available");
                }
                break;
              default:
                break;
            }
          }
          break;
        default:
          break;
      }
  }

  private gotFirstNav: boolean = false;
  ngOnInit() {
    this.checkViewportSize();
    // Subscribe to route changes
    this.routeSub = this.router.events.pipe().subscribe((args: Event) => {
      if (args instanceof NavigationEnd || args instanceof PopStateEvent) {
        const trigger = (<any>args).navigationTrigger;
        switch (trigger) {
          case 'imperative':
            // this is a programmatic navigation, so we don't want to do anything here
            break;
          case 'popstate':
            // this is a browser back/forward navigation, so we want to do something here
            // when the route changes and it maps to one of our drawer items, select it
            this.NavigateFromUrl();
            break;
          default:
            // this is a click on a link, so we want to do something here
            // when the route changes and it maps to one of our drawer items, select it
            this.NavigateFromUrl();
            break;
        }
      }
      else if (args instanceof NavigationSkipped) {
        // check to see if the route in args is truly the same as the this.route
        // if so, then we're navigating to the same route and we don't want to do anything
        // if not, then we're navigating to a different route and we want to do something
        if (this._mostRecentURL.trim().toLowerCase() != args.url.trim().toLowerCase()) {
          this.NavigateFromUrl();
        }
      }
    });
  }

  private _mostRecentURL: string = '';
  private _mostRecentHomeURL: string = ''; // used only when we're on the home tab so we can remember the full URL for the HOME tab when we come back to it from another tab
  protected async NavigateFromUrl() {
    let url = this.router.url.trim().toLowerCase();
    if (url === '/') {
      this._mostRecentURL = '/home';
      this.router.navigate(['/home']); // redirect to /home
      this.gotFirstNav = true;
    }
    else {
      this._mostRecentURL = this.router.url;

      // see if this matches a drawer item or not
      const item = this.drawerItems.find(i => url.toLowerCase().trim().startsWith((<any>i).path?.toLowerCase().trim()));

      if (item) {
        this.selectDrawerItem(this.drawerItems.indexOf(item));
        this.gotFirstNav = true;
      }
    }

    if (this.activeTabIndex > 0) {
      // check to see if there are query params on the url and if so, stash em in the tabQueryParams array so we can restore the full set of query params later if we
      // come back to this tab
      const urlParts = this.router.url.split('?');
      if (urlParts.length > 1) {
        // we have query params, so stash them
        const params = new URLSearchParams(urlParts[1]);
        const queryParams: any = {};

        for (const [key, value] of params.entries()) {
          queryParams[key] = value;
        }
        this.tabQueryParams['tab_' + this.activeTabIndex] = queryParams;
      }
    }

    if(url.toLowerCase().includes('/app') && this.activeTabIndex > 0){
      this.setActiveTabToHome();
    }

    // finally, if we are on the home tab, update the _mostRecentHomeURL property to the current URL
    if (this.activeTabIndex === 0) {
      // only update the most recent home URL if we have a url that starts with something that is in the drawer
      // or /app
      if (!url.startsWith('/home') && (url.startsWith("/app") || this.drawerItems.find((item: any) => url.startsWith(item.path))))
        this._mostRecentHomeURL = url;
    }
  }


  selectDrawerItem(index: number) {
    this.selectedDrawerItem = this.drawerItems[index];
    this.showExpansionPanel = index === 2;
    // Get the <ul> element that contains the <li> elements
    const ulElement = this.drawerWrapper.nativeElement.querySelector('ul');
    
    if (ulElement) {
      // Get the <li> element at the specified index
      const liElement = ulElement.children[index];
    
      // add the k-selected class to the <li> element
      this.renderer.addClass(liElement, 'k-selected');

      // and remove k-selected from all other <li> within the <ul>
      for (let i = 0; i < ulElement.children.length; ++i) {
        if (i !== index)
          this.renderer.removeClass(ulElement.children[i], 'k-selected');
      }
    }

    // make sure that the first tab is selected since this is showing stuff in the Home/Nav tab
    this.setActiveTabToHome();
  }

  protected setActiveTabToHome() {
    this.innerSelectTab(null);
  }

  public innerSelectTab(tab: any) {
    // get index from the tabs array
    const index = tab ? this.tabs.indexOf(tab) + 1 : 0; // add one because the HOME tab is not in the array so we have to offset by 1 here for our data structure
    this.sharedService.InvokeManualResize();

    if (index === 0) {
      // this means the HOME tab
      let url = this.selectedDrawerItem ? (<any>this.selectedDrawerItem).path : '/home';
      if (this.selectedDrawerItem !== null && this.selectedDrawerItem !== undefined)
        url = (<any>this.selectedDrawerItem).path;
      if (!this._mostRecentURL.startsWith(url)) {
        // we only do this IF the most recent URL does NOT start with the selectedDrawerItem path. 
        // The reason is because there could be SUB-PATHS within the _mostRecentURL that are not part of the selectedDrawerItem path
        // plus this is redundant if we're already on the selectedDrawerItem path

        if (this._mostRecentHomeURL.startsWith(url) || 
            (url === '/data' && this._mostRecentHomeURL.startsWith('/app')) || // special case for the /data drawer item, it leads to resources that start with /app after the first level, so we compare that too 
            (url === '/home' && this._mostRecentHomeURL.startsWith('/app'))    // special case for the /data drawer item, it leads to resources that start with /app after the first level, so we compare that too 
        ) {
          // we use the most recent HomeURL if it starts with the selectedDrawerItem path
          // this is because we want to preserve the query params that were on the URL when we first navigated to the home tab
          url = this._mostRecentHomeURL;
        }
        this.router.navigate([url]);
        this.setAppTitle();
        this._mostRecentURL = url;  
      }
    }
    else {
      const tab = this.tabs[index - 1];
      if (tab) {
        this.setAppTitle(tab.label);
        const data = tab.data;
        this.updateBrowserURL(tab, data);    
      }
    }  
  }
  
  private checkForBaseURL() {
    setTimeout(() => {
      // this is a hack to get the first navigation to work correctly when the route is to the / base URL that doesn't seem to trigger the rest of our code like all other routes
      if (!this.gotFirstNav) {
        this.gotFirstNav = true;
        this.NavigateFromUrl();
      }
    }, 10);
  }

  /**
   * This method will load the user's workspace and all the workspace items that are part of the workspace from the database.
   */
  protected async loadWorkspace() {
    const md = new Metadata();
    const rv = new RunView();
    const workspaceParams: RunViewParams = {
      EntityName: "Workspaces",
      ExtraFilter: `UserID='${md.CurrentUser.ID}'`,
      OrderBy: "__mj_UpdatedAt DESC", // by default get the workspace that was most recently updated
      ResultType: "entity_object" /*we want entity objects back so that we can modify them as needed*/
    }
    const workspaces = await rv.RunView(workspaceParams);
    if (workspaces.Success) {
      if (workspaces.Results.length) {
        this.workSpace = workspaces.Results[0]; // by default get the first one, and since we are sorting by __mj_UpdatedAt DESC above, will be most recently modified one. Future feature for multi-workspace support we'll have to adjust this
      } 
      else {
        // no matching record found, so create a new one
        this.workSpace = await md.GetEntityObject<WorkspaceEntity>('Workspaces');
        this.workSpace.NewRecord();
        this.workSpace.Name = `${md.CurrentUser.Name || md.CurrentUser.ID}'s Workspace`;
        this.workSpace.UserID = md.CurrentUser.ID;
        await this.workSpace.Save();
      }
      if (!this.workSpace)
        throw new Error('Error loading workspace');

      if (this.workSpace.IsSaved) {
        const workspaceItemParams: RunViewParams = {
          EntityName: "Workspace Items",
          ExtraFilter: `WorkspaceID='${this.workSpace.ID}'`,
          OrderBy: "Sequence ASC", // get them in order
          ResultType: "entity_object" /*we want entity objects back so that we can modify them as needed*/
        }
        const workspaceItems = await rv.RunView(workspaceItemParams);
        if (workspaceItems.Success) {
          this.workSpaceItems = workspaceItems.Results;
          await this.LoadWorkspaceItems();
        }  
      }
    }
    else
      throw new Error('Error loading workspace');
  }

  /**
   * This method will load all the workspace items that are part of the workspace currently set in the workSpace member variable 
   */
  protected async LoadWorkspaceItems(): Promise<void> {
    const md = new Metadata();
    this.tabs = []; // first clear out the tabs - this is often already the state but in case this is a full refresh, make sure we do this.
    for (let item of this.workSpaceItems) {
      const itemData = item.Configuration ? JSON.parse(item.Configuration) : {};
      const resourceData: ResourceData = new ResourceData({
        ID: item.ID,
        Name: item.Name,
        ResourceTypeID: item.ResourceTypeID,
        ResourceRecordID: item.ResourceRecordID,
        Configuration: itemData,
      });
      const newTab: Tab = {
        id: item.ID,
        labelLoading: true,
        contentLoading: false,
        data: resourceData,
        workspaceItem: item, // provide the entity object here so we can modify it later if needed
        icon: resourceData.ResourceIcon
      }
      // now add to data structure
      await this.internalAddTab(newTab);

      setTimeout(async () => {
        // non-blocking, load the resource names dynamically as this requires additional DB lookups
        newTab.label = await this.GetWorkspaceItemDisplayName(resourceData)
        const resourceDynamicIcon = await this.GetWorkspaceItemIconClass(resourceData);
        newTab.icon = resourceDynamicIcon ? resourceDynamicIcon : newTab.icon; 
        newTab.labelLoading = false;

        if (newTab === this.tabs[this.activeTabIndex - 1]) // subtract one since the activeTabIndex is relative to the full set of tabs and the this.tabs array doesn't include the HOME tab
          this.setAppTitle(newTab.label)
      },10)
    }
    this.mjTabStrip.SelectedTabIndex = 0; 
  }

  protected setAppTitle(title: string = '') {
    if (title === '')
      this.titleService.setTitle(this.applicationName);
    else
      this.titleService.setTitle(title + ' (' + this.applicationName + ')');
  }


  /**
   * This method is responsible for searching for a matching tab in the existing tab structure of the loaded workspace. It returns either a Tab object or null if one isn't found that matches the ResourceData provided.
   * @param data 
   * @returns 
   */
  protected findExistingTab(data: ResourceData): Tab | null {
    let existingTab;
    if (data.ResourceType.trim().toLowerCase() === 'search results') {
      // we have a different matching logic for search results because we want to match on the search input as well as the entity
      existingTab = this.tabs.find(t => t.data.ResourceTypeID === data.ResourceTypeID &&
                                        t.data.Configuration.Entity === data.Configuration.Entity &&    
                                        t.data.Configuration.SearchInput === data.Configuration.SearchInput);
    }
    else if (data.ResourceType.trim().toLowerCase() === 'user views') {
      // a viwe can be either saved (where we have a view id) or dyanmic (where we have an entity name, and optionally, an extra filter)
      if (data.ResourceRecordID) {
        // saved view
        existingTab = this.tabs.find(t => t.data.ResourceTypeID === data.ResourceTypeID && 
                                          t.data.ResourceRecordID === data.ResourceRecordID &&
                                          data.ResourceRecordID !== null && 
                                          data.ResourceRecordID !== undefined   // make sure that we don't match on null/undefined ResourceRecordID's - these should always be NEW tabs
                      );
      }
      else {
        // dynamic view, compare entity name and if we have extra filter use that for comparison too
        existingTab = this.tabs.find(t => t.data.ResourceTypeID === data.ResourceTypeID && 
                                          t.data.Configuration.Entity === data.Configuration.Entity &&
                                          t.data.Configuration.ExtraFilter === data.Configuration.ExtraFilter
                      );
      }
    }
    else {
      existingTab = this.tabs.find(t => {
        if (t.data.ResourceTypeID === data.ResourceTypeID && 
            t.data.ResourceRecordID === data.ResourceRecordID  ) {
            // we now have to do one more check, we have to make sure that all of the values within the Configuration object match as well
            let bMatch = true;
            // ignore keys that start with an underscore or are the NewRecordValues key
            const keys = Object.keys(data.Configuration).filter(k => !k.startsWith('_') && k.trim().toLowerCase() !== 'newrecordvalues'); 
            for (const key of keys) {
              if (data.Configuration[key] !== t.data.Configuration[key]) {
                bMatch = false;
                break;
              }
            }
            return bMatch;
          }  
          else
            return false;
      });
    }
    return existingTab;
  }

  /**
   * This utility method is used to either Add a tab if a matching tab for the given data parameter isn't found, or to select the existing tab if it already exists.
   * @param data 
   */
  protected async AddOrSelectTab(data: ResourceData) {
    const t = this.tabs;
    this.loader = true;

    const existingTab = this.findExistingTab(data);

    if (existingTab) {
      // merge the data that we are provided with in terms of its raw query params with the existing tab
      // override existing values in the data.Configuration.___rawQueryParams from keys in the data.Configuration.___rawQueryParams
      existingTab.data.Configuration.___rawQueryParams = { ...existingTab.data.Configuration.___rawQueryParams, ...data.Configuration.___rawQueryParams };

      const index = this.tabs.indexOf(existingTab);

      // next, before we set the active tab, we need to merge the query params that we have for this tab with the query params that we have for the tab that we're about to select
      // when the app first loads there won't be any query params for the tabs, but as we navigate around and the tabs get selected, we'll cache the query params for each tab
      const tqp = this.tabQueryParams['tab_' + (index + 1)];
      if (tqp)
        this.tabQueryParams['tab_' + (index + 1)] = {...tqp, ...existingTab.data.Configuration.___rawQueryParams};  
      else
        this.tabQueryParams['tab_' + (index + 1)] = existingTab.data.Configuration.___rawQueryParams;

      // add one because the HOME tab is not in the tabs array but it IS part of our tab structure
      this.activeTabIndex = index + 1;


      this.scrollIntoView();
      if (existingTab.label)
        this.setAppTitle(existingTab.label);
      else
        this.setAppTitle()
      this.loader = false;
    }
    else {
      const newTab: Tab = {
        id: "", // initially blank but will be changed to the WorkspaceItem ID once we save it
        data: data,
        labelLoading: true,
        contentLoading: false,
        workspaceItem: null,
        icon: data.ResourceIcon,
      }

        // save it before we push to the tabs colleciton because we want the WorkspaceItem ID to be populated in the tab.id before we initialize the new tab by adding it to the this.tabs array
      await this.SaveSingleWorkspaceItem(newTab)

      // now add to data structure
      await this.internalAddTab(newTab);

      // select the new tab
      this.activeTabIndex = this.tabs.length; // this is intentionally past array boundary because ActiveTabIndex includes the Home tab that is not part of the tabs array

      this.sharedService.InvokeManualResize();
      this.scrollIntoView();
      setTimeout(async () => {
        // non-blocking this way
        newTab.label = await this.GetWorkspaceItemDisplayName(data) // do this after we fire up the loading so that we don't block anything
        const resourceDynamicIcon = await this.GetWorkspaceItemIconClass(data);
        newTab.icon = resourceDynamicIcon ? resourceDynamicIcon : newTab.icon; 

        this.setAppTitle(newTab.label);
        newTab.labelLoading = false;
        this.loader = false;
      }, 10)
    }
  }

  protected async internalAddTab(newTab: Tab) {
    // add the tab to the tabs collection
    this.tabs.push(newTab);
    // Manually trigger change detection and wait for DOM updates
    await this.waitForDomUpdate();
  }

  waitForDomUpdate(): Promise<void> {
    return new Promise(resolve => {
      this.cdr.detectChanges(); // Manually trigger change detection
      setTimeout(() => { resolve(); }, 0); // Resolve on the next tick to ensure changes are reflected in the DOM
    });
  }  

  private updateBrowserURL(tab: Tab, data: ResourceData) {
    // update the URL to reflect the current tab

    // FIRST, construct the base URL based on the resource type
    const rt = this.sharedService.ResourceTypeByID(data.ResourceTypeID);
    let url: string = '/resource';
    switch (rt?.Name.toLowerCase().trim()) {
      case 'user views':
        if (data.ResourceRecordID) {
          url += `/view/${data.ResourceRecordID}`;
        }
        else if (data.Configuration?.Entity) {
          // we don't have a view id. This can occur when we're referring to a dyanmic view where our data.Configuration.Entity is set and data.Configuration.ExtraFilter is set
          // so we need to construct a URL that will load up the dynamic view
          url += `/view/0?Entity=${data.Configuration.Entity}&ExtraFilter=${data.Configuration.ExtraFilter}`;
        }
        else {
          // we don't have a view ID and we also don't have an entity name, so this is an error condition
          LogError(`Invalid view configuration. No view ID or entity name specified.`);
          this.sharedService.CreateSimpleNotification(`Invalid view configuration. No view ID or entity name specified.`, "error", 5000);
          return;
        }
        break;
      case 'dashboards':
        url += `/dashboard/${data.ResourceRecordID}`;
        break;
      case 'reports':
        url += `/report/${data.ResourceRecordID}`;
        break;
      case 'queries':
        url += `/query/${data.ResourceRecordID}`;
        break;
      case 'records':
        const recIDAsString: string = data.ResourceRecordID !== null && data.ResourceRecordID !== undefined ? (typeof data.ResourceRecordID === "string" ? data.ResourceRecordID : data.ResourceRecordID.toString()) : "";
        url += `/record/${recIDAsString.trim()}?Entity=${data.Configuration.Entity}`;
        if (data.Configuration.NewRecordValues) {
          url += `&NewRecordValues=${data.Configuration.NewRecordValues}`;
        }
        break;
      case 'search results':
        url += `/search/${data.Configuration.SearchInput}?Entity=${data.Configuration.Entity}`;
        break;
      case 'settings':
        url += `/settings`;
        break;
      case 'notifications':
        url += `/notifications`;
        break;
      case 'lists':
        url += `/list/${data.ResourceRecordID}`;
        break;
    }

    // SECOND, we need to, in some cases, append query params that the TAB had created, we don't know what those are, they could be anything. In the AfterViewInit() code above we cache
    // these whenever they change for each tab.

    // Split the URL into the path and existing query params
    let [path, existingQuery] = url.split('?');

    const currentURL: string = window.location.href;
    const urlObj = new URL(currentURL);
    //Remove Entity as existingQuery will have it
    urlObj.searchParams.delete('Entity');
    for (const [key, value] of urlObj.searchParams.entries()){
      existingQuery = existingQuery ? existingQuery + `&${key}=${value}` : `${key}=${value}`;
    }

    // Create a URLSearchParams object from the existing query params
    const queryParams = new URLSearchParams(existingQuery);

    const tabIndex = this.tabs.indexOf(tab) + 1; // we add 1 Because the HOME tab is not in the array so we have to offset by 1 here for our data structure
    let cachedQueryParams = this.tabQueryParams['tab_' + tabIndex];  
    if (!cachedQueryParams) {
      // there is a case when we are first loading and cached query params might have been stuffed into a 'tab_-1' key because at the time activeTabIndex wasn't yet known. So we need to check for that
      cachedQueryParams = this.tabQueryParams['tab_-1'];
      if (cachedQueryParams) {
        delete this.tabQueryParams['tab_-1']; // remove it from the -1 key
        const tqp = this.tabQueryParams['tab_' + tabIndex];
        if (tqp)
          this.tabQueryParams['tab_' + tabIndex] = {...tqp, ...cachedQueryParams}; // merge it with the existing key if it exists
        else
          this.tabQueryParams['tab_' + tabIndex] = {...cachedQueryParams}; // stuff it into the correct key
      }
    }
    if (cachedQueryParams) {
      // Merge cached query params if they don't already exist in the URL
      const keys = Object.keys(cachedQueryParams);
      for (const key of keys) {
        if (!queryParams.has(key)) {
          queryParams.append(key, cachedQueryParams[key]);
        }
      }
    }

    // Construct the new URL with merged query params
    const params = queryParams.toString();
    const newUrl = `${path}${params && params.length > 0  ? '?' + queryParams.toString() : ''}`;

    // Update the most recent URL
    this._mostRecentURL = newUrl;

    // Update the browser URL without triggering Angular navigation
//    this.location.go(newUrl);
    this.router.navigateByUrl(newUrl);//, { skipLocationChange: true });

    // Update the app title
    this.setAppTitle(tab.label);
  }

  scrollIntoView() {
    if (this.mjTabStrip)  
      this.mjTabStrip.scrollIntoView(this.activeTabIndex);
  }

  public async GetWorkspaceItemDisplayName(data: ResourceData): Promise<string> {
    const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseResourceComponent, data.ResourceType);
    if (resourceReg) {
      const resource = <BaseResourceComponent>new resourceReg.SubClass();
      return await resource.GetResourceDisplayName(data);
    }
    else{
      return `Workspace Item ${data.ID}`;
    }
  }

  public async GetWorkspaceItemIconClass(data: ResourceData): Promise<string> {
    const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseResourceComponent, data.ResourceType);
    if (resourceReg) {
      const resource = <BaseResourceComponent>new resourceReg.SubClass();
      return await resource.GetResourceIconClass(data);
    }
    else{
      return '';
    }
  }

  /**
   * Saves the workspace to the database.
   * @returns 
   */
  public async SaveWorkspace(): Promise<boolean> {
    let bSuccess: boolean = true;
    for (let i = 0; i < this.tabs.length; ++i) {
      const tab = this.tabs[i];
      bSuccess = await this.SaveSingleWorkspaceItem(tab) && bSuccess;
    }
    return bSuccess;
  }


  public async HandleResourceRecordSaved(tab: Tab, resourceRecord: BaseEntity): Promise<boolean> {
    const oldId = tab.data.ResourceRecordID;
    tab.data.ResourceRecordID = resourceRecord.PrimaryKey.ToURLSegment();
    
    // we need to update the label in case the "Name" of the record changed, or if it was new and no longer is new
    tab.label = await this.GetWorkspaceItemDisplayName(tab.data); 

    const resourceDynamicIcon = await this.GetWorkspaceItemIconClass(tab.data);
    tab.icon = resourceDynamicIcon ? resourceDynamicIcon : tab.icon; 

    

    // now check to see if the old id and the new ID are any different
    // check for tab names that start with New as well...
    // and if so we need to replace the state in the URL for Angular so that we don't have a New Record situation in the URL but have the actual ID now
//    if (oldId !== tab.data.ResourceRecordID || tab.label?.toLowerCase().trim().startsWith('new') ) {
      this.updateBrowserURL(tab, tab.data);
  //  }

    return await this.SaveSingleWorkspaceItem(tab);
  }
  /**
   * Saves a single workspace item to the database.
   * @param tab 
   * @returns 
   */
  public async SaveSingleWorkspaceItem(tab: Tab): Promise<boolean> {
    try {
      if (!this.workSpace)
        throw new Error('No workspace loaded');

      let index = this.tabs.indexOf(tab);
      if (index < 0)
        index = this.tabs.length; // this situation occurs when the tab hasn't yet been added to the tabs collection so the index will be = the length of the tabs collection

      const md = new Metadata();
      let wsItem: WorkspaceItemEntity;
      if (!tab.workspaceItem) {
        wsItem = await md.GetEntityObject<WorkspaceItemEntity>('Workspace Items');
        if (tab.data.ID && tab.data.ID.length > 0)
          await wsItem.Load(tab.data.ID);
        else {
          wsItem.NewRecord();

          wsItem.Name = tab.data.Name ? tab.data.Name : tab.data.ResourceType + ' Record:' + tab.data.ResourceRecordID;
          wsItem.WorkspaceID = this.workSpace.ID;
          wsItem.ResourceTypeID = tab.data?.ResourceTypeID;
        }
        tab.workspaceItem = wsItem;
      }
      else {
        wsItem = tab.workspaceItem;
      }

      wsItem.ResourceRecordID = tab.data.ResourceRecordID.toString();
      wsItem.Sequence = index;
      wsItem.Configuration = JSON.stringify(tab.data.Configuration);// JSON.stringify({ Entity: tab.data.Entity });
      const result = await wsItem.Save();
      if (!result) {
        // do a console error and display a simple notification
        LogError(`Error saving workspace item ${wsItem.Name} to the database. ${wsItem.LatestResult.CompleteMessage || wsItem.LatestResult.CompleteMessage || wsItem.LatestResult.Errors?.join('\n')  }`);
        MJNotificationService.Instance.CreateSimpleNotification(`Error saving workspace item ${wsItem.Name} to the database. ${wsItem.LatestResult.CompleteMessage}`, 'error', 5000);
        return false;
      }
      tab.id = wsItem.ID;
      return result;
    }
    catch (err) {
      LogError(err);
      return false;
    }
  }

  public setTabContentLoadingStatus(tab: Tab, bLoading: boolean) {
      tab.contentLoading = bLoading;
      this.cdr.detectChanges(); // Manually trigger change detection
  }

  public async handleTabClosed(event: TabClosedEvent) {
    // get our tab data structure item based on the index that we get in the event
    if (event.index !== null && event.index >=0 && event.index <= this.tabs.length) {
      const tab = this.tabs[event.index - 1];  // subtract 1 because the event index includes the home tab and our data structure does not
      await this.closeTab(tab, event.newTabIndex);  
    }
    event.done(); // let the tab control know that we're done handling the event
  }

  public handleTabSelected(event: TabEvent) {
    if (event.index !== null && event.index >= 0 && event.index <= this.tabs.length) {
      if (event.index > 0) {
        const tab = this.tabs[event.index - 1]; // subtract 1 because the event index includes the home tab and our data structure does not
        this.innerSelectTab(tab);
      }
      else 
        this.innerSelectTab(null); // home
    }
  }

  public async closeTab(tab: any, newTabIndex: number): Promise<void> {
    const tabIndex = this.tabs.indexOf(tab);
    if (tabIndex >= 0) {
      // INTENTIONAL - do not use await here, we want to let the database updates happen in the background
      this.removeWorkspaceItem(this.tabs[tabIndex], null /*no transaction group*/);
      //await this.waitForDomUpdate(); // make sure dom is up to date
      // now, check to see how many tabs we have left and if we have none, then we need to select the HOME tab
      if (this.tabs.length > 0) {
        if (newTabIndex === 0) {
          // home tab
          this.innerSelectTab(null); // null param means home tab
        }
        else {
          // not home tab
          const tab = this.tabs[newTabIndex -1]; // remove 1 because the newTabIndex includes the HOME tab and our data structure does not
          this.updateBrowserURL(tab, tab?.data);    
        }
      }
      else {
        this.innerSelectTab(null); // null param means home tab
      }
    }
  }

  public async removeWorkspaceItem(tab: Tab, transGroup: TransactionGroupBase | null) {
    // remove the tab from the tabs collection
    const index = this.tabs.indexOf(tab);
    if (index >= 0) {
      this.tabs.splice(index, 1);
      
      // CRITICAL: Force immediate change detection to trigger component destruction
      // This ensures Angular processes the @for removal and calls ngOnDestroy on child components
      await this.waitForDomUpdate();
    }

    if (!tab.workspaceItem && tab.id && tab.id.length > 0) {
      // we lazy load the workspaceItem entity objects, so we load it here so we can delete it below, but only when it wasn't already loaded
      const md = new Metadata();
      tab.workspaceItem = <WorkspaceItemEntity>await md.GetEntityObject('Workspace Items');
      await tab.workspaceItem.Load(tab.id);
    }
    if (tab.workspaceItem) {
      const entity = <WorkspaceItemEntity>tab.workspaceItem;
      if (!transGroup) {
        if (!await entity.Delete()) {
          // error deleting the workspace item, alert the user
          this.sharedService.CreateSimpleNotification('Error deleting workspace item ' + tab.workspaceItem.Name + ' from the database. Please contact your system administrator.', 'error', 5000)
        }
      }
      else {
        entity.TransactionGroup = transGroup;
        await entity.Delete();  
      }
    }
  }




  public getActiveTabId(): any | null {
    if (this.activeTabIndex === 0) {
      return null
    }
    else // subtract 1 from the activeTabIndex if it is not the first tab since our data structure is for tabs 1 to n
      return this.tabs[this.activeTabIndex - 1]?.id;
  }

  public isTabActive(tabId: number): boolean {
    return this.getActiveTabId() === tabId;
  }

  ngOnDestroy() {
    // Clean up the subscription when the component is destroyed
    clearTimeout(this.resizeTimeout);
    if (this.routeSub)
      this.routeSub.unsubscribe();

    window.removeEventListener('resize', () => { });
  }
 

  public onDrawerSelect(ev: DrawerSelectEvent): void {
    this.selectedDrawerItem = ev.item;
    this.router.navigate([ev.item.path])
    this._mostRecentURL = ev.item.path;

    // make sure that the first tab is selected since this is showing stuff in the Home/Nav tab
    if (this.activeTabIndex !== 0) {
      this.activeTabIndex = 0;
    }

    this.setAppTitle(ev.item.text);
  }
  
  protected get activeTabIndex(): number {
    if (this.mjTabStrip)
      return this.mjTabStrip.SelectedTabIndex;
    else
      return -1;
  }

  protected set activeTabIndex(index: number) {
    if (this.mjTabStrip)
      this.mjTabStrip.SelectedTabIndex = index;
  }

  public getEntityItemFromViewItem(viewItem: DrawerItem): DrawerItem | null {
    for (let item of this.drawerItems) {
      if (item.id === viewItem.parentId) {
        // got the parent, this is the entity
        return item;
      }
    }

    return null;
  }
  public getAppItemFromViewItem(viewItem: DrawerItem): DrawerItem | null {
    let entityItem = this.getEntityItemFromViewItem(viewItem), appItem = null;

    if (entityItem)
      for (let item of this.drawerItems) {
        if (item.id == entityItem.parentId) {
          // got the parent, this is the app
          appItem = item;
          break;
        }
      }

    return appItem;
  }
 
  async loadApp() {

    //setting the panelItems here because by this point
    //the provider class is set within the MetaData class
    //and the applications property is populated
    const md: Metadata = new Metadata();
    const applications: ApplicationInfo[] = md.Applications;
    this.panelItems = applications.map((app: ApplicationInfo) => {
      let item = new TreeItem(app, ItemType.Application);
      item.ChildItems = app.ApplicationEntities.map((entity: ApplicationEntityInfo) => {
        let childItem: TreeItem = new TreeItem(entity, ItemType.Entity);
        childItem.Name = entity.Entity;
        childItem.ChildItems.push(new TreeItem({ Name: 'Stub Node' }, ItemType.StubData));
        return childItem;
      });
      return item;
    });

    await TemplateEngineBase.Instance.Config(false);
    await CommunicationEngineBase.Instance.Config(false);
    await EntityCommunicationsEngineClient.Instance.Config(false);

    await this.LoadDrawer();

    this.setDrawerConfig();

    window.addEventListener('resize', () => {
      this.setDrawerConfig();
    });
  }

  private async LoadDrawer() {
    const md = new Metadata();

    //make sure SharedService_resourceTypes is populated first
    await SharedService.RefreshData(true);

    this.drawerItems.length = 0; // clear the array

    const items = md.VisibleExplorerNavigationItems.filter(item => item.ShowInNavigationDrawer);
    items.forEach(item => {
      const drawerItem = {
        id: item.ID,
        selected: false,
        text: item.Name,
        path: item.Route,
        icon: item.IconCSSClass
      }
      this.drawerItems.push(drawerItem);
    });

    this.loading = false;
  }

  protected async loadSkip(md: Metadata) {
    const drawerItem = {
      id: 'AskSkip',
      selected: false,
      text: 'Ask Skip',
      path: '/askskip',
      icon: 'fa-solid fa-robot'  // Keep the fallback icon property
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadHome(md: Metadata) {
    const drawerItem = {
      id: 'Home',
      selected: true,
      text: 'Home',
      path: '/home',
      icon: "fa-solid fa-house"
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadSettings(md: Metadata) {
    const drawerItem = {
      id: 'Settings',
      selected: false,
      text: 'Settings',
      path: '/settings',
      icon: "fa-solid fa-gear"
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadLists() {
    const drawerItem = {
      id: 'Lists',
      selected: false,
      text: 'Lists',
      path: '/lists',
      icon: "fa-solid fa-list"
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadFiles() {
    const rv = new RunView();
    const viewResults = await rv.RunView({
      EntityName: 'File Storage Providers',
      ExtraFilter: 'IsActive = 1',
    });
    const filesEnabled = viewResults.RowCount > 0;
    
    if (filesEnabled) {
      const drawerItem = {
        id: 'Files',
        selected: false,
        text: 'Files',
        path: '/files',
        icon: "fa-regular fa-folder"
      };
      this.drawerItems.push(drawerItem);
    }
  }


  protected async loadApplications(md: Metadata) {
    const drawerItem = {
      id: 'Data',
      selected: false,
      text: 'Data',
      path: '/data',
      icon: "fa-solid fa-database"
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadResourceType(key: string, resourceType: string, path: string, currentUserID: string) {
    const rt = this.sharedService.ResourceTypeByName(resourceType)
    if (rt) {
      const drawerItem = {
        id: key,
        selected: false,
        text: resourceType,
        path: path,
        icon: rt.Icon ? rt.Icon : "fa-regular fa-file-alt"
      }
      this.drawerItems.push(drawerItem); 
    }
    else{
      LogStatus("no resource type found for " + resourceType);
    }
  }


  public setDrawerConfig() {
    const pageWidth = window.innerWidth;
    if (pageWidth <= 840) {
      this.mode = 'overlay';
      this.mini = false;
    } else {
      this.mode = 'push';
      this.mini = true;
    }
  }

  public toggle() {
    this.drawer.toggle();
    this.mini = !this.mini;
    this.sharedService.InvokeManualResize();
  }
}