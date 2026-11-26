/** Input payload for `Tours.EvaluatePredicates` (batched server-side predicates evaluated as the current user or guest). */
export interface ToursEvaluatePredicatesInput {
  Predicates: Array<{
    RequestKey: string;
    PredicateType: string;
    EntityName?: string;
    ExtraFilter?: string;
    QueryName?: string;
    CategoryPath?: string;
    QueryParams?: Record<string, string | number | boolean | null>;
    AuthorizationName?: string;
    CustomConfig?: Record<string, unknown>;
  }>;
}
