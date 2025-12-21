import { Component, Input, EventEmitter, Output, ContentChildren, QueryList, ViewChild, HostListener, ElementRef, AfterContentInit, AfterContentChecked, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { MJTabComponent } from '../tab/tab.component';
import { MJTabBodyComponent } from '../tab-body/tab-body.component';

 
export class TabEvent {
  public index!: number;
  public tab: MJTabComponent | null = null;
  public body: MJTabBodyComponent | null = null;
}
export class TabCancelableEvent extends TabEvent {
  public cancel: boolean = false;
}
export class TabClosedEvent extends TabEvent {
  /**
   * This property provides the default calculation for what the new tab index will be and can be overriden by the container component to set a different value.
   */
  public newTabIndex!: number
  /**
   * Whenever the container is done processing, it MUST call this done method to signal that it is done.  
   */
  public done!: (error?: any) => {};
}
export class TabContextMenuEvent extends TabEvent {
  public mouseEvent!: MouseEvent;
}

@Component({
  standalone: false,
  selector: 'mj-tabstrip',
  templateUrl: './tab-strip.component.html',
  styleUrls: ['./tab-strip.component.css']
})
export class MJTabStripComponent implements AfterContentInit, AfterContentChecked, AfterViewInit {
  protected _selectedTabIndex: number = 0; // default to negative 1 so any valid value of 0+ will invoke a state change internally later

  public static OutputDebugInfo: boolean = false;
  protected static OutputDebugMessage(message: string): void {
    if (MJTabStripComponent.OutputDebugInfo) {
      console.log(message);
    }
  }

  constructor(private cdr: ChangeDetectorRef) { }
  @Input() FillWidth: boolean = true;
  @Input() FillHeight: boolean = true;

  /**
   * This event is raised whenever the TabStrip component determines it would be advisable to conduct any necessary
   * resizing action in the parent container. Implement an event handler to handle this, if desired, for your application.
   */
  @Output() ResizeContainer = new EventEmitter();

  /**
   * The index of the selected tab. You can get/set this value and it will change the displayed tab.
   */
  @Input() get SelectedTabIndex(): number {
    return this._selectedTabIndex;
  }
  set SelectedTabIndex(index: number) {
    // check to make sure that the new index is different from the current index and only do the work here if it is different
    MJTabStripComponent.OutputDebugMessage(`MJTabStripComponent.SelectedTabIndex(${index})`);
    if (index !== this._selectedTabIndex) {
      const props = { 
        index: index!, 
        tab: index !== null && this.tabs ? this.tabs.toArray()[index] : null,
        body: index !== null && this.tabBodies ? this.tabBodies.toArray()[index] : null,
        cancel: false
      };
      if (props.tab?.Visible) {
        this.BeforeTabSelected.emit(props);
        if (!props.cancel) {
          this._selectedTabIndex = index;
  
          this.innerRefreshTabVisibility(index);      
  
          const afterProps = {
            index: index!,
            tab: props.tab,
            body: props.body
          }
          this.TabSelected.emit(afterProps);  
        }  
      }
      else
        throw new Error(`Tab index ${index} is not visible and cannot be selected.`);
    }
    else {
      // always do this even if we're not firing event since we're already on the right tab
      this.innerRefreshTabVisibility(index);      
    }
  }

  /**
   * This method will attempt to set the current tab by name. If the tab is found, it will be selected and the method will return the tab object. If the tab is not found, the method will return undefined.
   * @param tabName 
   * @returns 
   */
  public SelectTabByName(tabName: string): MJTabComponent | undefined {
    const tab = this.GetTabByName(tabName);
    if (tab) {
      if (tab.Visible)
        this.SelectedTabIndex = tab.index;
      else
        throw new Error(`Tab ${tabName} is not visible and cannot be selected.`);
    }
    return tab;
  }

  public GetTabByName(tabName: string): MJTabComponent | undefined {
    return this.tabs.find(t => t.Name?.trim().toLowerCase() === tabName.trim().toLowerCase());
  }

  protected innerRefreshTabVisibility(index: number) {
    Promise.resolve().then(() => {
      MJTabStripComponent.OutputDebugMessage(`MJTabStripComponent.innerRefreshTabVisibility(${index})`);
      // do this within a Promise.resolve() to ensure that the change detection has a chance to catch up before we start changing things

      // now, we have to tell each of our tabs they have been selected or not, and also to tell the bodies if they are visible or not
      this.tabs?.forEach((tab, i) => tab.TabSelected = i === index);
      this.tabBodies?.forEach((body, i) => body.TabVisible = i === index);

      // let angular now it needs to update its change detection
      this.cdr.detectChanges();
      
      // also ask for a resize now
      this.ResizeContainer.emit();
    });
  }

  /**
   * This event is fired before a tab is selected. If you set cancel to true, the tab will not be selected.
   */
  @Output() BeforeTabSelected = new EventEmitter<TabCancelableEvent>();

  /**
   * This event is fired when a tab is selected.
   */
  @Output() TabSelected = new EventEmitter<TabEvent>();

  /**
   * This event is fired before a tab is closed. If you set cancel to true, the tab will not be closed.
   */
  @Output() BeforeTabClosed = new EventEmitter<TabCancelableEvent>();

  /**
   * This event is fired after a tab is closed.
   */
  @Output() TabClosed = new EventEmitter<TabClosedEvent>(true);

  /**
   * This event is fired when a tab is right-clicked and the context menu event from the tab header fires.
   */
  @Output() TabContextMenu = new EventEmitter<TabContextMenuEvent>();

  /**
   * This event is fired whenever the tab control is scrolled left or right. This event can be invoked either due to a user clicking on the left/right buttons or by calling the scrollLeft/scrollRight methods, or by
   * the ScrollIntoView method being called.
   */
  @Output() TabScrolled = new EventEmitter();


  @ContentChildren(MJTabComponent) tabs!: QueryList<MJTabComponent>;
  @ContentChildren(MJTabBodyComponent) tabBodies!: QueryList<MJTabBodyComponent>;
   

  private _viewInitialized: boolean = false;
  ngAfterViewInit() {
    this._viewInitialized = true;
    this.SelectedTabIndex = this.SelectedTabIndex; // force a refresh of the tab visibility
    this.syncTabIndexes();
    this.checkTabScrollButtons();
  }
  ngAfterContentInit() {
    this.syncTabIndexes();
  }
  ngAfterContentChecked(): void {
    this.syncTabIndexes();
    this.checkTabScrollButtons();
  }

  /**
   * Call this method if you are ever dynamically adding or removing tabs from the component over time using @if or *ngIf or other similar methods. This will force the tab strip to 
   * re-evaluate the tabs and tab bodies and update the display accordingly.
   */
  public RefreshTabs() {
    this.cdr.detectChanges();
    this.syncTabIndexes();
    this.innerRefreshTabVisibility(this.SelectedTabIndex);
  }

  protected syncTabIndexes() {
    if (!this._viewInitialized) return; // don't do anything until the view is initialized  

    // Automatically assign indices to tabs and tab bodies
    this.tabs.forEach((tab, index) => tab.index = index);
    this.tabBodies.forEach((body, index) => body.index = index);
    if (this.SelectedTabIndex === null && this.tabs.length > 0) {
      this.SelectedTabIndex = 0;
    }
    else if (this.tabs.length === 0)
      this.SelectedTabIndex = -1;
  }

  /**
   * Returns a read-only (copy) of the tabs in this tab strip.
   */
  public get Tabs(): MJTabComponent[] {
    return this.tabs.toArray();
  }

  /**
   * Returns a read-only (copy) of the tab bodies in this tab strip.
   */
  public get TabBodies(): MJTabBodyComponent[] {
    return this.tabBodies.toArray();
  }

  /**
   * Method will close the specified tab number. It is automatically called by a tab that has TabCloseable set to true, if the user clicks the close button, and can be called programatically as well.
   */
  public async CloseTab(tabIndex: number) {
    MJTabStripComponent.OutputDebugMessage(`MJTabStripComponent.CloseTab(${tabIndex})`);
    if (tabIndex >= 0 && tabIndex < this.tabs.length) {
      // figure out what the new tab index will be so we can share with our container component
      let newTabIndex;
      if (this.tabs.length === 1) {
        // deleting the only tab we have, shouldn't happen but if so, set to -1
        newTabIndex = -1;
      }
      else if (this.SelectedTabIndex >= this.tabs.length - 1) {
        // we are ABOUT to delete the last tab, so select what will be the new last tab
        newTabIndex = this.tabs.length - 2; // substract 2 becuase subtracting 1 would be the last tab, but we are about to delete it
      }
      else {
        // deleting a tab that is not the last one, so we don't need to do anything special, just set the index to what it was before
        newTabIndex = this.SelectedTabIndex;  
      }

      const props: any = { 
        index: tabIndex,
        tab: this.tabs.toArray()[tabIndex],
        body: this.tabBodies.toArray()[tabIndex],
        cancel: false,
      };
      this.BeforeTabClosed.emit(props);
      if (!props.cancel) {
        // Convert callback to a promise
        const waitForCompletion = new Promise((resolve, reject) => {
          props.done = (error?: any) => {
            if (error) {
              reject(error);
            } else {
              resolve(true);
            }
          };
        });        
        props.newTabIndex = newTabIndex;

        // fire off the event to the container component
        this.TabClosed.emit(props);
        // wait for callback to occur from the event handler
        await waitForCompletion; 

        // finally, set the tab index to the props.newTabIndex value which allows the container to override our default calculation for new tab index
        this.SelectedTabIndex = props.newTabIndex;
      }
    }
    else
      throw new Error("Invalid tab index: " + tabIndex);
  }


  public handleTabContextMenu($event: MouseEvent, tab: MJTabComponent) {
    this.TabContextMenu.emit({ index: tab.index, tab: tab, body: this.tabBodies.toArray()[tab.index], mouseEvent: $event });
  }


  /* INTERNAL IMPLEMENTATION */
  @ViewChild('tabInnerContainer') tabInnerContainer!: ElementRef;

  showLeftButton: boolean = false;
  showRightButton: boolean = false;

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkTabScrollButtons();
  }

  protected checkTabScrollButtons() {
    if (this.tabInnerContainer && this.tabInnerContainer.nativeElement && this.tabInnerContainer.nativeElement.parentElement) {
      const container = this.tabInnerContainer.nativeElement;
      const parent = container.parentElement;
      const currentLeft = container.style.left ? parseInt(container.style.left) : 0;

      // show the right button if the container is wider than the parent AND the left position(which is zero or negative) + the container width is greater than the parent width
      this.showRightButton = container.clientWidth > parent.clientWidth && 
                             currentLeft + container.clientWidth > parent.clientWidth;

      // Show left button if left position is less than 0, meaning some of the left side of the container is off screen
      this.showLeftButton = currentLeft < 0;  
    }
  }

  protected scrollTabHeader(scrollAmount: number) {
    const style = this.tabInnerContainer.nativeElement.style
    if (style) {
      const curLeft = style.left ? parseInt(style.left) : 0;     
      style.left = (curLeft + scrollAmount) + 'px';
      this.checkTabScrollButtons(); // can do immediately because the above is direct DOM manipulation so the effect is immediate
      this.TabScrolled.emit();
    }
  }

  /**
   * This property determines how many pixels to scroll when the scrollLeft or scrollRight methods are called.
   */
  @Input() ScrollAmount: number = 150;
  public scrollLeft() {
    this.scrollTabHeader(150)
  }
  public scrollRight() {
    this.scrollTabHeader(-150)
  }


  /**
   * This method will scroll the specified tab index into view if it is not currently visible in the tab strip.
   * @param tabIndex 
   */
  public scrollIntoView(tabIndex: number) {
    // In this method, we need to calculate the current left position of the specified tab, 
    // if it is not visible we need to scroll left or scroll right sufficiently in order to ensure that the tab specified is visible
    // we do NOT change tab selection, the caller can do that separately if they want to
    if (tabIndex >= 0 && tabIndex < this.tabs.length) {
      const tab = this.tabs.toArray()[tabIndex];
      if (tab) {
        const tabElement = tab.elementRef.nativeElement;
        if (tabElement) {
          const tabLeft = tabElement.offsetLeft;
          const tabRight = tabLeft + tabElement.offsetWidth;
          const container = this.tabInnerContainer.nativeElement;
          const containerLeft = container.offsetLeft;
          const containerRight = containerLeft + container.offsetWidth;

          if (tabLeft < containerLeft) {
            // tab is off to the left, scroll left
            this.scrollTabHeader(tabLeft - containerLeft);
          }
          else if (tabRight > containerRight) {
            // tab is off to the right, scroll right
            this.scrollTabHeader(tabRight - containerRight);
          }
          else {
            // tab is already visible, do nothing
          }
        }
      }
    }
  }
}
