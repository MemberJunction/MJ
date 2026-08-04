/**
 * @fileoverview The shape of a scope decision — what a search WOULD be able to reach, and why.
 *
 * Everything the dimensional-scope work added is a decision made from inputs that are gone by
 * the time anyone asks about them. A grant applied because a time window happened to be open;
 * a dimension was discarded because it was caller-authored on a ServerDerived key; a lane was
 * skipped because its filter lost a clause. Each of those is invisible afterwards — the result
 * set looks the same whether it was correctly bounded or accidentally widened, so neither an
 * administrator configuring a scope nor an auditor reconstructing an incident can tell.
 *
 * `ScopeExplanation` is that decision, captured. It is used in two places deliberately:
 *
 *   1. **Before** a search — `SearchEngine.ExplainScope()` runs the entire resolution chain
 *      (entitlement → dimensions → lane filters) and returns this WITHOUT querying anything.
 *      "As this user, on this date, with this skill active: what could this reach?"
 *   2. **After** a search — the same object is serialized into
 *      `SearchExecutionLog.ScopeDecisionJSON`.
 *
 * One shape for both is the point. The preview an administrator approves is structurally the
 * record the audit log keeps, so a claim made at configuration time is checkable against what
 * actually ran, rather than being two representations that can quietly disagree.
 *
 * @module @memberjunction/search-engine
 */

import type { DimensionExplanation, SearchContext } from './search.types';
import type { SearchScopePermissionLevel, SearchScopePermissionSource } from '../permissions/SearchScopePermissionResolver';

/** Which kind of retrieval lane a {@link LaneExplanation} describes. */
export type LaneKind = 'ExternalIndex' | 'Entity' | 'StorageAccount';

/**
 * What happened to one retrieval lane.
 *
 * `Skipped` is the interesting state and the reason this type exists. A lane is skipped when
 * its restriction could not be applied safely — an unparseable filter, a template that lost a
 * clause, a required metadata key the rendered filter never mentions. Skipping is the correct
 * outcome (the alternative is querying unfiltered), but it is also silent: the search still
 * succeeds, just against fewer sources. Without this record, "the filter broke and we searched
 * three lanes instead of four" is indistinguishable from a scope that only ever had three.
 */
export interface LaneExplanation {
    Kind: LaneKind;
    /** Index name, entity name, or storage account ID — whatever identifies the lane to a human. */
    Target: string;
    /** The row ID of the lane's child record, for pinpointing which configuration to fix. */
    LaneID: string;
    Status: 'Active' | 'Skipped';
    /** The filter as rendered for this search, or null when the lane carries no filter. */
    RenderedFilter: string | null;
    /** Metadata keys this lane's `RequiredMetadataKeys` contract demands, if any. */
    RequiredMetadataKeys?: string[];
    /** Why the lane was skipped. Absent when `Status` is `Active`. */
    Reason?: string;
}

/** The entitlement half of the decision: was this principal allowed to reach the scope at all. */
export interface EntitlementExplanation {
    Allowed: boolean;
    Level: SearchScopePermissionLevel;
    /** Which resolution path produced the answer (direct grant, role, agent fallback, skill…). */
    Source: SearchScopePermissionSource;
    Reason: string;
    /** The principals in play, so a log row is self-describing without joining three tables. */
    Principals: {
        UserID: string | null;
        AgentID: string | null;
        SkillID: string | null;
        /** Tenant the search ran for (`SearchContext.PrimaryScopeRecordID`), null if untenanted. */
        PrimaryScopeRecordID: string | null;
    };
}

/**
 * The complete decision for one scope: whether it was reachable, how each dimension of its
 * bound was decided, and what each lane ended up doing.
 */
export interface ScopeExplanation {
    ScopeID: string;
    ScopeName: string;
    /**
     * The entitlement decision, or `null` when this layer did not evaluate one.
     *
     * `null` is a real and common state, not a placeholder: `SearchEngine` does not gate scopes
     * on `SearchScopePermission` itself — the caller that selects which scopes to search does
     * (the agent RAG layer, an application action). So an explanation captured *during* a search
     * legitimately has no entitlement to report, while one produced by `ExplainScope()` always
     * does, because the dry run resolves it on purpose.
     *
     * It is nullable rather than defaulted because the two plausible defaults are both wrong:
     * a fabricated "allowed" makes an unevaluated search look authorized in an audit log, and a
     * fabricated "denied" makes a perfectly normal search look blocked. Neither is worth the
     * convenience of a non-null field.
     */
    Entitlement: EntitlementExplanation | null;
    /** Every declared dimension with its resolved value and provenance. Empty for an undeclared scope. */
    Dimensions: DimensionExplanation[];
    Lanes: LaneExplanation[];
    /** Free-text notes from resolution (discards, applied defaults, expansion-query detail). */
    Diagnostics: string[];
    /**
     * True when this scope would actually contribute results: entitlement did not deny it AND
     * at least one lane is active. When `Entitlement` is null, this reflects the lanes alone.
     *
     * Entitled-but-zero-active-lanes is the case worth surfacing on its own. It looks like a
     * permissions problem to whoever reports it ("I have access but get nothing"), while the
     * actual cause is every lane failing its filter guard — a configuration bug that an
     * entitlement check alone will never reveal.
     */
    Reachable: boolean;
    /**
     * True when this scope configures **no lanes at all**, which in MJ means UNSCOPED — every
     * provider reads an empty child configuration as "all entities, all indexes, no filter".
     *
     * Surfaced as its own flag because it is the finding a reviewer is most likely to be
     * hunting for and least likely to spot: such a scope has no filter to inspect, so it looks
     * innocuous in every other field. It is also the exact opposite of what an empty `Lanes`
     * array intuitively suggests.
     */
    Unbounded: boolean;
    /** The effective context after resolution — what the lane templates were rendered against. */
    ResolvedContext?: SearchContext;
}

/** Input to {@link ScopeExplanation}-producing dry runs. */
export interface ExplainScopeInput {
    /** Scopes to explain. */
    ScopeIDs: string[];
    /**
     * The context a real caller would pass. Explaining with the SAME untrusted input a caller
     * would send is the point — a preview that only accepts already-sanitized values cannot
     * show you the discard, which is usually the thing you wanted to see.
     */
    SearchContext?: SearchContext;
    /** Agent principal, if the search would run on an agent's behalf. */
    AIAgentID?: string | null;
    /** Skill principal, if a skill would be active. */
    AISkillID?: string | null;
}

/**
 * Render an explanation as human-readable lines.
 *
 * Kept as a pure function next to the type rather than inside the engine so a CLI, an
 * Explorer panel, or a test can format one without constructing a `SearchEngine`.
 */
export function SummarizeExplanation(explanation: ScopeExplanation): string[] {
    const lines: string[] = [];
    lines.push(`Scope: ${explanation.ScopeName} (${explanation.ScopeID})`);
    const ent = explanation.Entitlement;
    lines.push(
        `  Reachable: ${explanation.Reachable ? 'YES' : 'NO'} — ` +
        (ent
            ? `entitlement ${ent.Allowed ? 'granted' : 'DENIED'} at ${ent.Level} via ${ent.Source}`
            : 'entitlement not evaluated at this layer')
    );
    if (ent) lines.push(`  Why: ${ent.Reason}`);

    if (explanation.Dimensions.length) {
        lines.push('  Dimensions:');
        for (const d of explanation.Dimensions) {
            const bound = d.Restricts ? ' [BOUND]' : '';
            const note = d.Note ? ` — ${d.Note}` : '';
            lines.push(`    ${d.Name}${bound} = ${JSON.stringify(d.Value)} (${d.Provenance})${note}`);
        }
    } else {
        lines.push('  Dimensions: none declared (legacy scope — the caller context passes through unchecked)');
    }

    lines.push('  Lanes:');
    if (!explanation.Lanes.length) {
        lines.push('    (NONE CONFIGURED — this scope is UNSCOPED: providers apply no filter)');
    }
    for (const lane of explanation.Lanes) {
        lines.push(`    [${lane.Status}] ${lane.Kind}: ${lane.Target}`);
        if (lane.RequiredMetadataKeys?.length) {
            lines.push(`        requires: ${lane.RequiredMetadataKeys.join(', ')}`);
        }
        if (lane.RenderedFilter) {
            lines.push(`        filter: ${lane.RenderedFilter.substring(0, 200)}`);
        }
        if (lane.Reason) {
            lines.push(`        SKIPPED: ${lane.Reason}`);
        }
    }

    for (const d of explanation.Diagnostics) lines.push(`  note: ${d}`);
    return lines;
}
