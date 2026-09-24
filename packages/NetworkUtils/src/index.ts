/**
 * `@memberjunction/network-utils` — low-level, server-side network utilities.
 *
 * Two things live here, and they belong together:
 *
 * 1. **{@link SafeFetch} / {@link AssertPublicUrl}** — the SSRF guard. Any code that fetches a
 *    caller-controlled URL needs it, and that is not an Actions-specific concern, so it sits in a
 *    package anything server-side can depend on.
 * 2. **{@link HttpClient} / {@link HttpRequest}** — a native-`fetch` HTTP client that replaces
 *    `axios` across the repo. Having one client means the SSRF guard is one option flag away
 *    (`ValidateUrl`) at every call site, instead of something each package has to remember to build.
 *
 * NODE ONLY. This package imports `node:dns` and `node:net` and must never be pulled into a browser
 * bundle — which is exactly why the guard does not live in `@memberjunction/global`.
 */
export * from "./SSRFGuard.js";
export * from "./HttpClient.js";
