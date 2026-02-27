/**
 * Pre-built class registrations manifest for @memberjunction/* packages (lite variant).
 *
 * Excludes ESM-incompatible packages:
 * - communication-* (depends on @microsoft/microsoft-graph-client which has ESM directory import issues)
 * - storage (also depends on @microsoft/microsoft-graph-client)
 * - content-autotagging, entity-communications-base, queue
 *
 * Usage in your entry point:
 *   import '@memberjunction/server-bootstrap-lite/mj-class-registrations';
 */
export * from './generated/mj-class-registrations.js';
