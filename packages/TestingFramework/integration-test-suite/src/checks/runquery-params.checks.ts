/**
 * runquery-params.checks.ts — the 'runquery-params' bundle (QP1–QP10): parameter-permutation
 * coverage for catalog queries, per plans/integration-test-expansion/test-catalog.md §0d.
 *
 * READ-ONLY by construction — no fixtures, no lifecycle, zero DB writes. Candidates are resolved
 * DYNAMICALLY from `QueryEngine.Instance.Queries` (via the shared classification exported by
 * runquery-catalog.checks.ts — the same cross-bundle-helper pattern as NOGRANT_EMAIL): the
 * "all-optional" set (§0d's queries #14/#15 — every declared param IsRequired=false, no raw
 * splice tokens), plus per-type candidates (number / date / array params) wherever they live in
 * the catalog. Genuine environment gaps (no such query seeded) skip-as-pass LOUDLY.
 *
 * ── THE CONTRACT UNDER TEST (read from source, not assumed) ─────────────────────────────────
 * packages/QueryProcessor/src/queryParameterProcessor.ts:
 *   • DefaultValue is informational ONLY — never injected; template `{% if %}`/`| default()`
 *     blocks own default behavior, so `{}` and omitted-Parameters are equivalent (QP1).
 *   • Type coercion: numeric strings accepted for 'number' ("must be a number" on junk, QP4);
 *     'date' → ISO ("must be a valid date" on junk, QP5); 'array' accepts a JSON-string form
 *     ("must be an array" for non-string scalars, "must be a valid JSON array" for bad JSON, QP6).
 *   • Unknown parameter names: rejected ("Unknown parameter: 'x'") ONLY on the template path —
 *     GenericDatabaseProvider/renderPipeline.ts skips template processing entirely for
 *     non-templated queries, so unknown params there are silently IGNORED (both legs pinned, QP8).
 *   • ValidationFilters chain (applySingleValidationFilter): required/email/min/max/trim/upper/
 *     lower/number/date/sqlsafe/sqljoin, first violation short-circuits with
 *     "failed validation filter '<name>'", and an UNRECOGNIZED filter name is itself a violation
 *     (false-promise guard). QP10 violates a declared chain and expects that exact surface —
 *     loud skip when no catalog query declares ValidationFilters (true of today's seeds).
 *   • Nunjucks truthiness: `{% if MinRating %}` treats 0 as falsy → clause omitted (QP7 pins the
 *     documented trap: passing 0 must equal the unfiltered baseline).
 * QP9 is the injection probe: `' OR 1=1 --` through a FILTER-piped string param must be
 * neutralized — either rejected by validation or literal-matched (row count identical to an
 * equally-nonsensical benign literal), NEVER a broadened result set.
 */
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import {
    AssertSaneResultShape,
    DeriveAllParams,
    DeriveSafeValue,
    LoadCatalog,
    PickReferenceEntity,
    RunCatalogQuery,
    SkipAsPass
} from './runquery-catalog.checks';
import type { CatalogQueryClass, SafeParamValue } from './runquery-catalog.checks';

/** How many offenders to print in a failure message (the COUNT carries the rest). */
const SAMPLE_SIZE = 8;

/** The unknown-parameter probe key — obviously synthetic, never a plausible real param name. */
const BOGUS_PARAM = 'mjIntegrationTestBogusParam';

/** The canonical injection payload from the task/catalog spec. */
const INJECTION_PAYLOAD = `' OR 1=1 --`;

/** A benign literal guaranteed (by obscurity) to match no real data — the injection baseline. */
const BENIGN_LITERAL = 'mj-it-benign-zzz-000';

function queryLabel(cls: CatalogQueryClass): string {
    return `'${cls.Query.CategoryPath}/${cls.Query.Name}' (${cls.Query.ID.slice(0, 8)})`;
}

function failOnOffenders(checkLabel: string, offenders: string[], exercised: number): void {
    if (offenders.length > 0) {
        const sample = offenders.slice(0, SAMPLE_SIZE).join('\n    ');
        throw new Error(`${checkLabel}: ${offenders.length} of ${exercised} case(s) failed:\n    ${sample}`);
    }
    console.log(`      → ${checkLabel}: ${exercised} case(s) exercised, all clean`);
}

/**
 * §0d's target set: every declared parameter optional, no raw splice tokens (all values flow
 * through filter pipes), templated. These are the queries where `{}` is a legal, complete call.
 */
function allOptionalQueries(catalog: CatalogQueryClass[]): CatalogQueryClass[] {
    return catalog.filter(c =>
        c.Params.length > 0 &&
        c.Params.every(p => p.IsRequired !== true) &&
        c.RawSpliceParams.length === 0 &&
        c.Query.UsesTemplate
    );
}

/**
 * (query, param) candidates of a given declared Type, safe to permute: no raw splice params on
 * the query (so a validation failure is unambiguously the target param's doing) and all sibling
 * params derivable. All-optional queries sort first — they are the §0d focus.
 */
function typedParamCandidates(
    catalog: CatalogQueryClass[],
    type: MJQueryParameterEntity['Type']
): Array<{ Cls: CatalogQueryClass; Param: MJQueryParameterEntity }> {
    const optionalSet = new Set(allOptionalQueries(catalog).map(c => NormalizeUUID(c.Query.ID)));
    const candidates: Array<{ Cls: CatalogQueryClass; Param: MJQueryParameterEntity }> = [];
    for (const cls of catalog) {
        if (cls.Params.length === 0 || cls.RawSpliceParams.length > 0 || !cls.Query.UsesTemplate) {
            continue;
        }
        for (const p of cls.Params) {
            if (p.Type === type) {
                candidates.push({ Cls: cls, Param: p });
            }
        }
    }
    candidates.sort((a, b) => {
        const aOpt = optionalSet.has(NormalizeUUID(a.Cls.Query.ID)) ? 0 : 1;
        const bOpt = optionalSet.has(NormalizeUUID(b.Cls.Query.ID)) ? 0 : 1;
        if (aOpt !== bOpt) return aOpt - bOpt;
        return `${queryLabel(a.Cls)}#${a.Param.Name}`.localeCompare(`${queryLabel(b.Cls)}#${b.Param.Name}`);
    });
    return candidates;
}

/** Run one all-optional query with `{}` and return the successful baseline result, or throw. */
async function optionalBaseline(cls: CatalogQueryClass, ctx: IntegrationCheckContext) {
    const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: {} }, ctx.User);
    Assert(!run.Threw, `${queryLabel(cls)} baseline {} run THREW: ${run.Error}`);
    Assert(run.Result!.Success, `${queryLabel(cls)} baseline {} run failed: ${run.Result!.ErrorMessage}`);
    return run.Result!;
}

// ── ValidationFilters violation planning (QP10) ─────────────────────────────────────────────

/** One entry of a declared `ValidationFilters` chain, coerced from the stored JSON. */
interface DeclaredFilter {
    name: string;
    args?: Array<string | number | boolean | null>;
}

/**
 * Parse a ValidationFilters JSON column the way QueryParameterProcessor.parseFilters does:
 * array of objects with a string `name`; malformed entries discarded.
 */
function parseDeclaredFilters(validationFilters: string | null): DeclaredFilter[] {
    if (!validationFilters || validationFilters.trim() === '') {
        return [];
    }
    try {
        const raw: unknown = JSON.parse(validationFilters);
        if (!Array.isArray(raw)) {
            return [];
        }
        const filters: DeclaredFilter[] = [];
        for (const entry of raw) {
            if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
                const obj = entry as { name: string; args?: unknown };
                filters.push({
                    name: obj.name,
                    args: Array.isArray(obj.args)
                        ? obj.args.filter((a): a is string | number | boolean | null =>
                            a === null || typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean')
                        : undefined
                });
            }
        }
        return filters;
    } catch {
        return [];
    }
}

/** Filter names applySingleValidationFilter recognizes — anything else is the unknown-filter guard. */
const KNOWN_FILTER_VOCAB = new Set(['required', 'email', 'min', 'max', 'trim', 'upper', 'lower', 'number', 'date', 'sqlsafe', 'sqljoin']);

interface ViolationPlan {
    /** The value that violates the target filter (while surviving type conversion + earlier filters). */
    Value: SafeParamValue;
    /** The (lowercased) filter name expected in "failed validation filter '<name>'". */
    ExpectFilter: string;
}

/**
 * Walk a declared chain IN ORDER (first violation short-circuits server-side, so the first
 * violatable filter is the one whose error surfaces) and craft a value that violates it while
 * passing the param's TYPE conversion (a type error would mask the filter's message).
 * Returns undefined when no filter in the chain is violatable for this param.
 */
function planViolation(p: MJQueryParameterEntity, filters: DeclaredFilter[]): ViolationPlan | undefined {
    for (const f of filters) {
        const name = f.name.trim().toLowerCase();
        const args = f.args ?? [];
        switch (name) {
            case 'required':
                // '' violates the filter; a required-PARAM '' would trip the earlier
                // "Required parameter missing" gate with a different message — skip those.
                if (p.IsRequired !== true && p.Type === 'string') {
                    return { Value: '', ExpectFilter: name };
                }
                break;
            case 'email':
                if (p.Type === 'string') {
                    return { Value: 'not-an-email', ExpectFilter: name };
                }
                break;
            case 'min': {
                const bound = Number(args[0]);
                if (!Number.isFinite(bound)) break;
                if (p.Type === 'number') {
                    return { Value: bound - 1, ExpectFilter: name };
                }
                if (p.Type === 'string' && bound > 1) {
                    return { Value: 'x', ExpectFilter: name }; // length 1 < bound, non-empty (required-safe)
                }
                break;
            }
            case 'max': {
                const bound = Number(args[0]);
                if (!Number.isFinite(bound)) break;
                if (p.Type === 'number') {
                    return { Value: bound + 1, ExpectFilter: name };
                }
                if (p.Type === 'string' && bound >= 0 && bound < 4096) {
                    return { Value: 'x'.repeat(bound + 1), ExpectFilter: name };
                }
                break;
            }
            case 'number':
                if (p.Type === 'string') {
                    return { Value: 'abc-not-a-number', ExpectFilter: name };
                }
                break;
            case 'date':
                if (p.Type === 'string') {
                    return { Value: 'zzz-not-a-date', ExpectFilter: name };
                }
                break;
            case 'sqlsafe':
                if (p.Type === 'string') {
                    return { Value: `'; DROP TABLE mj_integration_test --`, ExpectFilter: name };
                }
                break;
            case 'sqljoin':
                if (p.Type === 'array') {
                    return { Value: [`a'b`], ExpectFilter: name };
                }
                if (p.Type === 'string') {
                    return { Value: 'not-an-array', ExpectFilter: name }; // "filter requires an array value"
                }
                break;
            case 'trim':
            case 'upper':
            case 'lower':
                break; // pure transformations — cannot be violated
            default:
                // Unknown filter name: the processor rejects ANY value (false-promise guard).
                return { Value: DeriveSafeValue(p, undefined), ExpectFilter: name };
        }
    }
    return undefined;
}

// ── the ordered runquery-params bundle ──────────────────────────────────────────────────────

export const RunQueryParamsChecks: NamedCheck[] = [
    {
        Id: 'runquery-params.QP1',
        Name: 'QP1: all-optional queries — {} and omitted Parameters both succeed identically (template defaults apply)',
        Fn: async (ctx): Promise<void> => {
            const optional = allOptionalQueries(await LoadCatalog(ctx));
            if (optional.length === 0) {
                SkipAsPass('runquery-params.QP1', 'no all-optional-parameter catalog queries in this deployment');
                return;
            }
            const offenders: string[] = [];
            for (const cls of optional) {
                const withEmpty = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: {} }, ctx.User);
                const withOmitted = await RunCatalogQuery({ QueryID: cls.Query.ID }, ctx.User);
                if (withEmpty.Threw || withOmitted.Threw) {
                    offenders.push(`${queryLabel(cls)} THREW: ${withEmpty.Error ?? withOmitted.Error}`);
                    continue;
                }
                const empty = withEmpty.Result!;
                const omitted = withOmitted.Result!;
                if (!empty.Success || !omitted.Success) {
                    offenders.push(`${queryLabel(cls)} must succeed with no explicit values ` +
                        `({}: ${empty.Success}, omitted: ${omitted.Success}) — ${empty.ErrorMessage || omitted.ErrorMessage}`);
                    continue;
                }
                try {
                    AssertSaneResultShape(queryLabel(cls), empty);
                    AssertEqual(omitted.RowCount, empty.RowCount,
                        `${queryLabel(cls)}: omitted Parameters and {} must be equivalent (defaults live in the template)`);
                } catch (e) {
                    offenders.push(e instanceof Error ? e.message : String(e));
                }
            }
            failOnOffenders('QP1 all-optional baseline', offenders, optional.length);
        }
    },
    {
        Id: 'runquery-params.QP2',
        Name: 'QP2: each optional param varied independently → success, filtered count ≤ unfiltered baseline',
        Fn: async (ctx): Promise<void> => {
            const optional = allOptionalQueries(await LoadCatalog(ctx));
            if (optional.length === 0) {
                SkipAsPass('runquery-params.QP2', 'no all-optional-parameter catalog queries in this deployment');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const offenders: string[] = [];
            let exercised = 0;
            for (const cls of optional) {
                const baseline = await optionalBaseline(cls, ctx);
                for (const p of cls.Params) {
                    exercised++;
                    const value = DeriveSafeValue(p, refEntity);
                    const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: { [p.Name]: value } }, ctx.User);
                    if (run.Threw) {
                        offenders.push(`${queryLabel(cls)} param '${p.Name}'=${JSON.stringify(value)} THREW: ${run.Error}`);
                        continue;
                    }
                    const result = run.Result!;
                    if (!result.Success) {
                        offenders.push(`${queryLabel(cls)} param '${p.Name}'=${JSON.stringify(value)} failed: ${result.ErrorMessage}`);
                        continue;
                    }
                    if (result.RowCount > baseline.RowCount) {
                        offenders.push(`${queryLabel(cls)} param '${p.Name}': an optional FILTER widened the set ` +
                            `(${result.RowCount} > baseline ${baseline.RowCount})`);
                    }
                }
            }
            Assert(exercised > 0, 'QP2 anti-vacuity: at least one (query, param) case must run');
            failOnOffenders('QP2 independent-param sweep', offenders, exercised);
        }
    },
    {
        Id: 'runquery-params.QP3',
        Name: 'QP3: full all-params combo → success, no clause-interaction break, count ≤ baseline',
        Fn: async (ctx): Promise<void> => {
            const optional = allOptionalQueries(await LoadCatalog(ctx));
            if (optional.length === 0) {
                SkipAsPass('runquery-params.QP3', 'no all-optional-parameter catalog queries in this deployment');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const offenders: string[] = [];
            for (const cls of optional) {
                const baseline = await optionalBaseline(cls, ctx);
                const parameters = DeriveAllParams(cls, refEntity);
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: parameters }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(cls)} full combo THREW: ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (!result.Success) {
                    offenders.push(`${queryLabel(cls)} full combo ${JSON.stringify(parameters)} failed: ${result.ErrorMessage}`);
                    continue;
                }
                try {
                    AssertSaneResultShape(queryLabel(cls), result);
                } catch (e) {
                    offenders.push(e instanceof Error ? e.message : String(e));
                    continue;
                }
                if (result.RowCount > baseline.RowCount) {
                    offenders.push(`${queryLabel(cls)} full combo widened the set (${result.RowCount} > baseline ${baseline.RowCount})`);
                }
            }
            failOnOffenders('QP3 full-combo sweep', offenders, optional.length);
        }
    },
    {
        Id: 'runquery-params.QP4',
        Name: "QP4: number coercion — numeric string accepted; junk rejected with a clean 'must be a number'",
        Fn: async (ctx): Promise<void> => {
            const candidates = typedParamCandidates(await LoadCatalog(ctx), 'number');
            if (candidates.length === 0) {
                SkipAsPass('runquery-params.QP4', 'no catalog query declares a number-typed parameter on a filtered template');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const { Cls, Param } = candidates[0];
            const base = DeriveAllParams(Cls, refEntity);
            const numericValue = DeriveSafeValue(Param, refEntity);

            const accepted = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: String(numericValue) } }, ctx.User);
            Assert(!accepted.Threw, `${queryLabel(Cls)} numeric-string leg THREW: ${accepted.Error}`);
            Assert(accepted.Result!.Success,
                `${queryLabel(Cls)}: numeric STRING '${String(numericValue)}' for '${Param.Name}' must be coerced and accepted — got: ${accepted.Result!.ErrorMessage}`);

            const rejected = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: 'abc' } }, ctx.User);
            Assert(!rejected.Threw, `${queryLabel(Cls)} junk-number leg THREW (must be a clean result): ${rejected.Error}`);
            AssertEqual(rejected.Result!.Success, false,
                `${queryLabel(Cls)}: 'abc' for number param '${Param.Name}' must be rejected`);
            Assert(/must be a number/i.test(rejected.Result!.ErrorMessage),
                `${queryLabel(Cls)}: rejection must say "must be a number" — got: "${rejected.Result!.ErrorMessage}"`);
            console.log(`      → QP4 pinned on ${queryLabel(Cls)} param '${Param.Name}'`);
        }
    },
    {
        Id: 'runquery-params.QP5',
        Name: "QP5: date coercion — valid ISO accepted; junk rejected with a clean 'must be a valid date'",
        Fn: async (ctx): Promise<void> => {
            const candidates = typedParamCandidates(await LoadCatalog(ctx), 'date');
            if (candidates.length === 0) {
                SkipAsPass('runquery-params.QP5', 'no catalog query declares a date-typed parameter on a filtered template');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const { Cls, Param } = candidates[0];
            const base = DeriveAllParams(Cls, refEntity);

            const accepted = await RunCatalogQuery({ QueryID: Cls.Query.ID, Parameters: base }, ctx.User);
            Assert(!accepted.Threw, `${queryLabel(Cls)} valid-date leg THREW: ${accepted.Error}`);
            Assert(accepted.Result!.Success,
                `${queryLabel(Cls)}: a valid ISO date for '${Param.Name}' must be accepted — got: ${accepted.Result!.ErrorMessage}`);

            const rejected = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: 'zzz-not-a-date' } }, ctx.User);
            Assert(!rejected.Threw, `${queryLabel(Cls)} junk-date leg THREW (must be a clean result): ${rejected.Error}`);
            AssertEqual(rejected.Result!.Success, false,
                `${queryLabel(Cls)}: 'zzz-not-a-date' for date param '${Param.Name}' must be rejected`);
            Assert(/must be a valid date/i.test(rejected.Result!.ErrorMessage),
                `${queryLabel(Cls)}: rejection must say "must be a valid date" — got: "${rejected.Result!.ErrorMessage}"`);
            console.log(`      → QP5 pinned on ${queryLabel(Cls)} param '${Param.Name}'`);
        }
    },
    {
        Id: 'runquery-params.QP6',
        Name: 'QP6: array coercion — JSON-string form accepted; scalar and bad-JSON rejected with the distinct clean errors',
        Fn: async (ctx): Promise<void> => {
            const candidates = typedParamCandidates(await LoadCatalog(ctx), 'array');
            if (candidates.length === 0) {
                SkipAsPass('runquery-params.QP6', 'no catalog query declares an array-typed parameter on a filtered template');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const { Cls, Param } = candidates[0];
            const base = DeriveAllParams(Cls, refEntity);
            const arrayValue = DeriveSafeValue(Param, refEntity);
            Assert(Array.isArray(arrayValue), `derivation for array param '${Param.Name}' must produce an array`);

            const jsonString = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: JSON.stringify(arrayValue) } }, ctx.User);
            Assert(!jsonString.Threw, `${queryLabel(Cls)} JSON-string leg THREW: ${jsonString.Error}`);
            Assert(jsonString.Result!.Success,
                `${queryLabel(Cls)}: a JSON-STRING array for '${Param.Name}' must be parsed and accepted — got: ${jsonString.Result!.ErrorMessage}`);

            const scalar = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: 42 } }, ctx.User);
            Assert(!scalar.Threw, `${queryLabel(Cls)} scalar leg THREW (must be a clean result): ${scalar.Error}`);
            AssertEqual(scalar.Result!.Success, false,
                `${queryLabel(Cls)}: scalar 42 for array param '${Param.Name}' must be rejected`);
            Assert(/must be an array/i.test(scalar.Result!.ErrorMessage),
                `${queryLabel(Cls)}: scalar rejection must say "must be an array" — got: "${scalar.Result!.ErrorMessage}"`);

            const badJson = await RunCatalogQuery(
                { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: 'definitely-not-json[' } }, ctx.User);
            Assert(!badJson.Threw, `${queryLabel(Cls)} bad-JSON leg THREW (must be a clean result): ${badJson.Error}`);
            AssertEqual(badJson.Result!.Success, false,
                `${queryLabel(Cls)}: an unparseable string for array param '${Param.Name}' must be rejected`);
            Assert(/must be a valid JSON array/i.test(badJson.Result!.ErrorMessage),
                `${queryLabel(Cls)}: bad-JSON rejection must say "must be a valid JSON array" — got: "${badJson.Result!.ErrorMessage}"`);
            console.log(`      → QP6 pinned on ${queryLabel(Cls)} param '${Param.Name}'`);
        }
    },
    {
        Id: 'runquery-params.QP7',
        Name: 'QP7: the 0-truthiness trap — optional number param = 0 behaves as omitted (clause skipped, documented)',
        Fn: async (ctx): Promise<void> => {
            const optional = allOptionalQueries(await LoadCatalog(ctx));
            const cases = optional.flatMap(cls => cls.Params.filter(p => p.Type === 'number').map(p => ({ Cls: cls, Param: p })));
            if (cases.length === 0) {
                SkipAsPass('runquery-params.QP7', 'no all-optional catalog query declares a number-typed parameter');
                return;
            }
            const offenders: string[] = [];
            for (const { Cls, Param } of cases) {
                const baseline = await optionalBaseline(Cls, ctx);
                const run = await RunCatalogQuery({ QueryID: Cls.Query.ID, Parameters: { [Param.Name]: 0 } }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}'=0 THREW: ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (!result.Success) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}'=0 must succeed (0 is a valid number): ${result.ErrorMessage}`);
                    continue;
                }
                if (result.RowCount !== baseline.RowCount) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}'=0: Nunjucks truthiness documents 0 as falsy ` +
                        `(clause omitted) — expected the {} baseline count ${baseline.RowCount}, got ${result.RowCount}`);
                }
            }
            failOnOffenders('QP7 zero-truthiness sweep', offenders, cases.length);
        }
    },
    {
        Id: 'runquery-params.QP8',
        Name: "QP8: unknown-parameter contract — templated queries reject ('Unknown parameter'), non-templated silently ignore",
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const refEntity = PickReferenceEntity(ctx.Provider);

            // Leg A — templated path rejects. Exclude composition-dependent queries: the render
            // pipeline deliberately skips the unknown-param check when a dependency uses templates.
            const templated = catalog.filter(c =>
                c.Params.length > 0 && c.Query.UsesTemplate && !c.HasDependencies && c.RawSpliceParams.length === 0);
            if (templated.length === 0) {
                SkipAsPass('runquery-params.QP8', 'leg A: no dependency-free templated parameterized catalog query');
            } else {
                const cls = allOptionalQueries(catalog).find(c => !c.HasDependencies) ?? templated[0];
                const parameters = { ...DeriveAllParams(cls, refEntity), [BOGUS_PARAM]: 1 };
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: parameters }, ctx.User);
                Assert(!run.Threw, `${queryLabel(cls)} unknown-param leg THREW (must be a clean result): ${run.Error}`);
                AssertEqual(run.Result!.Success, false,
                    `${queryLabel(cls)}: an unknown parameter '${BOGUS_PARAM}' on a templated query must be rejected`);
                Assert(/unknown parameter/i.test(run.Result!.ErrorMessage) && run.Result!.ErrorMessage.includes(BOGUS_PARAM),
                    `${queryLabel(cls)}: rejection must name the unknown parameter — got: "${run.Result!.ErrorMessage}"`);
                console.log(`      → QP8 leg A pinned on ${queryLabel(cls)}`);
            }

            // Leg B — non-templated path IGNORES unknown params (render pipeline never validates).
            const bare = catalog.filter(c => c.Params.length === 0 && !c.Query.UsesTemplate);
            if (bare.length === 0) {
                SkipAsPass('runquery-params.QP8', 'leg B: no zero-parameter non-templated catalog query');
                return;
            }
            const cls = bare[0];
            const baseline = await RunCatalogQuery({ QueryID: cls.Query.ID }, ctx.User);
            Assert(!baseline.Threw && baseline.Result!.Success,
                `${queryLabel(cls)} bare baseline must succeed: ${baseline.Error ?? baseline.Result?.ErrorMessage}`);
            const withBogus = await RunCatalogQuery(
                { QueryID: cls.Query.ID, Parameters: { [BOGUS_PARAM]: 1 } }, ctx.User);
            Assert(!withBogus.Threw, `${queryLabel(cls)} bogus-param leg THREW: ${withBogus.Error}`);
            AssertEqual(withBogus.Result!.Success, true,
                `${queryLabel(cls)}: the ACTUAL contract is that non-templated queries IGNORE unknown parameters — ` +
                `got failure: ${withBogus.Result!.ErrorMessage}`);
            AssertEqual(withBogus.Result!.RowCount, baseline.Result!.RowCount,
                `${queryLabel(cls)}: an ignored unknown parameter must not change the result set`);
            const applied = withBogus.Result!.AppliedParameters;
            Assert(applied === undefined || applied === null || Object.keys(applied).length === 0,
                `${queryLabel(cls)}: nothing may be 'applied' on the non-template path — got ${JSON.stringify(applied)}`);
            console.log(`      → QP8 leg B pinned on ${queryLabel(cls)}`);
        }
    },
    {
        Id: 'runquery-params.QP9',
        Name: "QP9: injection probe — `' OR 1=1 --` through a filtered string param is neutralized, never a broadened set",
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            // Filter-piped string params only (raw ones would be TEXT SPLICING — QC4's relaxed
            // territory, and deliberately not fed hostile input by a test).
            const candidates = typedParamCandidates(catalog, 'string')
                .filter(c => !c.Cls.RawParams.some(rp => rp.Name === c.Param.Name));
            if (candidates.length === 0) {
                SkipAsPass('runquery-params.QP9', 'no filter-piped string parameter on any catalog query');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const offenders: string[] = [];
            let neutralizedByValidation = 0;
            for (const { Cls, Param } of candidates) {
                const base = DeriveAllParams(Cls, refEntity);
                const benign = await RunCatalogQuery(
                    { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: BENIGN_LITERAL } }, ctx.User);
                const malicious = await RunCatalogQuery(
                    { QueryID: Cls.Query.ID, Parameters: { ...base, [Param.Name]: INJECTION_PAYLOAD } }, ctx.User);
                if (malicious.Threw) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}': injection payload caused an UNHANDLED THROW: ${malicious.Error}`);
                    continue;
                }
                if (!malicious.Result!.Success) {
                    // Rejected outright (validation / SQL-safety) — neutralized, but must be clean.
                    if (!malicious.Result!.ErrorMessage || malicious.Result!.ErrorMessage.trim().length === 0) {
                        offenders.push(`${queryLabel(Cls)} '${Param.Name}': injection rejected with an EMPTY ErrorMessage`);
                    } else {
                        neutralizedByValidation++;
                    }
                    continue;
                }
                // Executed: the payload must have been treated as an inert literal — meaning it
                // matches exactly what an equally-nonsensical benign literal matches.
                if (benign.Threw || !benign.Result!.Success) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}': benign baseline failed, cannot compare ` +
                        `(${benign.Error ?? benign.Result?.ErrorMessage})`);
                    continue;
                }
                if (malicious.Result!.RowCount !== benign.Result!.RowCount) {
                    offenders.push(`${queryLabel(Cls)} '${Param.Name}': INJECTION BROADENED THE SET — ` +
                        `payload matched ${malicious.Result!.RowCount} row(s) vs benign ${benign.Result!.RowCount}`);
                }
            }
            console.log(`      → QP9: ${candidates.length} probe(s), ${neutralizedByValidation} rejected by validation, rest literal-matched`);
            failOnOffenders('QP9 injection probe', offenders, candidates.length);
        }
    },
    {
        Id: 'runquery-params.QP10',
        Name: "QP10: ValidationFilters enforcement — a violating value is rejected with \"failed validation filter '<name>'\"",
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const declaring: Array<{ Cls: CatalogQueryClass; Param: MJQueryParameterEntity; Filters: DeclaredFilter[] }> = [];
            for (const cls of catalog) {
                for (const p of cls.Params) {
                    const filters = parseDeclaredFilters(p.ValidationFilters);
                    if (filters.length > 0) {
                        declaring.push({ Cls: cls, Param: p, Filters: filters });
                    }
                }
            }
            if (declaring.length === 0) {
                SkipAsPass('runquery-params.QP10',
                    'no catalog query parameter declares ValidationFilters in this deployment — ' +
                    'the enforcement chain has no catalog surface to violate (fixture-based coverage lives in unit tests)');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            for (const { Cls, Param, Filters } of declaring) {
                const plan = planViolation(Param, Filters);
                if (!plan) {
                    continue; // chain is all-transformation (trim/upper/lower) — nothing to violate
                }
                const parameters = { ...DeriveAllParams(Cls, refEntity), [Param.Name]: plan.Value };
                const run = await RunCatalogQuery({ QueryID: Cls.Query.ID, Parameters: parameters }, ctx.User);
                Assert(!run.Threw, `${queryLabel(Cls)} '${Param.Name}' violation THREW (must be a clean result): ${run.Error}`);
                AssertEqual(run.Result!.Success, false,
                    `${queryLabel(Cls)}: value ${JSON.stringify(plan.Value)} violates declared filter '${plan.ExpectFilter}' ` +
                    `on '${Param.Name}' and must be rejected`);
                Assert(run.Result!.ErrorMessage.includes(`failed validation filter '${plan.ExpectFilter}'`),
                    `${queryLabel(Cls)}: rejection must carry "failed validation filter '${plan.ExpectFilter}'" — ` +
                    `got: "${run.Result!.ErrorMessage}"`);
                console.log(`      → QP10 pinned on ${queryLabel(Cls)} param '${Param.Name}' filter '${plan.ExpectFilter}'`);
                return;
            }
            SkipAsPass('runquery-params.QP10',
                `${declaring.length} parameter(s) declare ValidationFilters but every chain is transformation-only (trim/upper/lower) — nothing violatable`);
        }
    }
];

for (const check of RunQueryParamsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Deliberately NO RegisterLifecycle — this bundle is read-only: nothing to create, nothing to tear down.
