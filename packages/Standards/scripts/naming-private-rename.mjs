#!/usr/bin/env node
/**
 * @fileoverview Phase B, private-member pass — rename PascalCase `private` members to camelCase.
 *
 * Repo tooling, not part of the published package (see the sibling `naming-codemod.mjs` header).
 *
 * This is a DIFFERENT operation from the stub codemod next to it, which is why it is a different
 * file. A public member gets renamed and keeps its old name as a `@deprecated` stub, because a
 * consumer may be calling it. A `private` member has no consumer: TypeScript forbids access from
 * outside the class, so every reference is inside the class body and the rename can simply move
 * them all. No stub, nothing deprecated, no compatibility surface to preserve.
 *
 *     node packages/Standards/scripts/naming-private-rename.mjs \
 *         --findings findings.json --package packages/MJCore [--apply]
 *
 * Without `--apply` it is a dry run: it prints what it would change and what it refuses to touch.
 *
 * **What makes this safe is that the compiler is the backstop.** A reference this misses becomes
 * `TS2551: Property 'Foo' does not exist` — loud, not silent. That holds for every form except the
 * two below, which compile fine while meaning something different, so both are found and reported
 * rather than guessed at:
 *
 *   - **Bracket access** — `this['Foo']`, or a test reaching in through
 *     `(obj as unknown as Record<string, unknown>)['Foo']`. Renamed inside the class; reported
 *     everywhere else, because a same-named string key on an unrelated object is indistinguishable
 *     from syntax alone.
 *   - **Serialization** — `private` is erased at runtime, so `JSON.stringify(instance)` emits the
 *     field under whatever name it has. A class whose instances are serialized has a persisted
 *     shape that a rename would silently change. Flagged for a human. MJ's metadata classes are
 *     the sharp case: `DataContextItem._Data` is written by stringify and read straight back by
 *     `FromRawItem(rawItem: any)`, where the `any` means nothing fails to compile either way.
 *   - **Runtime string lookup** — `BaseEngine` resolves its configs with
 *     `(this as Record<string, unknown>)[config.PropertyName]`, and `GetConfigData` /
 *     `ObserveProperty` take the same string. A field renamed out from under one of those strings
 *     loads into a property nothing reads, and every getter quietly returns empty.
 *   - **Overriding** — the type system says a `private` member cannot be overridden; the runtime
 *     disagrees. A subclass declaring the same name shadows it on the prototype, and TypeScript
 *     never objects when that subclass lives in a test file outside the package's compile. Four of
 *     CodeGenLib's suites override the private `ManageMetadataBase.LogSQLAndExecute` to capture SQL.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const tsModule = await import('typescript');
/** @type {import('typescript')} */
const ts = tsModule.default ?? tsModule;

/** Why a finding was left alone. Same contract as the stub codemod: report, never guess. */
const SKIP_REASONS = {
    NoDeclarationFound: 'no private declaration matched the finding at that line',
    NameCollision: 'the camelCase name is already declared in this class',
    NameClaimedThisRun: 'another member in this class already takes that camelCase name in this run',
    AncestorConflict:
        'a class in the same hierarchy declares the same private name — TypeScript rejects two separate declarations of one private property across a hierarchy (TS2415). The index is REPO-WIDE on purpose: `ProviderBase` lives in MJCore and the subclasses that already claimed its camelCase name live in two other packages entirely',
    Serialized:
        'the class is serialized somewhere in this package (JSON.stringify / structuredClone), and `private` is erased at runtime — so the field name is part of a persisted shape that a rename would change silently',
    BracketOutsideClass: 'the old name is reached by bracket access outside the declaring class, where a same-named key on an unrelated object is indistinguishable from syntax alone',
    Overridden:
        'a subclass declares the same name. TypeScript treats overriding a private member as impossible and so never reports it, but the prototype does not care: the subclass member shadows the base one, and after a rename the base calls the new name while the override sits under the old one, intercepting nothing. Silent — no compile error, just a stub that never runs',
    RuntimeStringLookup:
        'the name appears as a string literal — either through a known runtime-lookup API (BaseEngine PropertyName, GetConfigData, ObserveProperty, emitPropertyChange) or anywhere in the declaring file. Renaming the field without the string leaves the engine writing to a property nothing reads, and an equality test or a lookup key against the old name silently stops matching',
};

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { findings: null, package: null, apply: false, limit: Infinity };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--findings') args.findings = argv[++i];
        else if (a === '--package') args.package = argv[++i];
        else if (a === '--limit') args.limit = Number(argv[++i]);
        else if (a === '--skips') args.skips = argv[++i];
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.findings) throw new Error('--findings <file> is required');
    if (!args.package) throw new Error('--package <dir> is required');
    return args;
}

// ---------------------------------------------------------------------------------------------
// Edit buffer — text-range edits, so formatting survives untouched
// ---------------------------------------------------------------------------------------------

class EditBuffer {
    constructor(text) {
        this.text = text;
        /** @type {{Start:number,End:number,Text:string}[]} */
        this.edits = [];
    }
    Replace(start, end, text) {
        this.edits.push({ Start: start, End: end, Text: text });
    }
    get Changed() {
        return this.edits.length > 0;
    }
    Apply() {
        const sorted = [...this.edits].sort((a, b) => b.Start - a.Start);
        let out = this.text;
        for (const e of sorted) out = out.slice(0, e.Start) + e.Text + out.slice(e.End);
        return out;
    }
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

function listSources(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) listSources(full, out);
        else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
    }
    return out;
}

const sourceCache = new Map();
function parse(file) {
    if (sourceCache.has(file)) return sourceCache.get(file);
    let source = null;
    try {
        source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    } catch {
        source = null;
    }
    sourceCache.set(file, source);
    return source;
}

// ---------------------------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------------------------

function modifierKinds(node) {
    return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).map((m) => m.kind);
}

const isPrivate = (node) => modifierKinds(node).includes(ts.SyntaxKind.PrivateKeyword);
const isStatic = (node) => modifierKinds(node).includes(ts.SyntaxKind.StaticKeyword);

/** A class member that can carry a name we would rename. */
function isNamedMember(node) {
    return (
        ts.isPropertyDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
    );
}

/** Every class in a file, with its members indexed by name. */
function classesIn(source) {
    /** @type {{Node:import('typescript').ClassDeclaration|import('typescript').ClassExpression, Name:string|null, Members:Map<string,object[]>, Extends:string[]}[]} */
    const found = [];
    const visit = (node) => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
            const members = new Map();
            for (const member of node.members) {
                const name = member.name && ts.isIdentifier(member.name) ? member.name.text : null;
                if (!name) continue;
                if (!members.has(name)) members.set(name, []);
                members.get(name).push(member);
            }
            const extendsNames = [];
            for (const clause of node.heritageClauses ?? []) {
                if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
                for (const type of clause.types) {
                    if (ts.isIdentifier(type.expression)) extendsNames.push(type.expression.text);
                }
            }
            found.push({
                Node: node,
                Name: node.name && ts.isIdentifier(node.name) ? node.name.text : null,
                Members: members,
                Extends: extendsNames,
            });
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
    return found;
}

/**
 * Names every class declares privately, so a rename can be checked against its whole hierarchy.
 *
 * Built REPO-WIDE, and that is the point. Two separate declarations of one private name across a
 * hierarchy is TS2415, and hierarchies cross package boundaries constantly: renaming
 * `ProviderBase._ConfigData` in MJCore collided with the private `_configData` that
 * `GraphQLDataProvider` and `PostgreSQLDataProvider` each already declared, in two other packages.
 * A package-scoped index cannot see that, and the error surfaces in the SUBCLASS's build rather
 * than in the one being renamed.
 */
function buildPrivateIndex(files) {
    /** @type {Map<string, {Private:Set<string>, All:Set<string>, Extends:string[]}>} */
    const index = new Map();
    /** @type {Map<string, string[]>} class name → the classes that extend it */
    const children = new Map();
    for (const file of files) {
        const source = parse(file);
        if (!source) continue;
        for (const klass of classesIn(source)) {
            if (!klass.Name) continue;
            const entry = index.get(klass.Name) ?? { Private: new Set(), All: new Set(), Extends: klass.Extends };
            for (const [name, members] of klass.Members) {
                entry.All.add(name);
                if (members.some((m) => isPrivate(m))) entry.Private.add(name);
            }
            index.set(klass.Name, entry);
            for (const parent of klass.Extends) {
                if (!children.has(parent)) children.set(parent, []);
                children.get(parent).push(klass.Name);
            }
        }
    }
    return { Index: index, Children: children };
}

/**
 * Every name declared anywhere in a class's hierarchy — ancestors AND descendants.
 *
 * Both directions matter. TS2415 does not care which end of the chain declared the name first, so
 * a subclass that already has a private `_configData` blocks the base class from renaming into it
 * exactly as an ancestor would.
 */
/** Names declared below a class in the hierarchy — where an override would sit. */
function descendantNames(index, children, className, seen = new Set()) {
    const out = new Set();
    const visit = (name) => {
        if (seen.has(name)) return;
        seen.add(name);
        for (const child of children.get(name) ?? []) {
            for (const n of index.get(child)?.All ?? []) out.add(n);
            visit(child);
        }
    };
    visit(className);
    return out;
}

function hierarchyNames(index, children, className, seen = new Set()) {
    const out = { Private: new Set(), All: new Set() };
    const visit = (name) => {
        if (seen.has(name)) return;
        seen.add(name);
        const entry = index.get(name);
        if (!entry) return;
        if (name !== className) {
            for (const n of entry.Private) out.Private.add(n);
            for (const n of entry.All) out.All.add(n);
        }
        for (const parent of entry.Extends) visit(parent);
        for (const child of children.get(name) ?? []) visit(child);
    };
    visit(className);
    return out;
}

/**
 * Class names whose instances are serialized in this package.
 *
 * `private` is a compile-time fiction — `JSON.stringify(instance)` emits every own field under its
 * real name — so a serialized class has a persisted shape that a rename would change without any
 * compiler complaint. Matching is deliberately coarse (the argument's identifier text, and any
 * `new X()` directly inside the call), because a false positive costs one skipped rename while a
 * false negative costs a silently broken payload.
 */
function serializedClasses(files) {
    const names = new Set();
    for (const file of files) {
        const source = parse(file);
        if (!source) continue;
        const visit = (node) => {
            if (
                ts.isCallExpression(node) &&
                ((ts.isPropertyAccessExpression(node.expression) &&
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.expression.text === 'JSON' &&
                    node.expression.name.text === 'stringify') ||
                    (ts.isIdentifier(node.expression) && node.expression.text === 'structuredClone'))
            ) {
                for (const arg of node.arguments) {
                    const collect = (n) => {
                        if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text);
                        if (ts.isIdentifier(n)) names.add(n.text);
                        if (ts.isPropertyAccessExpression(n)) names.add(n.name.text);
                        ts.forEachChild(n, collect);
                    };
                    collect(arg);
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }
    return names;
}

/**
 * Names this package resolves by STRING at runtime.
 *
 * `BaseEngine` reads its configs with `(this as Record<string, unknown>)[config.PropertyName]`, and
 * `GetConfigData` / `ObserveProperty` / `emitPropertyChange` take the same string. None of that is
 * type-checked against the class, so a field renamed out from under one of these strings still
 * compiles — the engine just loads into a property nothing reads, and every getter returns empty.
 *
 * Returns two sets, because knowing the API list is not enough. `Api` is every name reached through
 * a form named above, package-wide. `ByFile` is EVERY string literal in each file, used against the
 * declarations in that same file only. The second exists because `UserInfoEngine` shipped a
 * half-rename this guard did not catch: `PropertyName`, `ObserveProperty` and both `GetConfigData`
 * calls moved to `_userApplications`, while `c.PropertyName === '_UserApplications'` and
 * `emitPropertyChange('_UserApplications')` did not — an equality test and a call this list did not
 * know. Refusing a rename whenever the file mentions the name as a string is conservative on
 * purpose: a refused finding stays in the gate's list and a human looks at it, which is the correct
 * outcome. A silently-dropped notification is not.
 */
function runtimeStringNames(files) {
    const names = new Set();
    const perFile = new Map();
    const byNameFirstArg = new Set([
        'GetConfigData', 'ObserveProperty', 'configLoadedSuccessfully', 'emitPropertyChange',
    ]);
    for (const file of files) {
        const source = parse(file);
        if (!source) continue;
        const literals = new Set();
        const visit = (node) => {
            if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'PropertyName' &&
                ts.isStringLiteralLike(node.initializer)) {
                names.add(node.initializer.text);
            }
            if (ts.isCallExpression(node)) {
                const callee = node.expression;
                const called = ts.isIdentifier(callee) ? callee.text
                    : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
                if (byNameFirstArg.has(called) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
                    names.add(node.arguments[0].text);
                }
            }
            // Every string literal in the file, whatever it is doing. The named forms above are
            // the APIs we know; this catches the ones we do not — `c.PropertyName === '_x'`,
            // a key in a lookup table, a name passed to something this script has never heard of.
            if (ts.isStringLiteralLike(node)) literals.add(node.text);
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
        perFile.set(file, literals);
    }
    return { Api: names, ByFile: perFile };
}

/** `this` at the top of the expression chain — `this.X`, not `foo.this`. */
const isThis = (node) => node.kind === ts.SyntaxKind.ThisKeyword;

/**
 * Rewrite every reference to `renames` inside one class body.
 *
 * Covers the forms a private member can legally appear in:
 *   - the declaration's own name
 *   - `this.Foo` and `this['Foo']`
 *   - `ClassName.Foo` for a private static
 *   - `other.Foo`, where `other` is annotated with the owning class — TypeScript permits reaching
 *     into another instance's privates from inside the class, and `equals(o: Foo)` does it routinely
 */
function rewriteClassBody(klass, renames, buffer, source, className) {
    let count = 0;
    const move = (node, text) => {
        buffer.Replace(node.getStart(source), node.end, text);
        count++;
    };

    // Identifiers bound to this class by an explicit type annotation, so `other.Foo` is reachable.
    const sameClassBindings = new Set();
    const collectBindings = (node) => {
        if (
            (ts.isParameter(node) || ts.isVariableDeclaration(node)) &&
            ts.isIdentifier(node.name) &&
            node.type &&
            ts.isTypeReferenceNode(node.type) &&
            ts.isIdentifier(node.type.typeName) &&
            node.type.typeName.text === className
        ) {
            sameClassBindings.add(node.name.text);
        }
        ts.forEachChild(node, collectBindings);
    };
    ts.forEachChild(klass.Node, collectBindings);

    for (const member of klass.Node.members) {
        if (!isNamedMember(member) || !member.name || !ts.isIdentifier(member.name)) continue;
        const to = renames.get(member.name.text);
        if (to) move(member.name, to);
    }

    const visit = (node) => {
        if (ts.isPropertyAccessExpression(node)) {
            const to = renames.get(node.name.text);
            if (to) {
                const target = node.expression;
                const onThis = isThis(target);
                const onClass = ts.isIdentifier(target) && target.text === className;
                const onSibling = ts.isIdentifier(target) && sameClassBindings.has(target.text);
                if (onThis || onClass || onSibling) move(node.name, to);
            }
        }
        if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
            const to = renames.get(node.argumentExpression.text);
            if (to) {
                const target = node.expression;
                if (isThis(target) || (ts.isIdentifier(target) && target.text === className)) {
                    const quote = source.text[node.argumentExpression.getStart(source)];
                    move(node.argumentExpression, `${quote}${to}${quote}`);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(klass.Node, visit);
    return count;
}

/** Bracket access to a name from anywhere outside its declaring class — the silent-break form. */
function bracketAccessOutside(files, names, declaringFile) {
    /** @type {Map<string, string[]>} name → "file:line" */
    const hits = new Map();
    for (const file of files) {
        const source = parse(file);
        if (!source) continue;
        const inThisFile = file === declaringFile;
        const visit = (node) => {
            if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
                const name = node.argumentExpression.text;
                if (names.has(name) && !(inThisFile && isThis(node.expression))) {
                    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
                    if (!hits.has(name)) hits.set(name, []);
                    hits.get(name).push(`${file}:${line}`);
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }
    return hits;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd());
const worklist = JSON.parse(readFileSync(args.findings, 'utf8'));
const packageDir = args.package.replace(/\/$/, '');

const PRIVATE_FINDING = /^private member "([^"]+)" is PascalCase — private members are camelCase; rename to "([^"]+)"$/;

const selected = worklist.Findings.filter(
    (f) => (f.Severity ?? 'error') === 'error' && f.File.startsWith(`${packageDir}/`) && PRIVATE_FINDING.test(f.Message),
).slice(0, args.limit);

const packageFiles = listSources(join(repoRoot, packageDir));
// The hierarchy index spans every package: see buildPrivateIndex. The serialization scan stays
// package-local, because it is looking for the call sites that persist THIS package's classes.
const { Index: privateIndex, Children: childIndex } = buildPrivateIndex(listSources(join(repoRoot, 'packages')));
const serialized = serializedClasses(packageFiles);
const runtimeStrings = runtimeStringNames(packageFiles);

/** @type {Map<string, object[]>} */
const byFile = new Map();
for (const finding of selected) {
    if (!byFile.has(finding.File)) byFile.set(finding.File, []);
    byFile.get(finding.File).push(finding);
}

const skipped = [];
let renamedMembers = 0;
let rewrittenRefs = 0;
const changedFiles = [];
/** @type {Map<string,string[]>} */
const bracketWarnings = new Map();

for (const [relFile, findings] of byFile) {
    const absolute = join(repoRoot, relFile);
    const source = parse(absolute);
    if (!source) {
        for (const f of findings) skipped.push({ Finding: f, Reason: SKIP_REASONS.NoDeclarationFound });
        continue;
    }
    const buffer = new EditBuffer(source.text);
    const classes = classesIn(source);

    for (const klass of classes) {
        /** @type {Map<string,string>} old → new, for this class only */
        const renames = new Map();
        const claimed = new Set();

        for (const finding of findings) {
            const match = PRIVATE_FINDING.exec(finding.Message);
            if (!match) continue;
            const [, oldName, newName] = match;
            const members = klass.Members.get(oldName);
            if (!members) continue;
            const declaration = members.find(
                (m) =>
                    isPrivate(m) &&
                    isNamedMember(m) &&
                    source.getLineAndCharacterOfPosition(m.name.getStart(source)).line + 1 === finding.Line,
            );
            if (!declaration) continue;

            if (klass.Members.has(newName)) {
                skipped.push({ Finding: finding, Reason: SKIP_REASONS.NameCollision });
                continue;
            }
            if (claimed.has(newName)) {
                skipped.push({ Finding: finding, Reason: SKIP_REASONS.NameClaimedThisRun });
                continue;
            }
            if (klass.Name) {
                const hierarchy = hierarchyNames(privateIndex, childIndex, klass.Name);
                if (hierarchy.All.has(newName) || hierarchy.Private.has(oldName)) {
                    skipped.push({ Finding: finding, Reason: SKIP_REASONS.AncestorConflict });
                    continue;
                }
                // A subclass declaring the old name is an override the type system cannot see.
                if (descendantNames(privateIndex, childIndex, klass.Name).has(oldName)) {
                    skipped.push({ Finding: finding, Reason: SKIP_REASONS.Overridden });
                    continue;
                }
                if (serialized.has(klass.Name)) {
                    skipped.push({ Finding: finding, Reason: SKIP_REASONS.Serialized });
                    continue;
                }
            }
            if (runtimeStrings.Api.has(oldName) || runtimeStrings.ByFile.get(absolute)?.has(oldName)) {
                skipped.push({ Finding: finding, Reason: SKIP_REASONS.RuntimeStringLookup });
                continue;
            }
            claimed.add(newName);
            renames.set(oldName, newName);
        }

        if (renames.size === 0) continue;

        // A name reached by bracket access from outside this file cannot be moved safely — a
        // same-named string key on an unrelated object looks identical. Drop those and report.
        const outside = bracketAccessOutside(packageFiles, new Set(renames.keys()), absolute);
        for (const [name, sites] of outside) {
            const finding = findings.find((f) => PRIVATE_FINDING.exec(f.Message)?.[1] === name);
            if (finding) skipped.push({ Finding: finding, Reason: SKIP_REASONS.BracketOutsideClass });
            bracketWarnings.set(name, sites);
            renames.delete(name);
        }
        if (renames.size === 0) continue;

        rewrittenRefs += rewriteClassBody(klass, renames, buffer, source, klass.Name ?? '');
        renamedMembers += renames.size;
    }

    if (!buffer.Changed) continue;
    changedFiles.push(relFile);
    if (args.apply) writeFileSync(absolute, buffer.Apply(), 'utf8');
}

if (!args.apply) console.log('DRY RUN (nothing written)');
if (args.skips) {
    // The reason a private member could not move is the only durable record of why the gate still
    // reports it, so it has to travel to whatever marks it.
    writeFileSync(
        args.skips,
        JSON.stringify(
            skipped.map((s2) => ({ File: s2.Finding.File, Line: s2.Finding.Line, Reason: s2.Reason })),
            null,
            2,
        ),
    );
}

console.log(`  selected findings : ${selected.length}`);
console.log(`  renamed           : ${renamedMembers}   across ${changedFiles.length} file(s)`);
console.log(`  references moved  : ${rewrittenRefs}`);
console.log(`  skipped           : ${skipped.length}`);

if (skipped.length > 0) {
    const byReason = new Map();
    for (const s of skipped) byReason.set(s.Reason, (byReason.get(s.Reason) ?? 0) + 1);
    console.log('\n  skipped, by reason:');
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(count).padStart(6)}  ${reason}`);
    }
}
if (bracketWarnings.size > 0) {
    console.log('\n  bracket access outside the declaring class (needs a human):');
    for (const [name, sites] of bracketWarnings) {
        console.log(`    ${name}: ${sites.map((s) => relative(repoRoot, s)).join(', ')}`);
    }
}
