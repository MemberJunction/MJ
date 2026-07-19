/**
 * @fileoverview Public API Surface of @memberjunction/ng-react
 * This file exports all public APIs from the Angular React integration library.
 * @module @memberjunction/ng-react
 */

// Module
export * from './lib/module';

// Components
export * from './lib/components/mj-react-component.component';

// Services
export * from './lib/services/script-loader.service';
export * from './lib/services/react-bridge.service';
export * from './lib/services/angular-adapter.service';

// Configuration
export * from './lib/config/react-debug.config';

// Hooks
export * from './lib/hooks/antd-dropdown-position-hook';

// @RegisterClass plugin classes — must be exported so the ClassFactory
// registration is backed by an importable public API (see
// .github/scripts/check-registerclass-exports.mjs).
export * from './lib/utilities/runtime-utilities';
