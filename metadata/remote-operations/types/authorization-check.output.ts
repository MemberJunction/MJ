/** One row of `Authorization.Check` output. */
export interface AuthorizationCheckResultRow {
    /** The name as requested. */
    Name: string;
    /** True when the user has this authorization or an ancestor grant. */
    Allowed: boolean;
    /** True when no `MJ: Authorizations` row matches this name. Fail-closed: Allowed is then false. */
    Unknown: boolean;
    /** True when Allowed because of an ancestor grant, not a direct role on this row. */
    ViaAncestor: boolean;
    /** The authorization Name that actually matched (leaf or ancestor). Null when not allowed. */
    MatchedAuthorizationName: string | null;
}

/** Output of `Authorization.Check`. */
export interface AuthorizationCheckOutput {
    Results: AuthorizationCheckResultRow[];
}
