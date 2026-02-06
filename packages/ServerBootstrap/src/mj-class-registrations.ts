/**
 * Pre-built class registrations manifest for all @memberjunction/* packages.
 *
 * External consumers import this to prevent tree-shaking of MJ's dynamically
 * registered classes. This file is generated at MJ build time and ships with
 * the @memberjunction/server-bootstrap package.
 *
 * Usage in your MJAPI entry point:
 *   import '@memberjunction/server-bootstrap/mj-class-registrations';
 */
export * from './generated/mj-class-registrations.js';
