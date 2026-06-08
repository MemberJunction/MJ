import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { AngularAuthProviderFactory } from './AngularAuthProviderFactory';
import { MJMagicLinkProvider } from './providers/mjexplorer-magic-link-provider.service';
import { MJGlobal } from '@memberjunction/global';

// Import our generic redirect component
import { RedirectComponent } from './redirect.component';

// Export the generic redirect component for backward compatibility
export { RedirectComponent };

/**
 * Extensible authentication module that supports N providers
 * Uses MJGlobal ClassFactory pattern for dynamic provider creation
 */
@NgModule({
  imports: [CommonModule],
  declarations: [RedirectComponent],
  exports: [RedirectComponent]
})
export class AuthServicesModule {
  static forRoot(environment: any): ModuleWithProviders<AuthServicesModule> {

    const providers: any[] = [];
    const configuredType = environment.AUTH_TYPE?.toLowerCase();

    // Coexistence resolution: a single Explorer deployment can serve both SSO
    // users and magic-link guests. If a magic-link session token is present for
    // this page load (URL fragment from /redeem, or stored earlier this tab), use
    // the magic-link provider regardless of the configured primary IdP. Otherwise
    // use the configured AUTH_TYPE. This auto-falls-back to the IdP once a guest's
    // token is gone (expired/logged out), so the normal login button works again.
    const magicLinkActive = MJMagicLinkProvider.hasSessionToken();
    const authType = magicLinkActive ? MJMagicLinkProvider.PROVIDER_TYPE : configuredType;

    if (!authType) {
      console.error('No AUTH_TYPE specified in environment');
      return {
        ngModule: AuthServicesModule,
        providers: []
      };
    }

    if (magicLinkActive && authType !== configuredType) {
      console.log(`[Auth] Magic-link session token detected — using the magic-link provider for this load (configured primary: '${configuredType ?? 'none'}').`);
    }

    // Use the factory to get provider-specific Angular services
    // This uses the static method on each provider class for extensibility
    const angularServices = AngularAuthProviderFactory.getProviderAngularServices(authType, environment);
    providers.push(...angularServices);

    // Get the provider class from ClassFactory for extensibility
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
      MJAuthBase,
      authType
    );
    const providerClass = registration?.SubClass;

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
      providers
    };
  }
}
