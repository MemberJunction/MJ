/**
 * Core HTTP prefixes MJServer mounts — many of them PRE-AUTH — that an Open App
 * server extension must not claim.
 *
 * Every value is relative to the API root (`ApiRoute()` composes the real mount path).
 *
 * Kept as literals (not imported `*_MOUNT_PATH` constants) so this module cannot
 * pull `config.ts` / telephony routers into every importer. Values MUST stay in
 * lockstep with the `export const *_MOUNT_PATH` declarations and the `app.use` /
 * `app.get` calls in `src/coreRoutes.ts`. The companion unit tests read the constants'
 * source and boot those mounts (`apiRootBoot.test.ts`), failing if either drifts.
 *
 * `serve()` passes the result into `prepareServerExtensionConfigs({ extraReservedRoots })`.
 *
 * If you add a pre-auth core mount, add its prefix here.
 */

/** Core mounts that have no exported `*_MOUNT_PATH` constant. */
export const CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS: readonly string[] = [
    '/healthcheck',
    '/esignature',
    '/media',
    '/oauth',
    '/health',
    '/realtime',
    '/realtime-proxy',
];

/**
 * Values of the exported `*_MOUNT_PATH` constants. Duplicated here as strings
 * so this file stays import-safe; the unit test asserts they still match source.
 */
export const CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS: readonly string[] = [
    '/auth',              // AUTH_CATALOG_MOUNT_PATH
    '/magic-link',        // MAGIC_LINK_MOUNT_PATH
    '/widget',            // WIDGET_MOUNT_PATH
];

/**
 * Reserved roots for the running process, relative to the API root like every extension RootPath.
 * `graphqlRootPath` is no longer reserved: the API root is where every route lives, so extensions sit
 * beneath it (`prepareServerExtensionConfigs({ apiRootPath })` composes the mount path). Extensions take
 * precedence over GraphQL because Apollo mounts last.
 */
export function CoreReservedServerExtensionRoots(): string[] {
    return [...CORE_CONSTANT_RESERVED_SERVER_EXTENSION_ROOTS, ...CORE_STATIC_RESERVED_SERVER_EXTENSION_ROOTS];
}

/** @deprecated Use {@link CoreReservedServerExtensionRoots}. The argument is ignored. */
export function coreReservedServerExtensionRoots(_graphqlRootPath?: string): string[] {
    return CoreReservedServerExtensionRoots();
}
