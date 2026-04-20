// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap-lite/mj-class-registrations';

// Import supplemental manifest for user-defined classes (generated at prestart with --exclude-packages @memberjunction)
import './generated/class-registrations-manifest.js';

export * from './Server.js';
export * from './config.js';