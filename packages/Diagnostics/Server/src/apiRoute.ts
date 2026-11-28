import type { ServerMiddlewareContext } from '@memberjunction/server/middleware/BaseServerMiddleware';

/** Builds a path under MJAPI's base path, or the public absolute URL with `{ absolute: true }`. */
export type DiagnosticsApiRouteBuilder = ServerMiddlewareContext['ApiRoute'];

let routeBuilder: DiagnosticsApiRouteBuilder | undefined;

/** Stores the server's route builder. `DiagnosticsServerMiddleware.Initialize` calls this. */
export function SetDiagnosticsApiRoute(builder: DiagnosticsApiRouteBuilder | undefined): void {
  routeBuilder = builder;
}

/** Returns the server's route builder. Throws when the middleware received no `ServerMiddlewareContext`. */
export function GetDiagnosticsApiRoute(): DiagnosticsApiRouteBuilder {
  if (!routeBuilder) {
    throw new Error(
      'Diagnostics cannot build an API URL: DiagnosticsServerMiddleware.Initialize() received no ServerMiddlewareContext with ApiRoute.'
    );
  }
  return routeBuilder;
}

/** The public absolute download URL of a bundle, so a browser on another origin can open it. */
export function BundleDownloadUrl(route: DiagnosticsApiRouteBuilder, bundleId: string, token: string): string {
  return `${route(`/diagnostics/bundles/${bundleId}/download`, { absolute: true })}?token=${encodeURIComponent(token)}`;
}
