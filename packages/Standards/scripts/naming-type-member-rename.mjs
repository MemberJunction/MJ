#!/usr/bin/env node
/**
 * @fileoverview Phase B, type-member pass — rename members of types no consumer can name.
 *
 * Repo tooling, not part of the published package (see `naming-codemod.mjs`).
 *
 * An interface is erased at compile time, so there is no runtime carrier for a `@deprecated` stub
 * and no way to keep an old member name working. That is why the other two passes leave type
 * members alone, and why the gate reports most of them as warnings. This pass handles only the
 * subset where no compatibility is owed: the type is reachable from the package's entry point
 * neither by NAME nor through any exported signature, so nothing outside the package can name it,
 * spell it in an object literal, or read it off a value.
 *
 *     node packages/Standards/scripts/naming-type-member-rename.mjs \
 *         --findings findings.json --package packages/MJCLI [--apply]
 *
 * **Renaming is done by the TypeScript LanguageService, not by text matching.** A member rename
 * has to reach every object literal that supplies the property, every access on a value of the
 * type, and every destructuring of it — which needs the type checker, not syntax. `findRenameLocations`
 * is the same call an IDE's rename uses.
 *
 * That also supplies the safety property this pass rests on: if the checker reports a rename
 * location OUTSIDE this package, the type is reachable in a way the entry-point analysis missed,
 * and the member is left alone rather than renamed across a boundary.
 *
 * The hazard the checker cannot see is SERIALIZATION. `private` and `interface` are both
 * compile-time fictions; `JSON.stringify(value)` emits whatever the property is called, and
 * `JSON.parse(text) as T` reads whatever the file or wire actually contains. A renamed member of a
 * serialized type still compiles, still passes its tests, and silently stops matching every
 * document already written. So every type reachable from a serialization sink is excluded first.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const tsModule = await import('typescript');
/** @type {import('typescript')} */
const ts = tsModule.default ?? tsModule;

const SKIP_REASONS = {
    NoDeclaration: 'no type member matched the finding at that line',
    NotRenameable: 'the language service refused to rename it (no locations returned)',
    EscapesPackage: 'the checker found a use OUTSIDE this package, so the type is reachable in a way the entry-point walk missed',
    DeclarationFile: 'a use lives in a .d.ts, which this pass does not edit',
    NameCollision: 'the PascalCase name is already declared on this type',
    Serialized:
        'the type is reachable from a serialization sink (JSON.stringify / JSON.parse-as / res.json), so the member name is part of a wire or on-disk shape that a rename would change silently',
    VendorShape:
        'the member name is snake_case, which means it mirrors an external payload rather than MJ code — the remote spelling IS the contract',
    Optional:
        'the member is optional AND the old name still occurs somewhere the checker could not type, so the rename would leave that use assignable and silently undefined. A required member missing from a literal is a compile error; an optional one is a bug that ships',
    VerifyDropped:
        'compiling the plan proved the checker had missed a use — the rename broke something it could not see from the declaration, so it was withdrawn',
    UnclaimedUse:
        'the old name still occurs on a value the checker types as `any` or cannot resolve, so the rename would not reach it and the read would silently return undefined',
    TemplateUse:
        'the old name is read from an Angular template in a package that compiles templates WITHOUT type checking (`strictTemplates: false`), so the rename would not reach it and nothing would report it — every read becomes undefined at runtime',
    StructurallyMirrored:
        'an inline type literal or generic constraint in this package describes the same shape — `T extends { name: string; schema: string; definition: string }` mirrors RoutineDef. Nothing links the two symbolically, so a rename moves one and not the other and the type stops satisfying the constraint',
};

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { findings: null, package: null, apply: false, limit: Infinity, report: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--apply') args.apply = true;
        else if (a === '--findings') args.findings = argv[++i];
        else if (a === '--package') args.package = argv[++i];
        else if (a === '--limit') args.limit = Number(argv[++i]);
        else if (a === '--report') args.report = argv[++i];
        else if (a === '--skips') args.skips = argv[++i];
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.findings) throw new Error('--findings <file> is required');
    if (!args.package) throw new Error('--package <dir> is required');
    return args;
}

// ---------------------------------------------------------------------------------------------
// Program / language service
// ---------------------------------------------------------------------------------------------

function loadProgram(packageDir, overlay = new Map()) {
    const configPath = ts.findConfigFile(packageDir, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) throw new Error(`no tsconfig.json under ${packageDir}`);
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
    // Emit is never requested, so the slow half of the compiler does not run; the checker is all
    // this needs and `noEmit` keeps a stray build from landing in dist/.
    const options = { ...parsed.options, noEmit: true };

    // Test files are deliberately added back even though every package's tsconfig excludes them.
    // A fixture typed as the interface — `const r: SyncResult = { synced: 1 }` — is a rename
    // location like any other, and leaving tests out of the program means the checker cannot see
    // it, so the rename ships and the fixture keeps the old spelling until the suite runs.
    //
    // Including them also draws the line this pass could not otherwise draw: a fixture that models
    // ON-DISK JSON is typed `Record<string, unknown>`, not the interface, so the checker leaves it
    // alone. `__mj_managed: { version, keys }` in MJCLI is exactly that — ReadManagedMeta maps
    // those lowercase keys into the PascalCase type on purpose, and they must not move.
    const extra = [];
    const walk = (dir) => {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(test|spec)\.tsx?$/.test(entry.name) || /[\\/]__tests__[\\/]/.test(full)) {
                if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) extra.push(full);
            }
        }
    };
    walk(join(packageDir, 'src'));
    const files = [...new Set([...parsed.fileNames, ...extra])];

    const registry = ts.createDocumentRegistry();
    const host = {
        getScriptFileNames: () => files,
        // The version has to change with the overlay or the document registry hands back the cached
        // pre-edit source file and the verification compiles the code it was meant to check.
        getScriptVersion: (name) => (overlay.has(name) ? `overlay-${overlay.get(name).length}` : '1'),
        getScriptSnapshot: (name) => {
            if (overlay.has(name)) return ts.ScriptSnapshot.fromString(overlay.get(name));
            if (!existsSync(name)) return undefined;
            return ts.ScriptSnapshot.fromString(readFileSync(name, 'utf8'));
        },
        getCurrentDirectory: () => dirname(configPath),
        getCompilationSettings: () => options,
        getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
    };
    const service = ts.createLanguageService(host, registry);
    return { Service: service, Program: service.getProgram(), Files: files };
}

// ---------------------------------------------------------------------------------------------
// Serialization taint
// ---------------------------------------------------------------------------------------------

/** The call shapes that turn a value into text somebody else will read back. */
function isSerializationSink(node) {
    if (!ts.isCallExpression(node)) return null;
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) {
        const object = ts.isIdentifier(callee.expression) ? callee.expression.text : '';
        const method = callee.name.text;
        if (object === 'JSON' && method === 'stringify') return node.arguments[0] ?? null;
        // res.json(payload) / res.send(payload) — an HTTP response body.
        if (method === 'json' || method === 'send') return node.arguments[0] ?? null;
        // jwt.sign(claims, secret) — the first argument becomes the token payload verbatim.
        if (method === 'sign' || method === 'encode') return node.arguments[0] ?? null;
        // storage.setItem(key, value) where the value was not stringified is still a persisted blob.
        if (method === 'setItem') return node.arguments[1] ?? null;
    }
    if (ts.isIdentifier(callee) && (callee.text === 'sign' || callee.text === 'SignJWT')) {
        return node.arguments[0] ?? null;
    }
    return null;
}

/** Callees whose RESULT is a document somebody else wrote — the other end of a sink. */
const PARSE_CALLEE = /^(parse|safeParse|json|decode|verify|load|loadAll|readJson|readJSON|parseJSON|fromJSON)$/i;

/**
 * The type a parse lands on, for `node` being any expression.
 *
 * Three spellings all mean "this shape is whatever the document already contains":
 * `JSON.parse(t) as T`, `const c: T = JSON.parse(t)`, and `readJson<T>(path)`. Only the first was
 * recognised originally, which let JWT claim sets and on-disk `package.json` mirrors through.
 */
function isParseCall(node) {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee)) return PARSE_CALLEE.test(callee.name.text);
    if (ts.isIdentifier(callee)) return PARSE_CALLEE.test(callee.text);
    return false;
}

/** Unwrap `await x`, `(x)` and `x as unknown` so the call underneath is visible. */
function unwrap(node) {
    let current = node;
    for (let i = 0; i < 8 && current; i++) {
        if (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression;
        else if (ts.isAsExpression(current) && current.type.kind === ts.SyntaxKind.UnknownKeyword) current = current.expression;
        else break;
    }
    return current;
}

/**
 * Every type name in this package that can reach a serialization boundary.
 *
 * Seeded from the value handed to a sink and from the type a `JSON.parse(...) as T` asserts, then
 * walked through property types: if `Config` is stringified and it holds a `Nested`, the members of
 * `Nested` are in the emitted document too.
 */
function serializedTypes(program, files, packageDir) {
    const checker = program.getTypeChecker();
    const tainted = new Set();
    const queue = [];

    const seed = (type) => {
        if (!type) return;
        for (const t of type.isUnionOrIntersection?.() ? type.types : [type]) {
            const name = t.aliasSymbol?.getName() ?? t.getSymbol()?.getName();
            if (name && name !== '__type' && !tainted.has(name)) {
                tainted.add(name);
                queue.push(t);
            }
        }
    };

    for (const file of files) {
        if (!file.startsWith(packageDir)) continue;
        const source = program.getSourceFile(file);
        if (!source || source.isDeclarationFile) continue;
        const visit = (node) => {
            const arg = isSerializationSink(node);
            if (arg) {
                try { seed(checker.getTypeAtLocation(arg)); } catch { /* unresolvable — nothing to seed */ }
            }
            // `JSON.parse(text) as T` and `const x: T = JSON.parse(text)` both declare that T is
            // whatever the document on disk or the wire already contains.
            if (ts.isAsExpression(node) && isParseCall(unwrap(node.expression))) {
                try { seed(checker.getTypeAtLocation(node.type)); } catch { /* ignore */ }
            }
            // `const claims: MagicLinkJWTClaims = jwt.verify(token, secret)` — the annotation is the
            // only place the shape is named, so the parse lands there with no cast to spot.
            if (ts.isVariableDeclaration(node) && node.type && node.initializer &&
                isParseCall(unwrap(node.initializer))) {
                try { seed(checker.getTypeAtLocation(node.type)); } catch { /* ignore */ }
            }
            // `readJson<MemberPackageJson>(path)` — the shape is a type ARGUMENT, never written as a
            // cast and never annotated.
            if (ts.isCallExpression(node) && node.typeArguments?.length && isParseCall(node)) {
                for (const argument of node.typeArguments) {
                    try { seed(checker.getTypeAtLocation(argument)); } catch { /* ignore */ }
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }

    // Walk outward through property types — a stringified parent drags its children along.
    let guard = 0;
    while (queue.length > 0 && guard++ < 20000) {
        const type = queue.shift();
        let properties = [];
        try { properties = checker.getPropertiesOfType(type); } catch { continue; }
        for (const property of properties) {
            const declaration = property.valueDeclaration ?? property.declarations?.[0];
            if (!declaration) continue;
            try { seed(checker.getTypeOfSymbolAtLocation(property, declaration)); } catch { /* ignore */ }
        }
    }
    return tainted;
}

/**
 * Type names this package also describes ANONYMOUSLY somewhere.
 *
 * Structural typing means a member name can be depended on by a type with no symbolic link to the
 * one declaring it: `TopoSortRoutinesByDefinition<T extends { name; schema; definition }>` is
 * satisfied by `RoutineDef` purely by shape. `findRenameLocations` follows symbols, so it moves
 * `RoutineDef.name` and leaves the constraint alone, and `RoutineDef` stops satisfying it.
 *
 * The overlap threshold is two members, not one: a lone `name` or `id` is shared by half the types
 * in any codebase and would exclude nearly everything, while two matching members in one inline
 * literal is already a deliberate description of the same shape.
 */
function structurallyMirrored(program, files, packageDir) {
    const shapes = [];
    for (const file of files) {
        if (!file.startsWith(packageDir)) continue;
        const source = program.getSourceFile(file);
        if (!source || source.isDeclarationFile) continue;
        const visit = (node) => {
            if (ts.isTypeLiteralNode(node)) {
                const names = node.members
                    .filter((m) => m.name && ts.isIdentifier(m.name))
                    .map((m) => m.name.text);
                if (names.length >= 2) shapes.push(new Set(names));
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }

    const mirrored = new Set();
    for (const file of files) {
        if (!file.startsWith(packageDir)) continue;
        const source = program.getSourceFile(file);
        if (!source || source.isDeclarationFile) continue;
        const visit = (node) => {
            if (ts.isInterfaceDeclaration(node) || (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type))) {
                const members = (ts.isInterfaceDeclaration(node) ? node.members : node.type.members)
                    .filter((m) => m.name && ts.isIdentifier(m.name))
                    .map((m) => m.name.text);
                const own = new Set(members);
                for (const shape of shapes) {
                    let overlap = 0;
                    for (const n of shape) if (own.has(n)) overlap++;
                    // The inline shape must be fully describable by this type — a constraint only
                    // binds when the candidate has everything it asks for.
                    if (overlap >= 2 && overlap === shape.size) { mirrored.add(node.name.text); break; }
                }
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }
    return mirrored;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

/**
 * Every place a property NAME appears in this package, by name.
 *
 * `findRenameLocations` returns the uses the checker can connect to the declaration. What matters
 * for safety is the complement: a use it did NOT claim. Some of those are unrelated types that
 * happen to share a member name, which is fine. The rest sit on `any` — an implicit `any` binding,
 * a `JSON.parse` result, a `vi.fn()` whose return type was inferred — and those are exactly the
 * reads that keep compiling after the rename and return undefined at runtime.
 *
 * Built once for the package rather than per member; a rename wave asks this question hundreds of
 * times and the file walk is the expensive half.
 */
function occurrenceIndex(program, files, packageDir) {
    const index = new Map();
    const add = (name, entry) => {
        if (!index.has(name)) index.set(name, []);
        index.get(name).push(entry);
    };
    for (const file of files) {
        if (!file.startsWith(packageDir)) continue;
        const source = program.getSourceFile(file);
        if (!source || source.isDeclarationFile) continue;
        const visit = (node) => {
            if (ts.isPropertyAccessExpression(node)) {
                add(node.name.text, { File: file, Pos: node.name.getStart(source), Subject: node.expression, Kind: 'access' });
            } else if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
                       node.name && ts.isIdentifier(node.name)) {
                add(node.name.text, { File: file, Pos: node.name.getStart(source), Subject: node.parent, Kind: 'literal' });
            } else if (ts.isBindingElement(node) && node.propertyName && ts.isIdentifier(node.propertyName)) {
                add(node.propertyName.text, { File: file, Pos: node.propertyName.getStart(source), Subject: node.parent.parent, Kind: 'destructure' });
            } else if (ts.isElementAccessExpression(node) && node.argumentExpression &&
                       ts.isStringLiteral(node.argumentExpression)) {
                add(node.argumentExpression.text, { File: file, Pos: node.argumentExpression.getStart(source), Subject: node.expression, Kind: 'bracket' });
            }
            ts.forEachChild(node, visit);
        };
        ts.forEachChild(source, visit);
    }
    return index;
}

/**
 * Uses of `name` this rename plan would leave behind on a value the rename cannot reach.
 *
 * A site whose subject resolves to a real, unrelated type is not a hazard — half the types in any
 * codebase have a `name`. Three shapes are:
 *
 *   - `any`, where nothing will ever complain;
 *   - `unknown`, which is how a fixture SEVERS the link on purpose — `{…} as unknown as Context`
 *     is a double cast, and the literal inside it is checked against nothing;
 *   - a bare literal with no contextual type at all whose keys are this very type's members. That
 *     is a hand-built fixture, assigned to an inferred `const` and passed somewhere untyped.
 *
 * The last test is the same shape-matching heuristic that proved unsafe when used to REWRITE such
 * literals. Used to decline a rename it is safe in the way the other direction was not: the cost of
 * a false positive is one member that keeps its old spelling, not a silently corrupted fixture.
 */
function unclaimedHazards(checker, index, name, claimedKeys, ownerMembers) {
    const hazards = [];
    for (const use of index.get(name) ?? []) {
        if (claimedKeys.has(`${use.File}:${use.Pos}`)) continue;
        let contextual = null;
        let type = null;
        try {
            if (use.Kind === 'literal') {
                contextual = checker.getContextualType(use.Subject) ?? null;
                type = contextual ?? checker.getTypeAtLocation(use.Subject);
            } else {
                type = checker.getTypeAtLocation(use.Subject);
            }
        } catch { /* unresolved — treated as a hazard below */ }

        const flags = type ? type.flags : 0;
        const untyped = !type || (flags & ts.TypeFlags.Any) !== 0 || (flags & ts.TypeFlags.Unknown) !== 0;
        let text = '?';
        try { text = type ? checker.typeToString(type) : '(unresolved)'; } catch { /* keep ? */ }

        let detached = false;
        if (!untyped && use.Kind === 'literal' && !contextual && ownerMembers && ts.isObjectLiteralExpression(use.Subject)) {
            const keys = use.Subject.properties
                .filter((property) => property.name && ts.isIdentifier(property.name))
                .map((property) => property.name.text);
            const overlap = keys.filter((key) => ownerMembers.has(key)).length;
            detached = overlap >= 2 && keys.every((key) => ownerMembers.has(key));
        }

        if (untyped || detached) {
            hazards.push({ File: use.File, Pos: use.Pos, Kind: use.Kind, Type: detached ? `detached fixture (${text})` : text });
        }
    }
    return hazards;
}

/**
 * Member names read from an Angular template in a package Angular does NOT type-check.
 *
 * `strictTemplates: false` is a legitimate choice — `ng-core-entity-forms` sets it because the
 * generated forms blow TypeScript's expression-complexity limit (TS2563) — but it turns off type
 * checking for EVERY template expression in the package, hand-written ones included. The language
 * service never sees a template, so the "the compile proved it" safety this pass rests on proves
 * nothing there: four templates in that package shipped reading pre-rename names, and every read
 * was `undefined`.
 *
 * Returns an empty set for a strict-template package, where the compiler does the checking.
 *
 * The match is deliberately coarse — any `.name` in any template in the package, whatever the
 * receiver. Refusing costs a human review; accepting ships a blank panel or a thrown expression.
 */
function templateReadNames(packageDir) {
    if (!isBasicTemplateMode(packageDir)) return new Set();
    const names = new Set();
    const add = (text) => {
        for (const m of text.matchAll(/\.([A-Za-z_$][A-Za-z0-9_$]*)\b/g)) names.add(m[1]);
    };
    const walk = (dir) => {
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.html')) add(readFileSync(full, 'utf8'));
            else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
                const text = readFileSync(full, 'utf8');
                for (const m of text.matchAll(/template:\s*`([\s\S]*?)`/g)) add(m[1]);
            }
        }
    };
    walk(packageDir);
    return names;
}

/** Does this package compile its templates without type checking? Follows one `extends` hop. */
function isBasicTemplateMode(packageDir, depth = 0) {
    const config = join(packageDir, 'tsconfig.json');
    if (depth > 4 || !existsSync(config)) return false;
    const text = readFileSync(config, 'utf8');
    if (/"strictTemplates"\s*:\s*false/.test(text)) return true;
    if (/"strictTemplates"\s*:\s*true/.test(text)) return false;
    const extend = /"extends"\s*:\s*"([^"]+)"/.exec(text);
    if (!extend) return false;
    const target = resolve(packageDir, extend[1]);
    return isBasicTemplateMode(dirname(target), depth + 1);
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(process.cwd());
const packageRel = args.package.replace(/\/$/, '');
const packageDir = join(repoRoot, packageRel);

const TYPE_MEMBER = /^exported (interface|type|enum) member "([^"]+)" is not PascalCase — rename to "([^"]+)"$/;
const worklist = JSON.parse(readFileSync(args.findings, 'utf8'));
const selected = worklist.Findings.filter(
    (f) => (f.Severity ?? 'error') === 'error' && f.File.startsWith(`${packageRel}/`) && TYPE_MEMBER.test(f.Message),
).slice(0, args.limit);

if (selected.length === 0) {
    console.log('nothing selected');
    process.exit(0);
}

const { Service: service, Program: program, Files: files } = loadProgram(packageDir);
const checker = program.getTypeChecker();
const tainted = serializedTypes(program, files, packageDir);
const occurrences = occurrenceIndex(program, files, packageDir);
const templateNames = templateReadNames(packageDir);

/** The type declaration that owns the member at this line, and the member's name node. */
function memberAt(source, line, oldName) {
    let hit = null;
    const visit = (node, owner) => {
        const nextOwner =
            ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)
                ? node
                : owner;
        if (
            (ts.isPropertySignature(node) || ts.isMethodSignature(node) || ts.isEnumMember(node)) &&
            node.name &&
            ts.isIdentifier(node.name) &&
            node.name.text === oldName &&
            source.getLineAndCharacterOfPosition(node.name.getStart(source)).line + 1 === line
        ) {
            hit = { Name: node.name, Owner: nextOwner };
        }
        ts.forEachChild(node, (c) => visit(c, nextOwner));
    };
    ts.forEachChild(source, (c) => visit(c, null));
    return hit;
}

const skipped = [];
/** One member's whole rename: every location the checker says belongs to it. */
const plans = [];
const claimed = new Set();

for (const finding of selected) {
    const [, , oldName, newName] = TYPE_MEMBER.exec(finding.Message);
    const absolute = join(repoRoot, finding.File);
    const source = program.getSourceFile(absolute);
    if (!source) { skipped.push({ finding, reason: SKIP_REASONS.NoDeclaration }); continue; }

    const hit = memberAt(source, finding.Line, oldName);
    if (!hit) { skipped.push({ finding, reason: SKIP_REASONS.NoDeclaration }); continue; }

    // A snake_case member is mirroring somebody else's JSON. PascalCasing it is not a style fix.
    if (oldName.includes('_')) { skipped.push({ finding, reason: SKIP_REASONS.VendorShape }); continue; }

    const ownerName = hit.Owner?.name?.text;
    if (ownerName && tainted.has(ownerName)) { skipped.push({ finding, reason: SKIP_REASONS.Serialized }); continue; }

    if (hit.Owner && ts.isInterfaceDeclaration(hit.Owner) &&
        hit.Owner.members.some((m) => m.name && ts.isIdentifier(m.name) && m.name.text === newName)) {
        skipped.push({ finding, reason: SKIP_REASONS.NameCollision });
        continue;
    }
    const claimKey = `${ownerName ?? finding.File}:${newName}`;
    if (claimed.has(claimKey)) { skipped.push({ finding, reason: SKIP_REASONS.NameCollision }); continue; }

    let locations;
    try {
        // `providePrefixAndSuffixTextForRename` is what makes a SHORTHAND property survive.
        // `{ host, port }` is two shorthand assignments; renaming the member to `Host` and simply
        // replacing the identifier yields `{ Host, port }`, which no longer refers to the local
        // `host` and stops compiling. With the preference on, the service returns
        // `suffixText: ': host'` so the edit expands the shorthand to `{ Host: host, port }`.
        locations = service.findRenameLocations(absolute, hit.Name.getStart(source), false, false, {
            providePrefixAndSuffixTextForRename: true,
        });
    } catch {
        locations = undefined;
    }
    if (!locations || locations.length === 0) { skipped.push({ finding, reason: SKIP_REASONS.NotRenameable }); continue; }

    const escapes = locations.find((l) => !l.fileName.startsWith(packageDir));
    if (escapes) { skipped.push({ finding, reason: `${SKIP_REASONS.EscapesPackage} (${relative(repoRoot, escapes.fileName)})` }); continue; }
    if (locations.some((l) => /\.d\.[mc]?ts$/.test(l.fileName))) { skipped.push({ finding, reason: SKIP_REASONS.DeclarationFile }); continue; }

    // What the checker did NOT claim is the whole question. A leftover use on a real, unrelated
    // type is fine; one on `any` is a read that keeps compiling and starts returning undefined.
    // For a REQUIRED member a missed literal is a compile error the verify pass below catches, so
    // only the untyped sites matter. For an OPTIONAL one nothing ever complains, which is why the
    // same evidence is fatal there rather than merely reported.
    const optional = Boolean(hit.Name.parent && hit.Name.parent.questionToken);
    const claimedKeys = new Set(locations.map((l) => `${l.fileName}:${l.textSpan.start}`));
    const ownerMembers = new Set(
        (hit.Owner && ts.isInterfaceDeclaration(hit.Owner) ? hit.Owner.members : [])
            .filter((m) => m.name && ts.isIdentifier(m.name))
            .map((m) => m.name.text),
    );
    const hazards = unclaimedHazards(checker, occurrences, oldName, claimedKeys, ownerMembers);
    if (hazards.length > 0) {
        const where = hazards.slice(0, 3).map((h) => `${relative(repoRoot, h.File)} (${h.Kind}, ${h.Type})`).join('; ');
        skipped.push({ finding, reason: `${optional ? SKIP_REASONS.Optional : SKIP_REASONS.UnclaimedUse} [${where}]` });
        continue;
    }

    if (templateNames.has(oldName)) {
        skipped.push({ finding, reason: SKIP_REASONS.TemplateUse });
        continue;
    }

    claimed.add(claimKey);
    plans.push({
        Finding: finding,
        Owner: ownerName ?? finding.File,
        Edits: locations.map((l) => ({
            File: l.fileName,
            Start: l.textSpan.start,
            End: l.textSpan.start + l.textSpan.length,
            Text: `${l.prefixText ?? ''}${newName}${l.suffixText ?? ''}`,
        })),
    });
}

// ---------------------------------------------------------------------------------------------
// Verify, drop, repeat
// ---------------------------------------------------------------------------------------------

/** Apply a set of plans to an in-memory copy of the package. */
function overlayFor(active) {
    const byFile = new Map();
    for (const plan of active) {
        for (const e of plan.Edits) {
            if (!byFile.has(e.File)) byFile.set(e.File, []);
            byFile.get(e.File).push(e);
        }
    }
    const overlay = new Map();
    for (const [file, edits] of byFile) {
        let text = readFileSync(file, 'utf8');
        for (const e of [...edits].sort((a, b) => b.Start - a.Start)) {
            text = text.slice(0, e.Start) + e.Text + text.slice(e.End);
        }
        overlay.set(file, text);
    }
    return overlay;
}

function diagnosticsFor(overlay) {
    const { Program: p } = loadProgram(packageDir, overlay);
    const out = [];
    for (const file of p.getSourceFiles()) {
        if (!file.fileName.startsWith(packageDir) || file.isDeclarationFile) continue;
        for (const d of p.getSemanticDiagnostics(file)) {
            out.push({ File: file.fileName, Message: ts.flattenDiagnosticMessageText(d.messageText, ' ') });
        }
    }
    return out;
}

/**
 * Compile the plan before writing it, and drop whatever breaks.
 *
 * This is the step that makes the pass safe to run unattended. Structural typing means a member
 * name can be depended on by code the checker's rename never visits — an object literal built in a
 * `.map()` callback and assigned to `SchemaDef[]`, a generic constraint describing the same shape.
 * Those misses are compile errors, and the diagnostic names the type, so the offending owner can be
 * excluded and the plan recomputed until the package compiles exactly as well as it did before.
 */
const baseline = new Set(diagnosticsFor(new Map()).map((d) => `${d.File}|${d.Message}`));
let active = plans;
const dropped = [];
for (let round = 1; round <= 14; round++) {
    const introduced = diagnosticsFor(overlayFor(active)).filter((d) => !baseline.has(`${d.File}|${d.Message}`));
    if (introduced.length === 0) break;

    // Diagnostics usually name the type they could not satisfy — "... is not assignable to type
    // 'SchemaDef[]'" — so the owner can be blamed directly.
    const blamed = new Set();
    for (const d of introduced) for (const m of d.Message.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) blamed.add(m[0]);
    const before = active.length;
    let kept = active.filter((p) => !blamed.has(p.Owner));

    if (kept.length === before) {
        // A structural mismatch prints the literal's SHAPE rather than any type name — "Type '{ schema:
        // string; sqlQuery: string; … }' is not assignable" — so the owner never appears. The member
        // names do, under one spelling or the other.
        kept = active.filter((p) => {
            const [, , Old, New] = TYPE_MEMBER.exec(p.Finding.Message);
            return !blamed.has(Old) && !blamed.has(New);
        });
    }
    if (kept.length === before) {
        // Sometimes the named type is the TARGET rather than the thing renamed — a function value
        // that stopped matching `SpawnWorkspaceProcess`. Fall back to blaming every rename that
        // edited a file the new diagnostic appears in. Coarser, but it always makes progress.
        const files = new Set(introduced.map((d) => d.File));
        kept = active.filter((p) => !p.Edits.some((e) => files.has(e.File)));
    }
    if (kept.length === before) {
        console.error(`  verification still reports ${introduced.length} new error(s) with nothing to drop:`);
        for (const d of introduced.slice(0, 5)) console.error(`      ${relative(repoRoot, d.File)}: ${d.Message.slice(0, 140)}`);
        process.exit(1);
    }
    const keptSet = new Set(kept);
    for (const p of active) if (!keptSet.has(p)) dropped.push(p);
    active = kept;
}

const finalOverlay = overlayFor(active);
if (args.apply) for (const [file, text] of finalOverlay) writeFileSync(file, text, 'utf8');

// The applied map, for the follow-up sweep over test fixtures. Those build these objects by hand
// with no contextual type, so the checker never saw them and this pass could not move them.
if (args.skips) {
    // The skipped findings carry the only durable record of WHY a member could not move. The gate
    // still reports them, so the reason has to travel to whatever marks them.
    const droppedRecords = dropped.map((plan) => ({
        finding: plan.Finding,
        reason: SKIP_REASONS.VerifyDropped,
    }));
    writeFileSync(
        args.skips,
        JSON.stringify(
            [...skipped, ...droppedRecords].map((s2) => ({
                File: s2.finding.File,
                Line: s2.finding.Line,
                Message: s2.finding.Message,
                Reason: s2.reason,
                Category: s2.reason.replace(/ \[[^\]]*\]$/, '').replace(/ \([^)]*\)$/, ''),
            })),
            null,
            2,
        ),
    );
}

if (args.report) {
    writeFileSync(
        args.report,
        JSON.stringify(
            active.map((p) => {
                const [, , Old, New] = TYPE_MEMBER.exec(p.Finding.Message);
                return { Owner: p.Owner, Old, New, File: p.Finding.File };
            }),
            null,
            2,
        ),
    );
}

if (!args.apply) console.log('DRY RUN (nothing written)');
console.log(`  selected          : ${selected.length}`);
console.log(`  renamed           : ${active.length}   across ${finalOverlay.size} file(s)`);
console.log(`  rename locations  : ${active.reduce((n, p) => n + p.Edits.length, 0)}`);
console.log(`  serialized types  : ${tainted.size} excluded from consideration`);
console.log(`  dropped on verify : ${dropped.length}   (the compile proved the checker missed a use)`);
console.log(`  skipped           : ${skipped.length}`);
if (skipped.length > 0) {
    const byReason = new Map();
    for (const s2 of skipped) {
        const key = s2.reason.replace(/ \[[^\]]*\]$/, '').replace(/ \([^)]*\)$/, '');
        byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    console.log('\n  skipped, by reason:');
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(count).padStart(5)}  ${reason}`);
    }
}
