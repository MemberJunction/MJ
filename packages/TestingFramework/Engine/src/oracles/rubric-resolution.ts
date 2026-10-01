/** Which rubric a test run uses. The first source that names one wins. */
export interface RubricChoice {
    rubricId?: string;
    versionId?: string;
    /** Set when the caller named a version. That version is not replaced by the suite pin. */
    explicitVersion: boolean;
    source: 'run' | 'oracle' | 'test' | 'suite' | 'agent' | 'none';
}

export interface RubricSuiteRow {
    id: string;
    parentId?: string | null;
    rubricId?: string | null;
}

/**
 * Resolves the rubric for one test. First match wins:
 * run override, the rubric oracle's own config, the test, the suite chain
 * walking up ParentID, then the agent's default Evaluation rubric.
 */
export function resolveRubric(input: {
    run?: { rubricId?: string; versionId?: string };
    oracle?: { rubricId?: string; rubricVersionId?: string };
    testRubricId?: string | null;
    suites?: RubricSuiteRow[];
    suiteId?: string;
    agentRubricId?: string | null;
}): RubricChoice {
    if (input.run?.rubricId) {
        return { rubricId: input.run.rubricId, versionId: input.run.versionId, explicitVersion: !!input.run.versionId, source: 'run' };
    }
    if (input.oracle?.rubricId || input.oracle?.rubricVersionId) {
        return { rubricId: input.oracle.rubricId, versionId: input.oracle.rubricVersionId, explicitVersion: !!input.oracle.rubricVersionId, source: 'oracle' };
    }
    if (input.testRubricId) return { rubricId: input.testRubricId, explicitVersion: false, source: 'test' };
    const fromSuite = walkSuites(input.suites ?? [], input.suiteId);
    if (fromSuite) return { rubricId: fromSuite, explicitVersion: false, source: 'suite' };
    if (input.agentRubricId) return { rubricId: input.agentRubricId, explicitVersion: false, source: 'agent' };
    return { explicitVersion: false, source: 'none' };
}

function walkSuites(suites: RubricSuiteRow[], start?: string): string | undefined {
    const byId = new Map(suites.map(suite => [suite.id, suite]));
    const seen = new Set<string>();
    let current = start ? byId.get(start) : undefined;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        if (current.rubricId) return current.rubricId;
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return undefined;
}

/**
 * Remembers the published version chosen at the start of a suite run.
 * A later publish does not change the version for that suite run.
 * An explicitly named version is returned and does not replace the pin.
 */
export class PublishedVersionPin {
    private readonly pinned = new Map<string, Map<string, string>>();

    public async remember(suiteRunId: string, rubricId: string, explicitVersionId: string | undefined, lookupLatest: () => Promise<string | undefined>): Promise<string | undefined> {
        if (explicitVersionId) return explicitVersionId;
        const suite = this.pinned.get(suiteRunId) ?? new Map<string, string>();
        this.pinned.set(suiteRunId, suite);
        const existing = suite.get(rubricId);
        if (existing) return existing;
        const latest = await lookupLatest();
        if (latest) suite.set(rubricId, latest);
        return latest;
    }
}

export interface OracleConfigLike {
    type: string;
    config?: Record<string, unknown>;
}

/** Adds a rubric oracle when a rubric was resolved and the test did not already name one. */
export function ensureImplicitRubricOracle(oracles: OracleConfigLike[] | undefined, choice: RubricChoice, versionId?: string, versionLabel?: string): OracleConfigLike[] {
    const list = oracles ?? [];
    const pinned = { rubricVersionId: versionId, versionLabel };
    if (!choice.rubricId) return list;
    if (list.some(oracle => oracle.type === 'rubric')) {
        return list.map(oracle => oracle.type === 'rubric'
            ? { ...oracle, config: { ...pinned, ...oracle.config, versionLabel: oracle.config?.versionLabel ?? versionLabel } }
            : oracle);
    }
    return [...list, { type: 'rubric', config: { rubricId: choice.rubricId, ...pinned } }];
}

/**
 * The implicit rubric always gates status. It contributes to the score when
 * weights are absent, or when the weights already name `rubric`.
 */
export function weightsForImplicitRubric(weights: Record<string, number> | undefined, addedImplicit: boolean): Record<string, number> | undefined {
    if (!addedImplicit) return weights;
    if (!weights) return { rubric: 1 };
    return weights;
}
