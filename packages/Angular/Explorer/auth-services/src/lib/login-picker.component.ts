import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { PublicAuthProviderInfo } from '@memberjunction/core';

/**
 * Brand keys the picker knows how to render as a coloured chip. Anything else falls back to a
 * neutral chip with the provider's Font Awesome icon (or its initial).
 */
const BRAND_ICON_CLASSES: Readonly<Record<string, string>> = {
  msal: 'fa-brands fa-microsoft',
  microsoft: 'fa-brands fa-microsoft',
  google: 'fa-brands fa-google',
  okta: 'fa-solid fa-circle-half-stroke',
  auth0: 'fa-solid fa-shield-halved',
  cognito: 'fa-brands fa-aws',
  workos: 'fa-solid fa-building-lock',
  'magic-link': 'fa-solid fa-wand-magic-sparkles'
};

/**
 * Reusable, app-agnostic multi-IdP login picker.
 *
 * Presentational by design: it takes a provider catalog in and emits the user's choice out. It
 * owns no routing, no branding, and no knowledge of which app embeds it, so Explorer and any
 * other MJ application get the identical accessible picker by dropping in the element and
 * supplying their own surrounding login surface.
 *
 * Accessibility comes from the shared `mjButton` directive (focus ring, hit target, disabled
 * semantics) rather than from styles restated here, so it cannot drift from the rest of the app.
 *
 * @example
 * ```html
 * <mj-login-picker
 *   [Providers]="Catalog"
 *   [Busy]="SigningIn"
 *   (ProviderSelected)="OnProviderSelected($event)">
 * </mj-login-picker>
 * ```
 */
@Component({
  selector: 'mj-login-picker',
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <div class="mj-login-picker">
      @if (Heading) {
        <h3 class="mj-login-picker__heading">{{ Heading }}</h3>
      }
      @if (Subheading) {
        <p class="mj-login-picker__subheading">{{ Subheading }}</p>
      }

      <div class="mj-login-picker__list" role="group" [attr.aria-label]="Heading || 'Sign-in options'">
        @for (provider of Providers; track provider.name) {
          <button
            mjButton
            [variant]="IsSingleProvider ? 'primary' : 'secondary'"
            size="lg"
            class="mj-login-picker__row"
            [class.mj-login-picker__row--default]="provider.isDefault && !IsSingleProvider"
            type="button"
            [disabled]="Busy"
            [ariaLabel]="LabelFor(provider)"
            (click)="Select(provider)">
            <span class="mj-login-picker__chip" aria-hidden="true">
              @if (IconClassFor(provider); as iconClass) {
                <i [class]="iconClass"></i>
              } @else {
                {{ InitialFor(provider) }}
              }
            </span>
            <span class="mj-login-picker__label">{{ LabelFor(provider) }}</span>
            @if (provider.isDefault && !IsSingleProvider) {
              <span class="mj-login-picker__pill">Default</span>
            }
            <span class="mj-login-picker__chevron" aria-hidden="true">
              <i class="fa-solid fa-arrow-right"></i>
            </span>
          </button>
        }
      </div>

      <!-- Empty catalog: the deployment is configured through config/env with nothing published,
           so there is no provider to name. Opt-in via FallbackCtaLabel — an app that passes
           nothing renders nothing, which is the prior behaviour. -->
      @if (!Providers.length && FallbackCtaLabel) {
        <button
          mjButton
          variant="primary"
          size="lg"
          class="mj-login-picker__row mj-login-picker__row--fallback"
          type="button"
          [disabled]="Busy"
          (click)="FallbackSelected.emit()">
          {{ FallbackCtaLabel }}
        </button>
      }

      @if (ShowPoweredBy) {
        <p class="mj-login-picker__attribution">Powered by MemberJunction</p>
      }
    </div>
  `,
  styles: [
    `
      .mj-login-picker {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-3, 0.75rem);
        width: 100%;
        max-width: 400px;
      }

      /* Left-aligned per the locked Login C direction — the heading, lede and rows share
         one leading edge; only the attribution centers. */
      .mj-login-picker__heading {
        margin: 0;
        font-size: var(--mj-text-2xl, 1.5rem);
        font-weight: var(--mj-font-bold, 700);
        color: var(--mj-text-primary);
        text-align: left;
      }

      .mj-login-picker__subheading {
        margin: 0 0 var(--mj-space-5, 1.25rem);
        font-size: var(--mj-text-base, 1rem);
        color: var(--mj-text-secondary);
        text-align: left;
      }

      .mj-login-picker__list {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2, 0.5rem);
      }

      /* Layout only — every visual affordance of the row (fill, radius, focus ring,
         hit target) belongs to the mjButton directive and is deliberately not restated. */
      .mj-login-picker__row {
        display: flex;
        align-items: center;
        gap: var(--mj-space-3, 0.75rem);
        width: 100%;
        text-align: left;
      }

      /* The default provider reads as the recommended path. Border only — fill, radius, focus
         ring and hit target all still come from the mjButton directive, and this targets the
         picker's own row class rather than .mj-btn, so the directive stays authoritative. */
      .mj-login-picker__row--default {
        border-color: var(--mj-brand-primary);
      }

      /* No icon chip or chevron to align against, so this one centres. */
      .mj-login-picker__row--fallback {
        justify-content: center;
        text-align: center;
      }

      .mj-login-picker__chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: var(--mj-radius-sm, 0.25rem);
        background: color-mix(in srgb, currentColor 12%, transparent);
        font-size: var(--mj-text-sm, 0.875rem);
        font-weight: 700;
      }

      /* Long provider names wrap instead of forcing horizontal overflow on narrow screens. */
      .mj-login-picker__label {
        flex: 1 1 auto;
        min-width: 0;
        white-space: normal;
      }

      .mj-login-picker__pill {
        flex: 0 0 auto;
        padding: 0.125rem var(--mj-space-2, 0.5rem);
        border-radius: var(--mj-radius-full, 999px);
        /* Brand-tinted rather than currentColor — the default provider is the one call to
           action on the surface, and Login C gives it the brand accent. */
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
        font-size: var(--mj-text-xs, 0.75rem);
        font-weight: var(--mj-font-bold, 700);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* Trailing affordance from the locked login mockup — signals that a row navigates
         away rather than toggling in place. Decorative, so it is aria-hidden and the row's
         accessible name still comes from the directive's ariaLabel. */
      .mj-login-picker__chevron {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        font-size: var(--mj-text-sm, 0.875rem);
        color: var(--mj-text-muted);
        transition: color 120ms ease, transform 120ms ease;
      }

      .mj-login-picker__row:hover .mj-login-picker__chevron,
      .mj-login-picker__row:focus-visible .mj-login-picker__chevron {
        color: var(--mj-brand-primary);
        transform: translateX(2px);
      }

      @media (prefers-reduced-motion: reduce) {
        .mj-login-picker__chevron {
          transition: none;
        }

        .mj-login-picker__row:hover .mj-login-picker__chevron,
        .mj-login-picker__row:focus-visible .mj-login-picker__chevron {
          transform: none;
        }
      }

      .mj-login-picker__attribution {
        margin: var(--mj-space-2, 0.5rem) 0 0;
        font-size: var(--mj-text-xs, 0.75rem);
        color: var(--mj-text-muted);
        text-align: center;
      }
    `
  ]
})
export class MJLoginPickerComponent {
  /** Providers to offer, already ordered by the caller. */
  @Input() Providers: PublicAuthProviderInfo[] = [];

  /** Optional heading rendered above the list. */
  @Input() Heading: string | null = 'Log in';

  /** Optional supporting line rendered under the heading. */
  @Input() Subheading: string | null = null;

  /**
   * Disables every row — set while a sign-in is being initiated so a second click cannot
   * start a competing redirect.
   */
  @Input() Busy = false;

  /**
   * Whether to render the "Powered by MemberJunction" attribution.
   *
   * On by default, and a host-supplied flag rather than a code change, because full
   * white-labelling is a commercial entitlement: a tenant that has paid to remove the
   * attribution must be satisfiable by configuration alone.
   */
  @Input() ShowPoweredBy = true;

  /**
   * Label for the call to action shown when the catalog published nothing.
   *
   * Lets one component cover all three states — 2+ providers (a list), exactly one (a single
   * primary CTA naming it), and none at all (this generic CTA, for deployments still configured
   * through `mj.config.cjs` / `AUTH_TYPE`). Null renders nothing, which is the prior behaviour
   * for hosts that handle the empty case themselves.
   */
  @Input() FallbackCtaLabel: string | null = null;

  /** Emitted with the chosen provider. The host decides what signing in means. */
  @Output() ProviderSelected = new EventEmitter<PublicAuthProviderInfo>();

  /** Emitted when the empty-catalog CTA is clicked. The host starts its configured sign-in. */
  @Output() FallbackSelected = new EventEmitter<void>();

  /** A single option is not a choice — it renders as one primary call to action. */
  public get IsSingleProvider(): boolean {
    return this.Providers.length === 1;
  }

  /** "Continue with Okta" — the conventional modern auth phrasing. */
  public LabelFor(provider: PublicAuthProviderInfo): string {
    return `Continue with ${provider.displayName || provider.name}`;
  }

  /**
   * Resolves the icon class for a provider: an explicit `Icon` from metadata wins, otherwise
   * a known brand mapping for the driver, otherwise null (the chip falls back to an initial).
   */
  public IconClassFor(provider: PublicAuthProviderInfo): string | null {
    if (provider.icon) {
      return provider.icon.startsWith('fa-') ? provider.icon : (BRAND_ICON_CLASSES[provider.icon.toLowerCase()] ?? null);
    }
    return BRAND_ICON_CLASSES[provider.driverClass?.toLowerCase()] ?? null;
  }

  /** Fallback chip content when no icon resolves. */
  public InitialFor(provider: PublicAuthProviderInfo): string {
    return (provider.displayName || provider.name || '?').charAt(0).toUpperCase();
  }

  public Select(provider: PublicAuthProviderInfo): void {
    if (!this.Busy) {
      this.ProviderSelected.emit(provider);
    }
  }
}
