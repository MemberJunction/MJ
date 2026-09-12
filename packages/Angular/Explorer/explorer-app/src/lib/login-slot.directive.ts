import { Directive, Input, TemplateRef } from '@angular/core';

/**
 * The regions of the login screen a host can fill with its own markup.
 *
 * Two of the four **replace** what the screen would otherwise draw, and two are **additive** —
 * the distinction is stated per slot below rather than left to be discovered, because it decides
 * whether a host's content lands beside the stock content or instead of it.
 *
 * @since 6.1.0
 */
export type MJLoginSlotName =
  /**
   * REPLACES the story panel's brand block (logo, title, subtitle). The host owns the whole
   * block, so `LoginBannerTitle` / `LoginBannerSubtitle` / `LoginBannerLogoLabel` no longer apply.
   */
  | 'bannerContent'
  /**
   * ADDITIVE, after the brand block. Suppresses the `'banner'`-region {@link MJLoginCard}s, which
   * are the stock content for this region — a host that wants both renders the cards' equivalent
   * in its own template.
   */
  | 'bannerFooter'
  /** ADDITIVE, above the sign-in options. Empty by default. */
  | 'panelHeader'
  /**
   * ADDITIVE, below the sign-in options. Suppresses the `'panel'`-region {@link MJLoginCard}s,
   * on the same rule as `'bannerFooter'`.
   */
  | 'panelFooter';

/**
 * Projects a template into one of the login screen's {@link MJLoginSlotName} regions.
 *
 * Mirrors `mjChatSlot` from `@memberjunction/ng-conversations` — one directive covering every
 * slot, so adding a region is a union member rather than a new directive class, and the host's
 * template is rendered through `ngTemplateOutlet` while the screen keeps a real default for any
 * slot nobody filled. That is what a bare `<ng-content>` could not do here: the login screen
 * renders the same regions in different places depending on {@link MJLoginLayout}, and content
 * captured as a `TemplateRef` can be rendered wherever the chosen layout puts it.
 *
 * Every slot is opt-in — an app that projects nothing sees the stock login screen.
 *
 * @example
 * ```html
 * <mj-explorer-app [LoginLayout]="'centered'">
 *   <ng-template mjLoginSlot="panelFooter">
 *     <a class="acme-legal" href="/terms">Terms</a> · <a class="acme-legal" href="/privacy">Privacy</a>
 *   </ng-template>
 * </mj-explorer-app>
 * ```
 *
 * @since 6.1.0
 */
@Directive({
  selector: '[mjLoginSlot]',
  standalone: true
})
export class MJLoginSlotDirective {
  /** Which region this template fills. */
  @Input('mjLoginSlot') public SlotName!: MJLoginSlotName;

  constructor(public readonly Template: TemplateRef<unknown>) {}
}
