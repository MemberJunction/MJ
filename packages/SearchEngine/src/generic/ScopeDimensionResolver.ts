/**
 * @fileoverview Resolves a scope's declared Search Context dimensions.
 *
 * `SearchScope.SearchContextConfig` has always documented `dimensions[]`,
 * `inheritanceMode` and `strictValidation` — but nothing read it. Dimensions therefore
 * arrived as a free-form bag that **any** caller could author, including an LLM writing a
 * tool call: `parseSecondaryScopes` type-cleaned the JSON and handed it straight to the
 * template renderer. A value anyone in the call chain can set is a narrowing convenience,
 * not an access bound, which is why apps that encoded a boundary as a dimension were doing
 * something the platform could not honour.
 *
 * This resolver makes the declaration enforceable:
 *
 *  - **`trust: 'ServerDerived'` ⇒ caller values for that key are DISCARDED**, and the value
 *    is derived by the engine (an approved `MJ: Queries` row, or a declared default). This is
 *    the anti-spoof rule and the reason a dimension can now carry an access decision.
 *  - **`valueType` is enforced.** A value failing its grammar REJECTS the search rather than
 *    being coerced or silently dropped.
 *  - **`freetext` is forbidden on a restricting dimension** — free text interpolated into a
 *    filter cannot be made safe by validation; it belongs in the query, not the bound.
 *  - **`narrowingOf` is a lattice meet**, so a caller can only ever narrow a server-derived
 *    dimension. Never widen.
 *  - **`strictValidation` has teeth** — an undeclared caller key rejects the search.
 *
 * Backwards compatibility is the design constraint: a scope whose `SearchContextConfig` is
 * null or has no dimensions is returned **untouched**, so every existing scope behaves
 * exactly as before.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, RunQuery, UserInfo } from '@memberjunction/core';
import { MJSearchScopeEntity } from '@memberjunction/core-entities';
import {
    SearchContext,
    SecondaryScopeValue,
    ScopeSearchContextConfig,
    ScopeSecondaryDimension,
    DimensionProvenance,
    DimensionExplanation,
    ScopePrincipals,
    ScopeSupersessionRule,
} from './search.types';

/** Inputs needed to resolve one scope's dimensions for one search. */
export interface DimensionResolutionInput {
    Scope: MJSearchScopeEntity;
    /** The context as supplied by the caller — trusted only where a dimension says so. */
    CallerContext: SearchContext | undefined;
    ContextUser: UserInfo;
    /** Principals available to bind into an expansion query. */
    Principals?: ScopePrincipals;
}

/** Result of resolving a scope's dimensions. */
export interface DimensionResolutionResult {
    /** Effective context. For a declared scope this contains RESOLVED dimensions only. */
    Context: SearchContext | undefined;
    /** Human-readable notes (discarded spoof attempts, applied defaults, …) for audit. */
    Diagnostics: string[];
    /**
     * Per-dimension provenance — the structured form of `Diagnostics`.
     *
     * `Diagnostics` is prose for a human reading a log; this is the same information as data,
     * so the explainer and the execution-log writer can record WHO decided each value without
     * re-parsing sentences. Empty for an undeclared scope, which resolves nothing.
     */
    Provenance: DimensionExplanation[];
}

/** Internal outcome of resolving one dimension, carrying its provenance alongside its value. */
interface DimensionOutcome {
    Value: SecondaryScopeValue | undefined;
    Provenance: DimensionProvenance;
    Note?: string;
}

/** Thrown when resolution cannot proceed safely. Callers must fail the search closed. */
export class ScopeDimensionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScopeDimensionError';
    }
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class ScopeDimensionResolver {
    /**
     * Resolve the effective Search Context for a scope.
     *
     * @throws {ScopeDimensionError} when a declared dimension cannot be resolved safely —
     *   the caller MUST fail the search rather than proceed with a partial bound.
     */
    public async Resolve(input: DimensionResolutionInput): Promise<DimensionResolutionResult> {
        const diagnostics: string[] = [];
        const config = this.parseConfig(input.Scope);

        // No declaration ⇒ legacy behaviour, untouched. This is what keeps every existing
        // scope working byte-for-byte.
        if (!config || !config.dimensions?.length) {
            return { Context: input.CallerContext, Diagnostics: diagnostics, Provenance: [] };
        }

        const callerScopes = input.CallerContext?.SecondaryScopes ?? {};
        const declared = new Map(config.dimensions.map((d) => [d.name, d]));

        this.rejectUndeclaredKeys(config, declared, callerScopes, input.Scope);
        this.validateDeclaration(config, input.Scope);

        const resolved: Record<string, SecondaryScopeValue> = {};
        const provenance: DimensionExplanation[] = [];
        for (const dim of this.orderByDependency(config.dimensions)) {
            // §5.12 — an ADVISORY dimension fails SOFT. A boundary that cannot be resolved must
            // refuse the search; an advisory one must not, because its only power is to remove
            // content from an already-entitled set. Dropping it leaves a superseded corpus in the
            // results, which is a relevance regression, not an access one.
            const outcome = dim.advisory === true
                ? await this.resolveAdvisory(dim, callerScopes, resolved, input, diagnostics)
                : await this.resolveOne(dim, callerScopes, resolved, input, diagnostics);
            if (outcome.Value !== undefined && outcome.Value !== null) resolved[dim.name] = outcome.Value;
            provenance.push({
                Name: dim.name,
                Value: outcome.Value ?? null,
                Provenance: outcome.Provenance,
                Restricts: dim.restricts === true,
                // Effective mode, not the raw declaration: a boundary with no explicit mode is
                // strict, and an auditor should see what was ENFORCED rather than what was written.
                InheritanceMode: dim.inheritanceMode ?? (dim.restricts === true ? 'strict' : 'cascading'),
                Note: outcome.Note,
            });
        }

        return {
            Context: {
                PrimaryScopeEntityID: input.CallerContext?.PrimaryScopeEntityID,
                PrimaryScopeRecordID: input.CallerContext?.PrimaryScopeRecordID,
                SecondaryScopes: Object.keys(resolved).length ? resolved : undefined,
            },
            Diagnostics: diagnostics,
            Provenance: provenance,
        };
    }

    /** Parse the scope's declaration; a malformed config fails closed rather than being ignored. */
    protected parseConfig(scope: MJSearchScopeEntity): ScopeSearchContextConfig | null {
        const raw = scope.SearchContextConfig;
        if (!raw || !raw.trim()) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
            return parsed as ScopeSearchContextConfig;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new ScopeDimensionError(
                `SearchScope "${scope.Name}" has a SearchContextConfig that is not valid JSON (${msg}). ` +
                `Refusing to search: the scope declares dimensions but they cannot be read, so no bound can be enforced.`
            );
        }
    }

    /**
     * Validate the DECLARATION itself, before any dimension is dispatched.
     *
     * This has to run here rather than inside per-dimension resolution. `advisory` routes to a
     * fail-soft path that deliberately swallows errors, so a contradiction checked *inside* that path
     * would be swallowed too — and the failure mode was the worst available one: a dimension
     * declaring `restricts: true` alongside `advisory: true` was silently given the advisory
     * posture, i.e. a declared boundary quietly became droppable. Found by a test, not by review.
     */
    protected validateDeclaration(config: ScopeSearchContextConfig, scope: MJSearchScopeEntity): void {
        for (const dim of config.dimensions) {
            if (dim.restricts === true && dim.advisory === true) {
                throw new ScopeDimensionError(
                    `SearchScope "${scope.Name}" dimension "${dim.name}" declares BOTH restricts:true and ` +
                    `advisory:true. A boundary must fail closed and may never be dropped; an advisory ` +
                    `dimension fails soft and may only subtract. Pick one — if it carries an access ` +
                    `decision it is not advisory.`
                );
            }
            if (dim.supersededByRules?.length && dim.advisory !== true) {
                throw new ScopeDimensionError(
                    `SearchScope "${scope.Name}" dimension "${dim.name}" declares supersededByRules but is not ` +
                    `advisory:true. Supersession rules may only ever REMOVE content; allowing them on a ` +
                    `non-advisory dimension would let an ordered rule participate in the bound.`
                );
            }
            for (const rule of dim.supersededByRules ?? []) {
                if (!rule.key || !Object.keys(rule.when ?? {}).length) {
                    throw new ScopeDimensionError(
                        `SearchScope "${scope.Name}" dimension "${dim.name}" has a supersession rule missing ` +
                        `"key" or "when". A rule with no conditions would fire unconditionally.`
                    );
                }
            }
        }
    }

    /** `strictValidation` with teeth — previously this only warned and used the value anyway. */
    protected rejectUndeclaredKeys(
        config: ScopeSearchContextConfig,
        declared: Map<string, ScopeSecondaryDimension>,
        callerScopes: Record<string, SecondaryScopeValue>,
        scope: MJSearchScopeEntity
    ): void {
        if (!config.strictValidation) return;
        const undeclared = Object.keys(callerScopes).filter((k) => !declared.has(k));
        if (undeclared.length) {
            throw new ScopeDimensionError(
                `SearchScope "${scope.Name}" has strictValidation enabled and the caller supplied undeclared ` +
                `dimension(s): ${undeclared.join(', ')}. Refusing to search.`
            );
        }
    }

    /** Resolve `narrowingOf` targets before their dependents; otherwise declaration order. */
    protected orderByDependency(dimensions: ScopeSecondaryDimension[]): ScopeSecondaryDimension[] {
        const byName = new Map(dimensions.map((d) => [d.name, d]));
        const out: ScopeSecondaryDimension[] = [];
        const seen = new Set<string>();
        const visit = (d: ScopeSecondaryDimension, chain: Set<string>) => {
            if (seen.has(d.name)) return;
            if (chain.has(d.name)) {
                throw new ScopeDimensionError(`Dimension "${d.name}" has a circular narrowingOf chain.`);
            }
            if (d.narrowingOf) {
                const target = byName.get(d.narrowingOf);
                if (!target) {
                    throw new ScopeDimensionError(
                        `Dimension "${d.name}" declares narrowingOf "${d.narrowingOf}", which is not a declared dimension.`
                    );
                }
                visit(target, new Set([...chain, d.name]));
            }
            seen.add(d.name);
            out.push(d);
        };
        for (const d of dimensions) visit(d, new Set());
        // Advisory dimensions resolve LAST: their ordered rules read the values other dimensions
        // produced, so they cannot be evaluated until those exist.
        return [...out.filter((d) => d.advisory !== true), ...out.filter((d) => d.advisory === true)];
    }

    /**
     * Resolve an advisory (§5.12 supersession) dimension. Never throws.
     *
     * Every failure path here degrades to "no supersession" rather than to a refused search. That
     * asymmetry with {@link resolveOne} is the entire point of the section: entitlement composes by
     * intersection and fails closed; supersession only subtracts and fails soft.
     */
    protected async resolveAdvisory(
        dim: ScopeSecondaryDimension,
        callerScopes: Record<string, SecondaryScopeValue>,
        alreadyResolved: Record<string, SecondaryScopeValue>,
        input: DimensionResolutionInput,
        diagnostics: string[]
    ): Promise<DimensionOutcome> {
        if (dim.supersededByRules?.length) {
            const hit = this.firstMatchingRule(dim.supersededByRules, alreadyResolved);
            if (!hit) {
                diagnostics.push(`no supersession rule matched for advisory dimension "${dim.name}" — nothing superseded`);
                return { Value: undefined, Provenance: 'Absent' };
            }
            diagnostics.push(`supersession rule matched for "${dim.name}" -> "${hit.key}"${hit.because ? ` (${hit.because})` : ''}`);
            return {
                Value: hit.key,
                Provenance: 'RuleDerived',
                Note: hit.because ?? `matched rule when=${JSON.stringify(hit.when)}`,
            };
        }

        // No rules declared: fall back to the ordinary paths, but swallow any failure.
        try {
            return await this.resolveOne(dim, callerScopes, alreadyResolved, input, diagnostics);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            diagnostics.push(`advisory dimension "${dim.name}" could not be resolved and was DROPPED (fail-soft): ${msg}`);
            LogStatus(`ScopeDimensionResolver: advisory dimension "${dim.name}" dropped — ${msg}`);
            return { Value: undefined, Provenance: 'Absent', Note: `dropped fail-soft: ${msg}` };
        }
    }

    /**
     * First rule whose every `when` entry matches. Order in the array IS the precedence order.
     *
     * A set-valued resolved dimension matches by MEMBERSHIP, so an author writes
     * `when: { ActiveSkillIDs: '<exam-writer>' }` without needing to know whether the dimension is
     * scalar or a set. Comparison is case-insensitive: MJ UUID casing is inconsistent, and a rule
     * that never fires because of letter case would be effectively undebuggable.
     */
    protected firstMatchingRule(
        rules: ScopeSupersessionRule[],
        resolved: Record<string, SecondaryScopeValue>
    ): ScopeSupersessionRule | undefined {
        const same = (a: unknown, b: unknown): boolean =>
            typeof a === 'string' && typeof b === 'string'
                ? a.toLowerCase() === b.toLowerCase()
                : a === b;

        return rules.find((rule) => Object.entries(rule.when).every(([name, expected]) => {
            const actual = resolved[name];
            if (actual === undefined) return false;
            if (Array.isArray(actual)) {
                return Array.isArray(expected)
                    ? expected.every((e) => actual.some((a) => same(a, e)))
                    : actual.some((a) => same(a, expected));
            }
            return same(actual, expected);
        }));
    }

    /** Resolve a single dimension, enforcing trust, grammar, narrowing and required-ness. */
    protected async resolveOne(
        dim: ScopeSecondaryDimension,
        callerScopes: Record<string, SecondaryScopeValue>,
        alreadyResolved: Record<string, SecondaryScopeValue>,
        input: DimensionResolutionInput,
        diagnostics: string[]
    ): Promise<DimensionOutcome> {
        const restricts = dim.restricts === true;
        // `restricts` is a profile: it forces the safe posture rather than relying on an
        // author remembering to set each field.
        const trust: 'CallerSupplied' | 'ServerDerived' =
            restricts ? 'ServerDerived' : (dim.trust ?? 'CallerSupplied');

        // §5.9 — a boundary defaults to STRICT, and choosing the permissive mode must be explicit.
        //
        // This check exists because `inheritanceMode` was the exact failure this whole resolver was
        // written to fix, reproduced: the field shipped in the declaration type and NOTHING read it,
        // so `cascading` on a boundary looked configured while behaving as an unenforced comment.
        if (restricts && dim.inheritanceMode === 'cascading' && dim.acknowledgeCascadingOnBoundary !== true) {
            throw new ScopeDimensionError(
                `Dimension "${dim.name}" is restricting and declares inheritanceMode 'cascading', which is ` +
                `PERMISSIVE — content lacking the dimension would apply to everyone, widening the bound. ` +
                `If that is genuinely intended, set "acknowledgeCascadingOnBoundary": true on the dimension ` +
                `so the choice is deliberate and greppable. Otherwise use 'strict' (the default for a boundary).`
            );
        }

        if (restricts && dim.valueType === 'freetext') {
            throw new ScopeDimensionError(
                `Dimension "${dim.name}" is restricting but declares valueType 'freetext'. Free text cannot be ` +
                `made safe inside a filter — model it as a query input instead.`
            );
        }

        let value: SecondaryScopeValue | undefined;
        let provenance: DimensionProvenance;
        let note: string | undefined;

        if (trust === 'ServerDerived') {
            if (dim.name in callerScopes) {
                // THE ANTI-SPOOF RULE. Discarded, never merged.
                diagnostics.push(
                    `discarded caller-supplied value for ServerDerived dimension "${dim.name}"`
                );
                LogStatus(`ScopeDimensionResolver: discarded caller-supplied value for ServerDerived dimension "${dim.name}"`);
                note = `a caller-supplied value was discarded (${JSON.stringify(callerScopes[dim.name]).substring(0, 80)})`;
            }
            value = await this.deriveServerValue(dim, input);
            // The discard is the security-relevant event, so it wins the label even when a
            // server value replaced it — an audit needs to see that someone tried.
            provenance = note ? 'DiscardedCaller' : 'ServerDerived';
        } else {
            const raw = callerScopes[dim.name];
            value = raw === undefined ? undefined : this.validateGrammar(dim, raw);
            provenance = raw === undefined ? 'Absent' : 'CallerSupplied';
        }

        if (value === undefined && dim.defaultValue !== undefined && dim.defaultValue !== null) {
            // A default may NOT stand in for a restricting dimension: "absent" must mean deny.
            if (restricts) {
                throw new ScopeDimensionError(
                    `Dimension "${dim.name}" is restricting and could not be derived; a defaultValue must not ` +
                    `substitute for an access bound.`
                );
            }
            value = dim.defaultValue;
            diagnostics.push(`applied defaultValue for "${dim.name}"`);
            provenance = 'Default';
        }

        if (value === undefined && dim.required) {
            throw new ScopeDimensionError(
                `Required dimension "${dim.name}" could not be resolved for scope "${input.Scope.Name}".`
            );
        }

        if (value !== undefined && dim.narrowingOf) {
            const bound = alreadyResolved[dim.narrowingOf];
            value = this.meet(dim, value, bound);
            if (bound !== undefined) {
                provenance = 'Narrowed';
                note = `narrowed within "${dim.narrowingOf}"${note ? `; ${note}` : ''}`;
            }
        }

        // An unresolved dimension is 'Absent' — UNLESS a caller value was discarded getting
        // here. The discard must survive: overwriting it would log a spoof attempt as a routine
        // "dimension not supplied", which is precisely the record an investigator needs and the
        // one an attacker would most like erased.
        if (value === undefined && provenance !== 'DiscardedCaller') provenance = 'Absent';
        return { Value: value, Provenance: provenance, Note: note };
    }

    /** Derive a ServerDerived value: an approved `MJ: Queries` row, else nothing. */
    protected async deriveServerValue(
        dim: ScopeSecondaryDimension,
        input: DimensionResolutionInput
    ): Promise<SecondaryScopeValue | undefined> {
        if (!dim.expansionQueryID) return undefined;
        const result = await new RunQuery().RunQuery({
            QueryID: dim.expansionQueryID,
            Parameters: {
                PrimaryScopeRecordID: input.CallerContext?.PrimaryScopeRecordID ?? null,
                UserID: (input.ContextUser as unknown as { ID?: string })?.ID ?? null,
                AgentID: input.Principals?.AgentID ?? null,
                // A skill is a principal in the same sense an agent is (Phase D), so a scope can
                // derive a different bound depending on which skill is active — the mechanism
                // behind "invoking this skill changes the content".
                SkillID: input.Principals?.SkillID ?? null,
            },
        }, input.ContextUser);

        if (!result?.Success) {
            throw new ScopeDimensionError(
                `Expansion query for dimension "${dim.name}" failed: ${result?.ErrorMessage ?? 'unknown error'}. ` +
                `Refusing to search rather than proceeding without the bound.`
            );
        }
        const rows = (result.Results ?? []) as Array<Record<string, unknown>>;
        // Single-column projection convention: first column of each row.
        const values = rows
            .map((r) => { const v = Object.values(r)[0]; return typeof v === 'string' ? v : String(v ?? ''); })
            .filter((v) => v.length > 0);
        return dim.valueType === 'uuid' ? values[0] : values;
    }

    /** Enforce the declared grammar. A failure REJECTS — never coerce, never drop-and-continue. */
    protected validateGrammar(dim: ScopeSecondaryDimension, raw: SecondaryScopeValue): SecondaryScopeValue {
        const fail = (why: string): never => {
            throw new ScopeDimensionError(`Dimension "${dim.name}" failed its declared valueType '${dim.valueType}': ${why}`);
        };
        switch (dim.valueType) {
            case 'uuid':
                if (typeof raw !== 'string' || !UUID_RE.test(raw)) return fail(`not a uuid (${String(raw).substring(0, 40)})`);
                return raw;
            case 'uuid[]': {
                const arr = Array.isArray(raw) ? raw : fail('not an array');
                for (const v of arr as string[]) if (!UUID_RE.test(v)) return fail(`array member is not a uuid (${String(v).substring(0, 40)})`);
                return arr as string[];
            }
            case 'enum':
                if (typeof raw !== 'string') return fail('not a string');
                if (!dim.enumValues?.length) return fail('no enumValues declared');
                if (!dim.enumValues.includes(raw)) return fail(`'${raw}' is not one of ${dim.enumValues.join('|')}`);
                return raw;
            case 'int':
                if (typeof raw !== 'number' || !Number.isInteger(raw)) return fail('not an integer');
                return raw;
            case 'iso-date': {
                if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) return fail('not an ISO date');
                return raw;
            }
            case 'bool':
                if (typeof raw !== 'boolean') return fail('not a boolean');
                return raw;
            case 'freetext':
            case undefined:
            default:
                return raw;
        }
    }

    /**
     * Lattice meet — a caller may only NARROW. `set` intersects; `scalar` must match exactly;
     * `opaque` forbids narrowing entirely.
     */
    protected meet(
        dim: ScopeSecondaryDimension,
        callerValue: SecondaryScopeValue,
        serverValue: SecondaryScopeValue | undefined
    ): SecondaryScopeValue {
        if (serverValue === undefined) return callerValue;
        if (dim.valueDomain === 'opaque') {
            throw new ScopeDimensionError(`Dimension "${dim.name}" has valueDomain 'opaque'; narrowingOf is not permitted.`);
        }

        // The lattice is chosen by the SHAPES of both sides, not by one declared domain. The
        // important case — and the one an earlier version got wrong — is a SCALAR caller value
        // narrowing a SET-valued server bound: that is a membership test ("pick one of the
        // allowed values"), not an equality test. Comparing a scalar against a stringified
        // array rejects every legitimate pick.
        const serverIsSet = Array.isArray(serverValue);
        const callerIsSet = Array.isArray(callerValue);
        const lower = (v: unknown) => String(v).toLowerCase();
        const widened = (detail: string) => new ScopeDimensionError(
            `Dimension "${dim.name}" would WIDEN rather than narrow the server-derived bound ` +
            `"${dim.narrowingOf}": ${detail}. Refusing to search.`
        );

        if (serverIsSet) {
            const allowed = new Set((serverValue as string[]).map(lower));
            if (!callerIsSet) {
                // Membership: one pick out of the allowed set.
                if (!allowed.has(lower(callerValue))) {
                    throw widened(`'${String(callerValue)}' is not one of the ${allowed.size} allowed value(s)`);
                }
                return callerValue;
            }
            // Set ∩ set.
            const meet = (callerValue as string[]).filter((v) => allowed.has(lower(v)));
            if (!meet.length) {
                throw new ScopeDimensionError(
                    `Dimension "${dim.name}" narrowed to NOTHING — the caller's values lie entirely outside the ` +
                    `server-derived bound "${dim.narrowingOf}". Refusing to search (never widen on a degenerate scope).`
                );
            }
            return meet;
        }

        // Server bound is a single value: the caller may only restate it.
        if (callerIsSet) {
            const distinct = new Set((callerValue as string[]).map(lower));
            if (distinct.size !== 1 || !distinct.has(lower(serverValue))) {
                throw widened(`a set that is not exactly ['${String(serverValue)}']`);
            }
            return serverValue;
        }
        if (lower(callerValue) !== lower(serverValue)) {
            throw widened(`'${String(callerValue)}' != '${String(serverValue)}'`);
        }
        return serverValue;
    }
}
