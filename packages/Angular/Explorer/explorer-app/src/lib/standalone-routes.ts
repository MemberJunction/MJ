/**
 * Routes Explorer renders on their own: no shell, no login screen, whether or not anyone is signed in.
 * Each page handles its own sign-in state.
 *
 * - `/oauth/callback` finishes an MCP OAuth sign-in.
 * - `/office/connect` is the Excel add-in's sign-in window. It runs inside an Office dialog, so it
 *   must not load the shell, and it offers its own Sign in button.
 */
export const STANDALONE_ROUTE_PATHS: readonly string[] = ['/oauth/callback', '/office/connect'];

/**
 * True when `url` is one of {@link STANDALONE_ROUTE_PATHS} or below one. Accepts a router URL or a
 * browser path, with or without a query string or fragment.
 *
 * @param url The path to test, such as `NavigationEnd.urlAfterRedirects` or `location.pathname`.
 * @param basePath The app's base href path (for example `/explorer`), stripped from `url` first so a
 *   browser path from an app deployed under a sub-path still matches. Router URLs never include it.
 */
export function IsStandaloneRoute(url: string, basePath = ''): boolean {
    const path = stripBasePath(url.split(/[?#]/)[0], basePath);
    return STANDALONE_ROUTE_PATHS.some(route => path === route || path.startsWith(`${route}/`));
}

function stripBasePath(path: string, basePath: string): string {
    const base = basePath.replace(/\/+$/, '');
    if (!base || !path.startsWith(`${base}/`)) {
        return path;
    }
    return path.slice(base.length);
}
