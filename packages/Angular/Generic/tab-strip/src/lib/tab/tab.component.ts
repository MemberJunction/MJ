import { Component, Input, Output, EventEmitter, Host, ChangeDetectorRef, ElementRef } from '@angular/core';
import { MJTabBase } from '../tab.base';
import { MJTabStripComponent } from '../tab-strip/tab-strip.component';

/**
 * Represents the tab in the header of a given tab strip
 */
@Component({
  standalone: false,
  selector: 'mj-tab',
  templateUrl: './tab.component.html',
  styleUrl: './tab.component.css'
})
export class MJTabComponent extends MJTabBase {
  private _tabSelected: boolean = false;
  /**
   * Determines if the tab is currently selected or not. This is set by the TabStrip component automatically when the SelectedTabIndex is set, do not set this directly.
   */
  @Input() get TabSelected() {
    return this._tabSelected;
  } 
  set TabSelected(value: boolean) {
    this._tabSelected = value;
    this.cdr.detectChanges(); // Manually trigger change detection to update the view
  }

  private _visible: boolean = true;
  @Input() get Visible(): boolean {
    return this._visible;
  }
  public set Visible(value: boolean) {
    this._visible = value;
    // whenever the visible property changes we need to set the display style to none if it is not visible and make sure
    // we're not selected and set to tab index of 0 if we're selected

    // Step 1 - get the elementRef and set our display to none
    if (!this._visible)
      this.elementRef.nativeElement.style.display = value ? "" : "none";
    else
      this.elementRef.nativeElement.style.display = "";

    // Step 2 - if we're not visible, make sure we're not selected
    if (!this._visible)
      this.tabstrip.SelectedTabIndex = 0;
  }

  private _name: string = ""
  @Input() get Name(): string {
    return this._name;
  }
  public set Name(value: string) {
    this._name = value;
  }

  private _id: any = null;
  @Input() get ID(): any {
    return this._id;
  }
  public set ID(value: any) {
    this._id = value;
  }

  private _props: any = null;
  /**
   * A property bag that can be used to store any additional properties that you want to associate with this tab.
   */
  @Input() get Props(): any {
    return this._props;
  }
  public set Props(value: any) {
    this._props = value;
  }

  /**
   * Determines if the tab can be closed by a user, or not. Defaults to false.
   */
  @Input() TabCloseable: boolean = false;

  /**
   * Returns a reference to the tab strip that this tab belongs to.
   */
  public get TabStrip(): MJTabStripComponent {
    return this.tabstrip;
  }
  constructor(@Host() private tabstrip: MJTabStripComponent, 
              private cdr: ChangeDetectorRef,
              public elementRef: ElementRef) {
    super();
  }

  /**
   * Event handler for when this tab is clicked to select it, generally not a great idea to call this directly, but it is possible to call directly to simulate a click. 
   * The preferred approach is to set the SelectedTabIndex property on the TabStrip component directly.
   */
  public selectTab() {
    this.tabstrip.SelectedTabIndex = this.index;
  }

  /**
   * Event handler for when the close button is clicked on the tab. This will fire the BeforeTabClosed event on the TabStrip component, and if it is not cancelled, will then fire the AfterTabClosed event.
   */
  public closeTab($event: MouseEvent) {
    $event.stopPropagation(); // prevent click from going to the tab
    this.tabstrip.CloseTab(this.index);
  }

  public handleContextMenu($event: MouseEvent) {
    $event.preventDefault();
    this.tabstrip.handleTabContextMenu($event, this);
  }
}
