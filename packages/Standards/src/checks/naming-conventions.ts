/**
 * @fileoverview The naming-convention standard.
 *
 * Enforces the convention documented in the MJ repo's `.claude/rules/typescript-style.md`, which is
 * deliberately inverted from ordinary TypeScript style:
 *
 *   public class members      PascalCase      `public IsLoading`, `@Input() QueryId`
 *   private class members     camelCase       `private destroy$`, `private _internalState`
 *   exported functions        PascalCase      `export function EscapeSQLString()`
 *   exported types            PascalCase      classes, interfaces, type aliases, enums
 *
 * ## Why an AST and not a regex
 *
 * The rule keys off information only a parser has. Visibility is the obvious part — TypeScript's
 * default is *public*, so `foo()` with no modifier is a public member and must be PascalCase, which
 * no regex can tell from a local function. But the exemptions matter more: whether a member
 * implements a framework contract depends on its class's heritage clause, and whether it carries
 * `@HostListener` depends on its decorators. A text-matching gate gets those wrong in both
 * directions, and a gate with false positives gets switched off.
 *
 * Parsing is syntax-only — `createSourceFile` per file, no `Program`, no type checker. There is no
 * root tsconfig in MJ that could build a repo-wide `Program` (the two at the root are bare
 * `compilerOptions` bases with no `include`/`references`), and a `Program` per package tsconfig
 * across 300+ packages is far too slow for a PR gate. Everything this rule needs is syntactic;
 * a full-repo pass over ~7,900 files costs about two seconds.
 *
 * ## What it deliberately does not check
 *
 * - **`protected` members.** MJ's own base classes declare PascalCase protected extension points —
 *   `BaseAction.InternalRunAction` (overridden 300+ times), `BaseEngine.AdditionalLoading`,
 *   `BaseResourceComponent.OnQueryParamsChanged`, `ProviderToUse`. That is the template-method
 *   pattern, it is load-bearing, and subclasses cannot deviate from the parent's casing. The
 *   documented "camelCase for private/protected" rule is simply wrong for the protected half.
 * - **Constructor parameter properties.** `constructor(private foo: X)` is already 98.5% compliant
 *   and the baseline this check's rollout was measured against excluded it. A later cycle can add it.
 * - **Interface and type-literal members.** Half of them mirror database rows (PascalCase) and half
 *   are option bags (camelCase); there is no single right answer, so there is no rule to enforce.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type * as TSApi from 'typescript';
import type { CheckContext, CheckResult, Severity, StandardCheck, Violation } from '../types.js';
import { HasMarkerNear } from '../lib/markers.js';
import { FindPackageDirs, FindSourceFiles } from '../lib/walk.js';

type TypeScriptApi = typeof TSApi;

// ─────────────────────────────────────────────────────────────────────────────
// The parser, as an optional peer dependency
// ─────────────────────────────────────────────────────────────────────────────

let typeScriptLoad: Promise<TypeScriptApi | null> | undefined;

/**
 * Resolve `typescript`, or `null` if the host repo does not have it.
 *
 * A dynamic import under category 2 of the repo's dynamic-import rule — an **optional peer
 * dependency**, declared as such in this package's `package.json`. This package is installed into
 * client repos to run in their CI, and pinning a hard `typescript` version there is exactly the
 * dependency conflict the "no runtime dependencies" design note exists to avoid. Every repo that
 * has TypeScript source already has the compiler; one that does not has nothing for this check to
 * read, so a clean skip is the right answer rather than a failed install.
 *
 * Memoized, so a run parses the module once rather than per file.
 */
function loadTypeScript(): Promise<TypeScriptApi | null> {
    typeScriptLoad ??= import('typescript')
        .then((mod) => ((mod as { default?: TypeScriptApi }).default ?? mod) as TypeScriptApi)
        .catch(() => null);
    return typeScriptLoad;
}

// ─────────────────────────────────────────────────────────────────────────────
// What gets read
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * Directories never descended into.
 *
 * `generated` and `.claude` are the two that actually matter here. Committed CodeGen output is
 * regenerated from a template, so a finding in it is unfixable in place — the fix belongs in the
 * generator — and `mj codegen` would revert any edit on its next run. `.claude/worktrees` holds
 * full duplicate checkouts of the repo, which would double every count.
 */
const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
    '.angular',
    'coverage',
    'generated',
    '.claude',
    '.turbo',
]);

const ALLOW_MARKER = 'case-violation-ok-legacy-back-compat';

const DECLARATION_FILE = /\.d\.[mc]?ts$/;
const TEST_FILE = /\.(test|spec)\.[mc]?tsx?$/;
const TEST_DIR = /[\\/]__tests__[\\/]/;

// ─────────────────────────────────────────────────────────────────────────────
// Name shapes
// ─────────────────────────────────────────────────────────────────────────────

/** `Foo`, `FooBar`, `HTTPClient` — an initial capital and nothing but letters and digits after. */
export function IsPascalCase(name: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/**
 * `MAX_ROWS`, `PREFS_KEY`, `URL` — a constant, not a misnamed member.
 *
 * Accepted wherever a capital would otherwise be a violation, because SCREAMING_SNAKE for constants
 * is universal and MJ uses it heavily: 419 private `static readonly` fields and 700+ exported
 * `const`s. A literal reading of "private members are camelCase" would flag every one of them, and
 * that alone would have made the rule unadoptable.
 */
export function IsScreamingSnake(name: string): boolean {
    return (/^[A-Z][A-Z0-9_]*$/.test(name) && name.includes('_')) || /^[A-Z][A-Z0-9]{1,}$/.test(name);
}

/**
 * The PascalCase form of a name, for the "rename to …" half of a message.
 *
 * Splits on `_` and `-` so `output_config` suggests `OutputConfig` rather than `Output_config`,
 * which is what a naive first-character uppercase produces and which is not PascalCase at all — a
 * suggestion that is itself a violation teaches the reader the wrong rule.
 */
export function SuggestPascalCase(name: string): string {
    const parts = name.replace(/^[^A-Za-z0-9]+/, '').split(/[_-]+/).filter(Boolean);
    if (parts.length === 0) return name;
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

/**
 * Is this name owned by a spec or framework that uses a `$` sigil?
 *
 * `$schema` is the JSON Schema keyword; `$`-prefixed members are conventional in several ecosystems.
 * The sigil is not a casing choice, and PascalCasing it would break the thing that reads it.
 */
function isSigilName(name: string): boolean {
    return name.startsWith('$');
}

/**
 * `destroy$`, `_internalState` — the shape a private member must have.
 *
 * The optional leading underscore is deliberate: `private _config` paired with `public get Config()`
 * is the documented backing-field idiom and appears ~1,960 times. Both it and the bare form are
 * correct; this check does not try to normalise between them.
 */
export function IsPrivateShaped(name: string): boolean {
    return /^_*[a-z$]/.test(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Framework contracts — names whose casing is not ours to choose
// ─────────────────────────────────────────────────────────────────────────────

/** `ngOnInit`, `ngOnDestroy`, `ngAfterViewInit`, … — Angular calls these by name. */
const ANGULAR_LIFECYCLE = /^ng[A-Z]/;

/** Members a JS runtime, the DOM, or a framework invokes by an exact lowercase name. */
const PLATFORM_CONTRACT = new Set([
    // JS / JSON protocols
    'toJSON', 'toString', 'valueOf',
    // Angular ControlValueAccessor + PipeTransform
    'writeValue', 'registerOnChange', 'registerOnTouched', 'setDisabledState', 'transform',
    // Angular guards / interceptors
    'canActivate', 'intercept',
    // Custom elements / Lit
    'connectedCallback', 'disconnectedCallback', 'attributeChangedCallback', 'observedAttributes', 'render',
    // Disposable
    'dispose',
]);

/**
 * React calls these by exact name. The two statics are the dangerous ones: React reads them
 * into a local and calls them UNBOUND (`var f = fiber.type.getDerivedStateFromError; f(error)`),
 * so a `@deprecated` stub forwarding through `this` throws instead of delegating — and for
 * `getDerivedStateFromError` it throws while handling a child's error, unmounting the tree.
 *
 * These are exempt unconditionally rather than behind a `React.Component` heritage test, because
 * a boundary built against an injected React (`extends (React as any).Component`) has no typed
 * base class for the contract index to see.
 */
const REACT_LIFECYCLE = new Set([
    // Statics — invoked unbound, so a delegating stub cannot work at all
    'getDerivedStateFromError', 'getDerivedStateFromProps',
    // Instance lifecycle
    'componentDidCatch', 'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
    'shouldComponentUpdate', 'getSnapshotBeforeUpdate',
    // Legacy lifecycle, still honoured by React
    'componentWillMount', 'componentWillReceiveProps', 'componentWillUpdate',
    'UNSAFE_componentWillMount', 'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate',
    // Statics React reads off the class
    'defaultProps', 'displayName', 'contextType', 'contextTypes', 'propTypes',
]);

/** oclif reads these off a `Command` subclass, and calls `run()` by name. */
const OCLIF_MEMBERS = new Set([
    'run', 'flags', 'args', 'description', 'examples', 'topic', 'aliases',
    'hidden', 'strict', 'usage', 'baseFlags', 'summary', 'enableJsonFlag',
]);

/** `Error` subclasses inherit these; renaming one breaks `instanceof` reporting. */
const ERROR_MEMBERS = new Set(['name', 'message', 'stack', 'cause']);

/** Decorators that let a framework bind a member under a name of its own choosing. */
const EXEMPT_MEMBER_DECORATORS = new Set(['HostListener', 'HostBinding']);

/** MJ's own generated system columns. Their casing comes from the database, not from style. */
const MJ_SYSTEM_PREFIX = '__mj_';

/**
 * Every line that carries the NAME of a `@deprecated` declaration.
 *
 * This is the exclusion that makes the cleanup possible. The fix for a violating public symbol is
 * to rename it and leave the old name behind as a deprecated stub delegating to the new one — so
 * the old name is *supposed* to keep its old casing, and flagging it would make the fix itself a
 * violation. MJ already writes exactly this shim (`SQLServerDataProvider.ts:424` is a literal
 * camelCase/PascalCase deprecated pair), so the tag is the natural marker.
 *
 * Collected per file up front rather than tested per finding, because the tag sits on a node the
 * finding does not carry — a `VariableStatement`'s JSDoc governs names declared one level below it.
 *
 * NOTE: `ts.getJSDocTags` reads `node.jsDoc`, which is only populated when the file was parsed with
 * `setParentNodes: true`. Parsing without it returns an empty tag list for every node — silently,
 * which would turn this whole exclusion into a no-op.
 */
function deprecatedNameLines(ts: TypeScriptApi, source: TSApi.SourceFile): Set<number> {
    const lines = new Set<number>();
    const isDeprecated = (node: TSApi.Node): boolean => {
        try {
            return ts.getJSDocTags(node).some((tag) => tag.tagName.text === 'deprecated');
        } catch {
            return false;
        }
    };
    const visit = (node: TSApi.Node): void => {
        if (isDeprecated(node)) {
            if (ts.isVariableStatement(node)) {
                // The tag is on the statement; the names are on its declarations.
                for (const declaration of node.declarationList.declarations) {
                    if (ts.isIdentifier(declaration.name)) lines.add(lineOf(source, declaration.name));
                }
            } else {
                const named = node as TSApi.Node & { name?: TSApi.Node };
                if (named.name && ts.isIdentifier(named.name)) lines.add(lineOf(source, named.name));
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
    return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes used while walking
// ─────────────────────────────────────────────────────────────────────────────

/** One finding, before it is given a file and a package. */
interface Finding {
    Line: number;
    Message: string;
    /**
     * For a finding on the member of an exported type: the declaration that owns it.
     *
     * Present only when the owning type is a plain data shape — not one a class implements, and so
     * with no runtime carrier that could hold both an old and a new name. `Run` uses it to decide
     * whether this finding has a compatible fix at all; see the severity model there.
     */
    DataShapeOwner?: string;
}

/** The syntactic facts about the class a member belongs to. */
interface ClassContext {
    /** Names in the `extends` clause, unqualified and stripped of type arguments. */
    Extends: string[];
    /** Names in the `implements` clause. An implemented interface dictates member names too. */
    Implements: string[];
    /** True when the class extends something whose name ends `Command` — an oclif command. */
    IsOclifCommand: boolean;
    /** True when the class extends something whose name ends `Error`. */
    IsErrorSubclass: boolean;
}

/** Everything a file needs in order to be judged. */
interface FileContext {
    Ts: TypeScriptApi;
    Source: TSApi.SourceFile;
    /** Original text, split into lines — allow-markers live in comments, so this is not stripped. */
    Lines: string[];
    /** Member names declared by classes that something in the repo extends. */
    Contract: ReadonlySet<string>;
    /** Names of interfaces some class in the repo `implements`. */
    Implemented: ReadonlySet<string>;
    /** Mutable tally of findings dropped because their declaration is `@deprecated`. */
    DeprecatedSuppressed: { Count: number };
    AllowedNames: ReadonlySet<string>;
    AllowedPrefixes: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — the inherited-contract index
// ─────────────────────────────────────────────────────────────────────────────

/** Walk every class declaration/expression in a source file. */
function forEachClass(ts: TypeScriptApi, source: TSApi.SourceFile, visit: (node: TSApi.ClassLikeDeclaration) => void): void {
    const walk = (node: TSApi.Node): void => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) visit(node);
        ts.forEachChild(node, walk);
    };
    ts.forEachChild(source, walk);
}

/** `Foo<Bar>` / `ns.Foo` → `Foo`. */
function heritageName(type: TSApi.ExpressionWithTypeArguments, source: TSApi.SourceFile): string {
    return type.expression.getText(source).replace(/<[\s\S]*$/, '').split('.').pop() ?? '';
}

/** The `extends` names of a class or interface, unqualified. */
function extendsNames(
    ts: TypeScriptApi,
    node: TSApi.ClassLikeDeclaration | TSApi.InterfaceDeclaration,
    source: TSApi.SourceFile,
): string[] {
    const names: string[] = [];
    for (const clause of node.heritageClauses ?? []) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const type of clause.types) names.push(heritageName(type, source));
    }
    return names;
}

/** The `implements` names of a class, unqualified. */
function implementsNames(ts: TypeScriptApi, node: TSApi.ClassLikeDeclaration, source: TSApi.SourceFile): string[] {
    const names: string[] = [];
    for (const clause of node.heritageClauses ?? []) {
        if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
        for (const type of clause.types) names.push(heritageName(type, source));
    }
    return names;
}

/**
 * Every member name declared by a class that something else in the repo `extends`.
 *
 * This is what stands in for a type checker. A subclass member that matches a name its base class
 * declares is honouring a contract, not choosing a name — and renaming it would break the override.
 * Roughly 1,580 members in MJ are in this position.
 *
 * `override` alone is not enough to detect them: only ~130 of those 1,580 carry the keyword, because
 * TypeScript does not require it unless `noImplicitOverride` is on. So the index is built by name,
 * which over-exempts slightly (a subclass coining a name that coincides with an unrelated base
 * class's member) in exchange for not producing ~1,450 unfixable findings. That trade is the right
 * way round: a gate that cries wolf gets disabled, and the marker is there for the rest.
 */
function buildIndexes(ts: TypeScriptApi, parsedFiles: ReadonlyArray<TSApi.SourceFile>): { Contract: Set<string>; Implemented: Set<string> } {
    const inherited = new Set<string>();
    const implemented = new Set<string>();
    const membersByType = new Map<string, string[]>();

    const record = (name: string, members: ReadonlyArray<{ name?: TSApi.Node }>): void => {
        const names: string[] = [];
        for (const member of members) {
            if (member.name && ts.isIdentifier(member.name)) names.push(member.name.text);
        }
        membersByType.set(name, names);
    };

    for (const source of parsedFiles) {
        forEachClass(ts, source, (node) => {
            // `implements` counts as well as `extends`: an interface a class implements dictates
            // that class's member names just as firmly as a base class does.
            for (const name of extendsNames(ts, node, source)) inherited.add(name);
            for (const name of implementsNames(ts, node, source)) {
                inherited.add(name);
                implemented.add(name);
            }
            if (node.name) record(node.name.text, node.members);
        });
        // Interfaces are indexed too, so `interface B extends A` lets B inherit A's names.
        for (const statement of source.statements) {
            if (!ts.isInterfaceDeclaration(statement)) continue;
            for (const name of extendsNames(ts, statement, source)) inherited.add(name);
            record(statement.name.text, statement.members);
        }
    }

    const contract = new Set<string>();
    for (const [typeName, names] of membersByType) {
        if (!inherited.has(typeName)) continue;
        for (const name of names) contract.add(name);
    }
    return { Contract: contract, Implemented: implemented };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 — the rules
// ─────────────────────────────────────────────────────────────────────────────

/** Modifier kinds on a node, or an empty list where modifiers are not possible. */
function modifierKinds(ts: TypeScriptApi, node: TSApi.Node): TSApi.SyntaxKind[] {
    if (!ts.canHaveModifiers(node)) return [];
    return (ts.getModifiers(node) ?? []).map((m) => m.kind);
}

/** Decorator names on a node — `@Input()` and `@Input` both yield `Input`. */
function decoratorNames(ts: TypeScriptApi, node: TSApi.Node, source: TSApi.SourceFile): string[] {
    if (!ts.canHaveDecorators(node)) return [];
    return (ts.getDecorators(node) ?? []).map((d) => d.expression.getText(source).replace(/[(<][\s\S]*$/, ''));
}

/** 1-based line of a node. */
function lineOf(source: TSApi.SourceFile, node: TSApi.Node): number {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

/** Repo-level additions to the built-in allowlist. */
function isRepoAllowed(name: string, context: FileContext): boolean {
    return context.AllowedNames.has(name) || context.AllowedPrefixes.some((p) => name.startsWith(p));
}

/**
 * Is this member's name dictated by something other than MJ style?
 *
 * Every branch here corresponds to a measured false-positive class in the MJ repo, not a
 * hypothetical one — the counts are in `guides/NAMING_CONVENTIONS_GUIDE.md`.
 */
function isContractName(
    name: string,
    member: TSApi.ClassElement,
    classContext: ClassContext,
    context: FileContext,
): boolean {
    const { Ts: ts, Source: source } = context;
    if (ANGULAR_LIFECYCLE.test(name)) return true;
    if (PLATFORM_CONTRACT.has(name)) return true;
    if (REACT_LIFECYCLE.has(name)) return true;
    if (name.startsWith(MJ_SYSTEM_PREFIX)) return true;
    if (classContext.IsOclifCommand && OCLIF_MEMBERS.has(name)) return true;
    if (classContext.IsErrorSubclass && ERROR_MEMBERS.has(name)) return true;
    if (decoratorNames(ts, member, source).some((d) => EXEMPT_MEMBER_DECORATORS.has(d))) return true;
    if (isRepoAllowed(name, context)) return true;

    // Honouring a base class's name. The `override` keyword is the explicit signal; the index
    // catches the ~92% of real overrides that omit it.
    const kinds = modifierKinds(ts, member);
    if (kinds.includes(ts.SyntaxKind.OverrideKeyword)) return true;
    const hasHeritage = classContext.Extends.length > 0 || classContext.Implements.length > 0;
    return hasHeritage && context.Contract.has(name);
}

/** Members that carry a name we could judge. Constructors and index signatures do not. */
function isNamedMember(ts: TypeScriptApi, member: TSApi.ClassElement): member is TSApi.ClassElement & { name: TSApi.Identifier } {
    if (ts.isConstructorDeclaration(member)) return false;
    // A non-`Identifier` name is computed, a string literal, or `[Symbol.iterator]` — in every case
    // the name is not a style choice, so there is nothing to enforce.
    return !!member.name && ts.isIdentifier(member.name);
}

/** Judge one class member. Returns a message, or `null` when it is fine or exempt. */
function checkMember(member: TSApi.ClassElement & { name: TSApi.Identifier }, classContext: ClassContext, context: FileContext): string | null {
    const ts = context.Ts;
    const kinds = modifierKinds(ts, member);
    const name = member.name.text;

    // `protected` is not checked at all — see the file header.
    if (kinds.includes(ts.SyntaxKind.ProtectedKeyword)) return null;

    if (kinds.includes(ts.SyntaxKind.PrivateKeyword)) {
        if (IsPrivateShaped(name) || IsScreamingSnake(name.replace(/^_+/, ''))) return null;
        if (isRepoAllowed(name, context)) return null;
        const suggestion = name.replace(/^(_*)([A-Z])/, (_, u: string, c: string) => u + c.toLowerCase());
        return `private member "${name}" is PascalCase — private members are camelCase; rename to "${suggestion}"`;
    }

    // Everything else is public: TypeScript's default visibility is public, so a member with no
    // access modifier is part of the class's API surface just as much as an explicit `public` one.
    if (IsPascalCase(name) || IsScreamingSnake(name) || isSigilName(name)) return null;
    if (isContractName(name, member, classContext, context)) return null;
    return `public member "${name}" is not PascalCase — rename to "${SuggestPascalCase(name)}"`;
}

/** Judge every member of one class. */
function checkClass(node: TSApi.ClassLikeDeclaration, context: FileContext): Finding[] {
    const ts = context.Ts;
    const extendsList = extendsNames(ts, node, context.Source);
    const classContext: ClassContext = {
        Extends: extendsList,
        Implements: implementsNames(ts, node, context.Source),
        IsOclifCommand: extendsList.some((e) => /Command$/.test(e)),
        IsErrorSubclass: extendsList.some((e) => /Error$/.test(e)),
    };

    const findings: Finding[] = [];
    const record = (node2: TSApi.Node, message: string | null): void => {
        if (!message) return;
        const line = lineOf(context.Source, node2);
        if (HasMarkerNear(context.Lines, line, ALLOW_MARKER)) return;
        findings.push({ Line: line, Message: message });
    };

    for (const member of node.members) {
        if (ts.isConstructorDeclaration(member)) {
            findings.push(...checkParameterProperties(member, classContext, context));
            continue;
        }
        if (!isNamedMember(ts, member)) continue;
        record(member.name, checkMember(member, classContext, context));
    }
    return findings;
}

/**
 * Judge `constructor(public Foo: X, private bar: Y)`.
 *
 * A parameter property declares a class member, so it follows the member rule — a `public` one is
 * part of the class's API surface exactly as a field is. A parameter with no access modifier is an
 * ordinary parameter, not a member, and is left alone.
 */
function checkParameterProperties(
    constructorNode: TSApi.ConstructorDeclaration,
    classContext: ClassContext,
    context: FileContext,
): Finding[] {
    const ts = context.Ts;
    const findings: Finding[] = [];
    for (const parameter of constructorNode.parameters) {
        const kinds = modifierKinds(ts, parameter);
        if (kinds.length === 0) continue;
        if (!ts.isIdentifier(parameter.name)) continue;
        const name = parameter.name.text;

        let message: string | null = null;
        if (kinds.includes(ts.SyntaxKind.ProtectedKeyword)) {
            message = null;
        } else if (kinds.includes(ts.SyntaxKind.PrivateKeyword)) {
            if (!IsPrivateShaped(name) && !IsScreamingSnake(name.replace(/^_+/, '')) && !isRepoAllowed(name, context)) {
                const suggestion = name.replace(/^(_*)([A-Z])/, (_, u: string, c: string) => u + c.toLowerCase());
                message = `private parameter property "${name}" is PascalCase — private members are camelCase; rename to "${suggestion}"`;
            }
        } else if (!IsPascalCase(name) && !IsScreamingSnake(name) && !isSigilName(name)) {
            const hasHeritage = classContext.Extends.length > 0 || classContext.Implements.length > 0;
            const exempt = isRepoAllowed(name, context) || (hasHeritage && context.Contract.has(name));
            if (!exempt) {
                message = `public parameter property "${name}" is not PascalCase — rename to "${SuggestPascalCase(name)}"`;
            }
        }
        if (!message) continue;
        const line = lineOf(context.Source, parameter.name);
        if (HasMarkerNear(context.Lines, line, ALLOW_MARKER)) continue;
        findings.push({ Line: line, Message: message });
    }
    return findings;
}

/**
 * Judge the members of an exported interface, type literal, or enum.
 *
 * An exported type's members ARE the package's API surface — a consumer writes
 * `params.maxTokens`, and the property name is as much a published contract as a class's public
 * field. So the same PascalCase rule applies. Only **exported** types are judged: an internal
 * `interface Options` nobody outside the module can name is an implementation detail, and the
 * public-API-surface principle the whole convention rests on does not reach it.
 *
 * `SCREAMING_SNAKE` is accepted for the same reason it is on a class — constants. Enum members are
 * overwhelmingly one or the other already.
 */
function checkTypeMembers(
    members: ReadonlyArray<TSApi.TypeElement | TSApi.EnumMember>,
    kindLabel: string,
    hasHeritage: boolean,
    context: FileContext,
    ownerName?: string,
): Finding[] {
    const ts = context.Ts;
    const findings: Finding[] = [];
    for (const member of members) {
        // Index signatures, computed keys and string-literal keys carry no name we could judge.
        if (!member.name || !ts.isIdentifier(member.name)) continue;
        const name = member.name.text;
        if (IsPascalCase(name) || IsScreamingSnake(name) || isSigilName(name)) continue;
        if (name.startsWith(MJ_SYSTEM_PREFIX)) continue;
        if (PLATFORM_CONTRACT.has(name)) continue;
        if (isRepoAllowed(name, context)) continue;
        // `interface B extends A` must keep A's names, exactly as a subclass must.
        if (hasHeritage && context.Contract.has(name)) continue;
        const line = lineOf(context.Source, member.name);
        if (HasMarkerNear(context.Lines, line, ALLOW_MARKER)) continue;
        // An interface a class implements HAS a runtime carrier: the class can hold both the old and
        // the new name, so renaming the interface member is fixable without breaking anyone. A plain
        // data shape has no such carrier, which is what `DataShapeOwner` marks.
        const isDataShape = !ownerName || !context.Implemented.has(ownerName);
        findings.push({
            Line: line,
            Message: `exported ${kindLabel} member "${name}" is not PascalCase — rename to "${SuggestPascalCase(name)}"`,
            ...(isDataShape && ownerName ? { DataShapeOwner: ownerName } : {}),
        });
    }
    return findings;
}

/** Every object-literal type reachable inside an exported type alias, including nested ones. */
function collectTypeLiterals(ts: TypeScriptApi, node: TSApi.Node): TSApi.TypeLiteralNode[] {
    const found: TSApi.TypeLiteralNode[] = [];
    const walk = (current: TSApi.Node): void => {
        if (ts.isTypeLiteralNode(current)) found.push(current);
        ts.forEachChild(current, walk);
    };
    walk(node);
    return found;
}

/**
 * Judge an `export { Foo, bar }` list.
 *
 * A named export list publishes a name under the module's API surface just as `export function`
 * does, so the same rule applies. This is a distinct AST node with no `export` modifier of its own,
 * which is why it needs its own branch rather than falling out of the modifier check.
 *
 * Re-exports (`export { x } from './y'`) are skipped: the name belongs to the module it came from
 * and is judged there, and a barrel file cannot fix it.
 */
function checkExportList(statement: TSApi.ExportDeclaration, context: FileContext): Finding[] {
    const ts = context.Ts;
    if (statement.moduleSpecifier) return [];
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) return [];
    const findings: Finding[] = [];
    for (const element of statement.exportClause.elements) {
        const name = element.name.text;
        if (IsPascalCase(name) || IsScreamingSnake(name) || isSigilName(name) || isRepoAllowed(name, context)) continue;
        const line = lineOf(context.Source, element.name);
        if (HasMarkerNear(context.Lines, line, ALLOW_MARKER)) continue;
        findings.push({
            Line: line,
            Message: `exported name "${name}" is not PascalCase — rename to "${SuggestPascalCase(name)}"`,
        });
    }
    return findings;
}

/**
 * Judge one exported module-scope declaration.
 *
 * Exported *functions* are the rule this settles: MJ was split 1,388 PascalCase to 2,047 camelCase
 * with nothing written down either way, so the public-API-surface-is-PascalCase reading wins for
 * consistency with class members. A `const` holding an arrow function is a function by any useful
 * definition and follows the same rule; a `const` holding a value may be PascalCase or
 * SCREAMING_SNAKE, which is what 96% of them already are.
 */
function checkExportedStatement(statement: TSApi.Statement, context: FileContext): Finding[] {
    const ts = context.Ts;
    // An `export { ... }` list has no export MODIFIER, so it is handled before the modifier gate.
    if (ts.isExportDeclaration(statement)) return checkExportList(statement, context);
    if (!modifierKinds(ts, statement).includes(ts.SyntaxKind.ExportKeyword)) return [];
    const findings: Finding[] = [];
    const flag = (node: TSApi.Node, message: string): void => {
        const line = lineOf(context.Source, node);
        if (HasMarkerNear(context.Lines, line, ALLOW_MARKER)) return;
        findings.push({ Line: line, Message: message });
    };
    const pascalize = SuggestPascalCase;

    if (ts.isFunctionDeclaration(statement) && statement.name && !IsPascalCase(statement.name.text)) {
        const name = statement.name.text;
        if (!isRepoAllowed(name, context) && !isSigilName(name)) {
            flag(statement.name, `exported function "${name}" is not PascalCase — rename to "${pascalize(name)}"`);
        }
    }

    const typeDeclaration =
        (ts.isClassDeclaration(statement) && 'class') ||
        (ts.isInterfaceDeclaration(statement) && 'interface') ||
        (ts.isTypeAliasDeclaration(statement) && 'type') ||
        (ts.isEnumDeclaration(statement) && 'enum');
    if (typeDeclaration && statement.name && ts.isIdentifier(statement.name) && !IsPascalCase(statement.name.text)) {
        const name = statement.name.text;
        if (!isRepoAllowed(name, context)) {
            flag(statement.name, `exported ${typeDeclaration} "${name}" is not PascalCase — rename to "${pascalize(name)}"`);
        }
    }

    if (ts.isInterfaceDeclaration(statement)) {
        const hasHeritage = extendsNames(ts, statement, context.Source).length > 0;
        findings.push(...checkTypeMembers(statement.members, 'interface', hasHeritage, context, statement.name.text));
    }
    if (ts.isTypeAliasDeclaration(statement)) {
        for (const literal of collectTypeLiterals(ts, statement.type)) {
            findings.push(...checkTypeMembers(literal.members, 'type', false, context, statement.name.text));
        }
    }
    if (ts.isEnumDeclaration(statement)) {
        findings.push(...checkTypeMembers(statement.members, 'enum', false, context, statement.name.text));
    }

    if (ts.isVariableStatement(statement)) {
        const keyword = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 ? 'const' : 'binding';
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) continue;
            const name = declaration.name.text;
            if (isRepoAllowed(name, context)) continue;
            const initializer = declaration.initializer;
            const isFunction = !!initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
            if (isFunction) {
                if (!IsPascalCase(name)) {
                    flag(declaration.name, `exported function "${name}" is not PascalCase — rename to "${pascalize(name)}"`);
                }
            } else if (!IsPascalCase(name) && !IsScreamingSnake(name)) {
                flag(declaration.name, `exported ${keyword} "${name}" is neither PascalCase nor SCREAMING_SNAKE_CASE`);
            }
        }
    }

    return findings;
}

/** Judge one file. */
export function CheckSourceFile(context: FileContext): Finding[] {
    const findings: Finding[] = [];
    forEachClass(context.Ts, context.Source, (node) => findings.push(...checkClass(node, context)));
    for (const statement of context.Source.statements) findings.push(...checkExportedStatement(statement, context));

    // A `@deprecated` declaration is a back-compat stub keeping an old name alive on purpose. Its
    // casing is the whole point, so it is not a violation. Counted by the caller so the number of
    // suppressions stays visible rather than becoming a quiet hiding place.
    const deprecated = deprecatedNameLines(context.Ts, context.Source);
    context.DeprecatedSuppressed.Count += findings.filter((f) => deprecated.has(f.Line)).length;
    // A message that suggests renaming a name to itself is noise at best and teaches the wrong rule
    // at worst. It means the name is one this check cannot express an opinion about, so drop it.
    return findings
        .filter((f) => !deprecated.has(f.Line))
        .filter((f) => !/rename to "([^"]+)"$/.test(f.Message) || !isNoOpSuggestion(f.Message))
        .sort((a, b) => a.Line - b.Line);
}

/**
 * Does a `rename to "X"` message suggest the name it is already complaining about?
 *
 * Read as two anchored halves rather than one pattern spanning the middle. A single
 * `"([^"]+)" is .*rename to "([^"]+)"$` puts an unbounded `.*` between two character classes and an
 * end anchor, which backtracks polynomially — the message is assembled from source identifiers, so
 * its length is not something this check controls.
 */
function isNoOpSuggestion(message: string): boolean {
    const declared = /^[^"]*"([^"]+)" is /.exec(message);
    if (!declared) return false;
    const suggested = /rename to "([^"]+)"$/.exec(message);
    return !!suggested && declared[1] === suggested[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// What a package actually publishes
// ─────────────────────────────────────────────────────────────────────────────

/** Every string that looks like a module path inside an `exports` subtree. */
function collectExportTargets(node: unknown, out: string[]): void {
    if (typeof node === 'string') {
        out.push(node);
        return;
    }
    if (Array.isArray(node)) {
        for (const item of node) collectExportTargets(item, out);
        return;
    }
    if (node && typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) collectExportTargets(value, out);
    }
}

/**
 * The source files a package's published entry points are built from.
 *
 * `main`/`types` point into `dist`, which this check never reads — it works on source — so each
 * published path is mapped back to its `src` counterpart.
 *
 * **Every** entry counts, not just the root one. A package with an `exports` map publishes one
 * module per subpath, and a type reachable only from `"./forms"` is every bit as public as one
 * reachable from `"."` — consumers import it as `@scope/pkg/forms`. Reading only `types`/`main`
 * declares those types unpublished and therefore free to rename, which is exactly backwards.
 */
function resolveEntrySources(packageDir: string): { Entries: string[]; Private: boolean } {
    let manifest: { main?: string; types?: string; typings?: string; private?: boolean; exports?: unknown };
    try {
        manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as typeof manifest;
    } catch {
        return { Entries: [], Private: false };
    }
    const isPrivate = manifest.private === true;
    const raw: string[] = [];
    for (const field of [manifest.types, manifest.typings, manifest.main]) {
        if (typeof field === 'string') raw.push(field);
    }
    collectExportTargets(manifest.exports, raw);

    const candidates = raw.map((field) =>
        field.replace(/^\.\//, '').replace(/^dist\//, 'src/').replace(/\.d\.ts$|\.js$/, '.ts'),
    );
    const entries: string[] = [];
    const seen = new Set<string>();
    const take = (candidate: string): void => {
        const full = join(packageDir, candidate);
        if (seen.has(full)) return;
        if (existsSync(full) && statSync(full).isFile()) {
            seen.add(full);
            entries.push(full);
        }
    };
    for (const candidate of candidates) take(candidate);
    if (entries.length === 0) {
        for (const fallback of ['src/index.ts', 'src/public-api.ts', 'src/public_api.ts', 'index.ts']) take(fallback);
    }
    return { Entries: entries, Private: isPrivate };
}

/** Resolve a relative module specifier to a source file on disk. */
function resolveRelativeImport(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), specifier).replace(/\.js$/, '');
    for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

/**
 * Every symbol name a package publishes, reached transitively from its entry points.
 *
 * This is what separates "exported from its file" from "exported from the package" — and the two
 * are very different for this rule. A type no consumer can name can be renamed outright; one the
 * package publishes cannot, because an interface has no runtime carrier to hold both names. Only
 * the second kind is a compatibility problem.
 *
 * Follows `export * from './x'` into the target file. A named re-export contributes both its
 * exported name and, when it is aliased, the source name the declaration actually carries.
 * A re-export from another *package* is not followed: that name belongs to the package it came
 * from and is judged there.
 */
function collectPublicSymbols(
    ts: TypeScriptApi,
    entryFiles: readonly string[],
    sourceOf: (file: string) => TSApi.SourceFile | null,
): Set<string> {
    const names = new Set<string>();
    const seen = new Set<string>();
    const queue = [...entryFiles];
    while (queue.length > 0) {
        const file = queue.shift() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = sourceOf(file);
        if (!source) continue;
        for (const statement of source.statements) {
            if (ts.isExportDeclaration(statement)) {
                const specifier =
                    statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
                        ? statement.moduleSpecifier.text
                        : null;
                if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
                    for (const element of statement.exportClause.elements) {
                        // Both halves of `export { Source as Alias }`. Consumers import the ALIAS,
                        // so it is published — but a finding on a member carries the name of the
                        // DECLARATION that owns it (`DataShapeOwner`), which is the source half.
                        // Recording only the alias makes `severityFor` miss the match and return
                        // `error`, and an `error` type member is what the rename pass selects —
                        // so a published member would be renamed with no stub possible.
                        names.add(element.name.text);
                        if (element.propertyName) names.add(element.propertyName.text);
                    }
                } else if (!statement.exportClause && specifier) {
                    const target = resolveRelativeImport(file, specifier);
                    if (target) queue.push(target);
                }
                continue;
            }
            if (!modifierKinds(ts, statement).includes(ts.SyntaxKind.ExportKeyword)) continue;
            if (ts.isVariableStatement(statement)) {
                for (const declaration of statement.declarationList.declarations) {
                    if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
                }
            } else {
                const named = statement as TSApi.Statement & { name?: TSApi.Node };
                if (named.name && ts.isIdentifier(named.name)) names.add(named.name.text);
            }
        }
    }
    return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

function stringArrayOption(options: CheckContext['Options'], key: string): string[] {
    const raw = options[key];
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === 'string');
}

/** Normalise a repo-relative path for prefix comparison on any platform. */
function toPosix(path: string): string {
    return path.split('\\').join('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────

/** The registered naming-convention standard. */
export const NamingConventionsCheck: StandardCheck = {
    Id: 'naming-conventions',
    Title: 'Public class members and exported symbols are PascalCase; private members are camelCase',
    Since: '6.2.0',
    DefaultSeverity: 'warn',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/guides/NAMING_CONVENTIONS_GUIDE.md',
    Description:
        'MJ inverts the usual TypeScript convention: public class members and exported symbols are PascalCase, ' +
        'private members are camelCase (a leading underscore is fine). Framework contracts — Angular lifecycle ' +
        'hooks, oclif command members, base-class override points, SCREAMING_SNAKE constants — are exempt. ' +
        'Severity follows whether a compatible fix exists: anything a @deprecated delegating stub can fix is an ' +
        'error; members of an exported data shape are a warn, since an interface has no runtime carrier for a stub.',
    DefaultRoots: ['packages'],
    DefaultOptions: {
        /**
         * Promote data-shape findings from `warn` to `error`.
         *
         * Off by default because those findings have **no compatible fix** — see the severity model
         * in `Run`. Turning it on accepts a **breaking change** to this repo's published types:
         * every external consumer naming one of those properties stops compiling, and no stub can
         * carry the old name because an interface has no runtime carrier.
         *
         * It exists for a repository whose types are internal, or that is pre-1.0 and willing to
         * take the break. A repo with published consumers should leave it off.
         */
        enforceTypeMembers: false,
        /** Include `*.test.ts` / `*.spec.ts` / `__tests__`. Off: tests mimic third-party APIs on purpose. */
        includeTests: false,
        /** Exact member/export names this repo accepts regardless of shape. */
        allowedNames: [] as string[],
        /** Name prefixes this repo accepts regardless of shape, e.g. `__mj_`. */
        allowedPrefixes: [] as string[],
    },

    /**
     * ## The severity model
     *
     * Severity is derived from **whether a finding can be fixed without breaking a consumer**, not
     * from which package it is in. That is the only axis that makes a hard-failing gate honest here.
     *
     * Almost everything is fixable: a class member, an exported function, an exported const — all
     * of them have a runtime object that can carry the new name *and* keep the old one as a
     * `@deprecated` stub delegating to it. Those are `error`.
     *
     * The exception is a member of an **exported data shape** — an interface, type literal or enum
     * that no class implements. An interface is erased at compile time, so there is no carrier and
     * no stub: renaming the member simply breaks anyone who names it. Keeping both members does not
     * help either, because making them optional to stay compatible is what destroys the type safety
     * the interface existed for. Those are `warn` — visible, counted, but not something the build
     * can demand — unless `enforceTypeMembers` says otherwise.
     */
    async Run(context: CheckContext): Promise<CheckResult> {
        const ts = await loadTypeScript();
        if (!ts) {
            return {
                Violations: [],
                Notes: ['typescript could not be resolved — naming-conventions skipped. Install it to enable this check.'],
            };
        }

        const includeTests = context.Options['includeTests'] === true;
        const enforceTypeMembers = context.Options['enforceTypeMembers'] === true;
        const allowedNames = new Set(stringArrayOption(context.Options, 'allowedNames'));
        const allowedPrefixes = stringArrayOption(context.Options, 'allowedPrefixes');

        const isExcludedFile = (file: string): boolean => {
            if (DECLARATION_FILE.test(file)) return true;
            if (includeTests) return false;
            return TEST_FILE.test(file) || TEST_DIR.test(toPosix(file));
        };

        // Collect every file first, so pass 1 can index base classes that live in other packages.
        const packages: Array<{ Dir: string; Rel: string; Files: string[]; Public: Set<string> | null; Private: boolean }> = [];
        for (const root of context.Roots) {
            for (const dir of FindPackageDirs(join(context.RepoRoot, root), { SkipDirs: SKIP_DIRS })) {
                const files = FindSourceFiles(dir, {
                    SkipDirs: SKIP_DIRS,
                    Extensions: SOURCE_EXTENSIONS,
                    Exclude: isExcludedFile,
                });
                if (files.length > 0) packages.push({ Dir: dir, Rel: toPosix(relative(context.RepoRoot, dir)), Files: files, Public: null, Private: false });
            }
        }

        // A file can sit in more than one package's walk when packages nest, and parsing it twice
        // would report it twice. The innermost package wins, which is the one that owns the file.
        const ownerByFile = new Map<string, string>();
        for (const pkg of packages) {
            for (const file of pkg.Files) {
                const current = ownerByFile.get(file);
                if (!current || pkg.Rel.length > current.length) ownerByFile.set(file, pkg.Rel);
            }
        }

        // `setParentNodes: true` is required, not incidental: `ts.getJSDocTags` reads `node.jsDoc`,
        // which the parser only attaches when it is on. Without it the `@deprecated` exclusion
        // silently matches nothing. Measured cost over ~7,500 files: 2.1s -> 2.5s.
        const sources = new Map<string, TSApi.SourceFile>();
        const parsed: Array<{ File: string; Source: TSApi.SourceFile; Lines: string[] }> = [];
        for (const file of ownerByFile.keys()) {
            let text: string;
            try {
                text = readFileSync(file, 'utf8');
            } catch {
                continue;
            }
            const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
            sources.set(file, source);
            parsed.push({ File: file, Source: source, Lines: text.split('\n') });
        }

        const sourceOf = (file: string): TSApi.SourceFile | null => {
            const cached = sources.get(file);
            if (cached) return cached;
            try {
                const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
                sources.set(file, source);
                return source;
            } catch {
                return null;
            }
        };

        let packagesWithoutEntry = 0;
        for (const pkg of packages) {
            const { Entries, Private } = resolveEntrySources(pkg.Dir);
            pkg.Private = Private;
            if (Entries.length === 0) {
                if (!Private) packagesWithoutEntry++;
                continue;
            }
            pkg.Public = collectPublicSymbols(ts, Entries, sourceOf);
        }
        const packageByRel = new Map(packages.map((p) => [p.Rel, p]));

        const { Contract, Implemented } = buildIndexes(ts, parsed.map((p) => p.Source));
        const deprecatedSuppressed = { Count: 0 };

        /**
         * A data-shape finding is only a compatibility problem when the owning type is actually
         * published. When the package has no resolvable entry we cannot prove it is unpublished, so
         * it is treated as published — the conservative direction, since the cost of being wrong is
         * demanding a rename that does break someone.
         */
        const severityFor = (finding: Finding, pkgRel: string | undefined): Exclude<Severity, 'off'> => {
            if (!finding.DataShapeOwner || enforceTypeMembers) return 'error';
            const pkg = pkgRel ? packageByRel.get(pkgRel) : undefined;
            if (!pkg) return 'warn';
            // A private package is published to nobody. Nothing outside the repo can name its types,
            // so there is no compatibility to preserve and the rename is free.
            if (pkg.Private) return 'error';
            if (pkg.Public === null) return 'warn';
            return pkg.Public.has(finding.DataShapeOwner) ? 'warn' : 'error';
        };

        const violations: Violation[] = [];
        for (const { File, Source, Lines } of parsed) {
            const pkgRel = ownerByFile.get(File);
            const rel = toPosix(relative(context.RepoRoot, File));
            const findings = CheckSourceFile({
                Ts: ts,
                Source,
                Lines,
                Contract,
                Implemented,
                DeprecatedSuppressed: deprecatedSuppressed,
                AllowedNames: allowedNames,
                AllowedPrefixes: allowedPrefixes,
            });
            for (const finding of findings) {
                violations.push({
                    File: rel,
                    Line: finding.Line,
                    Message: finding.Message,
                    ...(pkgRel ? { Package: pkgRel } : {}),
                    Severity: severityFor(finding, pkgRel),
                });
            }
        }

        return { Violations: violations, Notes: buildNotes(violations, parsed.length, packages.length, packagesWithoutEntry, deprecatedSuppressed.Count) };
    },
};

/**
 * The summary a reader actually needs when there are tens of thousands of findings.
 *
 * A per-package table, because the work is done package by package and a total tells you nothing
 * about where to start. Capped, because the tail is long and the point is orientation.
 */
function buildNotes(
    violations: ReadonlyArray<Violation>,
    fileCount: number,
    packageCount: number,
    packagesWithoutEntry: number,
    deprecatedSuppressed: number,
): string[] {
    const errors = violations.filter((v) => v.Severity === 'error');
    const warnings = violations.length - errors.length;
    const notes = [
        `${fileCount} file(s) in ${packageCount} package(s) scanned — ${errors.length} failing, ${warnings} reported`,
        `${warnings} are members of exported data shapes: an interface has no runtime carrier, so there is no ` +
            'deprecated-stub form for them and no fix that keeps consumers compiling. Renaming them is a ' +
            'breaking change; "enforceTypeMembers" opts into that and is off by default.',
    ];
    if (deprecatedSuppressed > 0) {
        notes.push(`${deprecatedSuppressed} finding(s) suppressed by an @deprecated tag — back-compat stubs, working as intended.`);
    }
    if (packagesWithoutEntry > 0) {
        notes.push(`${packagesWithoutEntry} package(s) have no resolvable entry point; their data shapes are treated as published.`);
    }
    if (errors.length === 0) return notes;

    const byPackage = new Map<string, number>();
    for (const violation of errors) {
        const key = violation.Package ?? '(unattributed)';
        byPackage.set(key, (byPackage.get(key) ?? 0) + 1);
    }
    const ranked = [...byPackage.entries()].sort((a, b) => b[1] - a[1]);
    notes.push(`failing findings span ${ranked.length} package(s); the heaviest:`);
    for (const [name, count] of ranked.slice(0, PACKAGE_TABLE_LIMIT)) {
        notes.push(`  ${String(count).padStart(6)}  ${name}`);
    }
    if (ranked.length > PACKAGE_TABLE_LIMIT) {
        notes.push(`  … and ${ranked.length - PACKAGE_TABLE_LIMIT} more package(s)`);
    }
    return notes;
}

/** How many packages the summary table names before it stops. */
const PACKAGE_TABLE_LIMIT = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Adoption support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Packages that currently have zero violations.
 *
 * Progress tracking for a cleanup campaign: which packages are done. Answers it by running the
 * rules, never by writing to the repo and reverting — the same discipline as
 * `ProbeUndeclaredPackages` in `ui-layers`.
 */
export async function FindCleanPackages(repoRoot: string, roots: string[]): Promise<string[]> {
    const summary = await NamingConventionsCheck.Run({ RepoRoot: repoRoot, Roots: roots, Options: {} });
    const dirty = new Set<string>();
    for (const violation of summary.Violations) if (violation.Package) dirty.add(violation.Package);

    const ts = await loadTypeScript();
    if (!ts) return [];
    const clean: string[] = [];
    for (const root of roots) {
        for (const dir of FindPackageDirs(join(repoRoot, root), { SkipDirs: SKIP_DIRS })) {
            const rel = toPosix(relative(repoRoot, dir));
            const files = FindSourceFiles(dir, {
                SkipDirs: SKIP_DIRS,
                Extensions: SOURCE_EXTENSIONS,
                Exclude: (f) => DECLARATION_FILE.test(f) || TEST_FILE.test(f) || TEST_DIR.test(toPosix(f)),
            });
            if (files.length > 0 && !dirty.has(rel)) clean.push(rel);
        }
    }
    return clean.sort();
}
