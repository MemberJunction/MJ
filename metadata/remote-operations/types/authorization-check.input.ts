/** Input for `Authorization.Check`. */
export interface AuthorizationCheckInput {
    /**
     * Authorization names to evaluate (e.g. `Orders.Price.OverrideList`).
     * Matching is case-insensitive. Empty array returns an empty Results list.
     */
    Names: string[];
}
