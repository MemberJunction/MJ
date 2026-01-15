/**
 * MJAPI Server Configuration
 *
 * This is a completely empty config file - demonstrating the power of the
 * distributed defaults system!
 *
 * ALL settings come from @memberjunction/server (DEFAULT_SERVER_CONFIG),
 * which references environment variables for deployment-specific values:
 *
 * Database Connection:
 * - DB_HOST, DB_PORT, DB_DATABASE
 * - DB_USERNAME, DB_PASSWORD
 * - DB_TRUST_SERVER_CERTIFICATE, DB_INSTANCE_NAME
 * - DB_READ_ONLY_USERNAME, DB_READ_ONLY_PASSWORD
 * - MJ_CORE_SCHEMA
 *
 * Server Settings:
 * - GRAPHQL_PORT, GRAPHQL_ROOT_PATH, GRAPHQL_BASE_URL
 * - MJAPI_PUBLIC_URL, ENABLE_INTROSPECTION, MJ_API_KEY
 *
 * Authentication:
 * - Azure AD: TENANT_ID, WEB_CLIENT_ID
 * - Auth0: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET
 *
 * Ask Skip Integration:
 * - ASK_SKIP_URL, ASK_SKIP_API_KEY, ASK_SKIP_ORGANIZATION_ID
 * - ASK_SKIP_CHAT_URL, ASK_SKIP_LEARNING_URL
 * - ASK_SKIP_RUN_LEARNING_CYCLES, ASK_SKIP_RUN_LEARNING_CYCLES_UPON_STARTUP
 * - ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES
 *
 * Other Settings:
 * - METADATA_CACHE_REFRESH_INTERVAL
 * - MJ_TELEMETRY_ENABLED
 *
 * Framework defaults (automatically configured):
 * - User handling (auto-create users, roles, etc.)
 * - Database settings (timeouts, connection pool)
 * - Scheduled jobs (enabled, max concurrent, etc.)
 * - Telemetry (enabled, level)
 * - SQL logging (enabled, options)
 * - REST API options
 *
 * To override ANY default setting, simply add it to this file.
 * For example:
 *
 * module.exports = {
 *   telemetry: {
 *     enabled: false,
 *     level: 'debug'
 *   },
 *   userHandling: {
 *     autoCreateNewUsers: false,
 *     newUserRoles: ['Viewer']
 *   },
 *   restApiOptions: {
 *     enabled: true
 *   }
 * };
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  // Empty config - everything uses defaults from DEFAULT_SERVER_CONFIG!
  // Add any custom overrides here if needed.
};
