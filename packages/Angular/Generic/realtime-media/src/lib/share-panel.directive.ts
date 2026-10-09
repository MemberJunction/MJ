import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { SharePanelRegistry, type SharePanelRegistration } from './share-panel-registry';

/**
 * `[mjSharePanel]`: marks its element as a panel the user can share on its own. While the element is on screen, a call's
 * Share menu lists it under "This panel" by its label, and sharing it shows only this element. Where the browser cannot
 * share a single panel (anything but Chrome and Edge on the desktop), nothing is listed.
 *
 * An empty or `null` label leaves the element unmarked, so a host can mark it conditionally. The directive adds no style,
 * class or ARIA to its element and moves no focus; it registers the element with the app's {@link SharePanelRegistry}
 * and takes it off again when it goes away.
 *
 * ```html
 * <mj-tab-container mjSharePanel="Main content" mjSharePanelIcon="fa-solid fa-table-cells-large"></mj-tab-container>
 * <div [mjSharePanel]="shareable ? title : null" [mjSharePanelIcon]="icon">…</div>
 * ```
 */
@Directive({
  selector: '[mjSharePanel]',
  standalone: true,
})
export class SharePanelDirective implements OnInit, OnDestroy {
  private readonly registry = inject(SharePanelRegistry);
  private readonly element: Element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  private registration: SharePanelRegistration | null = null;
  private label: string | null = null;
  private icon: string | null = null;
  private initialized = false;

  /** The panel's name in the Share menu and in the share preview, such as "Whiteboard". Empty or `null`: not shareable. */
  @Input('mjSharePanel')
  public set Label(value: string | null) {
    this.label = value?.trim() || null;
    this.sync();
  }
  public get Label(): string | null {
    return this.label;
  }

  /** Font Awesome classes for the panel's menu item, such as `fa-solid fa-chalkboard`. Optional. */
  @Input('mjSharePanelIcon')
  public set Icon(value: string | null) {
    this.icon = value?.trim() || null;
    this.sync();
  }
  public get Icon(): string | null {
    return this.icon;
  }

  public ngOnInit(): void {
    this.initialized = true;
    this.sync();
  }

  public ngOnDestroy(): void {
    this.initialized = false;
    this.registration?.Unregister();
    this.registration = null;
  }

  /** Registers the element, renames it, or takes it off the registry, as the label says. */
  private sync(): void {
    if (!this.initialized) {
      return;
    }
    if (!this.label) {
      this.registration?.Unregister();
      this.registration = null;
    } else if (this.registration) {
      this.registration.Update(this.label, this.icon);
    } else {
      this.registration = this.registry.Register(this.element, this.label, this.icon);
    }
  }
}
