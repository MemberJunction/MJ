/**
 * @module @memberjunction/server-extensions-core
 *
 * Server Extension framework for MJServer. Provides the abstract base class
 * and loader for auto-discovering and managing server extension plugins.
 *
 * ## Overview
 *
 * This package defines the plugin architecture that allows any package to register
 * Express routes and lifecycle hooks on a running MJServer instance. Extensions
 * are discovered via MJ's standard `@RegisterClass` + `ClassFactory` pattern and
 * configured in `mj.config.cjs`.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { RegisterClass } from '@memberjunction/global';
 * import { BaseServerExtension } from '@memberjunction/server-extensions-core';
 *
 * @RegisterClass(BaseServerExtension, 'MyExtension')
 * export class MyExtension extends BaseServerExtension {
 *     // ... implement Initialize, Shutdown, HealthCheck
 * }
 * ```
 *
 * @see {@link BaseServerExtension} for the extension base class
 * @see {@link ServerExtensionLoader} for the discovery and lifecycle manager
 */

export { BaseServerExtension } from './BaseServerExtension.js';
export { ServerExtensionLoader } from './ServerExtensionLoader.js';
export {
    ServerExtensionConfig,
    ExtensionInitResult,
    ExtensionHealthResult,
} from './types.js';
