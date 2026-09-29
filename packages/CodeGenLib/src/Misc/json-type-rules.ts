/**
 * @fileoverview Turns the `@CHECK` tags of an opted-in JSONType into the runtime rule set emitted
 * into a generated entity's `Validate()`, and compile-checks rule code before it is allowed there.
 *
 * Two kinds of rule exist:
 *
 * - `@CHECK ts:(<expression>)` — a TypeScript boolean expression, used directly; no model involved.
 * - `@CHECK (<SQL>)` — translated to TypeScript by an LLM exactly like a table CHECK constraint, then
 *   cached in `__mj.GeneratedCode`. This module never calls the model; it consumes results the
 *   caller looked up by {@link BuildJSONCheckKey}.
 *
 * Rule code is emitted only after the TypeScript compiler API has accepted it. A rule that fails is
 * skipped with an error — CodeGen never writes code that would break the generated package's build.
 *
 * @module Misc/json-type-rules
 */

import fs from 'fs';
import vm from 'vm';
import ts from 'typescript';
import {
    BuildJSONCheckKey,
    CollectJSONCheckRules,
    GetAllMembers,
    JSONCheckRule,
    JSONTypeModel,
    PrefixedTypeText,
    ResolveLocalTarget,
} from './json-type-model';

/** A cached / freshly generated translation of a SQL `@CHECK`, as this module needs it. */
export interface JSONCheckTranslation {
    /** Plain-language statement of the rule; becomes the validation message. */
    Description: string;
    /** Function BODY taking `value` and `row` that returns true when the value is VALID. */
    Body: string;
}

/** Everything {@link BuildJSONRuleSet} decided. */
export interface JSONRuleSetResult {
    /** Object-literal source for `ValidateJSONField`'s `rules` argument; null when there are no emit-able rules. */
    Source: string | null;
    /** SQL rules that need a translation which was not supplied (skipped). */
    Missing: JSONCheckRule[];
    /** Human-readable problems (rules skipped because their code did not parse, …). */
    Errors: string[];
    /** SQL rules present in the type, in emission order — what a generator must supply translations for. */
    SqlRules: JSONCheckRule[];
}

/** Escapes a value for a double-quoted TS string literal. */
const str = (s: string): string => JSON.stringify(s);

/** Syntax check of `return (<expression>);` inside a function; returns null when fine, else the first diagnostic. */
export function CheckTSExpressionSyntax(expression: string): string | null {
    const wrapped = `function __rule(value: unknown, row: unknown): boolean {\nreturn (\n${expression}\n);\n}`;
    return firstSyntaxError(wrapped);
}

function firstSyntaxError(source: string): string | null {
    const file = ts.createSourceFile('rule.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    return diagnostics.length > 0 ? ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n') : null;
}

/**
 * Compile-checks LLM-produced rule code: it must parse, contain a `return`, avoid `${` (generated
 * code can travel through Flyway migrations, which read `${...}` as a placeholder), and — with the
 * definition's own types in scope — type-check against `value`.
 *
 * `row` is typed as an open record here because the code is generated once per JSONType, not per
 * owning entity; the emitted code is checked against the real entity class when the package builds.
 *
 * @param definition - the JSONTypeDefinition source (original, un-prefixed names)
 * @param valueTypeText - the TypeScript type of `value` (original names)
 * @param body - the function body under test
 * @returns null when acceptable, otherwise the reason it was rejected
 */
export function CompileCheckJSONRuleBody(definition: string, valueTypeText: string, body: string): string | null {
    if (body.includes('${')) {
        return 'the code contains a template-literal placeholder (${...}); use string concatenation';
    }
    if (!/\breturn\b/.test(body)) {
        return 'the code never returns a value';
    }
    const source = `${definition}\ndeclare const __unusedRowShape: { [column: string]: any };\nfunction __rule(value: ${valueTypeText}, row: typeof __unusedRowShape): boolean {\n${body}\n}\n`;
    const syntax = firstSyntaxError(source);
    if (syntax) {
        return `syntax error: ${syntax}`;
    }
    return firstSemanticError(source);
}

/** One self-check the model supplies with a translated SQL `@CHECK`: an input and the verdict it must get. */
export interface JSONRuleTestCase {
    /** The `value` argument (JSON). */
    Value: unknown;
    /** The `row` argument (JSON); omitted means an empty record. */
    Row?: unknown;
    /** True when the rule must accept this input. */
    Expected: boolean;
}

/** Wall-clock ceiling for one test-case call, so a non-terminating body cannot hang CodeGen. */
const RULE_TEST_TIMEOUT_MS = 250;

/**
 * Executes a translated rule body against the model's own test cases, in an isolated `vm` context
 * with no globals and a time limit. This is a self-consistency guard, not proof of equivalence with
 * the SQL: it catches a body that does not do what its own author says it does — most usefully
 * the NULL-passes rule, because `requireAbsentCase` demands at least one case in which an
 * optional/nullable member is absent or null.
 *
 * @param body - the function body (TypeScript)
 * @param cases - test cases returned with the translation
 * @param requireAbsentCase - true when the value type has optional/nullable members
 * @param optionalMembers - names of those members, to recognise an "absent" case
 * @returns null when every case passes, otherwise the reason the translation must be rejected
 */
export function RunJSONRuleTestCases(
    body: string,
    cases: ReadonlyArray<JSONRuleTestCase> | undefined,
    requireAbsentCase: boolean,
    optionalMembers: ReadonlyArray<string>,
): string | null {
    if (!cases || cases.length === 0) {
        return 'the model returned no TestCases; at least one is required to check the translation';
    }
    if (requireAbsentCase && !cases.some((c) => isAbsentCase(c.Value, optionalMembers))) {
        return `TestCases must include a case where an optional/nullable member (${optionalMembers.join(', ')}) is absent or null`;
    }
    const source = `(function (value, row) {\n${body}\n})`;
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    for (const [index, testCase] of cases.entries()) {
        const failure = runOneCase(js, testCase);
        if (failure) {
            return `TestCases[${index}] ${JSON.stringify(testCase.Value)}: ${failure}`;
        }
    }
    return null;
}

function isAbsentCase(value: unknown, optionalMembers: ReadonlyArray<string>): boolean {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return optionalMembers.some((name) => record[name] === undefined || record[name] === null);
}

function runOneCase(js: string, testCase: JSONRuleTestCase): string | null {
    try {
        const context = vm.createContext({ input: JSON.stringify({ value: testCase.Value, row: testCase.Row ?? {} }) });
        const script = new vm.Script(`const args = JSON.parse(input);\n${js.trim().replace(/;$/, '')}(args.value, args.row)`);
        const actual: unknown = script.runInContext(context, { timeout: RULE_TEST_TIMEOUT_MS });
        return actual === testCase.Expected ? null : `expected ${testCase.Expected} but the body returned ${String(actual)}`;
    } catch (error) {
        return `the body threw: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/** Type-checks a single virtual file against the real TypeScript lib. Returns the first error or null. */
function firstSemanticError(source: string): string | null {
    const fileName = '/__mj_rule_check.ts';
    const options: ts.CompilerOptions = {
        noEmit: true, strict: true, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], types: [], skipLibCheck: true,
    };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
        name === fileName ? ts.createSourceFile(name, source, languageVersion, true) : original(name, languageVersion, onError, shouldCreate);
    host.fileExists = (name) => name === fileName || fs.existsSync(name);
    host.readFile = (name) => (name === fileName ? source : fs.readFileSync(name, 'utf8'));
    const program = ts.createProgram([fileName], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(fileName));
    if (diagnostics.length === 0) {
        return null;
    }
    return `type error: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`;
}

/** Original-name text of the type a rule's `value` parameter has. */
export function RuleValueTypeText(model: JSONTypeModel, rule: JSONCheckRule): string {
    return rule.ValueTypeNode ? rule.ValueTypeNode.getText(model.SourceFile) : rule.DeclarationName;
}

/** Declared types that transitively contain a rule-bearing type (rule-bearing types included). */
function typesReachingRules(model: JSONTypeModel, bearing: Set<string>): Set<string> {
    const reaching = new Set(bearing);
    let changed = true;
    while (changed) {
        changed = false;
        for (const decl of model.Declarations.values()) {
            if (reaching.has(decl.Name)) {
                continue;
            }
            const hits = GetAllMembers(model, decl).some((m) => {
                const target = ResolveLocalTarget(model, m.TypeNode);
                return target !== null && reaching.has(target.Name);
            });
            if (hits) {
                reaching.add(decl.Name);
                changed = true;
            }
        }
    }
    return reaching;
}

/** Edges from each type reachable from the root to child types that lead to rules. */
function buildGraph(model: JSONTypeModel, reaching: Set<string>): Record<string, Array<{ Property: string; Type: string; Shape: string }>> {
    const graph: Record<string, Array<{ Property: string; Type: string; Shape: string }>> = {};
    const queue = [model.RootName];
    const seen = new Set<string>();
    while (queue.length > 0) {
        const name = queue.shift() as string;
        if (seen.has(name) || !model.Declarations.has(name)) {
            continue;
        }
        seen.add(name);
        const edges: Array<{ Property: string; Type: string; Shape: string }> = [];
        for (const member of GetAllMembers(model, model.Declarations.get(name)!)) {
            const target = ResolveLocalTarget(model, member.TypeNode);
            if (target && reaching.has(target.Name)) {
                edges.push({ Property: member.Name, Type: target.Name, Shape: target.Shape });
                queue.push(target.Name);
            }
        }
        if (edges.length > 0) {
            graph[name] = edges;
        }
    }
    return graph;
}

function indent(text: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return text.split('\n').map((l) => (l.length > 0 ? `${pad}${l}` : l)).join('\n');
}

/** Cleans LLM/stored text the way table-CHECK validators are cleaned: escaped \n, \t and \" become real. */
function cleanStoredCode(code: string): string {
    return code.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
}

/**
 * Builds the `rules` argument of `ValidateJSONField` for an opted-in JSONType.
 *
 * @param model - the parsed definition
 * @param prefix - the entity-prefixed name stem (`<EntityClass>Entity`), giving `${prefix}_${Type}` type names
 * @param entityClassName - the owning entity class, the type of `row`
 * @param isArray - true when the field holds an array of the root type
 * @param translations - SQL check key → translation, for the SQL rules that have one
 */
export function BuildJSONRuleSet(
    model: JSONTypeModel,
    prefix: string,
    entityClassName: string,
    isArray: boolean,
    translations: ReadonlyMap<string, JSONCheckTranslation>,
): JSONRuleSetResult {
    const collected = CollectJSONCheckRules(model);
    const bearing = new Set(collected.map((r) => r.DeclarationName));
    const reaching = typesReachingRules(model, bearing);
    const reachable = new Set(Object.keys(buildGraph(model, reaching)).concat(model.RootName));
    for (const edges of Object.values(buildGraph(model, reaching))) {
        edges.forEach((e) => reachable.add(e.Type));
    }
    const rules = collected.filter((r) => reachable.has(r.DeclarationName));
    const result: JSONRuleSetResult = { Source: null, Missing: [], Errors: [], SqlRules: rules.filter((r) => r.Kind === 'sql') };
    const emitted: string[] = [];
    for (const rule of rules) {
        const entry = renderRule(model, prefix, entityClassName, rule, translations, result);
        if (entry) {
            emitted.push(entry);
        }
    }
    if (emitted.length === 0) {
        return result;
    }
    const graph = buildGraph(model, reaching);
    const graphSource = Object.entries(graph)
        .map(([type, edges]) => `${str(type)}: [${edges.map((e) => `{ Property: ${str(e.Property)}, Type: ${str(e.Type)}, Shape: ${str(e.Shape)} }`).join(', ')}]`)
        .join(', ');
    result.Source = `{
    RootType: ${str(model.RootName)},
    RootIsArray: ${isArray},
    Graph: { ${graphSource} },
    Rules: [
${emitted.join(',\n')},
    ],
}`;
    return result;
}

function renderRule(
    model: JSONTypeModel,
    prefix: string,
    entityClassName: string,
    rule: JSONCheckRule,
    translations: ReadonlyMap<string, JSONCheckTranslation>,
    result: JSONRuleSetResult,
): string | null {
    const where = `${rule.Path} @CHECK`;
    let description: string;
    let body: string;
    if (rule.Kind === 'ts') {
        const problem = CheckTSExpressionSyntax(rule.Expression);
        if (problem) {
            result.Errors.push(`${where} ts: expression skipped — ${problem}`);
            return null;
        }
        description = `Must satisfy: ${rule.NormalizedText}`;
        body = `return (\n${indent(rule.Expression, 4)}\n);`;
    } else {
        const translation = translations.get(BuildJSONCheckKey(model.RootName, rule));
        if (!translation) {
            result.Missing.push(rule);
            return null;
        }
        description = translation.Description;
        body = cleanStoredCode(translation.Body).trim();
    }
    const valueType = rule.ValueTypeNode ? PrefixedTypeText(model, rule.ValueTypeNode, prefix) : `${prefix}_${rule.DeclarationName}`;
    const lines = [
        `Type: ${str(rule.DeclarationName)},`,
        ...(rule.Property !== undefined ? [`Property: ${str(rule.Property)},`] : []),
        ...(rule.PerElement ? ['PerElement: true,'] : []),
        `Description: ${str(description)},`,
        `Test(value: ${valueType}, row: ${entityClassName}): boolean {`,
        indent(body, 4),
        '},',
    ];
    return `        {\n${indent(lines.join('\n'), 12)}\n        }`;
}
