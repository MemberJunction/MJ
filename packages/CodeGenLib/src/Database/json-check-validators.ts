/**
 * @fileoverview Resolves the SQL `@CHECK` rules of opted-in JSONTypes to TypeScript, the way table
 * CHECK constraints are resolved to validator methods: read what was generated before, generate what
 * is new, persist it, and let the entity emitter consume the result.
 *
 * Differences from the table path, all deliberate:
 *
 * - **Keyed on text, not on a field.** A cache entry is identified by
 *   `JSONType name | property path | normalized check text`
 *   (see {@link BuildJSONCheckKey}). A shared interface bound to several entity fields therefore
 *   generates once, and editing the tag text — but not re-flowing its whitespace — is detected as a
 *   new key and regenerates.
 * - **Reads are unconditional.** Cached translations are returned whether or not AI is enabled, so a
 *   `--no-ai` run preserves committed validators instead of silently dropping them (the same
 *   regression the table path documents near `manageEntityFieldValuesAndValidatorFunctions`).
 *   Only *generation* is gated, by the `ParseCheckConstraints` feature.
 * - **Compile-checked before use.** Model output is emitted only after
 *   {@link CompileCheckJSONRuleBody} accepts it; otherwise the rule is skipped with an error.
 *
 * The module talks to the database and the model through two small interfaces so it can be tested
 * with stubs.
 *
 * @module Database/json-check-validators
 */

import type { UserInfo } from '@memberjunction/core';
import { ordinalCompare } from '@memberjunction/global';
import type { JSONCheckParserResult, JSONCheckScopeInfo } from '../Misc/advanced_generation';
import {
    BuildJSONCheckKey,
    CollectJSONCheckRules,
    GetAllMembers,
    JSONCheckRule,
    JSONTypeModel,
    ParseJSONTypeDefinition,
    ResolveLocalTarget,
} from '../Misc/json-type-model';
import { CompileCheckJSONRuleBody, RuleValueTypeText, RunJSONRuleTestCases } from '../Misc/json-type-rules';

/** Name of the `__mj.GeneratedCodeCategory` these translations are stored under. */
export const JSON_VALIDATOR_CATEGORY_NAME = 'CodeGen: JSON Validators';

/** One resolved SQL `@CHECK` translation. */
export class JSONValidatorResult {
    /** Declared name of the JSONType root the rule belongs to (`EntityField.JSONType`). */
    public JSONTypeName = '';
    /** `<Declaration>` or `<Declaration>.<property>`. */
    public Path = '';
    public NormalizedText = '';
    /** `JSONTypeName | Path | NormalizedText`, stored in `GeneratedCode.Source`. */
    public Key = '';
    public FunctionName = '';
    public FunctionDescription = '';
    /** Function body: takes `value` and `row`, returns true when the value is valid. */
    public FunctionText = '';
    /** `__mj.GeneratedCode.ID` when the translation came from (or was written to) the database. */
    public GeneratedCodeID = '';
    public AIModelID = '';
    /** False when read back from the cache; true when generated during this run. */
    public WasGenerated = false;
}

/** A cached `GeneratedCode` row in this category. */
export interface CachedJSONValidator {
    ID: string;
    Source: string;
    Name: string;
    Code: string;
    Description: string | null;
}

/** Database access the resolver needs. */
export interface JSONCheckStore {
    /** Approved rows of the JSON-validators category. */
    LoadCached(): Promise<CachedJSONValidator[]>;
    /** Writes a newly generated translation; assigns `entry.GeneratedCodeID`. */
    Persist(entry: JSONValidatorResult): Promise<void>;
}

/** The slice of `AdvancedGeneration` the resolver uses (so tests can supply a stub). */
export interface JSONCheckTranslator {
    featureEnabled(featureName: string): boolean;  // case-violation-ok-legacy-back-compat: mirrors AdvancedGeneration.featureEnabled, which subclasses override and so cannot be renamed
    ParseJSONCheck(
        checkText: string,
        scope: JSONCheckScopeInfo,
        propertyList: string,
        definition: string,
        rowFieldList: string,
        existingMethodName: string | null,
        contextUser: UserInfo,
    ): Promise<JSONCheckParserResult | null>;
}

/** A row of `vwEntityFields`, reduced to what this module reads. */
export interface JSONFieldRow {
    Entity: string;
    Name: string;
    Type?: string;
    AllowsNull?: boolean;
    JSONType?: string | null;
    JSONTypeDefinition?: string | null;
}

/** Inputs to {@link ResolveJSONCheckValidators}. */
export interface ResolveJSONCheckOptions {
    /** Every entity field (JSON and not): JSON ones are selected here, the rest supply the `row` column list. */
    Fields: ReadonlyArray<JSONFieldRow>;
    /** True to call the model for keys with no cached translation (subject to the feature flag). */
    GenerateNew: boolean;
    Store: JSONCheckStore;
    Translator: JSONCheckTranslator;
    CurrentUser: UserInfo;
    /** Reports a problem without failing the run. */
    ReportError: (message: string) => void;
    /** Reports a non-fatal note. */
    ReportWarning: (message: string) => void;
}

/** A JSONType definition in use by at least one field, with the entity that supplies its `row` columns. */
interface JSONTypeUse {
    JSONTypeName: string;
    Definition: string;
    Model: JSONTypeModel;
    /** First entity (by name, for determinism) binding this definition. */
    Entity: string;
}

function collectOptedInTypes(fields: ReadonlyArray<JSONFieldRow>): JSONTypeUse[] {
    const uses = new Map<string, JSONTypeUse>();
    const ordered = [...fields].sort((a, b) => ordinalCompare(a.Entity, b.Entity) || ordinalCompare(a.Name, b.Name));
    for (const field of ordered) {
        const name = field.JSONType?.trim();
        const definition = field.JSONTypeDefinition?.trim();
        if (!name || !definition) {
            continue;
        }
        const id = `${name}\u0000${definition}`;
        if (uses.has(id)) {
            continue;
        }
        const model = ParseJSONTypeDefinition(definition, name);
        if (model?.OptedIn) {
            uses.set(id, { JSONTypeName: name, Definition: definition, Model: model, Entity: field.Entity });
        }
    }
    return [...uses.values()];
}

/** Members of the object `value` refers to, one per line, for the prompt. */
function buildPropertyList(model: JSONTypeModel, rule: JSONCheckRule): string {
    const target = rule.ValueTypeNode ? ResolveLocalTarget(model, rule.ValueTypeNode)?.Name : rule.DeclarationName;
    const decl = target ? model.Declarations.get(target) : undefined;
    if (!decl) {
        return `   * (value is a ${RuleValueTypeText(model, rule)})`;
    }
    return GetAllMembers(model, decl)
        .map((m) => `   * ${m.Name} - ${m.TypeNode.getText(model.SourceFile)}${m.Optional ? ' (optional)' : ''}`)
        .join('\n');
}

/** Optional or nullable members of the object `value` refers to (the ones the NULL rule is about). */
function optionalMemberNames(model: JSONTypeModel, rule: JSONCheckRule): string[] {
    const target = rule.ValueTypeNode ? ResolveLocalTarget(model, rule.ValueTypeNode)?.Name : rule.DeclarationName;
    const decl = target ? model.Declarations.get(target) : undefined;
    if (!decl) {
        return [];
    }
    return GetAllMembers(model, decl)
        .filter((m) => m.Optional || /\bnull\b/.test(m.TypeNode.getText(model.SourceFile)))
        .map((m) => m.Name);
}

function buildRowFieldList(fields: ReadonlyArray<JSONFieldRow>, entity: string): string {
    return fields
        .filter((f) => f.Entity.trim().toLowerCase() === entity.trim().toLowerCase())
        .sort((a, b) => ordinalCompare(a.Name, b.Name))
        .map((f) => `   * ${f.Name} - ${f.Type ?? 'unknown'}${f.AllowsNull ? ' (nullable)' : ' (not null)'}`)
        .join('\n');
}

function fromCache(use: JSONTypeUse, rule: JSONCheckRule, key: string, row: CachedJSONValidator): JSONValidatorResult {
    const result = new JSONValidatorResult();
    result.JSONTypeName = use.JSONTypeName;
    result.Path = rule.Path;
    result.NormalizedText = rule.NormalizedText;
    result.Key = key;
    result.FunctionName = row.Name;
    result.FunctionDescription = row.Description ?? '';
    result.FunctionText = row.Code;
    result.GeneratedCodeID = row.ID;
    result.WasGenerated = false;
    return result;
}

/**
 * Generates one translation and compile-checks it. Returns null (after reporting) when the model
 * returned nothing usable or its code did not pass the check.
 */
async function generateOne(
    use: JSONTypeUse,
    rule: JSONCheckRule,
    key: string,
    options: ResolveJSONCheckOptions,
): Promise<JSONValidatorResult | null> {
    const scope: JSONCheckScopeInfo = {
        TypeName: rule.DeclarationName,
        Property: rule.Property,
        PerElement: rule.PerElement,
        ValueType: RuleValueTypeText(use.Model, rule),
    };
    const translated = await options.Translator.ParseJSONCheck(
        rule.Expression,
        scope,
        buildPropertyList(use.Model, rule),
        use.Definition,
        buildRowFieldList(options.Fields, use.Entity),
        null,
        options.CurrentUser,
    );
    if (!translated?.Code || !translated.Description || !translated.MethodName) {
        options.ReportError(`JSON @CHECK ${use.JSONTypeName}.${rule.Path}: the model returned no usable translation for '${rule.NormalizedText}'`);
        return null;
    }
    const problem = CompileCheckJSONRuleBody(use.Definition, scope.ValueType, translated.Code);
    if (problem) {
        options.ReportError(`JSON @CHECK ${use.JSONTypeName}.${rule.Path}: generated code for '${rule.NormalizedText}' rejected (${problem}); the rule is skipped`);
        return null;
    }
    const optionalMembers = optionalMemberNames(use.Model, rule);
    const testProblem = RunJSONRuleTestCases(translated.Code, translated.TestCases, optionalMembers.length > 0, optionalMembers);
    if (testProblem) {
        options.ReportError(`JSON @CHECK ${use.JSONTypeName}.${rule.Path}: generated code for '${rule.NormalizedText}' failed its own test cases (${testProblem}); the rule is skipped`);
        return null;
    }
    const result = new JSONValidatorResult();
    result.JSONTypeName = use.JSONTypeName;
    result.Path = rule.Path;
    result.NormalizedText = rule.NormalizedText;
    result.Key = key;
    result.FunctionName = translated.MethodName;
    result.FunctionDescription = translated.Description;
    result.FunctionText = translated.Code;
    result.AIModelID = translated.ModelID;
    result.WasGenerated = true;
    return result;
}

/**
 * Resolves every SQL `@CHECK` of every opted-in JSONType in use.
 *
 * @returns translations, one per distinct key; rules that could not be resolved are absent (and were
 *          reported), which makes the entity emitter skip them
 */
export async function ResolveJSONCheckValidators(options: ResolveJSONCheckOptions): Promise<JSONValidatorResult[]> {
    const wanted: Array<{ Use: JSONTypeUse; Rule: JSONCheckRule; Key: string }> = [];
    const seen = new Set<string>();
    for (const use of collectOptedInTypes(options.Fields)) {
        for (const rule of CollectJSONCheckRules(use.Model).filter((r) => r.Kind === 'sql')) {
            const key = BuildJSONCheckKey(use.JSONTypeName, rule);
            if (!seen.has(key)) {
                seen.add(key);
                wanted.push({ Use: use, Rule: rule, Key: key });
            }
        }
    }
    if (wanted.length === 0) {
        return [];
    }
    const cached = new Map((await options.Store.LoadCached()).map((row) => [row.Source, row]));
    const canGenerate = options.GenerateNew && options.Translator.featureEnabled('ParseCheckConstraints');
    const results: JSONValidatorResult[] = [];
    for (const { Use, Rule, Key } of wanted) {
        const hit = cached.get(Key);
        if (hit) {
            results.push(fromCache(Use, Rule, Key, hit));
            continue;
        }
        if (!canGenerate) {
            options.ReportWarning(`JSON @CHECK ${Use.JSONTypeName}.${Rule.Path}: no generated validator is stored for '${Rule.NormalizedText}' and generation is off; the rule is not emitted`);
            continue;
        }
        const generated = await generateOne(Use, Rule, Key, options);
        if (generated) {
            await options.Store.Persist(generated);
            results.push(generated);
        }
    }
    return results;
}
