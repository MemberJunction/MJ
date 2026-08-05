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
          </button>
        }
      </div>

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
        max-width: 420px;
      }

      .mj-login-picker__heading {
        margin: 0;
        font-size: var(--mj-text-2xl, 1.5rem);
        font-weight: 600;
        color: var(--mj-text-primary);
        text-align: center;
      }

      .mj-login-picker__subheading {
        margin: 0 0 var(--mj-space-2, 0.5rem);
        font-size: var(--mj-text-base, 1rem);
        color: var(--mj-text-muted);
        text-align: center;
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
        background: color-mix(in srgb, currentColor 14%, transparent);
        font-size: var(--mj-text-xs, 0.75rem);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
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
  @Input() Heading: string | null = 'Log In';

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

  /** Emitted with the chosen provider. The host decides what signing in means. */
  @Output() ProviderSelected = new EventEmitter<PublicAuthProviderInfo>();

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
