import { Component, ElementRef, ViewChild, OnInit, OnDestroy, HostListener, HostBinding, AfterViewInit, Renderer2, Input, ChangeDetectorRef, viewChildren, ViewChildren, QueryList } from '@angular/core';
import { Location } from '@angular/common';
import { Router, NavigationEnd, Event, NavigationSkipped, ActivatedRoute } from '@angular/router';
import { DrawerItem, DrawerSelectEvent, DrawerComponent, DrawerMode, TabCloseEvent, TabStripComponent, SelectEvent } from "@progress/kendo-angular-layout";
import { Metadata, ApplicationInfo, EntityInfo, RunView, RunViewParams, LogError, TransactionGroupBase, ApplicationEntityInfo } from '@memberjunction/core';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { WorkspaceEntity, WorkspaceItemEntity, UserViewEntity, ViewInfo } from '@memberjunction/core-entities';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { Title } from '@angular/platform-browser';
import { StubData } from '../../generic/app-nav-view.types';
import { Item, ItemType, TreeItem } from '../../generic/Item.types';
import { MJTabStripComponent, TabClosedEvent, TabContextMenuEvent, TabEvent } from '@memberjunction/ng-tabstrip';
import { letterSpaceIcon } from '@progress/kendo-svg-icons';

export interface Tab {
  id?: number;
  label?: string;
  icon?: string;
  data?: any;
  labelLoading: boolean;
  contentLoading: boolean;
  workspaceItem?: any;
}

@Component({
  selector: 'app-navigation',
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
  public selectedView: UserViewEntity | null = null;
  public loading: boolean = true;
  public loader: boolean = false;
  public tabs: any[] = [];
  public closedTabs: any[] = []; // should always be empty after using it
  private tabQueryParams: any = {};
  // public activeTabIndex: number = 0;
  // public selectedTabIndex: number = 0;
  private workSpace: any = {};
  private workSpaceItems: WorkspaceItemEntity[] = [];
  public panelItems: TreeItem[] = [];

  public showExpansionPanel: boolean = false;

  private routeSub: Subscription | null = null;
  @HostBinding('class.mobile-screen') isMobileScreen: boolean = false;
  private resizeTimeout: any;

  @ViewChild(DrawerComponent, { static: false }) drawer!: DrawerComponent;
  @ViewChild('mjTabstrip') mjTabStrip!: MJTabStripComponent;
  @ViewChild('drawerWrapper', { static: false }) drawerWrapper!: ElementRef;
  //@ViewChild("tabstrip", { static: false }) public tabstrip !: TabStripComponent;
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
    const md = new Metadata();
    const transGroup = await md.CreateTransactionGroup();
    for (let i = 0; i < this.closedTabs.length; ++i) {
      const tab = this.closedTabs[i];
      await this.removeWorkspaceItem(tab, transGroup);
    }
    await transGroup.Submit();
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
          await this.getWorkspace();
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
                  // another component requested that we add something to our tab structure
                this.AddOrSelectTab(<ResourceData>event.args);
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
        // we have query params, so stash em
        const params = new URLSearchParams(urlParts[1]);
        const keys = params.keys();
        const queryParams: any = {};
        for (const key of keys) {
          queryParams[key] = params.get(key);
        }
        this.tabQueryParams['tab_' + this.activeTabIndex] = queryParams;
      }
    }

    if(url.toLowerCase().includes('/app') && this.activeTabIndex > 0){
      this.setActiveTabToHome();
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
      let url = this.selectedDrawerItem ? (<any>this.selectedDrawerItem).path : '/home';
      if (this.selectedDrawerItem !== null && this.selectedDrawerItem !== undefined)
        url = (<any>this.selectedDrawerItem).path;
      this.router.navigate([url]);
      this.setAppTitle();
      this._mostRecentURL = url;
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

  private async getWorkspace() {
    const md = new Metadata();
    const rv = new RunView();
    const workspaceParams: RunViewParams = {
      EntityName: "Workspaces",
      ExtraFilter: `UserID=${md.CurrentUser.ID}`
    }
    const workspaces = await rv.RunView(workspaceParams);
    if (workspaces.Success) {
      const workspaceRecord = <WorkspaceEntity>await md.GetEntityObject("Workspaces");
      if (workspaces.Results.length) {
        const workspace: any = workspaces.Results.find((workspace: any) => workspace.UserID === md.CurrentUser.ID);
        await workspaceRecord.Load(workspace.ID);
      } else {
        workspaceRecord.NewRecord();
        workspaceRecord.Name = `${md.CurrentUser.Name || md.CurrentUser.ID}'s Workspace`;
        workspaceRecord.UserID = md.CurrentUser.ID;
        await workspaceRecord.Save();
      }
      this.workSpace = workspaceRecord;
      const workspaceItemParams: RunViewParams = {
        EntityName: "Workspace Items",
        ExtraFilter: `WorkspaceID='${this.workSpace.ID}'`,
        ResultType: "entity_object" /*we want entity objects back so that we can modify them as needed*/
      }
      const workspaceItems = await rv.RunView(workspaceItemParams);
      if (workspaceItems.Success) {
        this.workSpaceItems = workspaceItems.Results;
        await this.LoadWorkSpace();
      }
    }
  }

  public async LoadWorkSpace(): Promise<void> {
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
        // non-blocking, load dynamically
        newTab.label = await this.GetWorkspaceItemDisplayName(resourceData)
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

  protected checkForExistingTab(data: ResourceData): Tab | null {
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
      existingTab = this.tabs.find(t => t.data.ResourceTypeID === data.ResourceTypeID && 
                                              t.data.ResourceRecordID === data.ResourceRecordID &&
                                              data.ResourceRecordID  // make sure that we don't match on null/undefined ResourceRecordID's - these should always be NEW tabs
                                        )
    }
    return existingTab;
  }

  protected async AddOrSelectTab(data: ResourceData) {
    const t = this.tabs;
    this.loader = true;

    const existingTab = this.checkForExistingTab(data);

    if (existingTab) {
      const index = this.tabs.indexOf(existingTab);
      // add one because the HOME tab is not in the tabs array but it IS part of our tab structure
      this.activeTabIndex = index + 1;

      //this.tabstrip.selectTab(this.activeTabIndex);

      this.scrollIntoView();
      if (existingTab.label)
        this.setAppTitle(existingTab.label);
      else
        this.setAppTitle()
      this.loader = false;
    }
    else {
      const newTab: Tab = {
        id: -1, // initially -1 but will be changed to the WorkspaceItem ID once we save it
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
      //this.tabstrip.selectTab(this.activeTabIndex);
      //this.renderer.selectRootElement(this.tabstrip.wrapper.nativeElement).focus()

      this.sharedService.InvokeManualResize();
      this.scrollIntoView();
      setTimeout(async () => {
        // non-blocking this way
        newTab.label = await this.GetWorkspaceItemDisplayName(data) // do this after we fire up the loading so that we don't block anything
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
    const rt = this.sharedService.ResourceTypeByID(data.ResourceTypeID)
    let url: string = '/resource';
    switch (rt?.Name.toLowerCase().trim()) {
      case 'user views':
        if (data.ResourceRecordID && !isNaN(data.ResourceRecordID) && data.ResourceRecordID > 0) {
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
        url += `/record/${data.ResourceRecordID}?Entity=${data.Configuration.Entity}`;
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
    }

    // SECOND, we need to, in some cases, append query params that the TAB had created, we don't know what those are, they could be anything. In the AfterViewInit() code above we cache
    //         these whenever they change for each tab.

    // Split the URL into the path and existing query params
    const [path, existingQuery] = url.split('?');

    // Create a URLSearchParams object from the existing query params
    const queryParams = new URLSearchParams(existingQuery);

    // Your cached query params, assuming it's an object like { key1: 'value1', key2: 'value2' }
    const tabIndex = this.tabs.indexOf(tab) + 1; // we add 1 Because the HOME tab is not in the array so we have to offset by 1 here for our data structure
    let cachedQueryParams = this.tabQueryParams['tab_' + tabIndex]; // Replace with your actual method to get cached params
    if (!cachedQueryParams) {
      // there is a case when we are first loading and cached query params might have been stuffed into a 'tab_-1' key because at the time activeTabIndex wasn't yet known. So we need to check for that
      cachedQueryParams = this.tabQueryParams['tab_-1'];
      if (cachedQueryParams) {
        delete this.tabQueryParams['tab_-1']; // remove it from the -1 key
        this.tabQueryParams['tab_' + tabIndex] = cachedQueryParams; // stuff it into the correct key
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
    // const containerElement = this.tabstrip.wrapper.nativeElement;
    // setTimeout(() => {
    //   const newTabElement = containerElement.querySelector(`li:nth-child(${this.activeTabIndex + 1})`);
    //   newTabElement.scrollIntoView({ inline: 'nearest' });
    // }, 200);
  }

  async GetWorkspaceItemDisplayName(data: ResourceData): Promise<string> {
    const resourceReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseResourceComponent, data.ResourceType);
    if (resourceReg) {
      const resource = <BaseResourceComponent>new resourceReg.SubClass();
      return await resource.GetResourceDisplayName(data);
    }
    else
      return `Workspace Item ${data.ID}`;
  }

  async SaveWorkspace(): Promise<boolean> {
    let bSuccess: boolean = true;
    for (let i = 0; i < this.tabs.length; ++i) {
      const tab = this.tabs[i];
      bSuccess = await this.SaveSingleWorkspaceItem(tab) && bSuccess;
    }
    return bSuccess;
  }

  async SaveSingleWorkspaceItem(tab: Tab): Promise<boolean> {
    try {
      let index = this.tabs.indexOf(tab);
      if (index < 0)
        index = this.tabs.length; // this situation occurs when the tab hasn't yet been added to the tabs collection so the index will be = the length of the tabs collection

      const md = new Metadata();
      let wsItem: WorkspaceItemEntity;
      if (!tab.workspaceItem) {
        wsItem = <WorkspaceItemEntity>await md.GetEntityObject('Workspace Items');
        if (tab.data.ID && !isNaN(tab.data.ID) && tab.data.ID > 0)
          await wsItem.Load(tab.data.ID);
        else {
          wsItem.NewRecord();

          wsItem.Name = tab.data.Name ? tab.data.Name : tab.data.ResourceType + ' Record:' + tab.data.ResourceRecordID;
          wsItem.WorkSpaceID = this.workSpace.ID;
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
      await this.removeWorkspaceItem(this.tabs[tabIndex], null /*no transaction group*/);
//      await this.waitForDomUpdate(); // make sure dom is up to date

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
    if (index >= 0)
      this.tabs.splice(index, 1);

    if (!tab.workspaceItem && tab.id && tab.id > 0) {
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
        entity.Delete(); // no await here, we're in a transaction group so we don't want to block
      }
    }
  }




  public getActiveTabId() {
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
      //this.tabstrip.selectTab(0);
      //this.renderer.selectRootElement(this.tabstrip.wrapper.nativeElement).focus()
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
    let entityItem = null

    for (let item of this.drawerItems) {
      if (item.id == viewItem.parentId) {
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

    await this.LoadDrawer();

    this.setDrawerConfig();

    window.addEventListener('resize', () => {
      this.setDrawerConfig();
    });
  }

  private async LoadDrawer() {
    const md = new Metadata();

    this.drawerItems.length = 0; // clear the array

    // the Drawer configuraion has the following sections:
    /*
       * Home - a simple view that shows all the other options - dashboards, reports, data, etc, and ALSO shows Favorites and Most Recently Used Records
       * Ask Skip - interaction with Skip AI
       * Data
       * Dashboards
       * Reports
       * Settings
    */

    // Home
    await this.loadHome(md);

    // Skip
    await this.loadSkip(md);

    // Data
    await this.loadApplications(md);

    // Dashboards
    await this.loadResourceType('Dashboards','Dashboards','/dashboards', md.CurrentUser.ID);

    // Reports
    await this.loadResourceType('Reports','Reports','/reports', md.CurrentUser.ID);

    // Queries
    await this.loadResourceType('Queries','Queries','/queries', md.CurrentUser.ID);

    // Files
    await this.loadFiles();

    // Settings
    await this.loadSettings(md);

    this.loading = false;
  }



  protected async loadSkip(md: Metadata) {
    const drawerItem = {
      id: 'AskSkip',
      selected: false,
      text: 'Ask Skip',
      path: '/askskip',
      svgIcon: this.sharedService.kendoSVGIcon('user')
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadHome(md: Metadata) {
    const drawerItem = {
      id: 'Home',
      selected: true,
      text: 'Home',
      path: '/home',
      svgIcon: this.sharedService.kendoSVGIcon('home') 
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadSettings(md: Metadata) {
    const drawerItem = {
      id: 'Settings',
      selected: false,
      text: 'Settings',
      path: '/settings',
      svgIcon: this.sharedService.kendoSVGIcon('gear') 
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
        svgIcon: this.sharedService.kendoSVGIcon('folder'),
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
      svgIcon: this.sharedService.kendoSVGIcon('data') 
    }
    this.drawerItems.push(drawerItem);
  }

  protected async loadResourceType(key: string, resourceType: string, path: string, currentUserID: number) {
    const rt = this.sharedService.ResourceTypeByName(resourceType)
    if (rt) {
      const icon = rt.Icon;

      const drawerItem = {
        id: key,
        selected: false,
        text: resourceType,
        path: path,
        svgIcon: icon ? this.sharedService.kendoSVGIcon(icon) : null
      }
      this.drawerItems.push(drawerItem); 
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
    this.sharedService.InvokeManualResize();
  }
}
