/**
 * @fileoverview Tree-shaking anchor guaranteeing all standard `@memberjunction/tours-runtime`
 * ClassFactory plugins are loaded and registered when the package is imported.
 * @module @memberjunction/tours-runtime
 */

import './base-driver';
import './standard-step-types';
import './standard-anchor-resolvers';
import './standard-completion-checks';
import './standard-triggers';
import './standard-eligibility-policies';
import './standard-directors';

let _registered = false;

/**
 * Tree-shaking anchor function for `@memberjunction/tours-runtime` standard plugins.
 * Calling or importing this ensures all `@RegisterClass` decorators execute.
 */
export function RegisterStandardTourPlugins(): void {
    _registered = true;
}

export function AreStandardTourPluginsRegistered(): boolean {
    return _registered;
}
