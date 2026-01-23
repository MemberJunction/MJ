/*
 * Public API Surface
 */

// Core exports
export * from './lib/mjexplorer-auth-base.service';
export * from './lib/auth-services.module';
export { RedirectComponent } from './lib/redirect.component';

// Type exports - v3.0.0 standardized types
export * from './lib/auth-types';

// Interface exports
export * from './lib/IAuthProvider';
export * from './lib/AngularAuthProviderFactory';

// Provider implementations
export * from './lib/providers/mjexplorer-msal-provider.service';
export * from './lib/providers/mjexplorer-auth0-provider.service';
export * from './lib/providers/mjexplorer-okta-provider.service';