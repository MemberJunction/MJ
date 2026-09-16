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
        'the member is optional, so a use the checker does not reach stays ASSIGNABLE after the rename and the value silently becomes undefined. A required member missing from a literal is a compile error; an optional one is a bug that ships',
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
    }
    return null;
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
            if (ts.isAsExpression(node) && ts.isCallExpression(node.expression)) {
                const callee = node.expression.expression;
                if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) &&
                    callee.expression.text === 'JSON' && callee.name.text === 'parse') {
                    try { seed(checker.getTypeAtLocation(node.type)); } catch { /* ignore */ }
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
const tainted = serializedTypes(program, files, packageDir);

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

    // `findRenameLocations` does not reach an object literal that is only STRUCTURALLY matched to
    // the type later. When the member is required that miss is a compile error and the verify pass
    // below catches it. When it is optional the literal stays assignable, the property is simply
    // absent, and nothing complains — so those are never attempted.
    if (hit.Name.parent && hit.Name.parent.questionToken) {
        skipped.push({ finding, reason: SKIP_REASONS.Optional });
        continue;
    }

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
        const key = s2.reason.replace(/ \([^)]*\)$/, '');
        byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    console.log('\n  skipped, by reason:');
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(count).padStart(5)}  ${reason}`);
    }
}
