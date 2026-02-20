/**
 * AST-based scanner/fixer for hardcoded entity names AND class name references
 * in TypeScript source code, for the MemberJunction v5.0 migration.
 *
 * Three replacement strategies (ported from tools/migrate-entity-refs.js):
 *
 *   1. **Class names** (regex with word boundaries):
 *      - Explicit subclass renames (from subclass-rename-map.ts):
 *        `ActionEntityServerEntity` → `MJActionEntityServer`,
 *        `UserViewEntity_Server` → `MJUserViewEntityServer`,
 *        `QueryFormExtendedComponent` → `MJQueryFormComponentExtended`
 *      - CodeGen artifacts (auto-generated per entity):
 *        `ActionEntity` → `MJActionEntity`,
 *        `ActionSchema` → `MJActionSchema`,
 *        `ActionEntityType` → `MJActionEntityType`
 *
 *   2. **Multi-word entity names** (regex with quote boundaries):
 *      `'Action Categories'` → `'MJ: Action Categories'`
 *
 *   3. **Single-word entity names** (TypeScript AST):
 *      Only replaces string literals in confirmed entity-name contexts
 *      (EntityName properties, GetEntityObject args, RegisterClass decorators, etc.)
 *
 * Usage (via MJCLI):
 *   mj codegen 5-0-fix-entity-names --path packages/Angular
 *   mj codegen 5-0-fix-entity-names --path packages/Angular --fix
 *
 * Or programmatically:
 *   import { scanEntityNames } from '@memberjunction/codegen-lib';
 *   const result = await scanEntityNames({ TargetPath: './packages' });
 */

import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { ENTITY_RENAME_MAP, type EntityRenameEntry } from './entity-rename-map';
import { SUBCLASS_RENAME_MAP, type SubclassRenameCategory, type SubclassRenameEntry } from './subclass-rename-map';
export { SUBCLASS_RENAME_MAP, type SubclassRenameCategory, type SubclassRenameEntry };

// ============================================================================
// Public Types
// ============================================================================

/** The kind of pattern where an old name was found. */
export type EntityNamePatternKind =
    | 'GetEntityObject'
    | 'OpenEntityRecord'
    | 'EntityNameMethod'     // Other methods that take entity name as first arg
    | 'EntityNameProperty'
    | 'RegisterClass'
    | 'NameComparison'       // .Name === 'OldName' or .Entity === 'OldName'
    | 'ClassName'            // Class name reference (e.g. ActionEntity → MJActionEntity)
    | 'MultiWordEntityName'; // Multi-word entity name in quotes (regex-based)

/**
 * A single finding: one string literal or identifier in source code that uses
 * an old entity name or class name.
 */
export interface EntityNameFinding {
    /** Absolute path to the source file */
    FilePath: string;
    /** 1-based line number */
    Line: number;
    /** 0-based character offset within the line */
    Column: number;
    /** The old name found */
    OldName: string;
    /** The corrected name */
    NewName: string;
    /** The quote character used (' or " or `) — empty string for class name references */
    QuoteChar: string;
    /** 0-based start position of the token in the file */
    StartPos: number;
    /** 0-based end position of the token in the file */
    EndPos: number;
    /** The kind of pattern matched */
    PatternKind: EntityNamePatternKind;
}

/**
 * Options for the entity name scanner.
 */
export interface EntityNameScanOptions {
    /** File or directory to scan */
    TargetPath: string;
    /**
     * Path to entity_subclasses.ts for building the rename map dynamically.
     * If not provided, uses the embedded rename map compiled into this package.
     */
    EntitySubclassesPath?: string;
    /** Whether to apply fixes in place. Default: false (dry-run). */
    Fix?: boolean;
    /** Additional glob patterns to exclude from scanning. */
    ExcludePatterns?: string[];
    /** If true, logs progress to console. Default: true. */
    Verbose?: boolean;
}

/**
 * Result of a scan (and optional fix) operation.
 */
export interface EntityNameScanResult {
    Success: boolean;
    /** All findings across all scanned files */
    Findings: EntityNameFinding[];
    /** Absolute paths of files that were modified (only in fix mode) */
    FixedFiles: string[];
    /** Number of files scanned */
    FilesScanned: number;
    /** Number of entries in the rename map */
    RenameMapSize: number;
    /** Errors encountered during scanning */
    Errors: string[];
}

// Re-export the rename map types for consumers
export type { EntityRenameEntry } from './entity-rename-map';
export { ENTITY_RENAME_MAP } from './entity-rename-map';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_EXCLUDE_PATTERNS: string[] = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/__tests__/**',
    '**/*.d.ts',
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/generated/**',
    '**/Demos/**',
    '**/EntityNameScanner/**',
];

/**
 * Method names whose first string-literal argument is treated as an entity name.
 */
const ENTITY_NAME_METHODS = new Set([
    'GetEntityObject',
    'GetEntityObjectByRecord',
    'GetEntityByName',
    'EntityByName',
    'OpenEntityRecord',
    'navigateToEntity',
    'BuildRelationshipViewParamsByEntityName',
    'NewRecordValues',
    'IsCurrentTab',
]);

/**
 * Property names that hold entity name strings in property assignments.
 * Matches the original migrate-entity-refs.js ENTITY_NAME_PROPERTIES set.
 */
const ENTITY_NAME_ASSIGNMENT_PROPS = new Set([
    'EntityName',
    'entityName',
    'Entity',
]);

/**
 * Property names that, when used in a `=== 'OldName'` or `!== 'OldName'`
 * comparison, unambiguously indicate the string literal is an entity name.
 *
 * NOTE: `Name` is intentionally excluded — it's too generic and produces
 * false positives. Instead, `.Name` comparisons are handled by targeted
 * AST checks in classifyParentContext (Cases 5 and 6).
 */
const ENTITY_NAME_COMPARISON_PROPS = new Set([
    'Entity',
    'EntityName',
    'LinkedEntity',
]);

// ============================================================================
// Rename Map Construction
// ============================================================================

/** Escapes special regex characters in a string. */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A precompiled regex rule for class name or multi-word entity name replacement. */
export interface RegexRule {
    old: string;
    new: string;
    pattern: RegExp;
}

/** A multi-word entity name rule with patterns for each quote style. */
export interface MultiWordNameRule {
    old: string;
    new: string;
    singleQuotePattern: RegExp;
    doubleQuotePattern: RegExp;
    backtickPattern: RegExp;
}

/**
 * Builds class rename rules from the rename map entries and optional subclass map.
 *
 * Two sources of rules are combined:
 *
 * 1. **Explicit subclass rules** (from `subclassMap`): hand-curated old→new mappings
 *    that handle both prefix and suffix changes (e.g., `ActionEntityServerEntity` →
 *    `MJActionEntityServer`). These cover all known extended, server, and Angular
 *    form subclasses.
 *
 * 2. **Auto-generated suffix rules** (from `entries`): for each entry with
 *    classNameChanged=true, creates regex rules for CodeGen-generated artifacts:
 *      - `EntityType` (zod inferred type)
 *      - `Schema`     (zod schema constant)
 *      - `Entity`     (base class name)
 *
 * Uses negative lookbehind for / and . to avoid matching inside file paths.
 */
export function buildClassRenameRules(
    entries: EntityRenameEntry[],
    subclassMap?: SubclassRenameEntry[]
): RegexRule[] {
    const rules: RegexRule[] = [];

    // ── Explicit subclass rules ─────────────────────────────────────────
    if (subclassMap) {
        for (const entry of subclassMap) {
            rules.push({
                old: entry.oldClassName,
                new: entry.newClassName,
                pattern: new RegExp(`(?<![/.])\\b${escapeRegExp(entry.oldClassName)}\\b`, 'g'),
            });
        }
    }

    // ── Auto-generated suffix rules (CodeGen artifacts only) ────────────
    for (const entry of entries) {
        if (!entry.classNameChanged) continue;

        // Suffixes in longest-first order to avoid partial matches.
        // Only covers CodeGen-generated artifacts; subclass and Angular form
        // renames are handled by the explicit subclass map above.
        const suffixes = ['EntityType', 'Schema', 'Entity'];
        for (const suffix of suffixes) {
            const oldName = entry.oldClassName + suffix;
            const newName = entry.newClassName + suffix;
            rules.push({
                old: oldName,
                new: newName,
                pattern: new RegExp(`(?<![/.])\\b${escapeRegExp(oldName)}\\b`, 'g'),
            });
        }
    }
    // Sort longest-first to prevent shorter patterns from matching inside longer names
    rules.sort((a, b) => b.old.length - a.old.length);
    return rules;
}

/**
 * Builds multi-word entity name regex rules.
 * For each entry with nameChanged=true AND a multi-word old name,
 * creates patterns that match the old name inside quotes.
 */
export function buildMultiWordNameRules(entries: EntityRenameEntry[]): MultiWordNameRule[] {
    const rules: MultiWordNameRule[] = [];
    for (const entry of entries) {
        if (!entry.nameChanged) continue;
        if (!entry.oldName.includes(' ')) continue;

        const escaped = escapeRegExp(entry.oldName);
        rules.push({
            old: entry.oldName,
            new: entry.newName,
            singleQuotePattern: new RegExp(`(?<=')${escaped}(?=')`, 'g'),
            doubleQuotePattern: new RegExp(`(?<=")${escaped}(?=")`, 'g'),
            backtickPattern: new RegExp(`(?<=\`)${escaped}(?=\`)`, 'g'),
        });
    }
    // Sort longest-first
    rules.sort((a, b) => b.old.length - a.old.length);
    return rules;
}

/**
 * Builds an entity name rename map (old → new) from the embedded data.
 * This is the simple entity-name-only map used by the HTML and metadata scanners.
 */
export function loadEmbeddedRenameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of ENTITY_RENAME_MAP) {
        if (entry.nameChanged) {
            map.set(entry.oldName, entry.newName);
        }
    }
    return map;
}

/**
 * Parses entity_subclasses.ts to build a map of old entity names to new
 * (MJ:-prefixed) entity names.
 *
 * Scans for `@RegisterClass(BaseEntity, 'MJ: SomeName')` decorators and
 * creates a mapping: `'SomeName' -> 'MJ: SomeName'`.
 */
export function buildEntityNameMap(entitySubclassesPath: string): Map<string, string> {
    const renameMap = new Map<string, string>();

    if (!fs.existsSync(entitySubclassesPath)) {
        throw new Error(`Entity subclasses file not found: ${entitySubclassesPath}`);
    }

    const sourceText = fs.readFileSync(entitySubclassesPath, 'utf-8');

    // Quick check
    if (!sourceText.includes('RegisterClass')) {
        return renameMap;
    }

    const sourceFile = ts.createSourceFile(
        entitySubclassesPath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    function visit(node: ts.Node): void {
        if (ts.isClassDeclaration(node)) {
            const decorators = ts.getDecorators(node);
            if (decorators) {
                for (const decorator of decorators) {
                    if (!ts.isCallExpression(decorator.expression)) continue;

                    const callExpr = decorator.expression;
                    if (!ts.isIdentifier(callExpr.expression)) continue;
                    if (callExpr.expression.text !== 'RegisterClass') continue;

                    const args = callExpr.arguments;
                    if (args.length < 2) continue;

                    if (!ts.isIdentifier(args[0]) || args[0].text !== 'BaseEntity') continue;
                    if (!ts.isStringLiteral(args[1])) continue;

                    const newName = args[1].text;
                    if (!newName.startsWith('MJ: ')) continue;

                    const oldName = newName.substring(4); // Strip 'MJ: '
                    renameMap.set(oldName, newName);
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // Filter to only entries that actually changed names (some entities always
    // had the MJ: prefix). Cross-reference against the embedded rename map.
    const knownRenames = new Set<string>();
    for (const entry of ENTITY_RENAME_MAP) {
        if (entry.nameChanged) {
            knownRenames.add(entry.oldName);
        }
    }
    for (const oldName of [...renameMap.keys()]) {
        if (!knownRenames.has(oldName)) {
            renameMap.delete(oldName);
        }
    }

    return renameMap;
}

// ============================================================================
// Rename Map Resolution
// ============================================================================

/**
 * Resolves the path to entity_subclasses.ts, trying common locations.
 * Returns null if not found (caller should fall back to embedded data).
 */
function resolveEntitySubclassesPath(basePath: string, explicitPath?: string): string | null {
    if (explicitPath) {
        const resolved = path.resolve(explicitPath);
        if (fs.existsSync(resolved)) return resolved;
        throw new Error(`Specified entity subclasses path does not exist: ${explicitPath}`);
    }

    // Try common locations relative to the target path
    const candidates = [
        // Monorepo layout (running from repo root or subdir)
        path.resolve(basePath, 'packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
        path.resolve(basePath, '../packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
        path.resolve(basePath, '../../packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
        // npm consumer layout (node_modules)
        path.resolve(basePath, 'node_modules/@memberjunction/core-entities/src/generated/entity_subclasses.ts'),
        path.resolve(basePath, '../node_modules/@memberjunction/core-entities/src/generated/entity_subclasses.ts'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
}

/**
 * Builds the entity name rename map, trying entity_subclasses.ts first and
 * falling back to the embedded rename map compiled into this package.
 */
export function resolveEntityNameMap(basePath: string, explicitPath: string | undefined, verbose: boolean): Map<string, string> {
    const entitySubclassesPath = resolveEntitySubclassesPath(basePath, explicitPath);

    if (entitySubclassesPath) {
        if (verbose) {
            console.log(`Building rename map from: ${entitySubclassesPath}`);
        }
        const renameMap = buildEntityNameMap(entitySubclassesPath);
        if (verbose) {
            console.log(`Loaded ${renameMap.size} entity name mappings`);
        }
        return renameMap;
    }

    // Fall back to the embedded data compiled into this package
    if (verbose) {
        console.log(`entity_subclasses.ts not found on disk, using embedded rename map`);
    }
    const renameMap = loadEmbeddedRenameMap();
    if (verbose) {
        console.log(`Loaded ${renameMap.size} entity name mappings from embedded data`);
    }
    return renameMap;
}

// ============================================================================
// AST Scanner (Strategy 3: Single-word entity names)
// ============================================================================

/**
 * Extracts the method name from a call expression's callee.
 * Handles both direct calls `GetEntityObject(...)` and member access
 * `md.GetEntityObject(...)` or `this.service.OpenEntityRecord(...)`.
 */
function getMethodName(expression: ts.Expression): string | null {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    return null;
}

/**
 * Determines if a string literal node is in a relevant AST context
 * (i.e., an argument to a known method, an EntityName property assignment,
 * or a comparison against a known entity-name property).
 */
function classifyParentContext(node: ts.Node): EntityNamePatternKind | null {
    const parent = node.parent;
    if (!parent) return null;

    // Case 1: Argument to a method call like GetEntityObject('Name') or OpenEntityRecord('Name')
    if (ts.isCallExpression(parent)) {
        const methodName = getMethodName(parent.expression);
        if (methodName && ENTITY_NAME_METHODS.has(methodName)) {
            if (methodName === 'GetEntityObject') return 'GetEntityObject';
            if (methodName === 'OpenEntityRecord') return 'OpenEntityRecord';
            return 'EntityNameMethod';
        }
    }

    // Case 2: Property assignment like EntityName: 'Name' or entityName: 'Name' or Entity: 'Name'
    if (ts.isPropertyAssignment(parent)) {
        const propName = parent.name;
        if (ts.isIdentifier(propName) && ENTITY_NAME_ASSIGNMENT_PROPS.has(propName.text)) {
            return 'EntityNameProperty';
        }
    }

    // Case 2b: Binary assignment like item.EntityName = 'Users' or item.entityName = 'Users'
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (parent.right === node && ts.isPropertyAccessExpression(parent.left)) {
            const propName = parent.left.name.text;
            if (ENTITY_NAME_ASSIGNMENT_PROPS.has(propName)) {
                return 'EntityNameProperty';
            }
        }
    }

    // Case 3: Argument to @RegisterClass decorator
    if (ts.isCallExpression(parent) && parent.parent && ts.isDecorator(parent.parent)) {
        const callee = parent.expression;
        if (ts.isIdentifier(callee) && callee.text === 'RegisterClass') {
            return 'RegisterClass';
        }
    }

    // Case 4: Comparison like .Entity === 'OldName' or .LinkedEntity === 'OldName'
    if (ts.isBinaryExpression(parent)) {
        const op = parent.operatorToken.kind;
        if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
            const otherSide = parent.left === node ? parent.right : parent.left;
            const propName = getTrailingPropertyName(otherSide);
            if (propName && ENTITY_NAME_COMPARISON_PROPS.has(propName)) {
                return 'NameComparison';
            }

            // Case 5: .EntityInfo.Name === 'OldName'
            if (propName === 'Name' && isEntityInfoNameChain(otherSide)) {
                return 'NameComparison';
            }

            // Case 6: .Entities.find(e => e.Name === 'OldName')
            if (propName === 'Name' && isEntitiesArrayCallback(parent)) {
                return 'NameComparison';
            }
        }
    }

    return null;
}

/**
 * Extracts the trailing property name from an expression.
 * For `foo.bar.Name` returns 'Name', for `e.Name` returns 'Name'.
 */
function getTrailingPropertyName(expr: ts.Expression): string | null {
    if (ts.isPropertyAccessExpression(expr)) {
        return expr.name.text;
    }
    return null;
}

/**
 * Checks if an expression is a `.EntityInfo.Name` property chain.
 */
function isEntityInfoNameChain(expr: ts.Expression): boolean {
    if (!ts.isPropertyAccessExpression(expr)) return false;
    if (expr.name.text !== 'Name') return false;

    const parent = expr.expression;
    if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'EntityInfo') {
        return true;
    }
    return false;
}

/**
 * Checks if a binary expression is inside a `.find()` or `.filter()` callback
 * on an array property named `Entities`.
 */
function isEntitiesArrayCallback(binaryExpr: ts.BinaryExpression): boolean {
    let current: ts.Node = binaryExpr;

    while (current.parent) {
        current = current.parent;

        if (ts.isArrowFunction(current)) {
            const callParent = current.parent;
            if (ts.isCallExpression(callParent)) {
                const callee = callParent.expression;
                if (ts.isPropertyAccessExpression(callee)) {
                    const methodName = callee.name.text;
                    if (methodName === 'find' || methodName === 'filter') {
                        const obj = callee.expression;
                        const objProp = getTrailingPropertyName(obj);
                        if (objProp === 'Entities') {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        if (ts.isBlock(current) || ts.isSourceFile(current)) {
            return false;
        }
    }

    return false;
}

// ============================================================================
// File Scanning
// ============================================================================

/**
 * Scans a single TypeScript file for entity name and class name references
 * that need updating for the v5.0 migration.
 *
 * Applies all three strategies:
 * 1. Regex-based class name scanning
 * 2. Regex-based multi-word entity name scanning
 * 3. AST-based single-word entity name scanning
 */
export function scanFile(
    filePath: string,
    sourceText: string,
    renameMap: Map<string, string>,
    classRules?: RegexRule[],
    multiWordRules?: MultiWordNameRule[]
): EntityNameFinding[] {
    const findings: EntityNameFinding[] = [];

    // Quick check: does this file contain any old entity name or class name?
    let hasRelevantContent = false;
    for (const oldName of renameMap.keys()) {
        if (sourceText.includes(oldName)) {
            hasRelevantContent = true;
            break;
        }
    }

    // Also check for class names if rules are provided
    if (!hasRelevantContent && classRules) {
        for (const rule of classRules) {
            if (sourceText.includes(rule.old)) {
                hasRelevantContent = true;
                break;
            }
        }
    }

    // Also check for multi-word entity names if rules are provided
    if (!hasRelevantContent && multiWordRules) {
        for (const rule of multiWordRules) {
            if (sourceText.includes(rule.old)) {
                hasRelevantContent = true;
                break;
            }
        }
    }

    if (!hasRelevantContent) return findings;

    // ── Strategy 1: Regex-based class name scanning ──────────────────────────
    if (classRules) {
        for (const rule of classRules) {
            let match: RegExpExecArray | null;
            // Reset lastIndex for each file
            rule.pattern.lastIndex = 0;
            while ((match = rule.pattern.exec(sourceText)) !== null) {
                const startPos = match.index;
                const endPos = startPos + match[0].length;
                const line = getLineNumber(sourceText, startPos);
                const column = getColumnNumber(sourceText, startPos);

                findings.push({
                    FilePath: filePath,
                    Line: line,
                    Column: column,
                    OldName: rule.old,
                    NewName: rule.new,
                    QuoteChar: '',
                    StartPos: startPos,
                    EndPos: endPos,
                    PatternKind: 'ClassName',
                });
            }
        }
    }

    // ── Strategy 2: Regex-based multi-word entity name scanning ──────────────
    if (multiWordRules) {
        for (const rule of multiWordRules) {
            const quotePatterns: Array<{ quoteChar: string; pattern: RegExp }> = [
                { quoteChar: "'", pattern: rule.singleQuotePattern },
                { quoteChar: '"', pattern: rule.doubleQuotePattern },
                { quoteChar: '`', pattern: rule.backtickPattern },
            ];

            for (const { quoteChar, pattern } of quotePatterns) {
                let match: RegExpExecArray | null;
                pattern.lastIndex = 0;
                while ((match = pattern.exec(sourceText)) !== null) {
                    const startPos = match.index;
                    const endPos = startPos + match[0].length;
                    const line = getLineNumber(sourceText, startPos);
                    const column = getColumnNumber(sourceText, startPos);

                    findings.push({
                        FilePath: filePath,
                        Line: line,
                        Column: column,
                        OldName: rule.old,
                        NewName: rule.new,
                        QuoteChar: quoteChar,
                        StartPos: startPos,
                        EndPos: endPos,
                        PatternKind: 'MultiWordEntityName',
                    });
                }
            }
        }
    }

    // ── Strategy 3: AST-based single-word entity name scanning ───────────────
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true, // setParentNodes
        ts.ScriptKind.TS
    );

    function visit(node: ts.Node): void {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const text = node.text;

            // Direct match: the entire string literal is an old entity name
            if (renameMap.has(text)) {
                const patternKind = classifyParentContext(node);
                if (patternKind) {
                    const { line, character } = ts.getLineAndCharacterOfPosition(
                        sourceFile,
                        node.getStart(sourceFile)
                    );
                    const startPos = node.getStart(sourceFile);
                    const endPos = node.getEnd();
                    const quoteChar = sourceText[startPos];

                    findings.push({
                        FilePath: filePath,
                        Line: line + 1,
                        Column: character,
                        OldName: text,
                        NewName: renameMap.get(text)!,
                        QuoteChar: quoteChar,
                        StartPos: startPos,
                        EndPos: endPos,
                        PatternKind: patternKind,
                    });
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return findings;
}

// ============================================================================
// Fixer
// ============================================================================

/** Priority map: AST-based findings are more precise than regex-based ones. */
const PATTERN_PRIORITY: Record<string, number> = {
    'ClassName': 1,
    'MultiWordEntityName': 2,
};

/**
 * Removes overlapping findings to prevent output corruption when multiple
 * strategies match the same text region. Keeps the highest-priority finding
 * (AST-based patterns win over regex-based ones since they have proper
 * context validation).
 */
function deduplicateFindings(findings: EntityNameFinding[]): EntityNameFinding[] {
    if (findings.length <= 1) return findings;

    // Sort by StartPos ascending, then by priority descending (higher = better)
    const sorted = [...findings].sort((a, b) => {
        if (a.StartPos !== b.StartPos) return a.StartPos - b.StartPos;
        const aPri = PATTERN_PRIORITY[a.PatternKind] ?? 10;
        const bPri = PATTERN_PRIORITY[b.PatternKind] ?? 10;
        return bPri - aPri; // higher priority first
    });

    const result: EntityNameFinding[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = result[result.length - 1];
        // If this finding overlaps with the previous kept finding, skip it
        if (current.StartPos < last.EndPos) continue;
        result.push(current);
    }

    return result;
}

/**
 * Applies fixes to a file by replacing old names with new names
 * at the exact positions identified by the scanner.
 *
 * Processes findings from end to start to preserve byte offsets.
 */
export function fixFile(sourceText: string, findings: EntityNameFinding[]): string {
    if (findings.length === 0) return sourceText;

    // Deduplicate overlapping findings to prevent output corruption.
    // When multiple strategies find the same entity name at overlapping positions,
    // keep only the most specific one (AST > MultiWordEntityName > ClassName).
    const deduped = deduplicateFindings(findings);

    // Sort by StartPos descending so we fix from end to start
    const sorted = [...deduped].sort((a, b) => b.StartPos - a.StartPos);

    let result = sourceText;
    for (const finding of sorted) {
        if (finding.PatternKind === 'ClassName') {
            // Class names: replace the identifier directly (no quotes)
            const before = result.substring(0, finding.StartPos);
            const after = result.substring(finding.EndPos);
            result = before + finding.NewName + after;
        } else if (finding.PatternKind === 'MultiWordEntityName') {
            // Multi-word names: replace just the entity name text (inside quotes)
            const before = result.substring(0, finding.StartPos);
            const after = result.substring(finding.EndPos);
            result = before + finding.NewName + after;
        } else {
            // AST-based: the StartPos/EndPos include quotes
            const newLiteral = finding.QuoteChar + finding.NewName + finding.QuoteChar;
            const before = result.substring(0, finding.StartPos);
            const after = result.substring(finding.EndPos);
            result = before + newLiteral + after;
        }
    }

    return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Gets the 1-based line number for a character position in text. */
function getLineNumber(text: string, pos: number): number {
    let line = 1;
    for (let i = 0; i < pos && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

/** Gets the 0-based column number for a character position in text. */
function getColumnNumber(text: string, pos: number): number {
    let lastNewline = -1;
    for (let i = 0; i < pos && i < text.length; i++) {
        if (text[i] === '\n') lastNewline = i;
    }
    return pos - lastNewline - 1;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Scans TypeScript files for hardcoded entity names and class name references
 * that need updating for the MemberJunction v5.0 migration, and optionally
 * fixes them in place.
 *
 * Three strategies are applied:
 * 1. Class name renames (regex): explicit subclass renames from subclass-rename-map.ts
 *    (e.g., ActionEntityServerEntity → MJActionEntityServer) plus auto-generated
 *    CodeGen artifact renames (e.g., ActionEntity → MJActionEntity)
 * 2. Multi-word entity name renames (regex): 'AI Models' → 'MJ: AI Models'
 * 3. Single-word entity name renames (AST): 'Actions' → 'MJ: Actions' (context-verified)
 */
export async function scanEntityNames(options: EntityNameScanOptions): Promise<EntityNameScanResult> {
    const errors: string[] = [];
    const verbose = options.Verbose !== false;

    // Resolve target path
    const targetPath = path.resolve(options.TargetPath);
    if (!fs.existsSync(targetPath)) {
        return {
            Success: false,
            Findings: [],
            FixedFiles: [],
            FilesScanned: 0,
            RenameMapSize: 0,
            Errors: [`Target path does not exist: ${targetPath}`],
        };
    }

    // Build rename maps from embedded data + subclass overrides
    const renameEntries = ENTITY_RENAME_MAP;
    const classRules = buildClassRenameRules(renameEntries, SUBCLASS_RENAME_MAP);
    const multiWordRules = buildMultiWordNameRules(renameEntries);

    // The entity name map for AST scanning — SINGLE-WORD ONLY to avoid duplicate
    // findings with Strategy 2 (multi-word names are handled exclusively by regex).
    // When entity_subclasses.ts is available, buildEntityNameMap returns all entries
    // (including multi-word). We filter to single-word to prevent overlapping matches.
    let entityNameMap: Map<string, string>;
    try {
        const fullMap = resolveEntityNameMap(targetPath, options.EntitySubclassesPath, verbose);
        // Filter to single-word names only for AST scanning
        entityNameMap = new Map<string, string>();
        for (const [oldName, newName] of fullMap) {
            if (!oldName.includes(' ')) {
                entityNameMap.set(oldName, newName);
            }
        }
    } catch (err) {
        return {
            Success: false,
            Findings: [],
            FixedFiles: [],
            FilesScanned: 0,
            RenameMapSize: 0,
            Errors: [(err as Error).message],
        };
    }

    if (verbose) {
        console.log(`Loaded ${classRules.length} class rename rules, ${multiWordRules.length} multi-word entity name rules, and ${entityNameMap.size} single-word AST rules`);
    }

    // Find TypeScript files
    const isFile = fs.statSync(targetPath).isFile();
    let tsFiles: string[];

    if (isFile) {
        tsFiles = [targetPath];
    } else {
        const excludePatterns = [
            ...DEFAULT_EXCLUDE_PATTERNS,
            ...(options.ExcludePatterns ?? []),
        ];

        tsFiles = await glob('**/*.ts', {
            cwd: targetPath,
            absolute: true,
            ignore: excludePatterns,
        });
    }

    if (verbose) {
        console.log(`Scanning ${tsFiles.length} TypeScript files...`);
    }

    // Scan files
    const allFindings: EntityNameFinding[] = [];
    const fixedFiles: string[] = [];

    for (const filePath of tsFiles) {
        try {
            const sourceText = fs.readFileSync(filePath, 'utf-8');
            const findings = scanFile(filePath, sourceText, entityNameMap, classRules, multiWordRules);

            if (findings.length > 0) {
                allFindings.push(...findings);

                if (options.Fix) {
                    const fixedText = fixFile(sourceText, findings);
                    fs.writeFileSync(filePath, fixedText, 'utf-8');
                    fixedFiles.push(filePath);
                    if (verbose) {
                        console.log(`  Fixed ${findings.length} reference(s) in ${filePath}`);
                    }
                } else if (verbose) {
                    console.log(`  Found ${findings.length} reference(s) in ${filePath}`);
                }
            }
        } catch (err) {
            const message = `Error scanning ${filePath}: ${(err as Error).message}`;
            errors.push(message);
            if (verbose) {
                console.error(`  ${message}`);
            }
        }
    }

    return {
        Success: errors.length === 0,
        Findings: allFindings,
        FixedFiles: fixedFiles,
        FilesScanned: tsFiles.length,
        RenameMapSize: renameEntries.length,
        Errors: errors,
    };
}
