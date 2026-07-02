/**
 * Builds the always-on GraphQL boundary log payload: operation name ONLY.
 *
 * Variable VALUES are never emitted here, in any configuration — this is the load-bearing
 * fix for the #2638 secret leak. Verbose variables logging (MJ_LOG_GRAPHQL_VARIABLES=true)
 * is the job of `variablesLoggingMiddleware`, which emits per-root-resolver, fully-emitted
 * values with `Encrypt=true` fields masked.
 *
 * Pure function, no MJ-server import surface, so the "no `variables` key in the boundary
 * line" property is testable in isolation without booting the request-context dependency
 * chain.
 *
 * See docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md.
 */
export function buildBoundaryLogPayload(
  operationName: string | undefined,
): { operationName: string | undefined } {
  return { operationName };
}
