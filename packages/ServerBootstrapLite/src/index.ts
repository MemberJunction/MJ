/**
 * MemberJunction Server Bootstrap (Lite)
 *
 * A lightweight class registrations manifest that excludes heavy and ESM-incompatible
 * dependencies (communication providers, storage, bizapps actions, etc.).
 *
 * Use this package instead of @memberjunction/server-bootstrap for:
 * - CLI tools (MJCLI)
 * - CodeGen (CodeGenLib, MJCodeGenAPI)
 * - MCP Server
 * - A2A Server
 * - Any server-side app that doesn't need communication/storage/bizapps
 *
 * For the full manifest with all packages, use @memberjunction/server-bootstrap.
 */
export { CLASS_REGISTRATIONS, CLASS_REGISTRATIONS_MANIFEST_LOADED, CLASS_REGISTRATIONS_COUNT, CLASS_REGISTRATIONS_PACKAGES } from './mj-class-registrations.js';
