/**
 * Regex-based scanner/fixer for hardcoded entity names in Angular HTML templates.
 *
 * Since HTML templates cannot be parsed with the TypeScript AST, this scanner
 * uses targeted regex patterns to find entity name references in:
 *   - Method calls in template expressions (event bindings, property bindings)
 *   - Static attribute values for entity-name-related attributes
 *
 * Uses the same rename map as EntityNameScanner (built from entity_subclasses.ts).
 *
 * Usage (via MJCLI):
 *   mj codegen fix-html-entity-names --path packages/Angular
 *   mj codegen fix-html-entity-names --path packages/Angular --fix
 *
 * Or programmatically:
 *   import { scanHtmlEntityNames } from '@memberjunction/codegen-lib';
 *   const result = await scanHtmlEntityNames({ TargetPath: './packages/Angular' });
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { resolveEntityNameMap } from './EntityNameScanner';

// ============================================================================
// Public Types
// ============================================================================

/** The kind of HTML pattern where an old entity name was found. */
export type HtmlPatternKind =
    | 'methodCallSingleQuote'   // someMethod('EntityName', ...) in template expression
    | 'methodCallDoubleQuote'   // someMethod("EntityName", ...) in template expression
    | 'attributeValue';         // EntityName="EntityName" as static attribute

/**
 * A single finding: one entity name reference in an HTML template that needs
 * the "MJ: " prefix.
 */
export interface HtmlEntityNameFinding {
    /** Absolute path to the source file */
    FilePath: string;
    /** 1-based line number */
    Line: number;
    /** The old entity name found */
    OldName: string;
    /** The corrected entity name */
    NewName: string;
    /** The kind of HTML pattern matched */
    PatternKind: HtmlPatternKind;
    /** Contextual description of the match */
    Context: string;
}

/**
 * Options for the HTML entity name scanner.
 */
export interface HtmlEntityNameScanOptions {
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
export interface HtmlEntityNameScanResult {
    Success: boolean;
    /** All findings across all scanned files */
    Findings: HtmlEntityNameFinding[];
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
    '**/generated/**',
    '**/Demos/**',
];

/**
 * Method names that take an entity name as their first string argument
 * in Angular template expressions.
 */
const HTML_ENTITY_NAME_METHODS = [
    'navigateToEntity',
    'openEntityRecord',
    'OpenEntityRecord',
    'BuildRelationshipViewParamsByEntityName',
    'NewRecordValues',
    'IsCurrentTab',
    'GetEntityObject',
];

/**
 * HTML attribute names whose static string value is an entity name.
 */
const HTML_ENTITY_NAME_ATTRIBUTES = [
    'RowsEntityName',
    'JoinEntityName',
];

// ============================================================================
// HTML File Scanner
// ============================================================================

/**
 * Builds regex patterns for matching entity name references in HTML templates.
 */
function buildMethodCallRegexes(): RegExp[] {
    const methodGroup = HTML_ENTITY_NAME_METHODS.join('|');
    return [
        // Single-quoted: someMethod('EntityName'  — in event/property bindings
        new RegExp(`(?:${methodGroup})\\s*\\(\\s*'([^']+)'`, 'g'),
        // Double-quoted inside single-quoted binding: someMethod("EntityName"
        // This handles cases like (click)="someMethod('EntityName')"
        // The outer quotes are double, inner are single — already caught above.
        // But also: [Prop]="someMethod('EntityName')" — same pattern.
    ];
}

function buildAttributeRegexes(): RegExp[] {
    const attrGroup = HTML_ENTITY_NAME_ATTRIBUTES.join('|');
    return [
        // Static attribute: RowsEntityName="Entity Name"
        new RegExp(`(?:${attrGroup})="([^"]+)"`, 'g'),
    ];
}

/**
 * Gets the 1-based line number for a character offset in the source text.
 */
function getLineNumber(sourceText: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < sourceText.length; i++) {
        if (sourceText[i] === '\n') line++;
    }
    return line;
}

/**
 * Scans a single HTML file for entity name references that need the "MJ: " prefix.
 */
export function scanHtmlFile(
    filePath: string,
    sourceText: string,
    renameMap: Map<string, string>,
): HtmlEntityNameFinding[] {
    const findings: HtmlEntityNameFinding[] = [];

    // Quick check: does this file contain any old entity name?
    let hasRelevantContent = false;
    for (const oldName of renameMap.keys()) {
        if (sourceText.includes(oldName)) {
            hasRelevantContent = true;
            break;
        }
    }
    if (!hasRelevantContent) return findings;

    // Scan method call patterns
    const methodRegexes = buildMethodCallRegexes();
    for (const regex of methodRegexes) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(sourceText)) !== null) {
            const entityName = match[1];
            if (renameMap.has(entityName)) {
                findings.push({
                    FilePath: filePath,
                    Line: getLineNumber(sourceText, match.index),
                    OldName: entityName,
                    NewName: renameMap.get(entityName)!,
                    PatternKind: 'methodCallSingleQuote',
                    Context: match[0],
                });
            }
        }
    }

    // Scan attribute patterns
    const attrRegexes = buildAttributeRegexes();
    for (const regex of attrRegexes) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(sourceText)) !== null) {
            const entityName = match[1];
            if (renameMap.has(entityName)) {
                findings.push({
                    FilePath: filePath,
                    Line: getLineNumber(sourceText, match.index),
                    OldName: entityName,
                    NewName: renameMap.get(entityName)!,
                    PatternKind: 'attributeValue',
                    Context: match[0],
                });
            }
        }
    }

    return findings;
}

// ============================================================================
// HTML File Fixer
// ============================================================================

/**
 * Applies entity name fixes to an HTML file using targeted string replacements.
 */
export function fixHtmlFile(
    sourceText: string,
    findings: HtmlEntityNameFinding[],
): string {
    if (findings.length === 0) return sourceText;

    let result = sourceText;

    for (const finding of findings) {
        // Replace old context with new context (old name swapped for new name)
        const oldContext = finding.Context;
        const newContext = oldContext.replace(finding.OldName, finding.NewName);
        result = replaceAll(result, oldContext, newContext);
    }

    return result;
}

/** Simple replaceAll using split/join for broad compatibility. */
function replaceAll(text: string, search: string, replacement: string): string {
    return text.split(search).join(replacement);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Scans HTML template files for hardcoded entity names that need the "MJ: " prefix,
 * and optionally fixes them in place.
 */
export async function scanHtmlEntityNames(
    options: HtmlEntityNameScanOptions,
): Promise<HtmlEntityNameScanResult> {
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

    // Build rename map (tries .ts file first, falls back to embedded rename map)
    let renameMap: Map<string, string>;
    try {
        renameMap = resolveEntityNameMap(targetPath, options.EntitySubclassesPath, verbose);
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

    // Find HTML files
    const isFile = fs.statSync(targetPath).isFile();
    let htmlFiles: string[];

    if (isFile) {
        htmlFiles = [targetPath];
    } else {
        const excludePatterns = [
            ...DEFAULT_EXCLUDE_PATTERNS,
            ...(options.ExcludePatterns ?? []),
        ];

        htmlFiles = await glob('**/*.html', {
            cwd: targetPath,
            absolute: true,
            ignore: excludePatterns,
        });
    }

    if (verbose) {
        console.log(`Scanning ${htmlFiles.length} HTML files...`);
    }

    // Scan files
    const allFindings: HtmlEntityNameFinding[] = [];
    const fixedFiles: string[] = [];

    for (const filePath of htmlFiles) {
        try {
            const sourceText = fs.readFileSync(filePath, 'utf-8');
            const findings = scanHtmlFile(filePath, sourceText, renameMap);

            if (findings.length > 0) {
                allFindings.push(...findings);

                if (options.Fix) {
                    const fixedText = fixHtmlFile(sourceText, findings);
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
        FilesScanned: htmlFiles.length,
        RenameMapSize: renameMap.size,
        Errors: errors,
    };
}
