import { AsyncLocalStorage } from 'node:async_hooks';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

/**
 * Which connection's catalog the code currently running belongs to.
 *
 * The problem this solves: every read of the integration catalog is keyed by INTEGRATION id, which
 * is shared by every connection of a connector. Threading a connection id down to each of them is
 * not viable — there are twenty-two call sites inside the REST connector base alone, and the
 * connectors that call them live in a separate repository and must keep compiling unchanged.
 *
 * So the connection id travels out of band. An operation that belongs to one connection runs inside
 * `RunInCatalogScope`, and the reads underneath it resolve per-connection without being told.
 *
 * This is the same mechanism the sync loop already uses for its own run context, in this very
 * package — `IntegrationEngine` imports `AsyncLocalStorage` for `runContext` and enters it around
 * each run and each write batch. Async context propagates across `await`, `Promise.all` and timer
 * callbacks, so a scope entered at the top of a run covers everything the run does.
 *
 * WHAT IT DOES NOT COVER, and why that is safe: a callback scheduled OUTSIDE the scope and invoked
 * inside it sees no scope, and so does a task handed to a worker thread or another process. Both
 * fall back to the shared catalog, which is the pre-existing behaviour — over-broad, never wrong
 * about what exists. The failure mode of a missed scope is therefore the old behaviour, not a
 * corrupt one. The failure mode that WOULD be dangerous — a per-connection write landing on the
 * shared rows — cannot happen here, because the write path takes an explicit connection id and
 * never consults this scope.
 */
export interface CatalogScopeState {
    companyIntegrationID: string;
}

const storage = new AsyncLocalStorage<CatalogScopeState>();

/** The connection currently in scope, or undefined when there is none. */
export function CurrentCatalogCI(): string | undefined {
    return storage.getStore()?.companyIntegrationID;
}

/**
 * Run `fn` with `companyIntegrationID` in scope.
 *
 * Nesting is allowed and the innermost wins, which is what a batch operation over several
 * connections needs: it enters one scope per connection and each iteration's reads resolve to that
 * connection alone.
 */
export function RunInCatalogScope<T>(companyIntegrationID: string, fn: () => T): T {
    if (!companyIntegrationID) return fn();
    return storage.run({ companyIntegrationID }, fn);
}

/**
 * `RunInCatalogScope` for an async body — the ordinary case. Separate only so the return type is
 * a promise rather than a promise-shaped generic, which makes a forgotten `await` a type error.
 */
export function WithCatalogScope<T>(companyIntegrationID: string, fn: () => Promise<T>): Promise<T> {
    if (!companyIntegrationID) return fn();
    return storage.run({ companyIntegrationID }, fn);
}

/**
 * Run `fn` with NO connection in scope, so its reads see the shared catalog.
 *
 * One deliberate caller: action generation. An Action describes the vendor's API, not one tenant's
 * projection of it, so generating actions from whichever connection happened to be in scope would
 * make the generated surface depend on who ran it. Stated here rather than left implicit, because
 * from inside the generator the shared read looks like an oversight.
 */
export function RunOutsideCatalogScope<T>(fn: () => T): T {
    return storage.exit(fn);
}

/**
 * Install the scope resolver on the client-safe engine base.
 *
 * Dependency inversion: `integration-engine-base` is bundled into the Angular client and cannot
 * import a Node built-in, so it declares a hook and this package fills it in. Called at module
 * load, so importing this package is enough — no ordering requirement on callers, and the client
 * never sets it, leaving every read on the shared catalog exactly as before.
 */
export function InstallCatalogScopeResolver(): void {
    IntegrationEngineBase.CatalogScopeResolver = CurrentCatalogCI;
}

InstallCatalogScopeResolver();
