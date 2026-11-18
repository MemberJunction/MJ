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

// Metadata-driven provider catalog (pre-auth) + the reusable multi-IdP login picker
export * from './lib/auth-provider-catalog';
export * from './lib/catalog-environment';
export * from './lib/login-picker.component';

// Designed sign-in page (Login Studio): the pre-auth loader and the region renderer
export * from './lib/login-screen-loader';
export * from './lib/login-region.component';

// Lazy provider loader and session token detection (providers themselves live in subpath exports)
export * from './lib/auth-provider-loader';
export * from './lib/magic-link-session';