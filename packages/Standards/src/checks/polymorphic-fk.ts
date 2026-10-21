/**
 * @fileoverview The polymorphic foreign-key metadata standard (Rule 2e).
 *
 * Enforces that every polymorphic foreign-key pair on an entity (`EntityID` + `RecordID`,
 * `SourceEntityID` + `SourceRecordID`, `TargetEntityID` + `TargetRecordID`,
 * `LinkedEntityID` + `LinkedRecordID`, `PrimaryScopeEntityID` + `PrimaryScopeRecordID`, etc.)
 * is explicitly decorated in `metadata/entities/` with `EntityField.EntityIDFieldName` pointing
 * to its companion `MJ: Entities` foreign-key column.
 *
 * ## Why this check exists
 *
 * MemberJunction forms (`<mj-form-field>`), grids (`<mj-entity-data-grid>`), cards, and record
 * detail panels use `EntityField.EntityIDFieldName` to resolve polymorphic `RecordID` values into
 * human-readable record names, entity icons, and clickable deep links — without ever guessing by
 * column-name heuristics at runtime (an entity can have multiple polymorphic pairs such as
 * `SourceEntityID`/`SourceRecordID` and `TargetEntityID`/`TargetRecordID`).
 *
 * When a migration adds a new table with a polymorphic `(EntityID, RecordID)` pair and CodeGen
 * regenerates `generated/entities/*.ts`, forgetting the metadata entry in
 * `metadata/entities/.polymorphic-fk-entity-fields.json` silently degrades the UI to raw UUIDs.
 *
 * This check settles both halves statically in CI:
 * 1. **Forward check (CodeGen schema → Metadata)**: Every non-PK, non-FK `*RecordID` /
 *    `*RecordPrimaryKey` field on an entity that also has an `MJ: Entities` FK column must have an
 *    `EntityIDFieldName` declaration in `metadata/`.
 * 2. **Reverse check (Metadata → CodeGen schema)**: Every `EntityIDFieldName` declaration in
 *    `metadata/` for an entity in this repo must name a real record-ID field and a real companion
 *    field whose `RelatedEntity` is `MJ: Entities`.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';
import { HasMarkerNear } from '../lib/markers.js';

const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    '.git',
    '.angular',
    'coverage',
    '.claude',
    '.turbo',
]);

const ALLOW_MARKER = 'mj-polymorphic-fk-allow';

/**
 * Matches polymorphic record-identifier column names (`RecordID`, `SourceRecordID`,
 * `TargetRecordID`, `LinkedRecordID`, `EntityRecordID`, `LinkedEntityRecordID`,
 * `PrimaryScopeRecordID`, `LinkedRecordPrimaryKey`, etc.) while excluding plural list columns
 * (`ExcludedRecordIDs`) and third-party external-system ID columns (`ExternalSystemRecordID`,
 * `ExternalRecordID`).
 */
const POLYMORPHIC_RECORD_FIELD_PATTERN = /^(?:[A-Z][A-Za-z0-9]*?)?Record(?:ID|PrimaryKey)$/;
const EXTERNAL_SYSTEM_RECORD_FIELD_PATTERN = /^External(?:System)?Record(?:ID|PrimaryKey)$/i;

/** Build a sorted array of 0-based newline offsets for O(log N) 1-based line lookup. */
function buildLineIndex(source: string): number[] {
    const starts = [0];
    for (let i = 0; i < source.length; i++) {
        if (source.charCodeAt(i) === 10) starts.push(i + 1);
    }
    return starts;
}

/** Convert a 0-based character offset into a 1-based line number using a prebuilt line index. */
function lineAtOffset(lineStarts: readonly number[], offset: number): number {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (lineStarts[mid] <= offset) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return hi + 1;
}

/** Parsed representation of a single field from a generated Zod entity schema. */
export interface GeneratedFieldDescriptor {
    Name: string;
    SqlDataType: string | null;
    RelatedEntity: string | null;
    File: string;
    Line: number;
}

/** Parsed representation of an entity from a generated Zod entity schema file. */
export interface GeneratedEntityDescriptor {
    Name: string;
    Fields: Map<string, GeneratedFieldDescriptor>;
    File: string;
    Line: number;
}

/** Parsed representation of a metadata `EntityIDFieldName` declaration. */
export interface MetadataPolymorphicDeclaration {
    EntityName: string;
    FieldName: string;
    EntityIDFieldName: string;
    File: string;
    Line: number;
}

/**
 * Collect all generated entity TypeScript files (`generated/entities/*.ts`) under `dir`.
 */
function findGeneratedEntityFiles(dir: string): string[] {
    const found: string[] = [];
    const walk = (current: string, inGeneratedEntities: boolean): void => {
        let entries;
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                const nextInGen =
                    inGeneratedEntities ||
                    (entry.name === 'entities' && current.endsWith(`${join('src', 'generated')}`)) ||
                    (entry.name === 'entities' && current.endsWith('generated'));
                walk(full, nextInGen);
            } else if (
                entry.isFile() &&
                inGeneratedEntities &&
                entry.name.endsWith('.ts') &&
                !entry.name.endsWith('.d.ts')
            ) {
                found.push(full);
            }
        }
    };
    walk(dir, false);
    return found;
}

/**
 * Collect all `.json` files under `dir`.
 */
function findJsonFiles(dir: string): string[] {
    const found: string[] = [];
    if (!existsSync(dir)) return found;
    const walk = (current: string): void => {
        let entries;
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                found.push(full);
            }
        }
    };
    walk(dir);
    return found;
}

/**
 * Parse all generated Zod entity schemas in a TypeScript file.
 */
export function ParseGeneratedEntitiesFromSource(
    source: string,
    repoRelativeFile: string,
): GeneratedEntityDescriptor[] {
    const results: GeneratedEntityDescriptor[] = [];
    const lineStarts = buildLineIndex(source);
    const blockRe =
        /\/\*\*\s*\n\s*\*\s*zod schema definition for the entity ([^\n*]+)\s*\n\s*\*\/\s*\nexport const \w+\s*=\s*z\.object\(\{([\s\S]*?)\n\}\);/g;

    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(source)) !== null) {
        const entityName = match[1].trim();
        const body = match[2];
        const blockStartOffset = match.index;
        const bodyStartOffset = blockStartOffset + match[0].indexOf(body);
        const entityLine = lineAtOffset(lineStarts, blockStartOffset);

        const fields = new Map<string, GeneratedFieldDescriptor>();
        const fieldRe = /^\s{4}([A-Za-z0-9_]+):\s*z\.[\s\S]*?\.describe\(`([\s\S]*?)`\)/gm;
        let fm: RegExpExecArray | null;
        while ((fm = fieldRe.exec(body)) !== null) {
            const fieldName = fm[1].trim();
            const desc = fm[2];
            const relMatch = /\*\s*\*\s*Related Entity\/Foreign Key:\s*([^\n(]+)/.exec(desc);
            const sqlMatch = /\*\s*\*\s*SQL Data Type:\s*([^\n]+)/.exec(desc);
            const fieldLine = lineAtOffset(lineStarts, bodyStartOffset + fm.index);

            fields.set(fieldName, {
                Name: fieldName,
                SqlDataType: sqlMatch ? sqlMatch[1].trim() : null,
                RelatedEntity: relMatch ? relMatch[1].trim() : null,
                File: repoRelativeFile,
                Line: fieldLine,
            });
        }

        results.push({
            Name: entityName,
            Fields: fields,
            File: repoRelativeFile,
            Line: entityLine,
        });
    }
    return results;
}

/**
 * Extract all `EntityIDFieldName` declarations from a metadata JSON file.
 */
export function ParseMetadataPolymorphicDeclarations(
    rawJson: string,
    repoRelativeFile: string,
): MetadataPolymorphicDeclaration[] {
    const declarations: MetadataPolymorphicDeclaration[] = [];
    if (!rawJson.includes('EntityIDFieldName')) return declarations;

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        return declarations;
    }

    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        const recObj = record as {
            fields?: Record<string, unknown>;
            relatedEntities?: Record<string, unknown>;
        };
        const entityName = typeof recObj.fields?.Name === 'string' ? recObj.fields.Name.trim() : null;
        if (!entityName) continue;

        const entityFields = recObj.relatedEntities?.['MJ: Entity Fields'];
        if (!Array.isArray(entityFields)) continue;

        for (const ef of entityFields) {
            if (!ef || typeof ef !== 'object') continue;
            const efObj = ef as {
                fields?: Record<string, unknown>;
                primaryKey?: Record<string, unknown>;
            };
            const entityIDFieldName =
                typeof efObj.fields?.EntityIDFieldName === 'string'
                    ? efObj.fields.EntityIDFieldName.trim()
                    : null;
            if (!entityIDFieldName) continue;

            let fieldName = typeof efObj.fields?.Name === 'string' ? efObj.fields.Name.trim() : null;
            if (!fieldName && typeof efObj.primaryKey?.ID === 'string') {
                const lookupMatch = /[?&]Name=([^&\s"]+)/.exec(efObj.primaryKey.ID);
                if (lookupMatch) fieldName = lookupMatch[1].trim();
            }
            if (!fieldName) continue;

            // Approximate 1-based line number of the declaration in the JSON file
            const entityIdx = rawJson.indexOf(`"${entityName}"`);
            const fieldIdx = entityIdx >= 0 ? rawJson.indexOf(fieldName, entityIdx) : rawJson.indexOf(fieldName);
            const line = fieldIdx >= 0 ? rawJson.slice(0, fieldIdx).split('\n').length : 1;

            declarations.push({
                EntityName: entityName,
                FieldName: fieldName,
                EntityIDFieldName: entityIDFieldName,
                File: repoRelativeFile,
                Line: line,
            });
        }
    }

    return declarations;
}

/**
 * Suggest the most likely companion `EntityID` field name on the same entity for a given
 * polymorphic `RecordID` field name.
 */
export function SuggestCompanionEntityIDField(
    recordFieldName: string,
    entityFKFields: GeneratedFieldDescriptor[],
): string {
    if (entityFKFields.length === 1) {
        return entityFKFields[0].Name;
    }
    const prefix = recordFieldName
        .replace(/EntityRecord(?:ID|PrimaryKey)$/, '')
        .replace(/Record(?:ID|PrimaryKey)$/, '');
    const exactCandidate = `${prefix}EntityID`;
    const match = entityFKFields.find((f) => f.Name.toLowerCase() === exactCandidate.toLowerCase());
    if (match) return match.Name;
    return entityFKFields.map((f) => f.Name).join(' or ');
}

/** The registered polymorphic foreign-key standard. */
export const PolymorphicFKCheck: StandardCheck = {
    Id: 'polymorphic-fk',
    Title: 'Polymorphic foreign-key pairs must declare EntityField.EntityIDFieldName in metadata',
    Since: '6.2.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/AGENTS.md',
    Description:
        'Every polymorphic foreign-key column pair (e.g. EntityID + RecordID, SourceEntityID + SourceRecordID, ' +
        'TargetEntityID + TargetRecordID) must populate EntityField.EntityIDFieldName in metadata/entities/ ' +
        'so forms, grids, and record links resolve target records deterministically without column-name heuristics.',
    DefaultRoots: ['packages', 'metadata'],
    DefaultOptions: {
        /**
         * Fully-qualified `"EntityName.FieldName"` pairs that deliberately hold an opaque string
         * rather than a polymorphic foreign key to the entity named in an `EntityID` column.
         */
        allowedFields: [] as string[],
    },

    Run(context: CheckContext): CheckResult {
        const violations: Violation[] = [];
        const notes: string[] = [];

        const rawAllowed = context.Options['allowedFields'];
        const allowedSet = new Set<string>(
            Array.isArray(rawAllowed) ? rawAllowed.filter((x): x is string => typeof x === 'string') : [],
        );

        // 1. Collect generated entities across scanned roots (plus `packages` if not explicitly listed)
        const scanDirs = new Set<string>(context.Roots.map((r) => join(context.RepoRoot, r)));
        const generatedFiles = new Set<string>();
        for (const dir of scanDirs) {
            if (!existsSync(dir)) continue;
            for (const f of findGeneratedEntityFiles(dir)) {
                generatedFiles.add(f);
            }
        }

        const entities = new Map<string, GeneratedEntityDescriptor>();
        const fileLinesCache = new Map<string, string[]>();

        for (const absFile of generatedFiles) {
            const raw = readFileSync(absFile, 'utf8');
            const relFile = relative(context.RepoRoot, absFile);
            fileLinesCache.set(relFile, raw.split('\n'));
            for (const ent of ParseGeneratedEntitiesFromSource(raw, relFile)) {
                entities.set(ent.Name, ent);
            }
        }

        // 2. Collect metadata declarations across `metadata/` (or any root containing JSON files)
        const metadataDirs = new Set<string>([join(context.RepoRoot, 'metadata')]);
        for (const r of context.Roots) {
            if (r === 'metadata' || r.startsWith('metadata/')) {
                metadataDirs.add(join(context.RepoRoot, r));
            }
        }

        const declarationsByPair = new Map<string, MetadataPolymorphicDeclaration>();
        const allDeclarations: MetadataPolymorphicDeclaration[] = [];

        for (const metaDir of metadataDirs) {
            for (const jsonFile of findJsonFiles(metaDir)) {
                const raw = readFileSync(jsonFile, 'utf8');
                const relFile = relative(context.RepoRoot, jsonFile);
                for (const decl of ParseMetadataPolymorphicDeclarations(raw, relFile)) {
                    declarationsByPair.set(`${decl.EntityName}::${decl.FieldName}`, decl);
                    allDeclarations.push(decl);
                }
            }
        }

        // 3. Forward check: every polymorphic RecordID column in generated schemas must be declared
        let candidatePairCount = 0;
        for (const entity of entities.values()) {
            const entityFKFields = [...entity.Fields.values()].filter(
                (f) => f.RelatedEntity === 'MJ: Entities',
            );
            if (entityFKFields.length === 0) continue;

            const lines = fileLinesCache.get(entity.File) ?? [];
            for (const field of entity.Fields.values()) {
                if (field.Name === 'ID' || field.RelatedEntity !== null) continue;
                if (!POLYMORPHIC_RECORD_FIELD_PATTERN.test(field.Name)) continue;
                if (EXTERNAL_SYSTEM_RECORD_FIELD_PATTERN.test(field.Name)) continue;
                if (allowedSet.has(`${entity.Name}.${field.Name}`)) continue;
                if (HasMarkerNear(lines, field.Line, ALLOW_MARKER)) continue;

                candidatePairCount++;
                const key = `${entity.Name}::${field.Name}`;
                if (!declarationsByPair.has(key)) {
                    const suggestedCompanion = SuggestCompanionEntityIDField(field.Name, entityFKFields);
                    violations.push({
                        File: field.File,
                        Line: field.Line,
                        Message:
                            `Entity "${entity.Name}" has polymorphic record field "${field.Name}" alongside ` +
                            `MJ: Entities FK (${entityFKFields.map((f) => f.Name).join(', ')}), but no ` +
                            `EntityField.EntityIDFieldName metadata entry was found — declare ` +
                            `"EntityIDFieldName": "${suggestedCompanion}" for "${field.Name}" in ` +
                            `metadata/entities/.polymorphic-fk-entity-fields.json (Rule 2e)`,
                    });
                }
            }
        }

        // 4. Reverse check: validate every metadata declaration whose entity exists in this repo
        for (const decl of allDeclarations) {
            const entity = entities.get(decl.EntityName);
            if (!entity) continue; // External/parent entity not generated in this repo

            const recordField = entity.Fields.get(decl.FieldName);
            if (!recordField) {
                violations.push({
                    File: decl.File,
                    Line: decl.Line,
                    Message:
                        `Polymorphic FK metadata on "${decl.EntityName}" references field "${decl.FieldName}", ` +
                        `which does not exist on the generated schema in ${entity.File}`,
                });
                continue;
            }

            if (decl.FieldName === decl.EntityIDFieldName) {
                violations.push({
                    File: decl.File,
                    Line: decl.Line,
                    Message:
                        `Polymorphic FK metadata on "${decl.EntityName}.${decl.FieldName}" sets ` +
                        `EntityIDFieldName to itself ("${decl.EntityIDFieldName}") — it must point to the ` +
                        `companion MJ: Entities foreign-key column`,
                });
                continue;
            }

            const companionField = entity.Fields.get(decl.EntityIDFieldName);
            if (!companionField) {
                violations.push({
                    File: decl.File,
                    Line: decl.Line,
                    Message:
                        `Polymorphic FK metadata on "${decl.EntityName}.${decl.FieldName}" sets ` +
                        `EntityIDFieldName to "${decl.EntityIDFieldName}", which does not exist on "${decl.EntityName}"`,
                });
                continue;
            }

            if (companionField.RelatedEntity !== 'MJ: Entities') {
                violations.push({
                    File: decl.File,
                    Line: decl.Line,
                    Message:
                        `Polymorphic FK metadata on "${decl.EntityName}.${decl.FieldName}" sets ` +
                        `EntityIDFieldName to "${decl.EntityIDFieldName}", but "${decl.EntityIDFieldName}" ` +
                        `is not a foreign key to "MJ: Entities" (found RelatedEntity: ${companionField.RelatedEntity ?? 'none'})`,
                });
            }
        }

        notes.push(
            `${entities.size} generated entities scanned, ${candidatePairCount} polymorphic FK pairs verified against ${allDeclarations.length} metadata declarations`,
        );

        return { Violations: violations, Notes: notes };
    },
};
