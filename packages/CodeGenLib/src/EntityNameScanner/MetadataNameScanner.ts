/**
 * JSON-based scanner/fixer for entity names in MemberJunction metadata files.
 *
 * Scans metadata directories for entity name references that need the "MJ: "
 * prefix, including:
 *   - `@lookup:` references (both the entity name and the lookup value)
 *   - `.mj-sync.json` / `.mj-folder.json` entity/entityName config fields
 *   - `relatedEntities` object keys
 *
 * Reuses the rename map from {@link buildEntityNameMap} (entity_subclasses.ts).
 *
 * Usage (via MJCLI):
 *   mj codegen fix-metadata-names --path metadata/
 *   mj codegen fix-metadata-names --path metadata/ --fix
 *
 * Or programmatically:
 *   import { scanMetadataNames } from '@memberjunction/codegen-lib';
 *   const result = await scanMetadataNames({ TargetPath: './metadata' });
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { buildEntityNameMap } from './EntityNameScanner';

// ============================================================================
// Public Types
// ============================================================================

/** The kind of pattern where an old entity name was found in metadata. */
export type MetadataPatternKind =
    | 'lookupEntity'      // Entity name in @lookup:ENTITY.field=value
    | 'lookupValue'       // Value in @lookup:MJ: Entities.Name=VALUE
    | 'folderConfig'      // entity/entityName in .mj-sync.json or .mj-folder.json
    | 'relatedEntityKey'  // Key in relatedEntities object
    | 'entityNameField';  // fields.Name in folders where .mj-sync.json entity is "Entities" or "MJ: Entities"

/**
 * A single finding: one entity name reference in a metadata file that needs
 * the "MJ: " prefix.
 */
export interface MetadataFinding {
    /** Absolute path to the source file */
    FilePath: string;
    /** 1-based line number */
    Line: number;
    /** The old entity name found */
    OldName: string;
    /** The corrected entity name */
    NewName: string;
    /** The kind of metadata pattern matched */
    PatternKind: MetadataPatternKind;
    /** Human-readable context (e.g., the full @lookup string) */
    Context: string;
}

/**
 * Options for the metadata name scanner.
 */
export interface MetadataNameScanOptions {
    /** File or directory to scan */
    TargetPath: string;
    /**
     * Path to entity_subclasses.ts for building the rename map.
     * If not provided, attempts to locate it relative to common workspace roots.
     */
    EntitySubclassesPath?: string;
    /** Whether to apply fixes in place. Default: false (dry-run). */
    Fix?: boolean;
    /** If true, logs progress to console. Default: true. */
    Verbose?: boolean;
}

/**
 * Result of a metadata scan (and optional fix) operation.
 */
export interface MetadataNameScanResult {
    Success: boolean;
    /** All findings across all scanned files */
    Findings: MetadataFinding[];
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
// Lookup Reference Parser
// ============================================================================

interface ParsedLookup {
    /** The entity being looked up (e.g., "MJ: Entities" or "Entities") */
    EntityName: string;
    /** The field being matched (e.g., "Name") */
    FieldName: string;
    /** The value being searched for (e.g., "Dashboards") */
    Value: string;
    /** Optional suffix like "allowDefer" */
    Options: string | null;
    /** The full raw lookup string after @lookup: */
    RawText: string;
}

/**
 * Parses a `@lookup:` reference string into its components.
 *
 * Format: `ENTITY.FIELD=VALUE` or `ENTITY.FIELD=VALUE?options`
 *
 * Examples:
 *   - `MJ: Entities.Name=Dashboards` → entity="MJ: Entities", field="Name", value="Dashboards"
 *   - `MJ: Dashboards.Name=ERD?allowDefer` → entity="MJ: Dashboards", field="Name", value="ERD"
 */
function parseLookupReference(rawText: string): ParsedLookup | null {
    // Find the = sign separating ENTITY.FIELD from VALUE
    const eqIdx = rawText.indexOf('=');
    if (eqIdx === -1) return null;

    // Parse VALUE and optional ?suffix
    let value = rawText.substring(eqIdx + 1);
    let options: string | null = null;
    const qIdx = value.indexOf('?');
    if (qIdx !== -1) {
        options = value.substring(qIdx + 1);
        value = value.substring(0, qIdx);
    }

    // Parse ENTITY.FIELD — find the last dot before = to split
    const leftSide = rawText.substring(0, eqIdx);
    const dotIdx = leftSide.lastIndexOf('.');
    if (dotIdx === -1) return null;

    const entityName = leftSide.substring(0, dotIdx);
    const fieldName = leftSide.substring(dotIdx + 1);

    if (!entityName || !fieldName || !value) return null;

    return { EntityName: entityName, FieldName: fieldName, Value: value, Options: options, RawText: rawText };
}

// ============================================================================
// Line Number Helper
// ============================================================================

/** Returns 1-based line number for a character position in source text. */
function getLineNumber(sourceText: string, position: number): number {
    let line = 1;
    for (let i = 0; i < position && i < sourceText.length; i++) {
        if (sourceText[i] === '\n') line++;
    }
    return line;
}

// ============================================================================
// Metadata File Scanner
// ============================================================================

/**
 * Scans a single metadata JSON file for entity name references that need
 * the "MJ: " prefix.
 *
 * @param isEntitiesFolder - If true, the folder's .mj-sync.json entity is
 *   "Entities" or "MJ: Entities", so `fields.Name` values are entity names.
 */
export function scanMetadataFile(
    filePath: string,
    sourceText: string,
    renameMap: Map<string, string>,
    isEntitiesFolder?: boolean,
): MetadataFinding[] {
    const findings: MetadataFinding[] = [];

    // Quick check: does this file contain any old entity name?
    let hasRelevantContent = false;
    for (const oldName of renameMap.keys()) {
        if (sourceText.includes(oldName)) {
            hasRelevantContent = true;
            break;
        }
    }
    if (!hasRelevantContent) return findings;

    // Validate JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(sourceText);
    } catch {
        return findings; // Invalid JSON, skip
    }

    // 1. Scan @lookup patterns
    scanLookupPatterns(sourceText, filePath, renameMap, findings);

    // 2. Scan folder config files for entity/entityName
    const basename = path.basename(filePath);
    if (basename === '.mj-sync.json' || basename === '.mj-folder.json') {
        scanFolderConfig(parsed, sourceText, filePath, renameMap, findings);
    }

    // 3. Scan relatedEntities keys
    scanRelatedEntityKeys(parsed, sourceText, filePath, renameMap, findings);

    // 4. Scan fields.Name when this folder manages the "Entities" entity
    if (isEntitiesFolder && basename !== '.mj-sync.json' && basename !== '.mj-folder.json') {
        scanEntityNameFields(parsed, sourceText, filePath, renameMap, findings);
    }

    return findings;
}

/**
 * Scans all @lookup: patterns in a file line-by-line.
 * Checks both the entity name and the lookup value.
 */
function scanLookupPatterns(
    sourceText: string,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    const lines = sourceText.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        let searchStart = 0;
        while (true) {
            const lookupIdx = line.indexOf('@lookup:', searchStart);
            if (lookupIdx === -1) break;

            // Extract the raw lookup text up to the closing quote
            const afterPrefix = line.substring(lookupIdx + 8); // after "@lookup:"
            const quoteIdx = afterPrefix.indexOf('"');
            if (quoteIdx === -1) {
                searchStart = lookupIdx + 8;
                continue;
            }

            const rawText = afterPrefix.substring(0, quoteIdx);
            const fullLookup = `@lookup:${rawText}`;

            const parsed = parseLookupReference(rawText);
            if (parsed) {
                checkLookupEntityName(parsed, fullLookup, lineNum, filePath, renameMap, findings);
                checkLookupValue(parsed, fullLookup, lineNum, filePath, renameMap, findings);
            }

            searchStart = lookupIdx + 8 + quoteIdx;
        }
    }
}

/**
 * Checks if the entity name in a @lookup reference needs the MJ: prefix.
 * e.g., `@lookup:Entities.Name=...` → should be `@lookup:MJ: Entities.Name=...`
 */
function checkLookupEntityName(
    parsed: ParsedLookup,
    fullLookup: string,
    lineNum: number,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    if (renameMap.has(parsed.EntityName)) {
        findings.push({
            FilePath: filePath,
            Line: lineNum,
            OldName: parsed.EntityName,
            NewName: renameMap.get(parsed.EntityName)!,
            PatternKind: 'lookupEntity',
            Context: fullLookup,
        });
    }
}

/**
 * Checks if the lookup value is an entity name that needs the MJ: prefix.
 * Only applies when looking up `MJ: Entities` (or `Entities`) by `Name`.
 */
function checkLookupValue(
    parsed: ParsedLookup,
    fullLookup: string,
    lineNum: number,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    // Only check values when the lookup is against the Entities entity by Name
    const entity = parsed.EntityName.trim();
    const isEntitiesLookup = entity === 'MJ: Entities' || entity === 'Entities';
    const isNameField = parsed.FieldName.trim() === 'Name';

    if (isEntitiesLookup && isNameField && renameMap.has(parsed.Value)) {
        findings.push({
            FilePath: filePath,
            Line: lineNum,
            OldName: parsed.Value,
            NewName: renameMap.get(parsed.Value)!,
            PatternKind: 'lookupValue',
            Context: fullLookup,
        });
    }
}

/**
 * Checks the entity/entityName field in .mj-sync.json or .mj-folder.json.
 */
function scanFolderConfig(
    parsed: unknown,
    sourceText: string,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    if (!parsed || typeof parsed !== 'object') return;

    const data = parsed as Record<string, unknown>;
    const entityName = (data.entity ?? data.entityName) as string | undefined;

    if (entityName && renameMap.has(entityName)) {
        const searchStr = `"${entityName}"`;
        const idx = sourceText.indexOf(searchStr);
        const lineNum = idx !== -1 ? getLineNumber(sourceText, idx) : 1;

        findings.push({
            FilePath: filePath,
            Line: lineNum,
            OldName: entityName,
            NewName: renameMap.get(entityName)!,
            PatternKind: 'folderConfig',
            Context: `Folder config entity: "${entityName}"`,
        });
    }
}

/**
 * Checks all keys in relatedEntities objects against the rename map.
 */
function scanRelatedEntityKeys(
    parsed: unknown,
    sourceText: string,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    const records = Array.isArray(parsed) ? parsed : [parsed];

    for (const record of records) {
        if (!record || typeof record !== 'object') continue;

        const rec = record as Record<string, unknown>;
        if (!rec.relatedEntities || typeof rec.relatedEntities !== 'object') continue;

        const relatedEntities = rec.relatedEntities as Record<string, unknown>;
        // Find where relatedEntities starts in the source for line-number search context
        const relIdx = sourceText.indexOf('"relatedEntities"');

        for (const key of Object.keys(relatedEntities)) {
            if (renameMap.has(key)) {
                const searchStr = `"${key}"`;
                const keyIdx = relIdx !== -1
                    ? sourceText.indexOf(searchStr, relIdx)
                    : sourceText.indexOf(searchStr);
                const lineNum = keyIdx !== -1 ? getLineNumber(sourceText, keyIdx) : 1;

                findings.push({
                    FilePath: filePath,
                    Line: lineNum,
                    OldName: key,
                    NewName: renameMap.get(key)!,
                    PatternKind: 'relatedEntityKey',
                    Context: `relatedEntities["${key}"]`,
                });
            }
        }
    }
}

/**
 * Checks `fields.Name` values in data files within folders that manage the
 * "Entities" or "MJ: Entities" entity. In these folders, the Name field
 * is the entity name itself and may need the "MJ: " prefix.
 */
function scanEntityNameFields(
    parsed: unknown,
    sourceText: string,
    filePath: string,
    renameMap: Map<string, string>,
    findings: MetadataFinding[],
): void {
    const records = Array.isArray(parsed) ? parsed : [parsed];

    for (const record of records) {
        if (!record || typeof record !== 'object') continue;

        const rec = record as Record<string, unknown>;
        const fields = rec.fields as Record<string, unknown> | undefined;
        if (!fields || typeof fields !== 'object') continue;

        const nameValue = fields.Name;
        if (typeof nameValue !== 'string') continue;

        if (renameMap.has(nameValue)) {
            // Find the line number by searching for "Name": "OldValue"
            const searchStr = `"Name": "${nameValue}"`;
            const idx = sourceText.indexOf(searchStr);
            const lineNum = idx !== -1 ? getLineNumber(sourceText, idx) : 1;

            findings.push({
                FilePath: filePath,
                Line: lineNum,
                OldName: nameValue,
                NewName: renameMap.get(nameValue)!,
                PatternKind: 'entityNameField',
                Context: `fields.Name: "${nameValue}"`,
            });
        }
    }
}

// ============================================================================
// Metadata File Fixer
// ============================================================================

/**
 * Applies entity name fixes to a metadata file using targeted string
 * replacements that preserve original formatting.
 */
export function fixMetadataFile(sourceText: string, findings: MetadataFinding[]): string {
    if (findings.length === 0) return sourceText;

    let result = sourceText;

    for (const finding of findings) {
        switch (finding.PatternKind) {
            case 'lookupEntity':
                // @lookup:OldName.  →  @lookup:NewName.
                result = replaceAll(result,
                    `@lookup:${finding.OldName}.`,
                    `@lookup:${finding.NewName}.`);
                break;

            case 'lookupValue':
                // Entities.Name=OldValue  →  Entities.Name=NewValue
                // Safe because this only matches within @lookup: context strings
                result = replaceAll(result,
                    `Entities.Name=${finding.OldName}`,
                    `Entities.Name=${finding.NewName}`);
                break;

            case 'folderConfig': {
                // "entity": "OldName"  →  "entity": "NewName"
                // Also handles "entityName": "..."
                const entityPattern = new RegExp(
                    `("entity(?:Name)?"\\s*:\\s*)"${escapeRegex(finding.OldName)}"`,
                    'g'
                );
                result = result.replace(entityPattern, `$1"${finding.NewName}"`);
                break;
            }

            case 'relatedEntityKey':
                // "OldName":  →  "NewName":  (within relatedEntities context)
                result = replaceAll(result,
                    `"${finding.OldName}":`,
                    `"${finding.NewName}":`);
                break;

            case 'entityNameField':
                // "Name": "OldName"  →  "Name": "NewName"
                result = replaceAll(result,
                    `"Name": "${finding.OldName}"`,
                    `"Name": "${finding.NewName}"`);
                break;
        }
    }

    return result;
}

/** Simple replaceAll using split/join for broad compatibility. */
function replaceAll(text: string, search: string, replacement: string): string {
    return text.split(search).join(replacement);
}

/** Escapes special regex characters in a string. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Path Resolution
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

// ============================================================================
// Main Entry Point
// ============================================================================

const DEFAULT_METADATA_EXCLUDE: string[] = [
    '**/node_modules/**',
    '**/.git/**',
];

/**
 * Scans metadata JSON files for entity name references that need the "MJ: "
 * prefix, and optionally fixes them in place.
 */
export async function scanMetadataNames(options: MetadataNameScanOptions): Promise<MetadataNameScanResult> {
    const errors: string[] = [];
    const verbose = options.Verbose !== false;

    // Resolve target path
    const targetPath = path.resolve(options.TargetPath);
    if (!fs.existsSync(targetPath)) {
        return {
            Success: false, Findings: [], FixedFiles: [],
            FilesScanned: 0, RenameMapSize: 0,
            Errors: [`Target path does not exist: ${targetPath}`],
        };
    }

    // Build rename map
    let renameMap: Map<string, string>;
    try {
        const entitySubclassesPath = resolveEntitySubclassesPath(targetPath, options.EntitySubclassesPath);
        if (verbose) console.log(`Building rename map from: ${entitySubclassesPath}`);
        renameMap = buildEntityNameMap(entitySubclassesPath);
        if (verbose) console.log(`Loaded ${renameMap.size} entity name mappings`);
    } catch (err) {
        return {
            Success: false, Findings: [], FixedFiles: [],
            FilesScanned: 0, RenameMapSize: 0,
            Errors: [(err as Error).message],
        };
    }

    // Find JSON files (including dotfiles like .mj-sync.json)
    const isFile = fs.statSync(targetPath).isFile();
    let jsonFiles: string[];

    if (isFile) {
        jsonFiles = [targetPath];
    } else {
        jsonFiles = await glob('**/*.json', {
            cwd: targetPath,
            absolute: true,
            dot: true,  // Include dotfiles like .mj-sync.json
            ignore: DEFAULT_METADATA_EXCLUDE,
        });
    }

    if (verbose) console.log(`Scanning ${jsonFiles.length} JSON files...`);

    // Build a set of directories whose .mj-sync.json declares entity as "Entities" or "MJ: Entities"
    const entityFolders = new Set<string>();
    for (const filePath of jsonFiles) {
        if (path.basename(filePath) === '.mj-sync.json') {
            try {
                const configText = fs.readFileSync(filePath, 'utf-8');
                const config = JSON.parse(configText) as Record<string, unknown>;
                const entityVal = (config.entity ?? config.entityName) as string | undefined;
                if (entityVal === 'Entities' || entityVal === 'MJ: Entities') {
                    entityFolders.add(path.dirname(filePath));
                }
            } catch {
                // skip unparseable config
            }
        }
    }

    // Scan files
    const allFindings: MetadataFinding[] = [];
    const fixedFiles: string[] = [];

    for (const filePath of jsonFiles) {
        try {
            const sourceText = fs.readFileSync(filePath, 'utf-8');
            const isEntitiesFolder = entityFolders.has(path.dirname(filePath));
            const findings = scanMetadataFile(filePath, sourceText, renameMap, isEntitiesFolder);

            if (findings.length > 0) {
                allFindings.push(...findings);

                if (options.Fix) {
                    const fixedText = fixMetadataFile(sourceText, findings);
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
            if (verbose) console.error(`  ${message}`);
        }
    }

    return {
        Success: errors.length === 0,
        Findings: allFindings,
        FixedFiles: fixedFiles,
        FilesScanned: jsonFiles.length,
        RenameMapSize: renameMap.size,
        Errors: errors,
    };
}
