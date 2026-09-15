#!/usr/bin/env node
/**
 * @fileoverview Phase B codemod — rename a naming-conventions violation and leave the old name
 * behind as a `@deprecated` delegating stub.
 *
 * This is repo tooling, not part of the published package (`files` in package.json ships only
 * `/dist`, `/bin` and `/schema`). It reads the JSON worklist that `bin/run.js check --json` writes
 * and rewrites the declarations it can fix **without breaking a single consumer**: the new
 * PascalCase name becomes the real declaration, and the old name stays as a stub that forwards to
 * it. Because the gate exempts anything carrying a `@deprecated` JSDoc tag, the finding disappears
 * while the old name keeps working.
 *
 *     node packages/Standards/scripts/naming-codemod.mjs \
 *         --findings findings.json --package packages/SQLConverter [--apply]
 *
 * Without `--apply` it is a dry run: it prints what it would change and what it refuses to touch,
 * and writes nothing.
 *
 * **It refuses more than it fixes, on purpose.** Every shape whose stub is not provably equivalent
 * is skipped and reported rather than guessed at — see SKIP_REASONS. A skipped finding stays in the
 * gate's error list, which is the correct outcome: a human looks at it.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const tsModule = await import('typescript');
/** @type {import('typescript')} */
const ts = tsModule.default ?? tsModule;

/**
 * Why a finding was left alone.
 *
 * Each of these is a shape where a mechanically-generated stub would either fail to compile or —
 * far worse — compile into something subtly different from the original. Guessing is not an option
 * when the whole point of Phase B is that nothing becomes a breaking change.
 */
const SKIP_REASONS = {
    NoDeclarationFound: 'no declaration matched the finding at that line',
    Overloaded: 'overloaded — the stub would have to replicate every signature',
    Generator: 'generator function — a delegating body would return the generator, not yield from it',
    BindingPattern: 'destructured parameter — the stub cannot forward it by name',
    ThisParameter: 'declares a `this` parameter',
    Abstract: 'abstract or bodiless — nothing to delegate to',
    NoTypeAnnotation: 'property has neither a type nor an initializer, so the accessor stub cannot be typed',
    Decorated: 'carries a decorator this codemod does not know how to alias',
    DecoratedAccessor: 'decorated get/set accessor — needs the Angular alias AND the pair rewrite together',
    AliasedBinding: 'already declares an explicit binding alias, which is the contract — renaming the property changes nothing',
    GenericClass: 'untyped member on a generic class, so the alias cannot name its type',
    OptionalProperty: 'optional property — an accessor cannot be optional, so the stub would turn `foo?` into a required member and break every object literal that omits it',
    StructuralClass: 'class is a declared data shape (@ObjectType/@InputType et al), so object literals are assigned to it and an accessor stub changes what they must supply',
    SubclassRedeclares: 'a subclass redeclares this member as a plain property, and TypeScript forbids a property overriding an accessor (TS2610)',
    Overridden: 'a subclass overrides this member, and a @deprecated stub preserves CALLING the old name but not OVERRIDING it — the override would be silently bypassed',
    AncestorDeclares: 'an ancestor class already declares the PascalCase name, so the rename would collide with an inherited member',
    NameClaimedThisRun: 'another member in this class already takes that PascalCase name in this run — `artifact` and `_artifact` both pascalize to `Artifact`',
    NameCollision: 'the PascalCase name is already declared in this scope',
    Declared: '`declare` member — no runtime carrier',
    ConstructorBodyRef: 'parameter property is referenced by bare name inside the constructor',
};

/** Findings this codemod understands. Everything else is reported as out of scope. */
const HANDLED = /^(exported function|public member|public parameter property) "/;

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { findings: null, package: null, apply: false, file: null, limit: Infinity };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--findings') args.findings = argv[++i];
        else if (a === '--package') args.package = argv[++i];
        else if (a === '--file') args.file = argv[++i];
        else if (a === '--limit') args.limit = Number(argv[++i]);
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.findings) throw new Error('--findings <file> is required');
    return args;
}

/** Pull the old and new name out of the check's own message, which always quotes both. */
function namesFrom(message) {
    const quoted = [...message.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (quoted.length < 2) return null;
    return { Old: quoted[0], New: quoted[quoted.length - 1] };
}

// ---------------------------------------------------------------------------------------------
// Edit buffer
// ---------------------------------------------------------------------------------------------

/**
 * A set of text-range replacements applied back-to-front.
 *
 * Text ranges, not a re-printed AST: the TypeScript printer would reformat every file it touched,
 * burying a two-line rename in a thousand-line whitespace diff and making review impossible.
 */
class EditBuffer {
    constructor(text) {
        this.text = text;
        /** @type {{Start:number,End:number,Text:string,Seq:number}[]} */
        this.edits = [];
        this.seq = 0;
    }
    Replace(start, end, text) {
        this.edits.push({ Start: start, End: end, Text: text, Seq: this.seq++ });
    }
    Insert(at, text) {
        this.edits.push({ Start: at, End: at, Text: text, Seq: this.seq++ });
    }
    get Count() {
        return this.edits.length;
    }
    Result() {
        // Descending by start, so an edit never disturbs the offsets of one still to be applied.
        // Two insertions at the SAME point are applied newest-first, because whatever is written
        // last at a position ends up leftmost — without this, two stubs generated for one
        // constructor come out in the opposite order from the parameters that produced them.
        const ordered = [...this.edits].sort((a, b) => b.Start - a.Start || b.End - a.End || b.Seq - a.Seq);
        let out = this.text;
        let lastStart = Infinity;
        for (const e of ordered) {
            if (e.End > lastStart) throw new Error(`overlapping edits at ${e.Start}..${e.End}`);
            out = out.slice(0, e.Start) + e.Text + out.slice(e.End);
            lastStart = e.Start;
        }
        return out;
    }
}

// ---------------------------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------------------------

const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/**
 * The file's own indentation step, so a generated stub matches the code around it.
 *
 * MJ is not uniform here — `Standards` indents by four, `SQLConverter` by two — and a stub that
 * disagrees with its file turns a two-line review into an argument about whitespace. Measured from
 * the smallest non-zero leading-space run in the file, which is the step by construction.
 */
function indentUnit(text) {
    const widths = new Set();
    for (const line of text.split('\n')) {
        if (line.startsWith('\t')) return '\t';
        const body = line.trim();
        // A JSDoc continuation sits one space deep (` * …`) in every file regardless of its real
        // step, so counting those would make every file look one-space indented.
        if (body.length === 0 || body.startsWith('*')) continue;
        const n = /^ */.exec(line)[0].length;
        if (n > 0) widths.add(n);
    }
    if (widths.size === 0) return '    ';
    return ' '.repeat(Math.min(...widths));
}

/** The indentation of the line a node starts on, so an inserted sibling lines up with it. */
function indentOf(text, node, source) {
    const start = node.getStart(source);
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const slice = text.slice(lineStart, start);
    return /^\s*/.exec(slice)[0];
}

/**
 * The declaration text from its first keyword up to (not including) its name.
 *
 * For `export async function foo` this is `export async function `, carrying every modifier
 * verbatim so the stub is declared exactly like the thing it replaces. `getStart` skips leading
 * JSDoc, so the original's doc comment is not dragged along with it.
 */
const prefixBeforeName = (text, node, source) => text.slice(node.getStart(source), node.name.getStart(source));

/**
 * Everything between the name and the body: type parameters, parameter list, return type.
 *
 * Copying this verbatim is what makes the stub's signature identical to the original's — including
 * generics, optional and rest parameters, and overload-free unions — without this script having to
 * understand any of it.
 */
const signatureTail = (text, node) => `${text.slice(node.name.end, node.body.pos).trimEnd()} `;

/** The argument list that forwards this declaration's parameters, preserving rest spread. */
function forwardArgs(node) {
    return node.parameters
        .filter((p) => !(p.name.kind === ts.SyntaxKind.Identifier && p.name.text === 'this'))
        .map((p) => (p.dotDotDotToken ? `...${p.name.text}` : p.name.text))
        .join(', ');
}

/** Modifier keywords worth carrying onto an accessor stub (`readonly` cannot apply to one). */
const ACCESSOR_MODIFIERS = new Set([
    ts.SyntaxKind.PublicKeyword,
    ts.SyntaxKind.ProtectedKeyword,
    ts.SyntaxKind.StaticKeyword,
]);

function accessorModifiers(node) {
    const kept = (node.modifiers ?? [])
        .filter((m) => ACCESSOR_MODIFIERS.has(m.kind))
        .map((m) => m.getText());
    return kept.length > 0 ? `${kept.join(' ')} ` : '';
}

const docFor = (newName) => `/** @deprecated Use {@link ${newName}}. */`;

/** Has this run already given some other member of this class the new name? */
function alreadyClaimed(ctx, classNode, newName) {
    const set = ctx.claimed?.get(classNode);
    return !!set && set.has(newName);
}

/** Record that the new name is now taken in this class, for the rest of this run. */
function claim(ctx, classNode, newName) {
    if (!ctx.claimed) return;
    if (!ctx.claimed.has(classNode)) ctx.claimed.set(classNode, new Set());
    ctx.claimed.get(classNode).add(newName);
}

/** Names already declared in a class body or at module scope, to catch a stub colliding. */
function declaredNames(container) {
    const names = new Set();
    const add = (n) => {
        if (n && ts.isIdentifier(n)) names.add(n.text);
    };
    for (const member of container.members ?? container.statements ?? []) {
        if (ts.isVariableStatement(member)) {
            for (const d of member.declarationList.declarations) add(d.name);
        } else if (ts.isImportDeclaration(member)) {
            // Imports bind names in exactly the same scope as declarations do. `status_logging`
            // imports LogError from @memberjunction/core and also declares its own logError —
            // renaming the second to match is a hard conflict, not a shadow.
            const clause = member.importClause;
            add(clause?.name);
            const named = clause?.namedBindings;
            if (named && ts.isNamedImports(named)) for (const e of named.elements) add(e.name);
            if (named && ts.isNamespaceImport(named)) add(named.name);
        } else add(member.name);
    }
    return names;
}

// ---------------------------------------------------------------------------------------------
// Rewriters — each returns null when it declines the shape
// ---------------------------------------------------------------------------------------------

/**
 * `export function foo()` → `export function Foo()`, plus a delegating `foo` beside it.
 */
function rewriteFunction(ctx, node, names) {
    const { text, source, buffer, unit } = ctx;
    if (!node.body) return SKIP_REASONS.Abstract;
    if (node.asteriskToken) return SKIP_REASONS.Generator;
    if (node.parameters.some((p) => !ts.isIdentifier(p.name))) return SKIP_REASONS.BindingPattern;
    if (node.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === 'this')) return SKIP_REASONS.ThisParameter;
    if (declaredNames(source).has(names.New)) return SKIP_REASONS.NameCollision;

    // An overload set shares one name across several declarations; only the last has a body. If any
    // other declaration in the file carries this name, replicating it correctly is a judgement call.
    const sameName = source.statements.filter(
        (s) => ts.isFunctionDeclaration(s) && s.name && s.name.text === names.Old,
    );
    if (sameName.length > 1) return SKIP_REASONS.Overloaded;

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const stub =
        `\n\n${docFor(names.New)}\n` +
        `${prefixBeforeName(text, node, source)}${names.Old}${signatureTail(text, node)}` +
        `{\n${unit}return ${names.New}(${forwardArgs(node)});\n}`;
    buffer.Insert(node.end, stub);
    return null;
}

/**
 * `export const foo = () => {}` → `export const Foo = …`, plus an aliasing `foo` beside it.
 *
 * An alias rather than a delegating wrapper, because the initializer's type — generics, overloads,
 * a declared function-type annotation — is carried across exactly by `const old = New`, where a
 * hand-built forwarding signature would have to reproduce it and could get it wrong.
 */
function rewriteExportedConstFunction(ctx, statement, declaration, names) {
    const { text, source, buffer } = ctx;
    if (statement.declarationList.declarations.length > 1) return SKIP_REASONS.NoDeclarationFound;
    if (declaredNames(source).has(names.New)) return SKIP_REASONS.NameCollision;

    buffer.Replace(declaration.name.getStart(source), declaration.name.end, names.New);

    const annotation = declaration.type ? `: ${text.slice(declaration.type.pos, declaration.type.end).trim()}` : '';
    buffer.Insert(
        statement.end,
        `\n\n${docFor(names.New)}\nexport const ${names.Old}${annotation} = ${names.New};`,
    );
    return null;
}

/**
 * `public foo()` → `public Foo()`, plus `public foo()` forwarding through `this`.
 */
function rewriteMethod(ctx, node, names, classNode) {
    const { text, source, buffer, unit } = ctx;
    if (!node.body) return SKIP_REASONS.Abstract;
    if (node.asteriskToken) return SKIP_REASONS.Generator;
    if (ts.getDecorators?.(node)?.length) return SKIP_REASONS.Decorated;
    if (node.parameters.some((p) => !ts.isIdentifier(p.name))) return SKIP_REASONS.BindingPattern;
    if (node.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === 'this')) return SKIP_REASONS.ThisParameter;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);
    // The silent one. A stub lets a caller keep using the old name, but a SUBCLASS that overrides
    // the old name now overrides the stub, while everything internal calls the new name — so the
    // override is simply never reached. `BaseProvider.getSupportedOperations` is overridden by every
    // provider; renaming it made all of them dead code that still compiled.
    if (classNode.name && ctx.subclassIndex?.Members?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.Overridden;
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;

    const sameName = classNode.members.filter((m) => m.name && ts.isIdentifier(m.name) && m.name.text === names.Old);
    if (sameName.length > 1) return SKIP_REASONS.Overloaded;

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const indent = indentOf(text, node, source);
    const stub =
        `\n\n${indent}${docFor(names.New)}\n` +
        `${indent}${prefixBeforeName(text, node, source)}${names.Old}${signatureTail(text, node)}` +
        `{\n${indent}${unit}return this.${names.New}(${forwardArgs(node)});\n${indent}}`;
    buffer.Insert(node.end, stub);
    return null;
}

/**
 * `public foo: T` → `public Foo: T`, plus a `@deprecated` accessor pair carrying the old name.
 *
 * A getter alone would silently break assignment, so a writable property always gets both halves;
 * a `readonly` one gets only the getter, which is what `readonly` already meant.
 */
function rewriteProperty(ctx, node, names, classNode) {
    const { text, source, buffer, unit } = ctx;
    if (ts.getDecorators?.(node)?.length) return SKIP_REASONS.Decorated;
    // With no annotation the accessor pair is still writable, because TypeScript infers a setter's
    // parameter type from its paired getter's return type — verified under `--strict`. What it
    // cannot do is infer from nothing, so a property with neither a type nor an initializer is out.
    if (!node.type && !node.initializer) return SKIP_REASONS.NoTypeAnnotation;
    // `foo?: T` cannot become `get foo?()` — TypeScript has no optional accessor — so the stub
    // silently promotes an optional member to a required one.
    if (node.questionToken) return SKIP_REASONS.OptionalProperty;
    if (isDataShapeClass(classNode)) return SKIP_REASONS.StructuralClass;
    if (classNode.name && ctx.subclassIndex?.Props?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.SubclassRedeclares;
    if (classNode.name && ctx.subclassIndex?.Members?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.Overridden;
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;
    if ((node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return SKIP_REASONS.Declared;
    if ((node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)) return SKIP_REASONS.Abstract;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const indent = indentOf(text, node, source);
    const mods = accessorModifiers(node);
    const readonly = (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
    const returnType = node.type ? `: ${text.slice(node.type.pos, node.type.end).trim()}` : '';
    const paramType = node.type ? `: ${text.slice(node.type.pos, node.type.end).trim()}` : '';

    let stub =
        `\n\n${indent}${docFor(names.New)}\n` +
        `${indent}${mods}get ${names.Old}()${returnType} {\n${indent}${unit}return this.${names.New};\n${indent}}`;
    if (!readonly) {
        stub +=
            `\n${indent}${docFor(names.New)}\n` +
            `${indent}${mods}set ${names.Old}(value${paramType}) {\n${indent}${unit}this.${names.New} = value;\n${indent}}`;
    }
    buffer.Insert(node.end, stub);
    return null;
}

/**
 * Decorators that mark a class as a *data shape* rather than a behaviour-carrying object.
 *
 * Object literals get assigned to these classes (`const m: StreamMessage = { … }`), and that makes
 * an accessor stub actively wrong: accessors are required members, so adding one under the old name
 * while the real property takes the new one means every literal must now supply BOTH. The old name
 * alone stops compiling — which is precisely the break this phase exists to avoid.
 */
const DATA_SHAPE_DECORATORS = new Set(['ObjectType', 'InputType', 'ArgsType', 'InterfaceType']);

function isDataShapeClass(classNode) {
    const decorated = (ts.getDecorators?.(classNode) ?? []).some((d) => {
        const e = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
        return ts.isIdentifier(e) && DATA_SHAPE_DECORATORS.has(e.text);
    });
    if (decorated) return true;

    // No decorator needed to be a data shape. A class of nothing but INSTANCE behaviour is one by
    // construction: `const p: ProviderInfo = { provider, type }` type-checks precisely because there
    // is no behaviour a literal would fail to supply.
    //
    // Instance methods are the test. Not the constructor — `DataObjectParams` has one that merely
    // defaults its fields and is still built from literals all over `baseEntity`. And not a STATIC
    // method, which lives on the constructor rather than the instance type: `ModelUsage.ForMedia` is
    // a static factory, so a `{ promptTokens, … }` literal is still assignable to `ModelUsage` and
    // renaming its fields still breaks that literal — in whichever package happens to write it.
    return !classNode.members.some(
        (m) =>
            ts.isMethodDeclaration(m) &&
            !(m.modifiers ?? []).some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword),
    );
}

/** The `@Input(…)` / `@Output(…)` decorator on a member, if it has one. */
function bindingDecorator(node, kind) {
    for (const decorator of ts.getDecorators?.(node) ?? []) {
        const call = decorator.expression;
        if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === kind) return call;
        if (ts.isIdentifier(call) && call.text === kind) return call;
    }
    return null;
}

/** Every decorator on a member, by name, so an unrecognised one can still block the rewrite. */
const decoratorNames = (node) =>
    (ts.getDecorators?.(node) ?? []).map((d) => {
        const e = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
        return ts.isIdentifier(e) ? e.text : '';
    });

/**
 * The type to give an alias when the member it forwards to has no annotation of its own.
 *
 * `MyClass['NewName']` reads the type back off the class, which is exact and needs no inference —
 * but it cannot name a generic class without its arguments, so those are handed back.
 */
function aliasType(node, classNode, names, text) {
    // `@Input() TestId?: string` declares `string | undefined`, but the `?` is a separate token from
    // the type annotation — reading only the annotation gives `string`, and the getter then fails to
    // compile because it returns the real, wider type. An accessor cannot itself be optional, so the
    // optionality has to travel in the type.
    const optional = node.questionToken ? ' | undefined' : '';
    if (node.type) return `${text.slice(node.type.pos, node.type.end).trim()}${optional}`;
    if (!classNode.name || classNode.typeParameters?.length) return null;
    return `${classNode.name.text}['${names.New}']`;
}

/**
 * `@Output() foo = new EventEmitter()` → `@Output() Foo = …`, plus a second output on one emitter.
 *
 * An output cannot be forwarded the way an input can: Angular takes hold of the EventEmitter object
 * itself and subscribes to it once, so there is no call to intercept. Two properties referring to
 * the SAME emitter is the only shape where both binding names deliver — proven in
 * `base-forms/src/lib/deprecated-output-alias.dom.test.ts`, which exists to keep it proven.
 */
function rewriteOutput(ctx, node, names, classNode) {
    const { text, source, buffer } = ctx;
    const decorator = bindingDecorator(node, 'Output');
    if (!decorator) return SKIP_REASONS.Decorated;
    if (decoratorNames(node).some((n) => n !== 'Output')) return SKIP_REASONS.Decorated;
    // An explicit alias already decoupled the binding name from the property, so the binding name
    // is unchanged by a rename and no second output is needed — or wanted.
    if (ts.isCallExpression(decorator) && decorator.arguments.length > 0) return SKIP_REASONS.AliasedBinding;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const indent = indentOf(text, node, source);
    const mods = accessorModifiers(node);
    buffer.Insert(
        node.end,
        `\n\n${indent}/**\n` +
            `${indent} * @deprecated Use {@link ${names.New}}.\n` +
            `${indent} *\n` +
            `${indent} * The same emitter under the old binding name, so a template still binding\n` +
            `${indent} * (${names.Old}) keeps working. Must stay AFTER ${names.New}: class fields\n` +
            `${indent} * initialise in order, and the other way round this captures undefined.\n` +
            `${indent} */\n` +
            `${indent}@Output() ${mods}${names.Old} = this.${names.New};`,
    );
    return null;
}

/**
 * `@Input() foo: T` → `@Input() Foo: T`, plus an aliased setter carrying the old binding name.
 *
 * Inputs flow inward, so a second write target is enough — this is the shape already in use in
 * `collapsible-panel`. The setter's own name is deliberately one nobody would type; the alias
 * string is what the template binds.
 */
function rewriteInput(ctx, node, names, classNode) {
    const { text, source, buffer, unit } = ctx;
    const decorator = bindingDecorator(node, 'Input');
    if (!decorator) return SKIP_REASONS.Decorated;
    if (decoratorNames(node).some((n) => n !== 'Input')) return SKIP_REASONS.Decorated;
    if (ts.isCallExpression(decorator) && decorator.arguments.length > 0) return SKIP_REASONS.AliasedBinding;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;

    const type = aliasType(node, classNode, names, text);
    if (!type) return SKIP_REASONS.GenericClass;

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const indent = indentOf(text, node, source);
    const mods = accessorModifiers(node);
    // A readable PAIR, not the write-only setter the `collapsible-panel` precedent uses. That
    // precedent only ever had to accept a binding; a component's own template also READS its
    // inputs — `@if (isOpen)`, `{{ isOpen }}` — and a setter alone makes those a compile error that
    // `tsc --noEmit` cannot see, because only the Angular compiler type-checks templates.
    buffer.Insert(
        node.end,
        `\n\n${indent}${docFor(names.New)}\n` +
            `${indent}@Input() ${mods}set ${names.Old}(value: ${type}) {\n` +
            `${indent}${unit}this.${names.New} = value;\n${indent}}\n` +
            `${indent}${docFor(names.New)}\n` +
            `${indent}${mods}get ${names.Old}(): ${type} {\n` +
            `${indent}${unit}return this.${names.New};\n${indent}}`,
    );
    return null;
}

/**
 * `constructor(public foo: T)` → `constructor(public Foo: T)`, plus an accessor pair on the class.
 *
 * Parameter properties are positional, so renaming one is invisible to every caller; only the
 * member it implicitly declares is API, and that is what the accessors preserve.
 */
function rewriteParameterProperty(ctx, node, names, classNode, ctor) {
    const { text, source, buffer, unit } = ctx;
    if (ts.getDecorators?.(node)?.length) return SKIP_REASONS.Decorated;
    if (!node.type) return SKIP_REASONS.NoTypeAnnotation;
    // `constructor(public foo?: T)` declares an optional member, and an accessor cannot be optional.
    if (node.questionToken) return SKIP_REASONS.OptionalProperty;
    if (isDataShapeClass(classNode)) return SKIP_REASONS.StructuralClass;
    if (classNode.name && ctx.subclassIndex?.Props?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.SubclassRedeclares;
    if (classNode.name && ctx.subclassIndex?.Members?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.Overridden;
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);

    // Inside the constructor the parameter is also a plain local. Renaming it there is a separate,
    // scope-sensitive edit, so a body that uses the bare name is handed back to a human.
    if (ctor.body && referencesBareName(ctor.body, names.Old, source)) return SKIP_REASONS.ConstructorBodyRef;

    buffer.Replace(node.name.getStart(source), node.name.end, names.New);

    const indent = `${indentOf(text, classNode, source)}${unit}`;
    const mods = accessorModifiers(node);
    const type = text.slice(node.type.pos, node.type.end).trim();
    const readonly = (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);

    let stub =
        `\n\n${indent}${docFor(names.New)}\n` +
        `${indent}${mods}get ${names.Old}(): ${type} {\n${indent}${unit}return this.${names.New};\n${indent}}`;
    if (!readonly) {
        stub +=
            `\n${indent}${docFor(names.New)}\n` +
            `${indent}${mods}set ${names.Old}(value: ${type}) {\n${indent}${unit}this.${names.New} = value;\n${indent}}`;
    }
    // Immediately after the constructor, where a reader looking at the parameter will find it.
    buffer.Insert(ctor.end, stub);
    return null;
}

/** Does this subtree read `name` as a standalone identifier (not as `x.name` or `{ name: … }`)? */
function referencesBareName(root, name, source) {
    let found = false;
    const visit = (node) => {
        if (found) return;
        if (ts.isIdentifier(node) && node.text === name) {
            const p = node.parent;
            const isMemberName = p && ts.isPropertyAccessExpression(p) && p.name === node;
            const isKey = p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node;
            if (!isMemberName && !isKey) {
                found = true;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(root, visit);
    return found;
}

/**
 * `get foo()` / `set foo()` → `get Foo()` / `set Foo()`, plus a delegating pair under the old name.
 *
 * Both halves move together or neither does: renaming only the getter would leave a `set foo` whose
 * partner no longer exists, which turns a read-write member into a write-only one and compiles
 * quietly. The check reports the getter and the setter as two separate findings, so this resolves
 * both from whichever one is reached first.
 */
function rewriteAccessorPair(ctx, node, names, classNode, state) {
    const { text, source, buffer, unit } = ctx;
    if (ts.getDecorators?.(node)?.length) return SKIP_REASONS.DecoratedAccessor;
    // A getter is part of the class's structural type exactly like a field, so a literal assigned to
    // the class has to supply its name too. `BaseResult.timeElapsed` is a getter, and renaming it
    // broke every `{ …, timeElapsed }` literal built in OTHER packages — invisible to this one.
    if (isDataShapeClass(classNode)) return SKIP_REASONS.StructuralClass;
    if (classNode.name && ctx.subclassIndex?.Props?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.SubclassRedeclares;
    if (classNode.name && ctx.subclassIndex?.Members?.get(classNode.name.text)?.has(names.Old))
        return SKIP_REASONS.Overridden;
    if (classNode.name && ctx.subclassIndex?.Ancestors?.get(classNode.name.text)?.has(names.New))
        return SKIP_REASONS.AncestorDeclares;
    if (declaredNames(classNode).has(names.New)) return SKIP_REASONS.NameCollision;
    if (alreadyClaimed(ctx, classNode, names.New)) return SKIP_REASONS.NameClaimedThisRun;
    claim(ctx, classNode, names.New);

    const pair = classNode.members.filter(
        (m) =>
            (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) &&
            m.name &&
            ts.isIdentifier(m.name) &&
            m.name.text === names.Old,
    );
    if (pair.some((m) => ts.getDecorators?.(m)?.length)) return SKIP_REASONS.DecoratedAccessor;

    const getter = pair.find((m) => ts.isGetAccessorDeclaration(m));
    const setter = pair.find((m) => ts.isSetAccessorDeclaration(m));
    for (const member of pair) buffer.Replace(member.name.getStart(source), member.name.end, names.New);

    const last = pair[pair.length - 1];
    const indent = indentOf(text, last, source);
    const mods = accessorModifiers(last);
    // The getter's declared return type if it has one; otherwise inference handles the getter, and
    // TypeScript infers the setter's parameter from its paired getter.
    const returnType = getter?.type ? `: ${text.slice(getter.type.pos, getter.type.end).trim()}` : '';
    const setterParam = setter?.parameters?.[0];
    const paramType = setterParam?.type ? `: ${text.slice(setterParam.type.pos, setterParam.type.end).trim()}` : '';

    let stub = '';
    if (getter) {
        stub +=
            `\n\n${indent}${docFor(names.New)}\n` +
            `${indent}${mods}get ${names.Old}()${returnType} {\n${indent}${unit}return this.${names.New};\n${indent}}`;
    }
    if (setter) {
        stub +=
            `${getter ? '\n' : '\n\n'}${indent}${docFor(names.New)}\n` +
            `${indent}${mods}set ${names.Old}(value${paramType}) {\n${indent}${unit}this.${names.New} = value;\n${indent}}`;
    }
    buffer.Insert(last.end, stub);

    // Claim the sibling's finding too, so it is not reported as unmatched.
    for (const member of pair) {
        const entry = state.get(`${lineOf(source, member.name)}:${names.Old}`);
        if (entry) {
            entry.Done = true;
            entry.Skip = null;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Same-file references
// ---------------------------------------------------------------------------------------------

/**
 * Point the declaring file's own code at the name it just renamed.
 *
 * The file that declares `parseTypeString` is usually also its heaviest caller, and leaving those
 * calls behind means the very function that was renamed still routes through its own deprecation
 * stub. These references are the safest ones in the whole codemod to move: the declaration is right
 * there in the same module scope, so nothing has to be resolved across a file boundary.
 *
 * Computed against the ORIGINAL AST, so the generated stubs — which must keep calling the new name
 * under the old one — are untouched by construction.
 */
function rewriteSameFileReferences(ctx, renames, skipNodes) {
    const { source, buffer } = ctx;
    if (renames.length === 0) return;
    const byOld = new Map(renames.map((r) => [r.Old, r]));
    const unsafe = new Set();
    const sites = [];

    const visit = (node) => {
        if (ts.isShorthandPropertyAssignment(node) && byOld.has(node.name.text)) {
            unsafe.add(node.name.text);
        } else if (ts.isIdentifier(node) && byOld.has(node.text) && !skipNodes.has(node)) {
            const p = node.parent;
            if (p && (ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && p.name === node) {
                /* someone else's member */
            } else if (p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node) {
                /* an object key that merely shares the name */
            } else if (p && (ts.isExportSpecifier(p) || ts.isImportSpecifier(p))) {
                // The old name is part of this file's declared surface; the barrel pass owns it.
                unsafe.add(node.text);
            } else if (p && isDeclarationName(p, node)) {
                unsafe.add(node.text);
            } else {
                sites.push(node);
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);

    for (const node of sites) {
        if (unsafe.has(node.text)) continue;
        buffer.Replace(node.getStart(source), node.end, byOld.get(node.text).New);
    }
}

/**
 * Point a class's own `this.old` calls at the renamed member.
 *
 * Nested class bodies are skipped: `this` means something different inside them, and this pass has
 * no way to tell whose member it is looking at.
 */
function rewriteThisReferences(ctx, classNode, renames, skipNodes) {
    const { source, buffer } = ctx;
    if (renames.length === 0) return;
    const byOld = new Map(renames.map((r) => [r.Old, r]));

    const visit = (node) => {
        if (node !== classNode && (ts.isClassDeclaration(node) || ts.isClassExpression(node))) return;
        if (
            ts.isPropertyAccessExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ThisKeyword &&
            ts.isIdentifier(node.name) &&
            byOld.has(node.name.text) &&
            !skipNodes.has(node.name)
        ) {
            buffer.Replace(node.name.getStart(source), node.name.end, byOld.get(node.name.text).New);
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(classNode, visit);
}

// ---------------------------------------------------------------------------------------------
// Per-file driver
// ---------------------------------------------------------------------------------------------

/**
 * Rewrite one file for the findings that land in it.
 *
 * Returns the new text plus a per-finding outcome. Findings are matched to declarations by line
 * **and** name, so a stale worklist mismatches loudly instead of renaming the wrong thing.
 */
function rewriteFile(absPath, findings, subclassIndex) {
    const text = readFileSync(absPath, 'utf8');
    const source = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const buffer = new EditBuffer(text);
    // Names this run has already introduced, per class. `declaredNames` only sees the ORIGINAL
    // members, so two findings that pascalize to the same thing — `artifact` and `_artifact` both
    // become `Artifact` — each pass the collision check and produce a duplicate identifier.
    const claimed = new Map();
    const ctx = { text, source, buffer, unit: indentUnit(text), subclassIndex, claimed };
    /** Declaration-name identifiers already rewritten; a reference pass must not touch them again. */
    const declarationNames = new Set();
    /** Renamed module-scope functions, and renamed members grouped by their owning class. */
    const functionRenames = [];
    const memberRenames = new Map();

    /** @type {Map<string, {Finding:object, Skip:string|null, Done:boolean}>} */
    const state = new Map();
    for (const f of findings) {
        const names = namesFrom(f.Message);
        state.set(`${f.Line}:${names?.Old}`, { Finding: f, Names: names, Skip: null, Done: false });
    }

    // Keyed on the NAME identifier's line, which is where the check anchors every finding it
    // reports. Anchoring on the declaration instead silently misses every decorated member, whose
    // `getStart()` is the `@` a line or more above the name.
    const take = (nameNode, names) => {
        const entry = state.get(`${lineOf(source, nameNode)}:${names.Old}`);
        return entry && !entry.Done ? entry : null;
    };

    const visit = (node, classNode) => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
            for (const member of node.members) visitMember(member, node);
            // Anything nested deeper still gets walked, but with the right owning class.
            ts.forEachChild(node, (c) => {
                if (!node.members.includes(c)) visit(c, node);
            });
            return;
        }
        if (ts.isVariableStatement(node) && node.declarationList.declarations.length >= 1) {
            for (const declaration of node.declarationList.declarations) {
                if (!ts.isIdentifier(declaration.name)) continue;
                const init = declaration.initializer;
                if (!init || !(ts.isArrowFunction(init) || ts.isFunctionExpression(init))) continue;
                const entry = take(declaration.name, { Old: declaration.name.text });
                if (!entry) continue;
                entry.Skip = rewriteExportedConstFunction(ctx, node, declaration, entry.Names);
                entry.Done = true;
                if (!entry.Skip) {
                    declarationNames.add(declaration.name);
                    functionRenames.push(entry.Names);
                }
            }
        }
        if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            const entry = take(node.name, { Old: node.name.text });
            if (entry) {
                entry.Skip = rewriteFunction(ctx, node, entry.Names);
                entry.Done = true;
                if (!entry.Skip) {
                    declarationNames.add(node.name);
                    functionRenames.push(entry.Names);
                }
            }
        }
        ts.forEachChild(node, (c) => visit(c, classNode));
    };

    const visitMember = (member, classNode) => {
        if (ts.isConstructorDeclaration(member)) {
            for (const param of member.parameters) {
                if (!(member.parameters && ts.isIdentifier(param.name))) continue;
                const isParamProp = (param.modifiers ?? []).some((m) =>
                    [ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(m.kind),
                );
                if (!isParamProp) continue;
                const entry = take(param.name, { Old: param.name.text });
                if (entry) {
                    entry.Skip = rewriteParameterProperty(ctx, param, entry.Names, classNode, member);
                    entry.Done = true;
                    if (!entry.Skip) {
                        declarationNames.add(param.name);
                        if (!memberRenames.has(classNode)) memberRenames.set(classNode, []);
                        memberRenames.get(classNode).push(entry.Names);
                    }
                }
            }
            ts.forEachChild(member, (c) => visit(c, classNode));
            return;
        }
        if (member.name && ts.isIdentifier(member.name)) {
            const entry = take(member.name, { Old: member.name.text });
            if (entry) {
                if (ts.isMethodDeclaration(member)) entry.Skip = rewriteMethod(ctx, member, entry.Names, classNode);
                else if (ts.isPropertyDeclaration(member) && bindingDecorator(member, 'Output'))
                    entry.Skip = rewriteOutput(ctx, member, entry.Names, classNode);
                else if (ts.isPropertyDeclaration(member) && bindingDecorator(member, 'Input'))
                    entry.Skip = rewriteInput(ctx, member, entry.Names, classNode);
                else if (ts.isPropertyDeclaration(member)) entry.Skip = rewriteProperty(ctx, member, entry.Names, classNode);
                else if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member))
                    entry.Skip = rewriteAccessorPair(ctx, member, entry.Names, classNode, state);
                else entry.Skip = SKIP_REASONS.NoDeclarationFound;
                entry.Done = true;
                if (!entry.Skip) {
                    declarationNames.add(member.name);
                    if (!memberRenames.has(classNode)) memberRenames.set(classNode, []);
                    memberRenames.get(classNode).push(entry.Names);
                }
            }
        }
        ts.forEachChild(member, (c) => visit(c, classNode));
    };

    ts.forEachChild(source, (c) => visit(c, null));

    // Reference passes run last, against the original AST, so they see every rename this file made.
    rewriteSameFileReferences(ctx, functionRenames, declarationNames);
    for (const [classNode, renames] of memberRenames) rewriteThisReferences(ctx, classNode, renames, declarationNames);

    for (const entry of state.values()) {
        if (!entry.Done) entry.Skip = SKIP_REASONS.NoDeclarationFound;
    }

    // ONLY module-level renames propagate to barrels and importers. A class member that happens to
    // share a name with an exported function — `status_logging` has both a `logError` method and a
    // `logError` function — must not make `import { logError }` elsewhere rewrite itself, least of
    // all when the function was left alone because its PascalCase name was already taken.
    return {
        Text: buffer.Count > 0 ? buffer.Result() : text,
        Changed: buffer.Count > 0,
        State: state,
        Renames: functionRenames,
    };
}

// ---------------------------------------------------------------------------------------------
// Subclass index
// ---------------------------------------------------------------------------------------------

/**
 * Which member names each class's descendants redeclare as plain properties.
 *
 * Turning a base-class property into a `get`/`set` pair is invisible to the base class and fatal to
 * its children: TypeScript rejects a property that overrides an accessor (TS2610), so the moment
 * `BaseResult.success` becomes an accessor, `ChatResult`'s own `success` property stops compiling.
 * Built once per package, keyed by class name — names, not symbols, because this codemod never
 * builds a type checker. That over-matches across unrelated same-named classes, which costs a few
 * renames and cannot cause a break.
 */
function buildSubclassIndex(packageDir) {
    /** class name → its declared base class names */
    const parents = new Map();
    /** class name → names it declares as plain properties */
    const properties = new Map();
    /** class name → every member name it declares, of any kind */
    const members = new Map();

    // GENERATED code is included here even though the codemod never rewrites it. A generated form
    // component is a real ancestor — `MJListFormComponentExtended extends MJListFormComponent` — and
    // an index that cannot see it reports no ancestor at all, which is worse than not checking.
    for (const abs of collectSourceFiles(packageDir, [], { includeGenerated: true })) {
        let source;
        try {
            source = ts.createSourceFile(abs, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        } catch {
            continue;
        }
        const visit = (node) => {
            if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
                const name = node.name.text;
                const bases = (node.heritageClauses ?? [])
                    .filter((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
                    .flatMap((h) => h.types.map((t) => (ts.isIdentifier(t.expression) ? t.expression.text : null)))
                    .filter(Boolean);
                parents.set(name, [...(parents.get(name) ?? []), ...bases]);
                const own = properties.get(name) ?? new Set();
                const decl = members.get(name) ?? new Set();
                for (const m of node.members) {
                    if (!m.name || !ts.isIdentifier(m.name)) continue;
                    if (ts.isPropertyDeclaration(m)) own.add(m.name.text);
                    // Every member kind counts as an override, not just properties: a method, a
                    // getter or a setter declared on a subclass overrides the base's member of the
                    // same name just as surely.
                    if (
                        ts.isPropertyDeclaration(m) ||
                        ts.isMethodDeclaration(m) ||
                        ts.isGetAccessorDeclaration(m) ||
                        ts.isSetAccessorDeclaration(m)
                    ) {
                        decl.add(m.name.text);
                    }
                }
                properties.set(name, own);
                members.set(name, decl);
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }

    // Invert: for each class, what everything below it declares. Two views, because they guard
    // different failures — `Props` is the TS2610 compile error, `Members` is the silent one where an
    // override stops being reached at all.
    // Ancestors, the mirror image. Renaming `loadComplete` to `LoadComplete` on a component whose
    // GRANDPARENT in another package already declares a `LoadComplete` accessor produces a member
    // that collides with an inherited one — TS2610/TS2416/TS2687 — and the same-class collision
    // check cannot see it, because the clashing declaration is not in this class or this file.
    const ancestorMembers = new Map();
    for (const [child] of parents) {
        const acc = new Set();
        const seen = new Set();
        const up = (names) => {
            for (const base of names) {
                if (seen.has(base)) continue;
                seen.add(base);
                for (const n of members.get(base) ?? []) acc.add(n);
                up(parents.get(base) ?? []);
            }
        };
        up(parents.get(child) ?? []);
        ancestorMembers.set(child, acc);
    }

    const descendantProps = new Map();
    const descendantMembers = new Map();
    for (const [child, bases] of parents) {
        const own = properties.get(child) ?? new Set();
        const ownAll = members.get(child) ?? new Set();
        const seen = new Set();
        const walkUp = (names) => {
            for (const base of names) {
                if (seen.has(base)) continue;
                seen.add(base);
                const p = descendantProps.get(base) ?? new Set();
                for (const n of own) p.add(n);
                descendantProps.set(base, p);
                const a = descendantMembers.get(base) ?? new Set();
                for (const n of ownAll) a.add(n);
                descendantMembers.set(base, a);
                walkUp(parents.get(base) ?? []);
            }
        };
        walkUp(bases);
    }
    return { Props: descendantProps, Members: descendantMembers, Ancestors: ancestorMembers };
}

// ---------------------------------------------------------------------------------------------
// Re-export lists
// ---------------------------------------------------------------------------------------------

/**
 * Publish the new name from every barrel that re-exports the old one.
 *
 * A rename is only half done while the package's entry point still says
 * `export { splitByStatement } from './MigrationStatementSplitter.js'`: the stub keeps every
 * existing consumer working, but the correctly-named function is not on the public surface at all,
 * so nobody can migrate onto it. `export *` barrels carry both names for free and need nothing;
 * explicit lists have to be told.
 *
 * The old name stays in the list beside it. Removing it is the breaking change this whole phase
 * exists to avoid.
 */
function updateReExports(packageDir, renamesByFile) {
    const edited = [];
    for (const abs of collectSourceFiles(packageDir)) {
        const text = readFileSync(abs, 'utf8');
        const source = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const buffer = new EditBuffer(text);

        for (const statement of source.statements) {
            if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
            if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
            if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

            const target = resolveSpecifier(abs, statement.moduleSpecifier.text);
            const renames = target && renamesByFile.get(target);
            if (!renames) continue;

            const present = new Set(statement.exportClause.elements.map((e) => e.name.text));
            for (const element of statement.exportClause.elements) {
                // `export { a as b }` aliases the name the consumer sees; the alias is the contract
                // and renaming the declaration behind it changed nothing, so leave it alone.
                if (element.propertyName) continue;
                const pair = renames.find((r) => r.Old === element.name.text);
                if (!pair || present.has(pair.New)) continue;
                buffer.Insert(element.getStart(source), `${pair.New}, `);
                present.add(pair.New);
            }
        }

        if (buffer.Count > 0) {
            edited.push({ Path: abs, Text: buffer.Result(), Count: buffer.Count });
        }
    }
    return edited;
}

/** `./Foo.js` next to `bar.ts` → the absolute path of `Foo.ts`. Relative specifiers only. */
function resolveSpecifier(fromFile, specifier) {
    if (!specifier.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), specifier).replace(/\.js$/, '');
    for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
        try {
            if (statSync(candidate).isFile()) return candidate;
        } catch {
            /* not this one */
        }
    }
    return null;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.angular', 'coverage', 'generated', '.turbo']);

/** Is this a test file? Used to scope the riskier, name-only rewrites to code that is not shipped. */
const isTestFile = (abs) => /(?:\.test\.ts|\.spec\.ts)$/.test(abs) || abs.includes('__tests__');

function collectSourceFiles(dir, out = [], { includeGenerated = false } = {}) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const skip = SKIP_DIRS.has(entry.name) && !(includeGenerated && entry.name === 'generated');
            if (!skip) collectSourceFiles(join(dir, entry.name), out, { includeGenerated });
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Module mock factories
// ---------------------------------------------------------------------------------------------

/**
 * Move `vi.mock` / `jest.mock` factories onto the new export names.
 *
 * A module mock names its overrides as object-literal KEYS, and a key is not a reference, so the
 * caller pass correctly leaves it alone. The result compiles and silently stops working: the factory
 * keeps overriding `resolveFromEnvironment` while the code under test now calls
 * `ResolveFromEnvironment`, which the `...actual` spread supplies for real. The mock never fires and
 * the assertion fails with "expected to be called once, but got 0 times".
 *
 * Only inside a mock factory whose specifier resolves to a file this run renamed — narrow enough
 * that an object key meaning something else entirely is never touched.
 */
function updateMockFactories(packageDir, renamesByFile) {
    const edited = [];
    for (const abs of collectSourceFiles(packageDir)) {
        const text = readFileSync(abs, 'utf8');
        if (!/\b(?:vi|jest|vitest)\s*\.\s*(?:mock|spyOn)\s*\(/.test(text)) continue;
        const source = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const buffer = new EditBuffer(text);

        /** Every rename this run made anywhere in the package, for instance-target spies. */
        const packageRenames = [...renamesByFile.values()].flat();

        /** local namespace binding → the renames of the module it points at */
        const namespaceRenames = new Map();
        for (const statement of source.statements) {
            if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const bindings = statement.importClause?.namedBindings;
            if (!bindings || !ts.isNamespaceImport(bindings)) continue;
            const target = resolveSpecifier(abs, statement.moduleSpecifier.text);
            const renames = target && renamesByFile.get(target);
            if (renames) namespaceRenames.set(bindings.name.text, renames);
        }

        const visit = (node) => {
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'mock' &&
                ts.isIdentifier(node.expression.expression) &&
                ['vi', 'jest', 'vitest'].includes(node.expression.expression.text) &&
                node.arguments.length >= 2 &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                const target = resolveSpecifier(abs, node.arguments[0].text);
                const renames = target && renamesByFile.get(target);
                if (renames) rewriteFactory(node.arguments[1], renames);
            }
            // `vi.spyOn(statusLogging, 'logWarning')` — the target is a STRING, so nothing in the
            // rename passes would ever touch it, and the spy simply stops intercepting once the
            // code under test moves to the new name. The namespace has to be traced back to the
            // module it imports before the string can safely be rewritten.
            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'spyOn' &&
                node.arguments.length >= 2 &&
                ts.isIdentifier(node.arguments[0]) &&
                ts.isStringLiteral(node.arguments[1])
            ) {
                const lit = node.arguments[1];
                // Case 1: the target is a namespace import, so the module — and therefore the
                // rename — can be resolved exactly.
                const nsRenames = namespaceRenames.get(node.arguments[0].text);
                let pair = nsRenames?.find((r) => r.Old === lit.text);

                // Case 2: the target is an instance (`vi.spyOn(component, 'highlightMatch')`), which
                // cannot be resolved to a class without a type checker. Restricted to TEST files and
                // to names this run actually renamed somewhere in the package. Worth doing because
                // the failure is silent: the @deprecated stub still exists, so the spy ATTACHES and
                // then never fires, because the code under test calls the new name.
                if (!pair && isTestFile(abs)) {
                    pair = packageRenames.find((r) => r.Old === lit.text);
                }
                if (pair) buffer.Replace(lit.getStart(source) + 1, lit.end - 1, pair.New);
            }
            ts.forEachChild(node, visit);
        };

        const rewriteFactory = (factory, renames) => {
            const byOld = new Map(renames.map((r) => [r.Old, r]));
            const walk = (node) => {
                // `resolveFromEnvironment: …` — the override key itself. The key moves to the new
                // name AND the old one is kept as a getter onto it, because a factory replaces the
                // WHOLE module: a barrel that re-exports both names resolves both against the mock,
                // and dropping either makes vitest fail with "No X export is defined on the mock".
                // A getter rather than a copied expression, so both names are the same mock instance
                // and an assertion on one sees calls made through the other.
                if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && byOld.has(node.name.text)) {
                    const pair = byOld.get(node.name.text);
                    buffer.Replace(node.name.getStart(source), node.name.end, pair.New);
                    buffer.Insert(node.end, `,\n    get ${pair.Old}() { return this.${pair.New}; }`);
                }
                // `typeof actual.resolveFromEnvironment` — a member of the real module namespace.
                if (
                    ts.isPropertyAccessExpression(node) &&
                    ts.isIdentifier(node.name) &&
                    byOld.has(node.name.text)
                ) {
                    buffer.Replace(node.name.getStart(source), node.name.end, byOld.get(node.name.text).New);
                }
                ts.forEachChild(node, walk);
            };
            walk(factory);
        };

        ts.forEachChild(source, visit);
        if (buffer.Count > 0) edited.push({ Path: abs, Text: buffer.Result(), Count: buffer.Count });
    }
    return edited;
}

// ---------------------------------------------------------------------------------------------
// In-package callers
// ---------------------------------------------------------------------------------------------

/**
 * Move the package's own code onto the new names.
 *
 * Without this the rename is cosmetic: every call inside the package still goes through the
 * `@deprecated` stub, so the package is its own biggest user of the API it just deprecated, and
 * every build hints at code nobody intends to change.
 *
 * **Scoped to the package on purpose.** A consumer in another package is rewritten when that
 * package's own slice runs, where its build and tests can prove the edit. Until then the stub
 * carries it, which is exactly what the stub is for.
 *
 * Bare identifiers only — `x.Old` is a member access this pass has no way to resolve, and a
 * shorthand `{ Old }` would silently rename the key as well as the value. Both are grounds to leave
 * the file alone entirely.
 */
function updateCallers(packageDir, renamesByFile) {
    const edited = [];
    for (const abs of collectSourceFiles(packageDir)) {
        const text = readFileSync(abs, 'utf8');
        const source = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

        // Which local bindings in THIS file name a symbol this run renamed.
        const local = new Map();
        /** Binding elements from `const { x } = await import(…)`, which are declaration AND reference. */
        const dynamicBindings = new Set();

        // `const { foo } = await import('./x.js')` binds exactly like a static import, and MJ uses it
        // wherever a module has to be loaded lazily. Missing it leaves the call site on the old name
        // while the barrel, the mock factory and everything else move — which is worse than not
        // renaming at all, because the two halves disagree.
        const findDynamicImports = (node) => {
            if (
                ts.isVariableDeclaration(node) &&
                node.name &&
                ts.isObjectBindingPattern(node.name) &&
                node.initializer
            ) {
                let call = node.initializer;
                if (ts.isAwaitExpression(call)) call = call.expression;
                if (
                    ts.isCallExpression(call) &&
                    call.expression.kind === ts.SyntaxKind.ImportKeyword &&
                    call.arguments.length > 0 &&
                    ts.isStringLiteral(call.arguments[0])
                ) {
                    const target = resolveSpecifier(abs, call.arguments[0].text);
                    const renames = target && renamesByFile.get(target);
                    if (renames) {
                        for (const element of node.name.elements) {
                            if (!ts.isIdentifier(element.name)) continue;
                            // `{ old: alias }` — the alias is the local, only the property moves.
                            const key = element.propertyName ?? element.name;
                            if (!ts.isIdentifier(key)) continue;
                            const pair = renames.find((r) => r.Old === key.text);
                            if (!pair) continue;
                            if (element.propertyName) {
                                buffer.Replace(key.getStart(source), key.end, pair.New);
                            } else {
                                dynamicBindings.add(element.name);
                                local.set(element.name.text, { Pair: pair, Element: element });
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, findDynamicImports);
        };

        for (const statement of source.statements) {
            if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const bindings = statement.importClause?.namedBindings;
            if (!bindings || !ts.isNamedImports(bindings)) continue;
            const target = resolveSpecifier(abs, statement.moduleSpecifier.text);
            const renames = target && renamesByFile.get(target);
            if (!renames) continue;
            for (const element of bindings.elements) {
                // `import { old as other }` binds a name this codemod never chose; leave it.
                if (element.propertyName) continue;
                const pair = renames.find((r) => r.Old === element.name.text);
                if (pair) local.set(element.name.text, { Pair: pair, Element: element });
            }
        }
        const buffer = new EditBuffer(text);
        ts.forEachChild(source, findDynamicImports);
        if (local.size === 0 && buffer.Count === 0) continue;
        const unsafe = new Set();
        const sites = [];

        // A file may already bind the PascalCase name from somewhere else entirely — `manage-metadata`
        // imports LogError from @memberjunction/core AND logError from ../Misc/status_logging. Moving
        // the second onto its new name would collide with the first, so that name is off limits here.
        const alreadyBound = new Set();
        for (const statement of source.statements) {
            if (ts.isImportDeclaration(statement)) {
                const clause = statement.importClause;
                if (clause?.name) alreadyBound.add(clause.name.text);
                const named = clause?.namedBindings;
                if (named && ts.isNamedImports(named)) for (const e of named.elements) alreadyBound.add(e.name.text);
                if (named && ts.isNamespaceImport(named)) alreadyBound.add(named.name.text);
            } else if (ts.isVariableStatement(statement)) {
                for (const d of statement.declarationList.declarations) {
                    if (ts.isIdentifier(d.name)) alreadyBound.add(d.name.text);
                }
            } else if (statement.name && ts.isIdentifier(statement.name)) {
                alreadyBound.add(statement.name.text);
            }
        }
        for (const [old, entry] of local) {
            if (alreadyBound.has(entry.Pair.New)) unsafe.add(old);
        }

        const visit = (node) => {
            if (ts.isShorthandPropertyAssignment(node) && local.has(node.name.text)) {
                unsafe.add(node.name.text);
            } else if (ts.isIdentifier(node) && local.has(node.text)) {
                const p = node.parent;
                if (p && ts.isImportSpecifier(p)) {
                    sites.push(node);
                } else if (p && (ts.isPropertyAccessExpression(p) || ts.isQualifiedName(p)) && p.name === node) {
                    /* a member of something else entirely */
                } else if (p && (ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node) {
                    /* an object key that merely shares the name */
                } else if (p && ts.isExportSpecifier(p)) {
                    // Re-exported from here under the old name; the barrel pass owns this line.
                    unsafe.add(node.text);
                } else if (dynamicBindings.has(node)) {
                    sites.push(node);
                } else if (p && isDeclarationName(p, node)) {
                    // Something else in this file declares the same name: the import is shadowed and
                    // no rename here can be trusted.
                    unsafe.add(node.text);
                } else {
                    sites.push(node);
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);

        for (const node of sites) {
            const entry = local.get(node.text);
            if (!entry || unsafe.has(node.text)) continue;
            buffer.Replace(node.getStart(source), node.end, entry.Pair.New);
        }

        if (buffer.Count > 0) edited.push({ Path: abs, Text: buffer.Result(), Count: buffer.Count });
    }
    return edited;
}

/**
 * Is this identifier the NAME being declared by its parent, rather than a reference to one?
 *
 * Class members belong in this list as much as top-level declarations do. A driver that imports a
 * `redactConnectionSecrets` function and also declares a `redactConnectionSecrets` METHOD has two
 * unrelated symbols that merely share a spelling; treating the method's own name as a reference to
 * the import renames the declaration while every `this.redactConnectionSecrets` call stays put.
 */
function isDeclarationName(parent, node) {
    return (
        (ts.isVariableDeclaration(parent) ||
            ts.isParameter(parent) ||
            ts.isFunctionDeclaration(parent) ||
            ts.isClassDeclaration(parent) ||
            ts.isBindingElement(parent) ||
            ts.isTypeAliasDeclaration(parent) ||
            ts.isInterfaceDeclaration(parent) ||
            ts.isEnumDeclaration(parent) ||
            ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent) ||
            ts.isGetAccessorDeclaration(parent) ||
            ts.isSetAccessorDeclaration(parent) ||
            ts.isMethodSignature(parent) ||
            ts.isEnumMember(parent) ||
            ts.isModuleDeclaration(parent)) &&
        parent.name === node
    );
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd());
const worklist = JSON.parse(readFileSync(args.findings, 'utf8'));

let selected = worklist.Findings.filter((f) => (f.Severity ?? 'error') === 'error');
if (args.package) selected = selected.filter((f) => f.File.startsWith(`${args.package.replace(/\/$/, '')}/`));
if (args.file) selected = selected.filter((f) => f.File === args.file);

const outOfScope = selected.filter((f) => !HANDLED.test(f.Message));
const inScope = selected.filter((f) => HANDLED.test(f.Message)).slice(0, args.limit);

/** @type {Map<string, object[]>} */
const byFile = new Map();
for (const f of inScope) {
    if (!byFile.has(f.File)) byFile.set(f.File, []);
    byFile.get(f.File).push(f);
}

const skipped = [];
/** @type {Map<string, {Old:string,New:string}[]>} absolute path → what this run renamed in it */
const renamesByFile = new Map();
// Built once: which member names each class's descendants redeclare as properties.
// Repo-wide, not package-scoped: the subclass of an exported base class almost always lives in a
// DIFFERENT package, which is exactly why this failure is invisible to any per-package check.
const subclassIndex = buildSubclassIndex(resolve(repoRoot, 'packages'));
let fixed = 0;
let filesChanged = 0;

for (const [rel, findings] of [...byFile.entries()].sort()) {
    const abs = resolve(repoRoot, rel);
    let result;
    try {
        result = rewriteFile(abs, findings, subclassIndex);
    } catch (err) {
        for (const f of findings) skipped.push({ Finding: f, Reason: `codemod error: ${err.message}` });
        continue;
    }
    for (const entry of result.State.values()) {
        if (entry.Skip) skipped.push({ Finding: entry.Finding, Reason: entry.Skip });
        else fixed++;
    }
    if (result.Changed) {
        filesChanged++;
        if (result.Renames.length > 0) renamesByFile.set(abs, result.Renames);
        if (args.apply) writeFileSync(abs, result.Text, 'utf8');
    }
}

// The barrel pass runs over the package as a whole, because the file that re-exports a symbol is
// almost never the file that declares it.
let barrelsUpdated = 0;
let namesPublished = 0;
let callerFiles = 0;
let callSites = 0;
let mockKeys = 0;
if (renamesByFile.size > 0 && args.package) {
    const packageDir = resolve(repoRoot, args.package);
    for (const edit of updateReExports(packageDir, renamesByFile)) {
        barrelsUpdated++;
        namesPublished += edit.Count;
        if (args.apply) writeFileSync(edit.Path, edit.Text, 'utf8');
    }
    for (const edit of updateCallers(packageDir, renamesByFile)) {
        callerFiles++;
        callSites += edit.Count;
        if (args.apply) writeFileSync(edit.Path, edit.Text, 'utf8');
    }
    for (const edit of updateMockFactories(packageDir, renamesByFile)) {
        mockKeys += edit.Count;
        if (args.apply) writeFileSync(edit.Path, edit.Text, 'utf8');
    }
}

const mode = args.apply ? 'APPLIED' : 'DRY RUN (nothing written)';
console.log(`\n${mode}`);
console.log(`  selected findings : ${selected.length}`);
console.log(`  in scope          : ${inScope.length}`);
console.log(`  fixed             : ${fixed}   across ${filesChanged} file(s)`);
console.log(`  skipped in scope  : ${skipped.length}`);
console.log(`  re-exports added  : ${namesPublished}   across ${barrelsUpdated} barrel(s)`);
console.log(`  call sites moved  : ${callSites}   across ${callerFiles} file(s) in this package`);
console.log(`  mock factory keys : ${mockKeys}`);
console.log(`  out of scope      : ${outOfScope.length}`);

if (skipped.length > 0) {
    const byReason = new Map();
    for (const s of skipped) byReason.set(s.Reason, (byReason.get(s.Reason) ?? 0) + 1);
    console.log('\n  skipped, by reason:');
    for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(5)}  ${reason}`);
    }
    if (process.env.CODEMOD_VERBOSE) {
        console.log('\n  skipped detail:');
        for (const s of skipped) console.log(`    ${s.Finding.File}:${s.Finding.Line}  ${s.Reason}`);
    }
}

if (outOfScope.length > 0) {
    const byKind = new Map();
    for (const f of outOfScope) {
        const kind = f.Message.split(' "')[0];
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }
    console.log('\n  out of scope, by kind:');
    for (const [kind, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(5)}  ${kind}`);
    }
}
console.log('');
