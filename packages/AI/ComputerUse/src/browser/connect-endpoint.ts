/**
 * Decide whether a connect endpoint refers to a CDP browser or a Playwright server.
 * Pure (no I/O) so it can be unit-tested without launching a browser.
 *
 * Used by `PlaywrightBrowserAdapter` and `HeadlessBrowserEngine` to branch into
 * attach mode (`chromium.connect` / `chromium.connectOverCDP`) instead of
 * launching a new browser.
 *
 * Duplicated from `@memberjunction/react-test-harness` — kept in sync by tests.
 * The function is tiny and pure; adding a cross-package dep edge isn't worth it.
 *
 * @throws if the scheme is unrecognized and no explicit `hint` is given.
 */
export function classifyConnectEndpoint(
    endpoint: string,
    hint: 'cdp' | 'server' | 'auto' = 'auto'
): 'cdp' | 'server' {
    if (hint !== 'auto') {
        return hint;
    }
    if (/^wss?:\/\//i.test(endpoint)) {
        return 'server';
    }
    if (/^https?:\/\//i.test(endpoint)) {
        return 'cdp';
    }
    throw new Error(
        `Unrecognized connect endpoint "${endpoint}". Use http(s):// for CDP ` +
        `or ws(s):// for a Playwright server, or set ConnectType explicitly.`
    );
}
