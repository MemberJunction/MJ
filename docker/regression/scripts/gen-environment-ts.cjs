/**
 * Generate MJExplorer's Angular environment.ts at image-bake time.
 *
 * GRAPHQL_URI must be an absolute URL because graphql-request v7+ validates
 * with `new URL()` which rejects relative paths. We point it at
 * http://localhost:4200/api/ — nginx proxies /api/ to mjapi:4000 inside the
 * compose network, so the browser never has to resolve docker hostnames.
 *
 * Inputs come from build args (passed in via Dockerfile.explorer):
 *   AUTH0_DOMAIN
 *   AUTH0_CLIENTID
 *
 * Output paths:
 *   packages/MJExplorer/src/environments/environment.ts
 *   packages/MJExplorer/src/environments/environment.development.ts
 */

const fs = require('fs');
const path = require('path');

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || '';
const AUTH0_CLIENTID = process.env.AUTH0_CLIENTID || '';

const content = [
    'export const environment = {',
    "  GRAPHQL_URI: 'http://localhost:4200/api/',",
    "  GRAPHQL_WS_URI: 'ws://localhost:4200/api/',",
    "  REDIRECT_URI: 'http://localhost:4200/',",
    "  CLIENT_ID: '',",
    "  TENANT_ID: '',",
    "  CLIENT_AUTHORITY: '',",
    "  AUTH_TYPE: 'auth0' as const,",
    "  NODE_ENV: 'production',",
    '  AUTOSAVE_DEBOUNCE_MS: 1200,',
    '  SEARCH_DEBOUNCE_MS: 800,',
    '  MIN_SEARCH_LENGTH: 3,',
    "  MJ_CORE_SCHEMA_NAME: '__mj',",
    '  production: true,',
    "  APPLICATION_NAME: 'MJ Explorer',",
    "  APPLICATION_INSTANCE: 'TEST',",
    `  AUTH0_DOMAIN: '${AUTH0_DOMAIN}',`,
    `  AUTH0_CLIENTID: '${AUTH0_CLIENTID}',`,
    '};',
    '',
].join('\n');

const dir = 'packages/MJExplorer/src/environments';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'environment.ts'), content);
fs.writeFileSync(path.join(dir, 'environment.development.ts'), content);

console.log(`  Wrote ${dir}/environment.ts (AUTH0_DOMAIN=${AUTH0_DOMAIN || '(empty)'})`);
