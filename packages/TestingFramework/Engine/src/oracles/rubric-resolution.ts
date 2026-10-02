/** Which rubric a test run uses. The first source that names one wins. */
export interface RubricChoice {
    RubricId?: string;
    VersionId?: string;
    /** Set when the caller named a version. That version is not replaced by the suite pin. */
    ExplicitVersion: boolean;
    Source: 'run' | 'oracle' | 'test' | 'suite' | 'agent' | 'none';
}

export interface RubricSuiteRow {
    Id: string;
    ParentId?: string | null;
    RubricId?: string | null;
}

/**
 * Resolves the rubric for one test. First match wins:
 * run override, the rubric oracle's own config, the test, the suite chain
 * walking up ParentID, then the agent's default Evaluation rubric.
 */
export function ResolveRubric(input: {
    run?: { rubricId?: string; versionId?: string };
    oracle?: { rubricId?: string; rubricVersionId?: string };
    testRubricId?: string | null;
    suites?: RubricSuiteRow[];
    suiteId?: string;
    agentRubricId?: string | null;
}): RubricChoice {
    if (input.run?.rubricId) {
        return { RubricId: input.run.rubricId, VersionId: input.run.versionId, ExplicitVersion: !!input.run.versionId, Source: 'run' };
    }
    if (input.oracle?.rubricId || input.oracle?.rubricVersionId) {
        return { RubricId: input.oracle.rubricId, VersionId: input.oracle.rubricVersionId, ExplicitVersion: !!input.oracle.rubricVersionId, Source: 'oracle' };
    }
    if (input.testRubricId) return { RubricId: input.testRubricId, ExplicitVersion: false, Source: 'test' };
    const fromSuite = walkSuites(input.suites ?? [], input.suiteId);
    if (fromSuite) return { RubricId: fromSuite, ExplicitVersion: false, Source: 'suite' };
    if (input.agentRubricId) return { RubricId: input.agentRubricId, ExplicitVersion: false, Source: 'agent' };
    return { ExplicitVersion: false, Source: 'none' };
}

/** @deprecated Use {@link ResolveRubric}. */
export function resolveRubric(input: {
    run?: { rubricId?: string; versionId?: string };
    oracle?: { rubricId?: string; rubricVersionId?: string };
    testRubricId?: string | null;
    suites?: RubricSuiteRow[];
    suiteId?: string;
    agentRubricId?: string | null;
}): RubricChoice {
    return ResolveRubric(input);
}

function walkSuites(suites: RubricSuiteRow[], start?: string): string | undefined {
    const byId = new Map(suites.map(suite => [suite.Id, suite]));
    const seen = new Set<string>();
    let current = start ? byId.get(start) : undefined;
    while (current && !seen.has(current.Id)) {
        seen.add(current.Id);
        if (current.RubricId) return current.RubricId;
        current = current.ParentId ? byId.get(current.ParentId) : undefined;
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

    public async Remember(suiteRunId: string, rubricId: string, explicitVersionId: string | undefined, lookupLatest: () => Promise<string | undefined>): Promise<string | undefined> {
        if (explicitVersionId) return explicitVersionId;
        const suite = this.pinned.get(suiteRunId) ?? new Map<string, string>();
        this.pinned.set(suiteRunId, suite);
        const existing = suite.get(rubricId);
        if (existing) return existing;
        const latest = await lookupLatest();
        if (latest) suite.set(rubricId, latest);
        return latest;
    }

    /** @deprecated Use {@link Remember}. */
    public async remember(suiteRunId: string, rubricId: string, explicitVersionId: string | undefined, lookupLatest: () => Promise<string | undefined>): Promise<string | undefined> {
        return this.Remember(suiteRunId, rubricId, explicitVersionId, lookupLatest);
    }
}

export interface OracleConfigLike {
    /** Same field as IOracle.type. Test configuration stores it as `type`. */
    type: string; // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    config?: Record<string, unknown>; // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Pins the resolved rubric onto the oracle list.
 * An llm-judge skips only the agent's own Evaluation rubric (`Source === 'agent'`).
 * A run override, a test rubric, a suite rubric, or a promoted rubric is still pinned.
 * A rubric with no published version is still named. The pin is written after the
 * oracle config, so the config cannot replace the version.
 */
export function EnsureImplicitRubricOracle(oracles: OracleConfigLike[] | undefined, choice: RubricChoice, versionId?: string, versionLabel?: string): OracleConfigLike[] {
    const list = oracles ?? [];
    if (list.some(oracle => oracle.type === 'llm-judge') && choice.Source === 'agent') return list;
    if (!choice.RubricId) return list;
    const pinned: Record<string, unknown> = { rubricId: choice.RubricId };
    if (versionId) pinned.rubricVersionId = versionId;
    if (versionLabel) pinned.versionLabel = versionLabel;
    if (list.some(oracle => oracle.type === 'rubric')) {
        return list.map(oracle => oracle.type === 'rubric'
            ? { ...oracle, config: { ...oracle.config, ...pinned } }
            : oracle);
    }
    return [...list, { type: 'rubric', config: pinned }];
}

/** @deprecated Use {@link EnsureImplicitRubricOracle}. */
export function ensureImplicitRubricOracle(oracles: OracleConfigLike[] | undefined, choice: RubricChoice, versionId?: string, versionLabel?: string): OracleConfigLike[] {
    return EnsureImplicitRubricOracle(oracles, choice, versionId, versionLabel);
}

/**
 * The implicit rubric always gates status. It contributes to the score when
 * weights are absent, or when the weights already name `rubric`.
 */
export function WeightsForImplicitRubric(weights: Record<string, number> | undefined, addedImplicit: boolean): Record<string, number> | undefined {
    if (!addedImplicit) return weights;
    if (!weights) return { rubric: 1 };
    return weights;
}

/** @deprecated Use {@link WeightsForImplicitRubric}. */
export function weightsForImplicitRubric(weights: Record<string, number> | undefined, addedImplicit: boolean): Record<string, number> | undefined {
    return WeightsForImplicitRubric(weights, addedImplicit);
}
