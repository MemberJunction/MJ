import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MenuAnchor, MenuAnchorOf, NextMenuFocusIndex, PlaceMenu } from './home-menus';
import { FilterSwitcherDashboards, HomeSwitcherDashboard } from './home-pinned-dashboards';

/** Width of the switcher menu, in pixels. Keep in step with the width in `.switcher-menu`. */
const SWITCHER_MENU_WIDTH = 300;

/** True when `target` is `container` or a node inside it. */
function isInside(container: Element | undefined, target: EventTarget | null): boolean {
  return !!container && target instanceof Node && container.contains(target);
}

/**
 * The Dashboards switcher on Home: a trigger and a menu with a filter box, Home, the pinned dashboards, New dashboard
 * and Manage pins. The Pinned header shows it as the "Dashboards" button (menu right-aligned); the dashboard view shows
 * it as the dashboard title (menu left-aligned), whose trigger can be a heading (HeadingLevel). The menu is
 * fixed-position under the trigger, so a collapsed accordion does not clip it. A click outside, Escape, focus moving
 * out, a change of the window's width or a page scroll closes it. Home handles the picks.
 */
@Component({
  standalone: false,
  selector: 'mj-home-dashboard-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Look === 'title') {
      @switch (HeadingLevel) {
        @case (1) { <h1 class="switcher-heading"><ng-container [ngTemplateOutlet]="titleTrigger"></ng-container></h1> }
        @case (2) { <h2 class="switcher-heading"><ng-container [ngTemplateOutlet]="titleTrigger"></ng-container></h2> }
        @default { <ng-container [ngTemplateOutlet]="titleTrigger"></ng-container> }
      }
    } @else {
      <button #trigger type="button" mjButton Variant="secondary" Size="sm" class="switcher-button"
        aria-haspopup="dialog" [attr.aria-expanded]="IsOpen" (click)="Toggle()">
        <i class="fa-solid fa-gauge-high" aria-hidden="true"></i>
        <span class="switcher-label">{{ Label }}</span>
        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
    }
    @if (IsOpen) {
      <div #menu class="switcher-menu" role="dialog" aria-label="Pinned dashboards"
        [style.left.px]="MenuLeft" [style.top.px]="MenuTop" [style.max-height.px]="MenuMaxHeight" (keydown)="OnMenuKeydown($event)">
        <mj-page-search Icon="fa-solid fa-magnifying-glass" Placeholder="Find a pinned dashboard"
          AriaLabel="Find a pinned dashboard" [Value]="Query" (ValueChange)="Query = $event"></mj-page-search>
        <div class="switcher-list">
          <button type="button" class="switcher-item switcher-home" [class.current]="!CurrentId"
            [attr.aria-current]="!CurrentId ? 'true' : null" (click)="Choose(null)">
            <i class="fa-solid fa-house" aria-hidden="true"></i><span class="switcher-item-name">Home</span>
            @if (!CurrentId) { <i class="fa-solid fa-check switcher-check" aria-hidden="true"></i> }
          </button>
          <div class="switcher-divider" role="separator"></div>
          @for (d of FilteredDashboards; track d.ID) {
            <button type="button" class="switcher-item switcher-dashboard" [class.current]="IsCurrent(d)"
              [attr.aria-current]="IsCurrent(d) ? 'true' : null" (click)="Choose(d.ID)">
              <i class="fa-solid fa-gauge-high" aria-hidden="true"></i><span class="switcher-item-name">{{ d.Name }}</span>
              @if (IsCurrent(d)) { <i class="fa-solid fa-check switcher-check" aria-hidden="true"></i> }
            </button>
          } @empty {
            <div class="switcher-empty">{{ Query.trim() ? 'No pinned dashboard matches.' : 'No pinned dashboards yet.' }}</div>
          }
        </div>
        <div class="switcher-divider" role="separator"></div>
        <button type="button" class="switcher-item switcher-new" (click)="ChooseNew()">
          <i class="fa-solid fa-plus" aria-hidden="true"></i><span class="switcher-item-name">New dashboard</span>
        </button>
        <button type="button" class="switcher-item switcher-manage" (click)="ChooseManagePins()">
          <i class="fa-solid fa-thumbtack" aria-hidden="true"></i><span class="switcher-item-name">Manage pins</span>
        </button>
      </div>
    }
    <!-- The title look's trigger; HeadingLevel puts it, and not the menu, in a heading -->
    <ng-template #titleTrigger>
      <button #trigger type="button" class="switcher-title" aria-haspopup="dialog" [attr.aria-expanded]="IsOpen" (click)="Toggle()">
        <span class="switcher-title-text">{{ Label }}</span>
        <i class="fa-solid fa-chevron-down switcher-chevron" aria-hidden="true"></i>
      </button>
    </ng-template>
  `,
  styles: [`
    :host { display: inline-flex; min-width: 0; max-width: 100%; }
    .switcher-heading { display: flex; min-width: 0; max-width: 100%; margin: 0; font: inherit; }
    .switcher-title {
      display: inline-flex; align-items: center; gap: var(--mj-space-3); max-width: 100%;
      margin-left: calc(-1 * var(--mj-space-2)); padding: var(--mj-space-1) var(--mj-space-2);
      border: 0; border-radius: var(--mj-radius-md); background: transparent; color: var(--mj-text-primary);
      font: inherit; font-size: var(--mj-text-lg); font-weight: var(--mj-font-bold); letter-spacing: var(--mj-tracking-tight);
      cursor: pointer;
    }
    .switcher-title:hover { background: var(--mj-bg-surface-hover); }
    .switcher-title:focus-visible { outline: none; box-shadow: var(--mj-focus-ring); }
    .switcher-title-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .switcher-chevron { font-size: 11px; color: var(--mj-text-muted); }
    .switcher-menu {
      position: fixed; z-index: 10001; width: 300px; overflow-y: auto; padding: 6px;
      background: var(--mj-bg-surface-elevated); border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md); box-shadow: var(--mj-shadow-lg);
      animation: switcher-in var(--mj-transition-fast);
    }
    @keyframes switcher-in { from { opacity: 0; } to { opacity: 1; } }
    .switcher-menu mj-page-search { display: flex; width: 100%; min-width: 0; }
    .switcher-list { max-height: 290px; overflow: auto; margin-top: 6px; }
    .switcher-item {
      display: flex; align-items: center; gap: var(--mj-space-3); width: 100%; padding: 8px 10px;
      border: 0; border-radius: var(--mj-radius-sm); background: transparent;
      font: inherit; font-size: var(--mj-text-sm); color: var(--mj-text-primary); text-align: left; cursor: pointer;
    }
    .switcher-item:hover { background: var(--mj-bg-surface-hover); }
    .switcher-item:focus-visible {
      outline: none; background: var(--mj-bg-surface-hover);
      box-shadow: inset 0 0 0 var(--mj-ring-width) var(--mj-focus-ring-color);
    }
    .switcher-item > i:first-child { width: 14px; text-align: center; font-size: 12px; color: var(--mj-text-muted); }
    .switcher-item-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .switcher-item.current { color: var(--mj-brand-primary); font-weight: var(--mj-font-semibold); }
    .switcher-item.current i { color: var(--mj-brand-primary); }
    .switcher-check { margin-left: auto; font-size: 12px; }
    .switcher-divider { height: 1px; margin: 6px 4px; background: var(--mj-border-default); }
    .switcher-empty { padding: 8px 10px; font-size: var(--mj-text-xs); color: var(--mj-text-muted); }
    @media (max-width: 480px) {
      .switcher-label {
        position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
        overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) { .switcher-menu { animation: none; } }
  `],
})
export class HomeDashboardSwitcherComponent implements OnDestroy {
  /** The pinned dashboards, in pin order. */
  @Input() Dashboards: HomeSwitcherDashboard[] = [];
  /** The dashboard Home shows, or null on the overview. */
  @Input() CurrentId: string | null = null;
  /** 'button': the Pinned header button. 'title': the dashboard title in the dashboard view. */
  @Input() Look: 'button' | 'title' = 'button';
  /** The trigger text: "Dashboards" for the button, the dashboard name for the title. */
  @Input() Label = 'Dashboards';
  /** 'right' lines the menu up with the trigger's right edge; 'left' with its left edge. */
  @Input() Align: 'left' | 'right' = 'right';
  /**
   * For the title look: 1 or 2 puts the trigger in an h1 or h2, with no margin or font of its own, and the menu stays
   * outside the heading. Null puts it in no heading. The button look ignores it.
   */
  @Input() HeadingLevel: 1 | 2 | null = null;
  /** Emits the dashboard the user picks, or null for Home. */
  @Output() Pick = new EventEmitter<string | null>();
  /** Emits when the user picks New dashboard. */
  @Output() New = new EventEmitter<void>();
  /** Emits when the user picks Manage pins. */
  @Output() ManagePins = new EventEmitter<void>();

  /** True while the menu shows. */
  public IsOpen = false;
  /** The text in the filter box. */
  public Query = '';
  /** The menu's left edge, in viewport pixels. */
  public MenuLeft = 0;
  /** The menu's top edge, in viewport pixels. */
  public MenuTop = 0;
  /** The menu's max height in pixels: the room on its side of the trigger. Null while the menu is measured. */
  public MenuMaxHeight: number | null = null;

  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('menu') private menu?: ElementRef<HTMLElement>;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  /** The window's width when the menu opened. A resize that keeps it, such as an on-screen keyboard opening, keeps the menu open. */
  private openWidth = 0;

  /**
   * Closes the menu on a click outside the switcher. It listens in the capture phase, so a click whose target stops
   * it still counts.
   */
  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!isInside(this.host.nativeElement, event.target)) {
      this.Close();
    }
  };

  /** Closes the menu when the page scrolls under it. A scroll inside the menu, such as its list, keeps it open. */
  private readonly onScroll = (event: Event): void => {
    if (!isInside(this.menu?.nativeElement, event.target)) {
      this.Close();
    }
  };

  /** The pinned dashboards whose name matches the filter box. */
  public get FilteredDashboards(): HomeSwitcherDashboard[] {
    return FilterSwitcherDashboards(this.Dashboards, this.Query);
  }

  /** True for the dashboard Home shows. */
  public IsCurrent(dashboard: HomeSwitcherDashboard): boolean {
    return UUIDsEqual(dashboard.ID, this.CurrentId);
  }

  /** Opens the menu when it is closed, and closes it when it is open. */
  public Toggle(): void {
    if (this.IsOpen) {
      this.Close();
    } else {
      this.Open();
    }
  }

  /** Opens the menu under the trigger, inside the viewport, with an empty filter box that has focus. */
  public Open(): void {
    const trigger = this.trigger?.nativeElement;
    if (!trigger) return;
    const anchor = MenuAnchorOf(trigger);
    this.Query = '';
    this.IsOpen = true;
    this.openWidth = window.innerWidth;
    this.placeMenu(anchor, 0);
    // Render the menu with no max height to measure its full height, then place it again with that height
    this.MenuMaxHeight = null;
    this.cdr.detectChanges();
    this.placeMenu(anchor, this.menu?.nativeElement.offsetHeight ?? 0);
    this.cdr.detectChanges();
    const filter = this.host.nativeElement.querySelector<HTMLInputElement>('.switcher-menu mj-page-search input');
    filter?.focus({ preventScroll: true });
    document.addEventListener('click', this.onDocumentClick, true);
    document.addEventListener('scroll', this.onScroll, true);
  }

  /** Closes the menu. `returnFocus` puts focus back on the trigger (Escape). */
  public Close(returnFocus = false): void {
    if (!this.IsOpen) return;
    this.IsOpen = false;
    this.stopWatchingPage();
    this.cdr.markForCheck();
    if (returnFocus) {
      this.trigger?.nativeElement.focus();
    }
  }

  /** Closes the menu and emits the picked dashboard, or null for Home. */
  public Choose(dashboardId: string | null): void {
    this.Close();
    this.Pick.emit(dashboardId);
  }

  /** Closes the menu and emits New. */
  public ChooseNew(): void {
    this.Close();
    this.New.emit();
  }

  /** Closes the menu and emits ManagePins. */
  public ChooseManagePins(): void {
    this.Close();
    this.ManagePins.emit();
  }

  /**
   * Keys in the menu: Escape closes it and puts focus back on the trigger. ArrowDown and ArrowUp move from the filter
   * box to the first or last row and between the rows; Home and End move between the rows. Other keys do nothing here.
   */
  public OnMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.Close(true);
      return;
    }
    const rows = Array.from(this.menu?.nativeElement.querySelectorAll<HTMLElement>('button.switcher-item') ?? []);
    const next = NextMenuFocusIndex(event.key, rows.findIndex(row => row === document.activeElement), rows.length);
    if (next !== null) {
      event.preventDefault();
      rows[next].focus();
    }
  }

  /** Closes the menu when focus moves to an element outside the switcher, as Tab does past the last row. */
  @HostListener('focusout', ['$event'])
  public OnFocusOut(event: FocusEvent): void {
    if (this.IsOpen && event.relatedTarget instanceof Node && !isInside(this.host.nativeElement, event.relatedTarget)) {
      this.Close();
    }
  }

  /**
   * Closes the menu when the window's width differs from its width at open. A resize of the height only, such as an
   * on-screen keyboard opening for the filter box, keeps the menu open.
   */
  @HostListener('window:resize')
  public OnWindowResize(): void {
    if (window.innerWidth !== this.openWidth) {
      this.Close();
    }
  }

  ngOnDestroy(): void {
    this.stopWatchingPage();
  }

  /**
   * Places the menu next to the trigger, lined up by Align, and limits its height to the room on that side. A height
   * of 0 places it below the trigger.
   */
  private placeMenu(anchor: MenuAnchor, height: number): void {
    const viewport = { Width: window.innerWidth, Height: window.innerHeight };
    const place = PlaceMenu(anchor, SWITCHER_MENU_WIDTH, height, this.Align, viewport);
    this.MenuLeft = place.Left;
    this.MenuTop = place.Top;
    this.MenuMaxHeight = place.MaxHeight;
  }

  /** Removes the page click and scroll listeners the open menu uses. */
  private stopWatchingPage(): void {
    document.removeEventListener('click', this.onDocumentClick, true);
    document.removeEventListener('scroll', this.onScroll, true);
  }
}
