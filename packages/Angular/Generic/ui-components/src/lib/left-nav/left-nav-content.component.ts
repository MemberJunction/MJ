import { Component, HostBinding, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * `<mj-left-nav-content>` — Content pane paired with `<mj-left-nav>`.
 *
 * Sits to the right of `<mj-left-nav>` inside `<mj-page-body [Flex]="true"
 * Direction="row">` and holds the active section's content. Provides the
 * standard layout box (`flex: 1`, page background, vertical overflow control)
 * plus built-in `[Loading]` / `[Error]` states so each shell doesn't reinvent
 * them.
 *
 * Projected content stays attached but hides via CSS when loading or errored —
 * matches the cached-component pattern used by admin shells where dynamically
 * loaded sub-pages should retain their state across section switches.
 *
 * ## Example
 *
 * ```html
 * <mj-page-body [Flex]="true" [Padding]="false" Direction="row">
 *   <mj-left-nav [Sections]="NavSections" [ActiveId]="ActiveSection"
 *                (ItemClicked)="OnNavItemClicked($event)" />
 *   <mj-left-nav-content [Loading]="IsLoading" [Error]="LoadError">
 *     <ng-container #contentHost></ng-container>
 *   </mj-left-nav-content>
 * </mj-page-body>
 * ```
 *
 * Replaces the bespoke `.{shell}-container__content` + `.{shell}-container__host`
 * + `.{shell}-container__loading` + `.{shell}-container__error` pattern that
 * every left-nav shell used to declare independently.
 */
@Component({
  selector: 'mj-left-nav-content',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (Error) {
      <div class="mj-left-nav-content__error" role="alert">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>{{ Error }}</span>
      </div>
    } @else if (Loading) {
      <div class="mj-left-nav-content__loading" role="status" aria-live="polite">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        <span>{{ LoadingLabel }}</span>
      </div>
    }
    <ng-content></ng-content>
  `,
  styles: [`
    :host {
      flex: 1;
      min-width: 0;
      /* min-height: 0 is essential when the parent <mj-page-body> reflows from
         row → column on mobile: without it this pane can't shrink below its
         content height, so the inner scroller (mj-page-body-interior) never
         gets a bounded height and the page can't scroll. Harmless in the row
         (desktop) case. */
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--mj-bg-page);
      overflow: hidden;
    }

    /* Force dynamically-projected components (via ViewContainerRef.createComponent
       or ng-content) to fill the host with a proper flex-column layout. ::ng-deep
       is required because Angular's emulated encapsulation gives the host a scope
       attribute that dynamically-created components do not inherit, so a plain
       direct-child selector would not match them. The :not() filters skip our own
       error / loading elements AND the interior chrome primitives, which already
       self-declare their flex behavior on :host (header-interior is display:block
       with natural height; body-interior is flex:1 1 auto with overflow-y:auto)
       and competing with them would break multi-sibling chrome layouts inside a
       single content pane. This replaces the bespoke inline-style hack admin
       shells used to apply via applyHostSizing(). */
    :host ::ng-deep > *:not(.mj-left-nav-content__error):not(.mj-left-nav-content__loading):not(mj-page-header-interior):not(mj-page-body-interior) {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* When busy, hide projected content but keep cached components attached
       to the DOM so their state survives the loading / error transition. */
    :host(.mj-left-nav-content--busy) ::ng-deep > *:not(.mj-left-nav-content__error):not(.mj-left-nav-content__loading) {
      display: none;
    }

    .mj-left-nav-content__error,
    .mj-left-nav-content__loading {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--mj-text-muted);
      font-size: 13px;
      padding: 32px;
      text-align: center;
    }

    .mj-left-nav-content__error {
      color: var(--mj-status-error);
    }

    .mj-left-nav-content__error i {
      font-size: 20px;
    }

    .mj-left-nav-content__loading i {
      font-size: 16px;
      color: var(--mj-brand-primary);
    }
  `]
})
export class MJLeftNavContentComponent {
  /**
   * When `true`, shows a centered loading state (spinner + label) and hides
   * any projected content via CSS. Cached components remain attached.
   */
  @Input() Loading: boolean = false;

  /**
   * When non-empty, shows a centered error state with this message and hides
   * any projected content.
   */
  @Input() Error: string | null = null;

  /** Label shown in the loading state. Defaults to "Loading…". */
  @Input() LoadingLabel: string = 'Loading…';

  /**
   * Drives the busy-state class on the host. When set, CSS hides projected
   * content (cached components stay attached, just not visible).
   */
  @HostBinding('class.mj-left-nav-content--busy')
  get IsBusy(): boolean {
    return this.Loading || !!this.Error;
  }

  @HostBinding('attr.aria-busy')
  get AriaBusy(): string | null {
    return this.Loading ? 'true' : null;
  }
}
