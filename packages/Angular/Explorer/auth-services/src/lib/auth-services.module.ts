import { NgModule, ModuleWithProviders, InjectionToken, Provider } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { AngularAuthProviderFactory } from './AngularAuthProviderFactory';
import { MJMagicLinkProvider } from './providers/mjexplorer-magic-link-provider.service';
import { MJGlobal } from '@memberjunction/global';
import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { AuthProviderCatalog, type AuthProviderResolution } from './auth-provider-catalog';
import { mergeCatalogEnvironment, type CatalogEnvironmentMapper } from './catalog-environment';
import { MJLoginPickerComponent } from './login-picker.component';

// Import our generic redirect component
import { RedirectComponent } from './redirect.component';

// Export the generic redirect component for backward compatibility
export { RedirectComponent };

/**
 * Injection token carrying how authentication resolved for this page load.
 *
 * A login surface injects this to decide whether to render the multi-provider picker or the
 * single sign-in button, and whether to start the login flow immediately after a picker
 * choice caused a reload.
 */
export const MJ_AUTH_PROVIDER_RESOLUTION = new InjectionToken<AuthProviderResolution>('MJ_AUTH_PROVIDER_RESOLUTION');

/** The resolution used when no catalog is supplied — i.e. the pre-existing single-provider path. */
const NO_CATALOG_RESOLUTION: AuthProviderResolution = { active: null, choices: [], showPicker: false, autoLogin: false };

/**
 * Extensible authentication module that supports N providers
 * Uses MJGlobal ClassFactory pattern for dynamic provider creation
 */
@NgModule({
  imports: [CommonModule, MJLoginPickerComponent],
  declarations: [RedirectComponent],
  exports: [RedirectComponent, MJLoginPickerComponent]
})
export class AuthServicesModule {
  /**
   * Wires the authentication provider into DI.
   *
   * @param environment The app's compiled environment. Typed loosely on purpose: every app
   *        declares its own environment shape (`MJEnvironmentConfig` and downstream equivalents
   *        are interfaces, which TypeScript will not assign to an indexed record), so narrowing
   *        this parameter would break every existing caller. It is narrowed once, below.
   * @param catalog Optional pre-auth provider catalog. Defaults to whatever the app preloaded
   *        via {@link AuthProviderCatalog.Preload} in its bootstrap entry point — passing it
   *        explicitly is for tests and for apps that source the catalog some other way. Callers
   *        must NOT pass `AuthProviderCatalog.GetPreloaded()` themselves: Angular's compiler
   *        requires every `imports` entry to be statically analyzable, and a function call in
   *        the argument list fails AOT with "Value could not be determined statically".
   *
   *        When the catalog is empty — an older server, a failed fetch, or a deployment that
   *        never adopted the entity — resolution falls back to `environment.AUTH_TYPE` and
   *        behaviour is byte-for-byte what it was before the catalog existed, which is what
   *        keeps every existing deployment working untouched.
   */
  static forRoot(environment: any, catalog?: PublicAuthProviderInfo[]): ModuleWithProviders<AuthServicesModule> {
    const env = environment as Record<string, unknown>;
    const providers: Provider[] = [];
    const configuredType = (env['AUTH_TYPE'] as string | undefined)?.toLowerCase();
    const resolvedCatalog = catalog ?? AuthProviderCatalog.GetPreloaded();

    // Coexistence resolution: a single Explorer deployment can serve both SSO
    // users and magic-link guests. If a magic-link session token is present for
    // this page load (URL fragment from /redeem, or stored earlier this tab), use
    // the magic-link provider regardless of the configured primary IdP. Otherwise
    // use the catalog selection, then the configured AUTH_TYPE. This auto-falls-back
    // to the IdP once a guest's token is gone (expired/logged out), so the normal
    // login button works again.
    const magicLinkActive = MJMagicLinkProvider.hasSessionToken();

    // The catalog resolves which provider this load uses; it never overrides an active
    // magic-link session, which is a property of THIS page load rather than a configured choice.
    const resolution = resolvedCatalog.length ? AuthProviderCatalog.Resolve(resolvedCatalog) : NO_CATALOG_RESOLUTION;
    providers.push({ provide: MJ_AUTH_PROVIDER_RESOLUTION, useValue: resolution });

    const catalogType = resolution.active?.driverClass?.toLowerCase();
    const authType = magicLinkActive ? MJMagicLinkProvider.PROVIDER_TYPE : (catalogType ?? configuredType);

    if (!authType) {
      console.error('No authentication provider available: the server published no catalog and no AUTH_TYPE is set in the environment');
      return {
        ngModule: AuthServicesModule,
        providers: providers as never[]
      };
    }

    if (magicLinkActive && authType !== (catalogType ?? configuredType)) {
      console.log(`[Auth] Magic-link session token detected — using the magic-link provider for this load (configured primary: '${catalogType ?? configuredType ?? 'none'}').`);
    }

    // Get the provider class from ClassFactory for extensibility
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
      MJAuthBase,
      authType
    );
    const providerClass = registration?.SubClass;

    // A catalog-selected provider takes its settings from metadata rather than from the compiled
    // environment, so the driver receives the row's values overlaid on the app's environment.
    // Magic-link is excluded: its session is established by the redeem flow, not by catalog config.
    const effectiveEnvironment =
      resolution.active && !magicLinkActive
        ? mergeCatalogEnvironment(environment, resolution.active, providerClass as CatalogEnvironmentMapper | undefined)
        : environment;

    // Use the factory to get provider-specific Angular services
    // This uses the static method on each provider class for extensibility
    const angularServices = AngularAuthProviderFactory.getProviderAngularServices(authType, effectiveEnvironment);
    providers.push(...angularServices);

    if (providerClass) {
      // Add the provider itself
      providers.push({
        provide: MJAuthBase,
        useClass: providerClass
      });
    } else {
      console.error(`No provider class registered for auth type: ${authType}`);
    }

    // Add the factory itself
    providers.push(AngularAuthProviderFactory);

    return {
      ngModule: AuthServicesModule,
      providers: providers as never[]
    };
  }
}
