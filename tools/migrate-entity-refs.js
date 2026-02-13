#!/usr/bin/env node
/**
 * MemberJunction v5.0 Entity Reference Migration Tool
 *
 * Migrates TypeScript source files from old entity class names and entity name strings
 * to the new MJ-prefixed versions. Reads the rename map from plans/entity-full-rename-map.json.
 *
 * Three replacement strategies:
 *   1. Class names (regex with word boundaries): OldNameEntity -> MJOldNameEntity
 *   2. Multi-word entity names (regex with quote boundaries): 'Old Name' -> 'MJ: Old Name'
 *   3. Single-word entity names (TypeScript AST): Only replaces string literals that appear
 *      in confirmed entity-name contexts (EntityName properties, GetEntityObject args,
 *      RegisterClass decorators, etc.)
 *
 * Usage:
 *   node tools/migrate-entity-refs.js [--dry-run] [--verbose] <file1> [file2] ...
 *   node tools/migrate-entity-refs.js [--dry-run] [--verbose] --glob "packages/[star][star]/[star].ts"
 *
 * Options:
 *   --dry-run   Show what would change without writing files
 *   --verbose   Show each individual replacement
 *   --glob      Process files matching a glob pattern (requires glob support)
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const targetFiles = args.filter(a => !a.startsWith('--'));

if (targetFiles.length === 0) {
    console.log('MJ v5.0 Entity Reference Migration Tool');
    console.log('========================================');
    console.log('Usage: node tools/migrate-entity-refs.js [--dry-run] [--verbose] <file1> [file2] ...');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run   Show what would change without writing files');
    console.log('  --verbose   Show each individual replacement');
    process.exit(1);
}

// ── Load rename map ─────────────────────────────────────────────────────────
const repoRoot = path.resolve(__dirname, '..');
const mapPath = path.join(repoRoot, 'plans', 'entity-full-rename-map.json');

if (!fs.existsSync(mapPath)) {
    console.error(`Error: Rename map not found at ${mapPath}`);
    process.exit(1);
}

const renameMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));

// ── Utility ─────────────────────────────────────────────────────────────────
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Build replacement rules ─────────────────────────────────────────────────

// Strategy 1: Class name rules — regex with word boundaries
// OldClassNameEntity -> NewClassNameEntity (and OldClassNameEntityType -> NewClassNameEntityType)
// Uses negative lookbehind for / and . to avoid matching inside file paths
// (e.g., import { Foo } from './custom/OldClassNameEntity' should NOT rename the path)
const classRules = [];
for (const entry of renameMap) {
    if (entry.classNameChanged) {
        const oldClass = entry.oldClassName + 'Entity';
        const newClass = entry.newClassName + 'Entity';
        // Also handle generated suffixed variants (longest-first to avoid partial matches):
        //   OldClassNameEntityType -> NewClassNameEntityType  (zod inferred type alias)
        //   OldClassNameSchema     -> NewClassNameSchema      (zod schema constant)
        //   OldClassNameEntity     -> NewClassNameEntity      (class name itself)
        const suffixes = ['EntityType', 'Schema', 'Entity'];
        for (const suffix of suffixes) {
            const oldName = entry.oldClassName + suffix;
            const newName = entry.newClassName + suffix;
            classRules.push({
                old: oldName,
                new: newName,
                pattern: new RegExp(`(?<![/.])\\b${escapeRegExp(oldName)}\\b`, 'g')
            });
        }
    }
}

// Strategy 2: Multi-word entity name rules — regex with quote boundaries
// 'Old Entity Name' -> 'MJ: Old Entity Name'
const nameRules = [];
for (const entry of renameMap) {
    if (entry.nameChanged && entry.oldName.includes(' ')) {
        const escaped = escapeRegExp(entry.oldName);
        nameRules.push({
            old: entry.oldName,
            new: entry.newName,
            singleQuotePattern: new RegExp(`(?<=')${escaped}(?=')`, 'g'),
            doubleQuotePattern: new RegExp(`(?<=")${escaped}(?=")`, 'g'),
            backtickPattern: new RegExp(`(?<=\`)${escaped}(?=\`)`, 'g')
        });
    }
}

// Strategy 3: Single-word entity name rules — handled via TypeScript AST
// These are too ambiguous for regex (e.g., 'Actions' could be a type literal).
// We use the TS compiler to parse each file, find StringLiteral nodes, and
// only replace those in confirmed entity-name contexts.
const singleWordNameMap = new Map();
for (const entry of renameMap) {
    if (entry.nameChanged && !entry.oldName.includes(' ')) {
        singleWordNameMap.set(entry.oldName, entry.newName);
    }
}

// Sort longest-first to prevent shorter patterns from matching inside longer names
classRules.sort((a, b) => b.old.length - a.old.length);
nameRules.sort((a, b) => b.old.length - a.old.length);

console.log(`Loaded ${classRules.length} class name rules, ${nameRules.length} multi-word entity name rules, and ${singleWordNameMap.size} single-word AST rules`);
if (dryRun) console.log('DRY RUN MODE - no files will be modified\n');

// ── AST context detection ───────────────────────────────────────────────────
// These functions determine if a StringLiteral node is used as an entity name.

/**
 * Known property names that hold entity name strings.
 * When a StringLiteral is the value of one of these properties, it's an entity name.
 */
const ENTITY_NAME_PROPERTIES = new Set([
    'EntityName',
    'entityName',
    'Entity',          // some older patterns
]);

/**
 * Known method names whose first argument is an entity name string.
 */
const ENTITY_NAME_METHODS_ARG0 = new Set([
    'GetEntityObject',
    'GetEntityObjectByRecord',
    'GetEntityByName',
]);

/**
 * Known method/function names whose second argument (index 1) is an entity name string.
 */
const ENTITY_NAME_METHODS_ARG1 = new Set([
    'RegisterClass',
]);

/**
 * Extracts the method/function name from a CallExpression's expression node.
 * Handles both simple calls (foo()) and property access calls (obj.foo()).
 */
function getCallName(expr) {
    if (ts.isIdentifier(expr)) {
        return expr.text;
    }
    if (ts.isPropertyAccessExpression(expr)) {
        return expr.name.text;
    }
    return null;
}

/**
 * Checks if a StringLiteral node is used as an entity name based on its AST context.
 * Returns true if the node is in a recognized entity-name position.
 */
function isEntityNameContext(node, sourceFile) {
    const parent = node.parent;
    if (!parent) return false;

    // Pattern 1: Property assignment — { EntityName: 'Actions' }
    if (ts.isPropertyAssignment(parent)) {
        const propName = parent.name;
        if (ts.isIdentifier(propName) && ENTITY_NAME_PROPERTIES.has(propName.text)) {
            // Confirm the string literal is the initializer (value), not the key
            if (parent.initializer === node) {
                return true;
            }
        }
        // Also check shorthand: EntityName: string (shouldn't happen but be safe)
    }

    // Pattern 2: Binary assignment — item.EntityName = 'Users'
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (parent.right === node && ts.isPropertyAccessExpression(parent.left)) {
            const propName = parent.left.name.text;
            if (ENTITY_NAME_PROPERTIES.has(propName)) {
                return true;
            }
        }
    }

    // Pattern 3: Call expression argument — GetEntityObject('Actions', ...)
    if (ts.isCallExpression(parent)) {
        const callName = getCallName(parent.expression);
        if (callName) {
            const argIndex = parent.arguments.indexOf(node);
            if (argIndex === 0 && ENTITY_NAME_METHODS_ARG0.has(callName)) {
                return true;
            }
            if (argIndex === 1 && ENTITY_NAME_METHODS_ARG1.has(callName)) {
                return true;
            }
        }
    }

    // Pattern 4: Decorator — @RegisterClass(BaseEntity, 'Actions')
    // Decorators wrap the call in a Decorator node, so the CallExpression is the
    // decorator's expression. The string is an argument of that call.
    if (ts.isCallExpression(parent) && parent.parent && ts.isDecorator(parent.parent)) {
        const callName = getCallName(parent.expression);
        if (callName) {
            const argIndex = parent.arguments.indexOf(node);
            if (argIndex === 1 && ENTITY_NAME_METHODS_ARG1.has(callName)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Walks a TypeScript AST and collects all StringLiteral nodes that:
 *   1. Match one of the single-word entity names
 *   2. Appear in a confirmed entity-name context
 *
 * Returns an array of { start, end, oldName, newName } sorted by start position descending
 * (so we can apply replacements from end to start without invalidating positions).
 */
function findSingleWordEntityNameReplacements(content, filePath) {
    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TS
    );

    const replacements = [];

    function visit(node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const text = node.text;
            if (singleWordNameMap.has(text)) {
                if (isEntityNameContext(node, sourceFile)) {
                    // Get the position of the string content (inside the quotes)
                    // node.getStart() includes the opening quote, node.getEnd() includes the closing quote
                    const start = node.getStart(sourceFile) + 1; // skip opening quote
                    const end = node.getEnd() - 1;                // skip closing quote
                    replacements.push({
                        start,
                        end,
                        oldName: text,
                        newName: singleWordNameMap.get(text)
                    });
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Sort descending by start position so replacements don't invalidate earlier positions
    replacements.sort((a, b) => b.start - a.start);
    return replacements;
}

// ── Process files ───────────────────────────────────────────────────────────
let totalFiles = 0;
let totalChangedFiles = 0;
let totalReplacements = 0;

for (const filePath of targetFiles) {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
        console.log(`  SKIP (not found): ${absPath}`);
        continue;
    }

    totalFiles++;
    let content = fs.readFileSync(absPath, 'utf-8');
    let fileChangeCount = 0;
    const changes = [];

    // ── Phase 1: Regex-based class name replacements ────────────────────────
    for (const rule of classRules) {
        const matches = content.match(rule.pattern);
        if (matches) {
            content = content.replace(rule.pattern, rule.new);
            fileChangeCount += matches.length;
            changes.push(`  class: ${rule.old} -> ${rule.new} (${matches.length}x)`);
        }
    }

    // ── Phase 2: Regex-based multi-word entity name replacements ────────────
    for (const rule of nameRules) {
        const quotePatterns = [
            { label: 'single-quote', pattern: rule.singleQuotePattern },
            { label: 'double-quote', pattern: rule.doubleQuotePattern },
            { label: 'backtick',     pattern: rule.backtickPattern }
        ];

        for (const { label, pattern } of quotePatterns) {
            const matches = content.match(pattern);
            if (matches) {
                content = content.replace(pattern, rule.new);
                fileChangeCount += matches.length;
                changes.push(`  name:  '${rule.old}' -> '${rule.new}' (${matches.length}x, ${label})`);
            }
        }
    }

    // ── Phase 3: AST-based single-word entity name replacements ─────────────
    if (singleWordNameMap.size > 0 && (absPath.endsWith('.ts') || absPath.endsWith('.tsx'))) {
        const astReplacements = findSingleWordEntityNameReplacements(content, absPath);
        if (astReplacements.length > 0) {
            for (const rep of astReplacements) {
                content = content.slice(0, rep.start) + rep.newName + content.slice(rep.end);
                fileChangeCount++;
                changes.push(`  ast:   '${rep.oldName}' -> '${rep.newName}' (line ${getLineNumber(content, rep.start)})`);
            }
        }
    }

    // ── Write results ───────────────────────────────────────────────────────
    if (fileChangeCount > 0) {
        totalChangedFiles++;
        totalReplacements += fileChangeCount;
        console.log(`${path.relative(repoRoot, absPath)}: ${fileChangeCount} replacement(s)`);

        if (verbose) {
            for (const c of changes) console.log(c);
        }

        if (!dryRun) {
            fs.writeFileSync(absPath, content, 'utf-8');
        }
    } else if (verbose) {
        console.log(`${path.relative(repoRoot, absPath)}: no changes`);
    }
}

// ── Utility: get line number from character position ────────────────────────
function getLineNumber(text, pos) {
    let line = 1;
    for (let i = 0; i < pos && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`Files scanned:  ${totalFiles}`);
console.log(`Files changed:  ${totalChangedFiles}`);
console.log(`Replacements:   ${totalReplacements}`);
if (dryRun) console.log('(dry-run mode - no files were written)');
console.log('Done.');
