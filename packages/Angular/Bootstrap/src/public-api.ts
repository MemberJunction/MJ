/**
 * Public API Surface of @memberjunction/ng-bootstrap
 */

export * from './lib/bootstrap.module';
export * from './lib/bootstrap.component';
export * from './lib/bootstrap.types';
export * from './lib/services/initialization.service';
export * from './lib/components/auth-shell.component';

/**
 * Pre-built class registrations manifest for all @memberjunction/* Angular packages.
 * Importing this module prevents tree-shaking of MJ's dynamically registered classes.
 * Generated at MJ build time and ships with the package.
 */
export * from './generated/mj-class-registrations';