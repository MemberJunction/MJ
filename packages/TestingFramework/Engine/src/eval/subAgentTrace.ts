/**
 * subAgentTrace.ts — the judgement half of the `trace-validate-sub-agents` oracle.
 *
 * Split from the traversal so the decision logic is a pure function over "which sub-agents ran and
 * how many iterations happened" (test plan §2.1). The traversal needs a database; this does not,
 * and this is the part with the semantics worth pinning in a unit test.
 *
 * FRAMEWORK-FREE — imports nothing from the testing engine.
 */

/** What the traversal found. */
export interface SubAgentTraceFacts {
    /** Every sub-agent dispatched anywhere in the run tree, in dispatch order, duplicates kept. */
    dispatchedAgents: string[];
    /** Loop iterations on the top-level run. See {@link SubAgentTraceConfig.minIterations}. */
    iterations: number;
}

/** The oracle's configuration, exactly as the shipped research-agent tests already supply it. */
export interface SubAgentTraceConfig {
    /** Every one of these must have been dispatched. Compared case-insensitively. */
    requiredAgents?: string[];
    /** None of these may have been dispatched — the "didn't over-delegate" check. */
    forbiddenAgents?: string[];
    /**
     * Minimum loop iterations.
     *
     * An "iteration" is one Prompt step on the top-level run: the Loop agent type runs exactly one
     * prompt per pass, so prompt steps are the only honest proxy the run tree offers. Sub-agent
     * prompt steps are excluded — they are the *child's* iterations, not the parent's.
     */
    minIterations?: number;
}

export interface SubAgentTraceResult {
    passed: boolean;
    score: number;
    message: string;
    details: {
        dispatchedAgents: string[];
        missingAgents: string[];
        forbiddenDispatched: string[];
        iterations: number;
        minIterations?: number;
    };
}

const normalize = (name: string): string => name.trim().toLowerCase();

/**
 * Judges a run's sub-agent dispatch against the expectation.
 *
 * Names are compared case-insensitively and after trimming, because an agent name in a test record
 * is typed by a human while the one in the trace comes from the catalog — a casing difference is
 * never the failure anyone means to report.
 */
export function EvaluateSubAgentTrace(facts: SubAgentTraceFacts, config: SubAgentTraceConfig): SubAgentTraceResult {
    const dispatched = new Set(facts.dispatchedAgents.map(normalize));

    const missingAgents = (config.requiredAgents ?? []).filter((name) => !dispatched.has(normalize(name)));
    const forbiddenDispatched = (config.forbiddenAgents ?? []).filter((name) => dispatched.has(normalize(name)));
    const iterationsShort = config.minIterations !== undefined && facts.iterations < config.minIterations;

    const details = {
        dispatchedAgents: facts.dispatchedAgents,
        missingAgents,
        forbiddenDispatched,
        iterations: facts.iterations,
        minIterations: config.minIterations
    };

    const problems: string[] = [];
    if (missingAgents.length > 0) {
        problems.push(`never dispatched required sub-agent(s): ${missingAgents.join(', ')}`);
    }
    if (forbiddenDispatched.length > 0) {
        problems.push(`dispatched forbidden sub-agent(s): ${forbiddenDispatched.join(', ')}`);
    }
    if (iterationsShort) {
        problems.push(`expected at least ${config.minIterations} iteration(s), saw ${facts.iterations}`);
    }

    if (problems.length > 0) {
        // Partial credit, so a run that got two of three required sub-agents scores above one that
        // got none. The three checks are weighted equally and only the ones configured count.
        const checks: boolean[] = [];
        if (config.requiredAgents?.length) {
            checks.push(missingAgents.length === 0);
        }
        if (config.forbiddenAgents?.length) {
            checks.push(forbiddenDispatched.length === 0);
        }
        if (config.minIterations !== undefined) {
            checks.push(!iterationsShort);
        }
        const score = checks.length === 0 ? 0 : checks.filter(Boolean).length / checks.length;
        return { passed: false, score, message: problems.join('; '), details };
    }

    const summary = facts.dispatchedAgents.length > 0
        ? `dispatched ${facts.dispatchedAgents.length} sub-agent step(s): ${[...new Set(facts.dispatchedAgents)].join(', ')}`
        : 'no sub-agents dispatched (none required)';
    return { passed: true, score: 1, message: `${summary}; ${facts.iterations} iteration(s)`, details };
}

/** @deprecated Use {@link EvaluateSubAgentTrace}. */
export function evaluateSubAgentTrace(facts: SubAgentTraceFacts, config: SubAgentTraceConfig): SubAgentTraceResult {
    return EvaluateSubAgentTrace(facts, config);
}
