import { Component, Input, Output, EventEmitter, Host } from '@angular/core';
import { MJTabBase } from '../tab.base';
import { MJTabStripComponent } from '../tab-strip/tab-strip.component';

/**
 * Represents the tab in the header of a given tab strip
 */
@Component({
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
  constructor(@Host() private tabstrip: MJTabStripComponent) {
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
