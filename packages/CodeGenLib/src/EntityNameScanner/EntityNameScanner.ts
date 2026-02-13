/**
 * AST-based scanner/fixer for hardcoded entity names in TypeScript source code.
 *
 * Scans for method calls like `OpenEntityRecord('OldName', ...)`,
 * `GetEntityObject<T>('OldName', ...)`, and property assignments like
 * `EntityName: 'OldName'` where the entity name should have been updated
 * to include the "MJ: " prefix.
 *
 * The rename map is built dynamically from entity_subclasses.ts by parsing
 * all @RegisterClass(BaseEntity, 'MJ: XYZ') decorators.
 *
 * Usage (via MJCLI):
 *   mj codegen fix-entity-names --path packages/Angular
 *   mj codegen fix-entity-names --path packages/Angular --fix
 *
 * Or programmatically:
 *   import { scanEntityNames } from '@memberjunction/codegen-lib';
 *   const result = await scanEntityNames({ TargetPath: './packages' });
 */

import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================================
// Public Types
// ============================================================================

/** The kind of AST pattern where an old entity name was found. */
export type EntityNamePatternKind =
    | 'GetEntityObject'
    | 'OpenEntityRecord'
    | 'EntityNameMethod'     // Other methods that take entity name as first arg
    | 'EntityNameProperty'
    | 'RegisterClass'
    | 'NameComparison';      // .Name === 'OldName' or .Entity === 'OldName'

/**
 * A single finding: one string literal in source code that uses an old entity name.
 */
export interface EntityNameFinding {
    /** Absolute path to the source file */
    FilePath: string;
    /** 1-based line number */
    Line: number;
    /** 0-based character offset within the line */
    Column: number;
    /** The old entity name found (without quotes) */
    OldName: string;
    /** The corrected entity name (without quotes) */
    NewName: string;
    /** The quote character used (' or " or `) */
    QuoteChar: string;
    /** 0-based start position of the full string literal (including quote) in the file */
    StartPos: number;
    /** 0-based end position of the full string literal (including quote) in the file */
    EndPos: number;
    /** The kind of AST pattern matched */
    PatternKind: EntityNamePatternKind;
}

/**
 * Options for the entity name scanner.
 */
export interface EntityNameScanOptions {
    /** File or directory to scan */
    TargetPath: string;
    /**
     * Path to entity_subclasses.ts for building the rename map.
     * If not provided, attempts to locate it relative to common workspace roots.
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
];

/**
 * Method names whose first string-literal argument is treated as an entity name.
 */
const ENTITY_NAME_METHODS = new Set([
    'GetEntityObject',
    'OpenEntityRecord',
    'navigateToEntity',
    'BuildRelationshipViewParamsByEntityName',
    'NewRecordValues',
    'IsCurrentTab',
]);

/**
 * Property names that, when used in a `=== 'OldName'` or `!== 'OldName'`
 * comparison, unambiguously indicate the string literal is an entity name.
 *
 * NOTE: `Name` is intentionally excluded — it's too generic and produces
 * false positives (e.g., action parameter lookups like `p.Name === 'Users'`).
 * Instead, `.Name` comparisons are handled by targeted AST checks in
 * classifyParentContext (Cases 5 and 6) that verify the surrounding context.
 */
const ENTITY_NAME_COMPARISON_PROPS = new Set([
    'Entity',
    'EntityName',
    'LinkedEntity',
]);

// ============================================================================
// Rename Map Builder
// ============================================================================

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
                    // Check it's @RegisterClass(...)
                    if (!ts.isIdentifier(callExpr.expression)) continue;
                    if (callExpr.expression.text !== 'RegisterClass') continue;

                    const args = callExpr.arguments;
                    // Must have at least 2 args: RegisterClass(BaseEntity, 'MJ: Name')
                    if (args.length < 2) continue;

                    // First arg should be BaseEntity
                    if (!ts.isIdentifier(args[0]) || args[0].text !== 'BaseEntity') continue;

                    // Second arg should be a string literal starting with 'MJ: '
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
    return renameMap;
}

// ============================================================================
// AST Scanner
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
            // Return specific kind for the two original methods, generic for others
            if (methodName === 'GetEntityObject') return 'GetEntityObject';
            if (methodName === 'OpenEntityRecord') return 'OpenEntityRecord';
            return 'EntityNameMethod';
        }
    }

    // Case 2: Property assignment like EntityName: 'Name'
    if (ts.isPropertyAssignment(parent)) {
        const propName = parent.name;
        if (ts.isIdentifier(propName) && propName.text === 'EntityName') {
            return 'EntityNameProperty';
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
    // (unambiguous property names only — see ENTITY_NAME_COMPARISON_PROPS)
    if (ts.isBinaryExpression(parent)) {
        const op = parent.operatorToken.kind;
        if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
            const otherSide = parent.left === node ? parent.right : parent.left;
            const propName = getTrailingPropertyName(otherSide);
            if (propName && ENTITY_NAME_COMPARISON_PROPS.has(propName)) {
                return 'NameComparison';
            }

            // Case 5: .EntityInfo.Name === 'OldName'
            // The property chain must include EntityInfo before the trailing .Name
            if (propName === 'Name' && isEntityInfoNameChain(otherSide)) {
                return 'NameComparison';
            }

            // Case 6: .Entities.find(e => e.Name === 'OldName') or .Entities.filter(...)
            // The comparison is inside a .find()/.filter() callback on an Entities array
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
 * Matches patterns like `p.entityObject.EntityInfo.Name`, `entity.EntityInfo.Name`, etc.
 */
function isEntityInfoNameChain(expr: ts.Expression): boolean {
    // expr should be a PropertyAccessExpression ending in .Name
    if (!ts.isPropertyAccessExpression(expr)) return false;
    if (expr.name.text !== 'Name') return false;

    // The object before .Name should be a PropertyAccessExpression ending in .EntityInfo
    const parent = expr.expression;
    if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'EntityInfo') {
        return true;
    }
    return false;
}

/**
 * Checks if a binary expression is inside a `.find()` or `.filter()` callback
 * on an array property named `Entities`.
 *
 * Matches patterns like:
 *   md.Entities.find(e => e.Name === 'OldName')
 *   this.metadata.Entities.filter(e => e.Name !== 'OldName')
 */
function isEntitiesArrayCallback(binaryExpr: ts.BinaryExpression): boolean {
    // Walk up: BinaryExpression -> ArrowFunction body (or ReturnStatement)
    // -> ArrowFunction -> CallExpression arguments -> CallExpression
    let current: ts.Node = binaryExpr;

    // Walk up past parenthesized expressions and return statements
    while (current.parent) {
        current = current.parent;

        if (ts.isArrowFunction(current)) {
            // The arrow function should be an argument to .find() or .filter()
            const callParent = current.parent;
            if (ts.isCallExpression(callParent)) {
                const callee = callParent.expression;
                if (ts.isPropertyAccessExpression(callee)) {
                    const methodName = callee.name.text;
                    if (methodName === 'find' || methodName === 'filter') {
                        // Check the object being called on ends with .Entities
                        const obj = callee.expression;
                        const objProp = getTrailingPropertyName(obj);
                        if (objProp === 'Entities') {
                            return true;
                        }
                    }
                }
            }
            return false; // Found an arrow function but it's not the right pattern
        }

        // Stop walking if we hit a statement or declaration boundary
        if (ts.isBlock(current) || ts.isSourceFile(current)) {
            return false;
        }
    }

    return false;
}

/**
 * Scans a single TypeScript file for string literals that match old entity names
 * in relevant AST contexts.
 */
export function scanFile(
    filePath: string,
    sourceText: string,
    renameMap: Map<string, string>
): EntityNameFinding[] {
    const findings: EntityNameFinding[] = [];

    // Quick check: does this file contain any old entity name?
    let hasRelevantContent = false;
    for (const oldName of renameMap.keys()) {
        if (sourceText.includes(oldName)) {
            hasRelevantContent = true;
            break;
        }
    }
    if (!hasRelevantContent) return findings;

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

/**
 * Applies entity name fixes to a file by replacing old names with new names
 * at the exact positions identified by the scanner.
 *
 * Processes findings from end to start to preserve byte offsets.
 */
export function fixFile(sourceText: string, findings: EntityNameFinding[]): string {
    if (findings.length === 0) return sourceText;

    // Sort by StartPos descending so we fix from end to start
    const sorted = [...findings].sort((a, b) => b.StartPos - a.StartPos);

    let result = sourceText;
    for (const finding of sorted) {
        // The string literal in source includes quotes: 'OldName' or "OldName"
        const oldLiteral = finding.QuoteChar + finding.OldName + finding.QuoteChar;
        const newLiteral = finding.QuoteChar + finding.NewName + finding.QuoteChar;

        // Replace at exact position
        const before = result.substring(0, finding.StartPos);
        const after = result.substring(finding.EndPos);
        result = before + newLiteral + after;
    }

    return result;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Resolves the path to entity_subclasses.ts, trying common locations.
 */
function resolveEntitySubclassesPath(basePath: string, explicitPath?: string): string {
    if (explicitPath) {
        const resolved = path.resolve(explicitPath);
        if (fs.existsSync(resolved)) return resolved;
        throw new Error(`Specified entity subclasses path does not exist: ${explicitPath}`);
    }

    // Try common locations relative to the target path
    const candidates = [
        path.resolve(basePath, 'packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
        path.resolve(basePath, '../packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
        path.resolve(basePath, '../../packages/MJCoreEntities/src/generated/entity_subclasses.ts'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(
        `Could not find entity_subclasses.ts. Searched:\n${candidates.map(c => `  - ${c}`).join('\n')}\n` +
        `Use --entity-subclasses to specify the path explicitly.`
    );
}

/**
 * Scans TypeScript files for hardcoded entity names that need the "MJ: " prefix,
 * and optionally fixes them in place.
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

    // Build rename map
    let renameMap: Map<string, string>;
    try {
        const entitySubclassesPath = resolveEntitySubclassesPath(targetPath, options.EntitySubclassesPath);
        if (verbose) {
            console.log(`Building rename map from: ${entitySubclassesPath}`);
        }
        renameMap = buildEntityNameMap(entitySubclassesPath);
        if (verbose) {
            console.log(`Loaded ${renameMap.size} entity name mappings`);
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
            const findings = scanFile(filePath, sourceText, renameMap);

            if (findings.length > 0) {
                allFindings.push(...findings);

                if (options.Fix) {
                    const fixedText = fixFile(sourceText, findings);
                    fs.writeFileSync(filePath, fixedText, 'utf-8');
                    fixedFiles.push(filePath);
                    if (verbose) {
                        console.log(`  Fixed ${findings.length} entity name(s) in ${filePath}`);
                    }
                } else if (verbose) {
                    console.log(`  Found ${findings.length} entity name(s) in ${filePath}`);
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
        RenameMapSize: renameMap.size,
        Errors: errors,
    };
}
