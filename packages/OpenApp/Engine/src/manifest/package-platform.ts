/**
 * Where a manifest package is allowed to RUN — the third axis of a `packages` entry, alongside
 * which array it sits in (`server`/`client`/`shared`) and its `role`.
 *
 * `shared` answers "which tiers is this package FOR", not "can this package run there". An actions
 * package is shared source — the server imports it and the app's own types reference it — but it
 * cannot be loaded in a browser: a first-party `*-actions` package depends on
 * `@memberjunction/aiengine`, directly or via `@memberjunction/core-entities-server`, and aiengine
 * depends on `@memberjunction/storage` — the one package that declares `@google-cloud/storage`,
 * which imports `fs`, `child_process`, `stream` and `node:async_hooks`. Before this axis existed,
 * `shared` put all of that in the Angular bundle and the host Explorer could not build (#4428).
 *
 * CANONICAL. Two other sites deliberately keep their own copy of this rule rather than import it,
 * because neither may take a dependency on this package:
 *   - `packages/DynamicPackages/src/discover.ts` (ships to the browser; one dependency by design)
 *   - `packages/MJCLI/src/lib/dev-workspace/build.ts`
 * Change one, change all three. `package-platform.test.ts` holds the canonical case list; the two
 * copies' specs mirror its cases by hand, because neither package can import this one.
 */
export type PackagePlatform = 'node' | 'browser' | 'both';

/** The two fields of a manifest package entry that decide tier routing. */
export interface PlatformRoutable {
    role?: string;
    platform?: PackagePlatform;
}

/**
 * The platform a package runs on: what it declares, or the default implied by its role.
 *
 * `actions` defaults to `node` because an MJ action is Node-side by construction — it is the one
 * role in the manifest's `role` enum (`packageRoleSchema` in `manifest-schema.ts`) that can never
 * be browser-safe. `GENERATED_PACKAGE_TYPES_BY_TIER` in `@memberjunction/dynamic-packages`'s
 * `discover.ts` also uses the word `'actions'`, but it enumerates the HOST's own CodeGen-generated
 * `codeGeneration.packages` types, not manifest package roles, so this rule does not govern it.
 *
 * Every other role defaults to `both`, which is how every manifest entry was routed before this
 * axis existed. A `role: "actions"` entry with no `platform` does change meaning: under `shared` it
 * no longer reaches the browser bundle (#4428), and under `client` the manifest schema now rejects
 * it as contradictory.
 */
export function ResolvePackagePlatform(pkg: PlatformRoutable): PackagePlatform {
    if (pkg.platform) {
        return pkg.platform;
    }
    return pkg.role === 'actions' ? 'node' : 'both';
}

/** Whether a package may be loaded by a process of `tier`. */
export function PackageRunsOnTier(pkg: PlatformRoutable, tier: 'server' | 'client'): boolean {
    const platform = ResolvePackagePlatform(pkg);
    if (platform === 'both') {
        return true;
    }
    return tier === 'server' ? platform === 'node' : platform === 'browser';
}
