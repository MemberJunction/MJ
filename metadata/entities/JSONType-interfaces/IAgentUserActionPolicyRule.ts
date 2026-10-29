/**
 * Per-action or wildcard action policy rule stored in the `ActionPolicyRules` JSON array
 * on `MJ: AI Agent User Policies` (`AIAgentUserPolicy.ActionPolicyRules`).
 *
 * Evaluated by `BaseAgent` before executing any action or tool on behalf of the user.
 */
export interface IAgentUserActionPolicyRule {
    /**
     * Exact Action Name, category prefix, or `"*"` wildcard pattern
     * (e.g. `"Send Single Message"`, `"*Email*"`, `"Place Outbound*"`).
     */
    actionPattern: string;

    /**
     * Execution gate applied when this rule matches:
     * - `'Allow'`: Proceed automatically (within the user's permission ceiling)
     * - `'RequireApproval'`: Pause and create an `MJ: AI Agent Requests` approval item
     * - `'Deny'`: Block execution and return a policy denial message to the agent
     */
    policy: 'Allow' | 'RequireApproval' | 'Deny';

    /**
     * Optional `SafeExpressionEvaluator` boolean condition evaluated against
     * `{ params, user, now }` (e.g. `"params.Amount > 500 || params.IsExternal === true"`).
     * When omitted, the rule applies unconditionally to matching actions.
     */
    conditionExpression?: string;

    /**
     * Optional time-of-day / day-of-week windows restricting when the action may run
     * (e.g. allowing outbound follow-up nudges only Monday–Friday 08:00–18:00).
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
         * Behavior when the action is invoked outside the allowed window:
         * - `'Deny'`: Reject immediately
         * - `'RequireApproval'`: Create an `AIAgentRequest` for user approval
         * - `'DeferUntilNextWindow'`: Return `nextWindowStartISO` so the agent can self-schedule an `AgentWake`
         */
        outsideWindowBehavior?: 'Deny' | 'ReadOnly' | 'RequireApproval' | 'DeferUntilNextWindow';
    }>;
}
