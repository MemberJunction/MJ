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

/** Source of per-instance DOM id bases — see {@link MJTabStripComponent.IdBase}. */
let tabStripIdSeq = 0;

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
  /** @deprecated No longer read — the strip sizes to content and the HOST owns region sizing. Kept only so existing bindings compile; remove on the next major. */
  @Input() FillWidth: boolean = true;
  /** @deprecated No longer read — the strip sizes to content and the HOST owns region sizing. Kept only so existing bindings compile; remove on the next major. */
  @Input() FillHeight: boolean = true;

  /**
   * Per-instance id base pairing each tab with its panel (`aria-controls` / `aria-labelledby`).
   * Index-suffixed by the tab/body components themselves once `syncTabIndexes` has run.
   */
  public readonly IdBase: string = `mj-tabstrip-${++tabStripIdSeq}`;

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

    // Pair each tab with its panel for assistive tech (`aria-controls` / `aria-labelledby`).
    // Written directly to the DOM rather than template-bound, because `index` is only known HERE —
    // after the first render — and a binding that changes mid-cycle trips NG0100 in dev mode.
    // Idempotent, and re-run whenever the tab set changes, so ids follow reorders/removals.
    this.tabs.forEach((tab, index) => {
      const el: HTMLElement | null = tab.elementRef?.nativeElement?.querySelector('[role="tab"]');
      if (el) {
        el.id = `${this.IdBase}-tab-${index}`;
        el.setAttribute('aria-controls', `${this.IdBase}-panel-${index}`);
      }
    });
    this.tabBodies.forEach((body, index) => {
      const el: HTMLElement | null = body.elementRef?.nativeElement?.querySelector('[role="tabpanel"]');
      if (el) {
        el.id = `${this.IdBase}-panel-${index}`;
        el.setAttribute('aria-labelledby', `${this.IdBase}-tab-${index}`);
      }
    });
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
    if (this.tabInnerContainer && this.tabInnerContainer.nativeElement) {
      // The list itself is the scroller now (`.mj-tabs__list` is `overflow-x: auto`), so overflow
      // and position are read off its NATIVE scroll state — the old scheme of animating a `left`
      // offset against a relatively-positioned wrapper is gone with the wrapper's CSS.
      const container: HTMLElement = this.tabInnerContainer.nativeElement;
      const overflow = container.scrollWidth - container.clientWidth;
      this.showLeftButton = overflow > 0 && container.scrollLeft > 0;
      this.showRightButton = overflow > 0 && container.scrollLeft < overflow - 1;
    }
  }

  protected scrollTabHeader(scrollAmount: number) {
    // Positive amount = reveal content to the LEFT (the old `left`-offset convention, preserved so
    // ScrollAmount and the button wiring keep their meaning); native scrollLeft counts the other way.
    const container: HTMLElement = this.tabInnerContainer.nativeElement;
    container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    // Smooth scrolling settles asynchronously; re-evaluate the buttons when it has.
    setTimeout(() => this.checkTabScrollButtons(), 300);
    this.TabScrolled.emit();
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
   * Keyboard navigation from the shared `mjTabList` directive (arrows / Home / End / Enter).
   *
   * The directive reports a POSITION among the rendered `[role="tab"]` elements, which is already
   * this component's identity model, so the mapping is direct. Selecting also scrolls the tab into
   * view — arrowing to a tab hidden behind the overflow edge would otherwise move focus somewhere
   * the user cannot see.
   */
  public onTabActivateRequested(request: { Index: number }): void {
    if (request.Index >= 0 && request.Index < this.tabs.length) {
      this.SelectedTabIndex = request.Index;
      this.scrollIntoView(request.Index);
    }
  }

  /**
   * Delete / Backspace on a focused tab. Routed through the SAME `CloseTab` path a click on the
   * close button uses, so the cancelable `BeforeTabClosed` contract holds for keyboard users too.
   * Ignored for tabs that are not closeable.
   */
  public onTabCloseRequested(request: { Index: number }): void {
    const tab = this.tabs?.toArray()[request.Index];
    if (tab?.TabCloseable) {
      void this.CloseTab(request.Index);
    }
  }


  /**
   * This method will scroll the specified tab index into view if it is not currently visible in the tab strip.
   * @param tabIndex 
   */
  public scrollIntoView(tabIndex: number) {
    // We do NOT change tab selection — the caller does that separately if they want to. The list
    // is a native horizontal scroller now, so the browser's own logic does the geometry.
    if (tabIndex >= 0 && tabIndex < this.tabs.length) {
      const tabElement: HTMLElement | undefined = this.tabs.toArray()[tabIndex]?.elementRef?.nativeElement;
      tabElement?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      setTimeout(() => this.checkTabScrollButtons(), 300);
    }
  }
}
