/**
 * registry.ts — the SERVER-FREE entry point for check registration + execution.
 *
 * WHY THIS EXISTS (browser fidelity, B32):
 * The root barrel (`./index`) re-exports `./bootstrap` (which imports
 * `@memberjunction/server-bootstrap-lite` + `mssql`) and every check module, some of
 * which import server-only packages. So a CLIENT dispatcher that reached for
 * `TestRunner` / `IntegrationCheckRegistry` through the barrel transitively loaded
 * `@memberjunction/core-entities-server` — and the ClassFactory then resolved entities
 * to their SERVER subclasses. The symptom was visible but easy to miss: the process
 * logged `MJRemoteOperationEntityServer is server/database-only …` and
 * `GetEntityObject('MJ: Tag Scopes')` returned `MJTagScopeEntityServer` rather than the
 * client class a browser would get.
 *
 * That silently defeated the point of client-first testing: the bundle claimed to prove
 * the wire behaves correctly for a browser, while actually exercising server subclasses
 * a browser never loads.
 *
 * This module therefore exports ONLY client-safe primitives — the runner, the registry,
 * and the types. It imports NO bootstrap and NO check modules. A client dispatcher pairs
 * it with `@memberjunction/testing-integration/client` (the server-free bootstrap) and a
 * direct side-effect import of its OWN check bundle via the `./checks/*` subpath, so the
 * only checks registered are the ones it intends to run.
 *
 * Keep this file dependency-light on purpose: anything added here is loaded by every
 * client dispatcher, and a single server import would silently reintroduce B32.
 */
// All four are verified server-free: `config` pulls only dotenv/path/cosmiconfig,
// `test-runner` only node:fs/node:path, `tiers` nothing, and `check-registry` only
// @memberjunction/global. `check`'s every import — including `mssql` and the
// instrumented-cache provider — is `import type`, so all of it is erased at compile time.
export * from './config';
export * from './test-runner';
export * from './check-registry';
export * from './check';
export * from './tiers';
