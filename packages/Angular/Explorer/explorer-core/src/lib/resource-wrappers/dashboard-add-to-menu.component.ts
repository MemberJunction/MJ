import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/**
 * The Add to menu on a dashboard tab: Pin card and Share. Presentational: it shows
 * where the dashboard is already placed and emits the item the user picks.
 */
@Component({
  standalone: false,
  selector: 'mj-dashboard-add-to-menu',
  template: `
    <span class="atm">
      <button type="button" class="atm-trigger" title="Add to" aria-haspopup="menu" [attr.aria-expanded]="Open ? 'true' : 'false'" (click)="ToggleOpen($event)">
        <i class="fa-solid fa-plus"></i> Add to <i class="fa-solid fa-chevron-down atm-caret"></i>
      </button>
      @if (Open) {
        <div class="atm-menu" role="menu" aria-label="Add to" (click)="$event.stopPropagation()">
          <div class="atm-label">Home</div>
          <button type="button" role="menuitem" class="atm-item atm-pin" (click)="ChooseItem(PinToHome)">
            <i class="fa-solid fa-thumbtack"></i><span class="atm-text"><b>Pin card</b><small>A thumbnail card in Pinned</small></span>
            @if (IsPinned) { <span class="atm-added"><i class="fa-solid fa-check"></i> Added</span> } @else { <i class="fa-solid fa-plus atm-plus"></i> }
          </button>
          @if (CanShare) {
            <div class="atm-sep"></div>
            <button type="button" role="menuitem" class="atm-item atm-share" (click)="ChooseItem(Share)">
              <i class="fa-solid fa-share-nodes"></i><span class="atm-text"><b>Share with people or roles…</b></span>
            </button>
          }
        </div>
      }
    </span>
  `,
  styles: [`
    .atm { position: relative; display: inline-flex; }
    .atm-trigger { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.2s, color 0.2s; }
    .atm-trigger:hover, .atm-trigger[aria-expanded='true'] { background: var(--mj-bg-surface-sunken); color: var(--mj-text-primary); }
    .atm-trigger:focus-visible, .atm-item:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
    .atm-caret { font-size: 10px; }
    .atm-menu { position: absolute; right: 0; top: calc(100% + 6px); width: 320px; max-width: calc(100vw - 32px); background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg); box-shadow: var(--mj-shadow-lg); padding: 6px; z-index: var(--mj-z-dropdown); }
    .atm-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--mj-text-muted); padding: 8px 10px 4px; }
    .atm-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: transparent; border-radius: var(--mj-radius-md); color: var(--mj-text-primary); font: inherit; cursor: pointer; }
    .atm-item:hover { background: var(--mj-bg-surface-hover); }
    .atm-item > i { color: var(--mj-text-secondary); }
    .atm-text { flex: 1; display: flex; flex-direction: column; }
    .atm-item b { font-weight: 500; font-size: 13px; }
    .atm-item small { font-size: 11px; color: var(--mj-text-muted); }
    .atm-added { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--mj-radius-full); background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
    .atm-plus { color: var(--mj-text-muted); }
    .atm-sep { height: 1px; background: var(--mj-border-subtle); margin: 6px 4px; }
  `],
})
export class DashboardAddToMenuComponent {
  /** True when the dashboard is already pinned to Home. */
  @Input() IsPinned = false;
  /** True when the user may share the dashboard. False leaves out the Share item. */
  @Input() CanShare = true;
  /** The user picked Pin card. */
  @Output() PinToHome = new EventEmitter<void>();
  /** The user picked Share. */
  @Output() Share = new EventEmitter<void>();

  /** True while the menu is open. */
  public Open = false;

  /** Opens or closes the menu. The click does not reach the document, so it does not close it again. */
  public ToggleOpen(event: MouseEvent): void {
    event.stopPropagation();
    this.Open = !this.Open;
  }

  /** Closes the menu, then emits the picked item. */
  public ChooseItem(item: EventEmitter<void>): void {
    this.Open = false;
    item.emit();
  }

  /** Closes the menu when the user clicks anywhere outside it. */
  @HostListener('document:click')
  public OnDocumentClick(): void {
    this.Open = false;
  }

  /** Closes the menu on Escape. */
  @HostListener('document:keydown.escape')
  public OnEscape(): void {
    this.Open = false;
  }
}
