/**
 * Per-entity or wildcard entity access rule stored in the `EntityAccessRules` JSON array
 * on `MJ: AI Agent User Policies` (`AIAgentUserPolicy.EntityAccessRules`).
 *
 * The owning user's MJ permissions (`contextUser`: Entity CRUD permissions, role-based
 * Row-Level Security filters, and role-based Field-Level Security permissions) are the
 * non-negotiable ceiling. Rules in this array strictly narrow access below that ceiling:
 * - CRUD narrowing (`Deny`, `ReadOnly`, `ReadWrite`, `RequireApprovalOnWrite`)
 * - Additional RLS narrowing (extra `RowLevelSecurityFilter` ID, SQL `whereClause` validated
 *   via `SQLExpressionValidator`, or in-memory `recordConditionExpression` evaluated via
 *   `SafeExpressionEvaluator`)
 * - Additional FLS narrowing (`deniedFields`, `readOnlyFields`, `requireApprovalFields`)
 * - Time-of-day / day-of-week / date-range windows (`timeWindows`)
 */
export interface IAgentUserEntityAccessRule {
    /**
     * Exact MJ Entity Name or wildcard pattern (e.g. `"*"`, `"MJ_BizApps_Accounting:*"`,
     * `"MJ_BizApps_Sales: Deals"`).
     */
    entityPattern: string;

    /**
     * Maximum CRUD mode allowed on matching entities. Intersected with `contextUser`'s
     * actual `EntityPermission` — never grants access the user does not already hold.
     */
    access: 'Deny' | 'ReadOnly' | 'ReadWrite' | 'RequireApprovalOnWrite';

    /**
     * Optional Row-Level Security (RLS) narrowing — AND-combined with the user's role RLS.
     */
    rlsNarrowing?: {
        /** Optional ID of a reusable `MJ: Row Level Security Filters` record. */
        rowLevelSecurityFilterId?: string;
        /**
         * Inline SQL filter validated via `SQLExpressionValidator` (`context: 'where_clause'`).
         * Supports user tokens such as `{{UserID}}` and `{{UserEmail}}`.
         */
        whereClause?: string;
        /**
         * Safe AST-validated boolean expression evaluated via `SafeExpressionEvaluator`
         * against `{ record, user, now }` before returning or saving a `BaseEntity`.
         */
        recordConditionExpression?: string;
    };

    /**
     * Optional Field-Level Security (FLS) narrowing — merged with the user's role FLS.
     * Each array supports exact field names or `*` wildcard patterns (e.g. `["Salary", "*SSN*"]`).
     */
    flsNarrowing?: {
        /** Fields stripped from read projections and blocked from write mutations. */
        deniedFields?: string[];
        /** Fields readable by the agent, but blocked from modification on Create/Update. */
        readOnlyFields?: string[];
        /** Modifying any matching field escalates the save to a user approval request (`AIAgentRequest`). */
        requireApprovalFields?: string[];
    };

    /**
     * Optional time-of-day / day-of-week windows restricting when access (especially writes)
     * is permitted on matching entities.
     */
    timeWindows?: Array<{
        /** Allowed days of week (e.g. `['Mon', 'Tue', 'Wed', 'Thu', 'Fri']`). */
        daysOfWeek?: Array<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>;
        /** 24-hour start time in `HH:mm` format (e.g. `"08:00"`). */
        startTime?: string;
        /** 24-hour end time in `HH:mm` format (e.g. `"18:00"`). */
        endTime?: string;
        /** IANA timezone (e.g. `"America/Chicago"`); defaults to UTC when omitted. */
        timezone?: string;
        /** Optional ISO-8601 start timestamp for temporary grants. */
        validFromISO?: string;
        /** Optional ISO-8601 end timestamp for temporary grants. */
        validUntilISO?: string;
        /**
         * Behavior when an operation is attempted outside the allowed window:
         * - `'Deny'`: Reject immediately
         * - `'ReadOnly'`: Allow reads, block writes
         * - `'RequireApproval'`: Create an `AIAgentRequest` for user approval
         * - `'DeferUntilNextWindow'`: Return `nextWindowStartISO` so the agent can self-schedule an `AgentWake`
         */
        outsideWindowBehavior?: 'Deny' | 'ReadOnly' | 'RequireApproval' | 'DeferUntilNextWindow';
    }>;
}
