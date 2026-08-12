/**
 * @fileoverview What a task-graph edge condition is allowed to reference.
 *
 * The condition dialect is part of the SPEC's meaning, not the dispatcher's implementation detail:
 * a `TaskGraphSpec` authored anywhere — an agent, the canvas, an MCP tool — carries conditions, and
 * "which names resolve" has to mean the same thing wherever that spec is validated. So the closed
 * set lives here, beside the spec, and the runtime envelope in `@memberjunction/task-graph` is
 * built to match it.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * The complete set of root names a condition may reference.
 *
 * Closed, and defined in the same file that builds the envelope, so the two cannot drift. This is
 * what makes an unknown root decidable at SUBMIT time rather than at run time — and an unknown root
 * is the one remaining way to earn a permanent hold now that data absence reads as false.
 */
export const CONDITION_ROOTS: ReadonlySet<string> = new Set([
    // dispatcher dialect
    'status', 'succeeded', 'failed', 'output', 'errorMessage',
    // flow dialect
    'payload', 'stepResult', 'flowContext', 'data', 'context',
]);

/** Names that are grammar, not scope — they resolve without the envelope providing anything. */
const LANGUAGE_NAMES: ReadonlySet<string> = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    'typeof', 'instanceof', 'in', 'new', 'void',
]);

/**
 * Root identifiers an expression references that the runtime envelope does not provide.
 *
 * Roots only — a property this engine cannot see (`payload.whatever`) is a question about data that
 * does not exist yet and is answered at run time. A *root* it cannot see is answerable now, and
 * answering it now is the difference between a refusal at the door and a branch that holds forever.
 *
 * **Returns nothing when the expression binds names of its own.** An arrow function introduces a
 * parameter that is legitimately free at the point this scans (`items.some(item => item.price > 1)`
 * — `item` is bound by the arrow, not by the envelope), and refusing it would reject a documented,
 * working shape. Arrows are the only binder the grammar admits: the evaluator's policy screen
 * already rejects `;` and `{`, so there are no statements and no declarations. When one is present
 * this stays silent rather than guessing, which keeps the check sound in the direction that matters
 * — it may miss a typo, it will never invent one.
 */
export function UnknownConditionRoots(expression: string): string[] {
    if (!expression || expression.includes('=>')) return [];

    // Strings first: `payload.status === 'approved'` must not report `approved` as a root.
    const code = expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");

    const unknown = new Set<string>();
    // Lookbehind excludes both property access (`.includes`) and identifier tails, including the
    // exponent in a numeric literal (`2e5`), which is otherwise indistinguishable from a name.
    for (const [name] of code.matchAll(/(?<![A-Za-z0-9_$.])[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        if (LANGUAGE_NAMES.has(name) || CONDITION_ROOTS.has(name)) continue;
        unknown.add(name);
    }
    return [...unknown];
}
