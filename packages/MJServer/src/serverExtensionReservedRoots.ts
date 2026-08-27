/**
 * Core HTTP prefixes MJServer mounts — many of them PRE-AUTH — that an Open App
 * server extension must not claim.
 *
 * Kept as literals (not imported `*_MOUNT_PATH` constants) so this module cannot
 * pull `config.ts` / telephony routers into every importer. Values MUST stay in
 * lockstep with the `export const *_MOUNT_PATH` declarations and the `app.use` /
 * `app.get` calls in `src/index.ts`. The companion unit test reads those source
 * files and fails if a constant drifts.
 *
 * `serve()` passes the result into `prepareServerExtensionConfigs({ extraReservedRoots })`.
 *
 * If you add a pre-auth `app.use(...)` in `serve()`, add its prefix here.
 */

/** Core mounts that have no exported `*_MOUNT_PATH` constant. */
export const CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS: readonly string[] = [
    '/healthcheck',
    '/esignature',
    '/media',
    '/oauth',
    '/health',
];

/**
 * Values of the exported `*_MOUNT_PATH` constants. Duplicated here as strings
 * so this file stays import-safe; the unit test asserts they still match source.
 */
export const CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS: readonly string[] = [
    '/auth',              // AUTH_CATALOG_MOUNT_PATH
    '/magic-link',        // MAGIC_LINK_MOUNT_PATH
    '/widget',            // WIDGET_MOUNT_PATH
    '/telephony/twilio',  // TWILIO_TELEPHONY_MOUNT_PATH
    '/telephony/vonage',  // VONAGE_TELEPHONY_MOUNT_PATH
    '/meetings/teams',    // TEAMS_MEETINGS_MOUNT_PATH
];

/**
 * Reserved roots for the running process. `graphqlRootPath` is included so a
 * deployment that sets `GRAPHQL_ROOT_PATH=/api` (or anything other than the
 * static `/graphql` baseline) is still protected. `/` as graphqlRootPath is
 * already reserved as the server root and does not prefix-match every path.
 */
export function coreReservedServerExtensionRoots(graphqlRootPath: string): string[] {
    const graphql = typeof graphqlRootPath === 'string' ? graphqlRootPath.trim() : '';
    return [
        ...(graphql ? [graphql] : []),
        ...CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS,
        ...CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS,
    ];
}
