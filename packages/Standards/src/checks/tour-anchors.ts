/**
 * @fileoverview The guided-tours anchor & metadata standard (`tour-anchors`).
 *
 * Validates `metadata/tours/` JSON definitions statically in CI:
 * 1. Namespace governance (`allowedPrefixes`) on `TourKey`, `Registered` anchor keys, and `Signal` keys.
 * 2. Every `Registered` anchor key (unless templated with `{{...}}`) exists either in a repo template/TS
 *    source (`data-mj-tour-anchor="..."`, `[mjTourAnchor]="'...'"`, `mjTourAnchor="..."`, `RegisterAnchor(...)`)
 *    or in the `@memberjunction/ng-tours` core anchor manifest JSON.
 * 3. Every semantic `FormField` / `FormSection` anchor (permitting `{{Context...}}` template variables)
 *    declares non-empty `Entity` and `Field` / `Section`, and validates literal entities/fields against
 *    generated entity metadata when available in the repo.
 * 4. Step types, anchor strategies, completion check types, and trigger types are known (either
 *    built-in, passed via options, seeded in `metadata/tour-step-types/`, or registered via
 *    `@RegisterClass(BaseTour..., '...')`).
 * 5. `Strategy === 'Selector'` CSS fallbacks emit a warning unless excused with a
 *    `tour-anchors-allow-selector` note in the step's `Configuration`.
 *
 * @module @memberjunction/standards
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';
import {
    ParseGeneratedEntitiesFromSource,
    type GeneratedEntityDescriptor,
} from './polymorphic-fk.js';

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

export const DEFAULT_KNOWN_STEP_TYPES: readonly string[] = [
    'Spotlight',
    'Action',
    'Beacon',
    'Modal',
    'Banner',
    'Choice',
    'Media',
    'EmbeddedComponent',
    'AskAgent',
];

export const DEFAULT_KNOWN_ANCHOR_STRATEGIES: readonly string[] = [
    'Registered',
    'FormField',
    'FormSection',
    'FormRailGroup',
    'FormToolbarAction',
    'NavItem',
    'RailPage',
    'AppSwitcher',
    'GridColumn',
    'Omnibar',
    'ChatComposer',
    'Role',
    'Selector',
];

export const DEFAULT_KNOWN_COMPLETION_TYPES: readonly string[] = [
    'NextButton',
    'AnchorInteraction',
    'Navigation',
    'Signal',
    'EntityEvent',
    'FieldState',
    'ServerPredicate',
    'AgentConfirmed',
    'All',
    'Any',
];

export const DEFAULT_KNOWN_TRIGGER_TYPES: readonly string[] = [
    'FirstVisit',
    'EntityFormOpened',
    'Signal',
    'AppUpgraded',
    'Struggle',
    'Schedule',
    'AgentSuggested',
];

const DEFAULT_CORE_MANIFEST_CANDIDATES: readonly string[] = [
    'packages/Angular/Generic/tours/src/core-anchor-manifest.json',
    'packages/Angular/Generic/tours/dist/core-anchor-manifest.json',
    'node_modules/@memberjunction/ng-tours/core-anchor-manifest.json',
    'node_modules/@memberjunction/ng-tours/src/core-anchor-manifest.json',
    'node_modules/@memberjunction/ng-tours/dist/core-anchor-manifest.json',
];

interface SyncMetadataRecord {
    fields?: Record<string, unknown>;
    relatedEntities?: Record<string, SyncMetadataRecord[]>;
    deleteRecord?: { delete?: boolean };
}

interface TourAnchorObject {
    Strategy?: unknown;
    Key?: unknown;
    AnchorKey?: unknown;
    Entity?: unknown;
    Field?: unknown;
    Section?: unknown;
    SectionKey?: unknown;
    Fallbacks?: unknown;
}

interface TourCompletionCheckObject {
    Type?: unknown;
    Signal?: unknown;
    SignalName?: unknown;
    Key?: unknown;
    Checks?: unknown;
}

function isTemplateVar(value: string): boolean {
    return value.includes('{{') && value.includes('}}');
}

function readStringOptionArray(options: Readonly<Record<string, unknown>>, key: string): string[] | undefined {
    const raw = options[key];
    if (!Array.isArray(raw)) return undefined;
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseJsonIfString(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return value;
    }
}

function findFilesWithExtensions(dir: string, extensions: readonly string[]): string[] {
    const results: string[] = [];
    if (!existsSync(dir)) return results;

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
            } else if (
                entry.isFile() &&
                extensions.some((ext) => entry.name.endsWith(ext)) &&
                !entry.name.endsWith('.d.ts')
            ) {
                results.push(full);
            }
        }
    };

    walk(dir);
    return results;
}

function findTourJsonFiles(repoRoot: string, roots: readonly string[]): string[] {
    const tourDirs = new Set<string>();
    const defaultToursDir = join(repoRoot, 'metadata', 'tours');
    if (existsSync(defaultToursDir)) {
        tourDirs.add(defaultToursDir);
    }
    for (const root of roots) {
        const abs = join(repoRoot, root);
        const normalized = root.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normalized === 'tours' || normalized.endsWith('/tours')) {
            if (existsSync(abs)) tourDirs.add(abs);
        } else if (
            normalized === 'metadata' ||
            normalized.startsWith('metadata/') ||
            normalized.endsWith('/metadata')
        ) {
            const nested = join(abs, 'tours');
            if (existsSync(nested)) tourDirs.add(nested);
        }
    }

    const files = new Set<string>();
    for (const dir of tourDirs) {
        for (const file of findFilesWithExtensions(dir, ['.json'])) {
            const base = file.split(/[/\\]/).pop() ?? '';
            if (
                base === '.mj-sync.json' ||
                base === '.mj-folder.json' ||
                base === 'package.json' ||
                /^tsconfig(\..+)?\.json$/i.test(base)
            ) {
                continue;
            }
            files.add(file);
        }
    }
    return [...files].sort();
}

function findStepTypeDirs(repoRoot: string, roots: readonly string[]): string[] {
    const dirs = new Set<string>();
    const defaultDir = join(repoRoot, 'metadata', 'tour-step-types');
    if (existsSync(defaultDir)) dirs.add(defaultDir);
    for (const root of roots) {
        const nested = join(repoRoot, root, 'tour-step-types');
        if (existsSync(nested)) dirs.add(nested);
    }
    return [...dirs];
}

function extractManifestKeys(rawJson: string): string[] {
    const keys: string[] = [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        return keys;
    }

    const collectItem = (item: unknown): void => {
        if (typeof item === 'string' && item.trim().length > 0) {
            keys.push(item.trim());
        } else if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            const candidate = obj['Key'] ?? obj['key'] ?? obj['AnchorKey'] ?? obj['anchorKey'];
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                keys.push(candidate.trim());
            }
        }
    };

    if (Array.isArray(parsed)) {
        for (const item of parsed) collectItem(item);
        return keys;
    }

    if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        const arr = obj['Anchors'] ?? obj['anchors'] ?? obj['Keys'] ?? obj['keys'];
        if (Array.isArray(arr)) {
            for (const item of arr) collectItem(item);
        }
    }

    return keys;
}

/**
 * Loads exported core anchor keys from the configured manifest path or standard default locations.
 */
export function LoadCoreAnchorManifest(
    repoRoot: string,
    configuredPath?: string
): { Keys: Set<string>; ManifestPath: string | null } {
    const candidates: string[] = [];
    if (configuredPath && configuredPath.trim().length > 0) {
        candidates.push(isAbsolute(configuredPath) ? configuredPath : join(repoRoot, configuredPath));
    } else {
        for (const rel of DEFAULT_CORE_MANIFEST_CANDIDATES) {
            candidates.push(join(repoRoot, rel));
        }
    }

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            const raw = readFileSync(candidate, 'utf8');
            return {
                Keys: new Set(extractManifestKeys(raw)),
                ManifestPath: candidate,
            };
        }
    }

    return { Keys: new Set<string>(), ManifestPath: null };
}

/**
 * Extracts all registered anchor keys declared in a template or TypeScript source file.
 */
export function ExtractRegisteredAnchorsFromSource(source: string): string[] {
    const found = new Set<string>();
    const patterns: RegExp[] = [
        /\bdata-mj-tour-anchor\s*=\s*"([^"]+)"/g,
        /\bdata-mj-tour-anchor\s*=\s*'([^']+)'/g,
        /\[attr\.data-mj-tour-anchor\]\s*=\s*"'([^']+)'"/g,
        /\[attr\.data-mj-tour-anchor\]\s*=\s*'"([^"]+)"'/g,
        /\[mjTourAnchor\]\s*=\s*"'([^']+)'"/g,
        /\[mjTourAnchor\]\s*=\s*'"([^"]+)"'/g,
        /\bmjTourAnchor\s*=\s*"([^"]+)"/g,
        /\bmjTourAnchor\s*=\s*'([^']+)'/g,
        /\bRegisterAnchor\s*\(\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
            const key = match[1].trim();
            if (key.length > 0) {
                found.add(key);
            }
        }
    }

    return [...found];
}

function collectRepoSourceData(
    repoRoot: string,
    roots: readonly string[]
): {
    RegisteredAnchors: Set<string>;
    StepTypes: Set<string>;
    Strategies: Set<string>;
    CompletionTypes: Set<string>;
    TriggerTypes: Set<string>;
    Entities: Map<string, GeneratedEntityDescriptor>;
} {
    const registeredAnchors = new Set<string>();
    const stepTypes = new Set<string>();
    const strategies = new Set<string>();
    const completionTypes = new Set<string>();
    const triggerTypes = new Set<string>();
    const entities = new Map<string, GeneratedEntityDescriptor>();

    const scanDirs = new Set<string>();
    const packagesDir = join(repoRoot, 'packages');
    if (existsSync(packagesDir)) scanDirs.add(packagesDir);
    for (const root of roots) {
        const normalized = root.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normalized === 'metadata' || normalized.startsWith('metadata/')) continue;
        const abs = join(repoRoot, root);
        if (existsSync(abs)) scanDirs.add(abs);
    }

    const registerClassPattern =
        /@RegisterClass\s*\(\s*(BaseTourStepType|BaseTourStepRenderer|BaseTourAnchorResolver|BaseTourCompletionCheck|BaseTourTrigger)\s*,\s*['"]([^'"]+)['"]/g;

    const seenFiles = new Set<string>();
    for (const dir of scanDirs) {
        for (const file of findFilesWithExtensions(dir, ['.html', '.ts'])) {
            if (seenFiles.has(file)) continue;
            seenFiles.add(file);

            const content = readFileSync(file, 'utf8');

            for (const anchor of ExtractRegisteredAnchorsFromSource(content)) {
                registeredAnchors.add(anchor);
            }

            if (file.endsWith('.ts')) {
                let match: RegExpExecArray | null;
                registerClassPattern.lastIndex = 0;
                while ((match = registerClassPattern.exec(content)) !== null) {
                    const baseClass = match[1];
                    const registeredKey = match[2].trim();
                    if (!registeredKey) continue;
                    if (baseClass === 'BaseTourStepType' || baseClass === 'BaseTourStepRenderer') {
                        stepTypes.add(registeredKey);
                    } else if (baseClass === 'BaseTourAnchorResolver') {
                        strategies.add(registeredKey);
                    } else if (baseClass === 'BaseTourCompletionCheck') {
                        completionTypes.add(registeredKey);
                    } else if (baseClass === 'BaseTourTrigger') {
                        triggerTypes.add(registeredKey);
                    }
                }

                const normalizedPath = file.replace(/\\/g, '/');
                if (normalizedPath.includes('/generated/entities/') || normalizedPath.includes('/generated/schemas/')) {
                    const relFile = relative(repoRoot, file);
                    for (const ent of ParseGeneratedEntitiesFromSource(content, relFile)) {
                        entities.set(ent.Name, ent);
                    }
                }
            }
        }
    }

    return {
        RegisteredAnchors: registeredAnchors,
        StepTypes: stepTypes,
        Strategies: strategies,
        CompletionTypes: completionTypes,
        TriggerTypes: triggerTypes,
        Entities: entities,
    };
}

function collectSeededStepTypes(repoRoot: string, roots: readonly string[]): Set<string> {
    const stepTypes = new Set<string>();
    for (const dir of findStepTypeDirs(repoRoot, roots)) {
        for (const file of findFilesWithExtensions(dir, ['.json'])) {
            const base = file.split(/[/\\]/).pop() ?? '';
            if (base === '.mj-sync.json' || base === '.mj-folder.json') continue;
            try {
                const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
                const records = Array.isArray(parsed) ? parsed : [parsed];
                for (const rec of records) {
                    if (typeof rec !== 'object' || rec === null) continue;
                    const syncRec = rec as SyncMetadataRecord;
                    if (syncRec.deleteRecord?.delete === true) continue;
                    const fields = syncRec.fields ?? (rec as Record<string, unknown>);
                    for (const key of ['Name', 'DriverClass', 'RendererClass']) {
                        const val = fields[key];
                        if (typeof val === 'string' && val.trim().length > 0) {
                            stepTypes.add(val.trim());
                        }
                    }
                }
            } catch {
                // Ignore malformed non-tour step type json
            }
        }
    }
    return stepTypes;
}

function extractStepTypeName(fields: Record<string, unknown>): string | null {
    const direct = fields['StepType'];
    if (typeof direct === 'string' && direct.trim().length > 0) {
        return direct.trim();
    }
    const stepTypeId = fields['StepTypeID'];
    if (typeof stepTypeId === 'string') {
        const match = /^@lookup:MJ:\s*Tour Step Types\.Name=(.+)$/i.exec(stepTypeId.trim());
        if (match && match[1].trim().length > 0) {
            return match[1].trim();
        }
    }
    return null;
}

function findLineNumber(rawText: string, needle: string): number {
    if (!needle) return 0;
    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) return i + 1;
    }
    return 0;
}

function hasPrefix(value: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => value.startsWith(prefix));
}

function stepConfigAllowsSelector(configRaw: unknown): boolean {
    if (configRaw == null) return false;
    if (typeof configRaw === 'string') {
        return configRaw.includes('tour-anchors-allow-selector');
    }
    try {
        return JSON.stringify(configRaw).includes('tour-anchors-allow-selector');
    } catch {
        return false;
    }
}

interface TourValidationContext {
    RelFile: string;
    RawText: string;
    AllowedPrefixes: readonly string[];
    KnownStepTypes: ReadonlySet<string>;
    KnownStrategies: ReadonlySet<string>;
    KnownCompletionTypes: ReadonlySet<string>;
    KnownTriggerTypes: ReadonlySet<string>;
    RepoRegisteredAnchors: ReadonlySet<string>;
    CoreManifestAnchors: ReadonlySet<string>;
    GeneratedEntities: ReadonlyMap<string, GeneratedEntityDescriptor>;
    Violations: Violation[];
}

function validateAnchor(
    ctx: TourValidationContext,
    stepLabel: string,
    anchorRaw: unknown,
    allowSelector: boolean
): void {
    const parsed = parseJsonIfString(anchorRaw);
    if (parsed == null) return;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        ctx.Violations.push({
            File: ctx.RelFile,
            Line: findLineNumber(ctx.RawText, stepLabel),
            Message: `Step "${stepLabel}" has a non-object Anchor definition.`,
        });
        return;
    }

    const anchor = parsed as TourAnchorObject;
    const strategy = typeof anchor.Strategy === 'string' ? anchor.Strategy.trim() : '';
    if (!strategy) {
        ctx.Violations.push({
            File: ctx.RelFile,
            Line: findLineNumber(ctx.RawText, stepLabel),
            Message: `Step "${stepLabel}" declares an Anchor without a "Strategy".`,
        });
        return;
    }

    if (!ctx.KnownStrategies.has(strategy)) {
        ctx.Violations.push({
            File: ctx.RelFile,
            Line: findLineNumber(ctx.RawText, strategy),
            Message:
                `Step "${stepLabel}" uses unknown anchor Strategy "${strategy}". ` +
                `Register a BaseTourAnchorResolver or use one of: ${[...ctx.KnownStrategies].join(', ')}.`,
        });
        return;
    }

    if (strategy === 'Registered') {
        const keyRaw = anchor.Key ?? anchor.AnchorKey;
        const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
        if (!key) {
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, stepLabel),
                Message: `Step "${stepLabel}" uses Strategy "Registered" without a non-empty "Key".`,
            });
        } else if (!isTemplateVar(key)) {
            if (ctx.AllowedPrefixes.length > 0 && !hasPrefix(key, ctx.AllowedPrefixes)) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, key),
                    Message:
                        `Registered anchor key "${key}" on step "${stepLabel}" must start with one of ` +
                        `allowedPrefixes [${ctx.AllowedPrefixes.join(', ')}].`,
                });
            }
            if (!ctx.RepoRegisteredAnchors.has(key) && !ctx.CoreManifestAnchors.has(key)) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, key),
                    Message:
                        `Registered anchor key "${key}" on step "${stepLabel}" was not found in any repo template/source ` +
                        `(data-mj-tour-anchor="${key}" or [mjTourAnchor]="'${key}'") or in the core anchor manifest.`,
                });
            }
        }
    } else if (strategy === 'FormField' || strategy === 'FormSection') {
        const entity = typeof anchor.Entity === 'string' ? anchor.Entity.trim() : '';
        const fieldOrSectionRaw =
            strategy === 'FormField'
                ? anchor.Field
                : anchor.Section ?? anchor.SectionKey ?? anchor.Field;
        const fieldOrSection = typeof fieldOrSectionRaw === 'string' ? fieldOrSectionRaw.trim() : '';

        if (!entity) {
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, stepLabel),
                Message: `Step "${stepLabel}" uses Strategy "${strategy}" without a non-empty "Entity".`,
            });
        }
        if (!fieldOrSection) {
            const propLabel = strategy === 'FormField' ? 'Field' : 'Section';
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, stepLabel),
                Message: `Step "${stepLabel}" uses Strategy "${strategy}" without a non-empty "${propLabel}".`,
            });
        }

        if (entity && !isTemplateVar(entity) && ctx.GeneratedEntities.size > 0) {
            const entDesc = ctx.GeneratedEntities.get(entity);
            if (!entDesc) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, entity),
                    Message:
                        `Semantic anchor on step "${stepLabel}" references unknown entity "${entity}" ` +
                        `not found in generated entity schemas.`,
                });
            } else if (
                strategy === 'FormField' &&
                fieldOrSection &&
                !isTemplateVar(fieldOrSection) &&
                !entDesc.Fields.has(fieldOrSection)
            ) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, fieldOrSection),
                    Message:
                        `Semantic FormField anchor on step "${stepLabel}" references field "${fieldOrSection}" ` +
                        `which does not exist on generated entity "${entity}".`,
                });
            }
        }
    } else if (strategy === 'Selector' && !allowSelector) {
        ctx.Violations.push({
            File: ctx.RelFile,
            Line: findLineNumber(ctx.RawText, 'Selector'),
            Severity: 'warn',
            Message:
                `Step "${stepLabel}" uses CSS fallback Strategy "Selector". Prefer a Registered or semantic anchor; ` +
                `add "tour-anchors-allow-selector" to step Configuration if a CSS selector is unavoidable.`,
        });
    }

    if (Array.isArray(anchor.Fallbacks)) {
        for (const fallback of anchor.Fallbacks) {
            validateAnchor(ctx, stepLabel, fallback, allowSelector);
        }
    }
}

function validateCompletionNode(
    ctx: TourValidationContext,
    stepLabel: string,
    nodeRaw: unknown
): void {
    const parsed = parseJsonIfString(nodeRaw);
    if (parsed == null) return;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return;

    const node = parsed as TourCompletionCheckObject;
    if (typeof node.Type === 'string') {
        const checkType = node.Type.trim();
        if (checkType.length > 0 && !ctx.KnownCompletionTypes.has(checkType)) {
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, checkType),
                Message:
                    `Step "${stepLabel}" uses unknown completion check Type "${checkType}". ` +
                    `Register a BaseTourCompletionCheck or use one of: ${[...ctx.KnownCompletionTypes].join(', ')}.`,
            });
        }
        if (checkType === 'Signal') {
            const sigRaw = node.Signal ?? node.SignalName ?? node.Key;
            const sig = typeof sigRaw === 'string' ? sigRaw.trim() : '';
            if (sig && !isTemplateVar(sig) && ctx.AllowedPrefixes.length > 0 && !hasPrefix(sig, ctx.AllowedPrefixes)) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, sig),
                    Message:
                        `Signal key "${sig}" in step "${stepLabel}" completion must start with one of ` +
                        `allowedPrefixes [${ctx.AllowedPrefixes.join(', ')}].`,
                });
            }
        }
    }

    if (Array.isArray(node.Checks)) {
        for (const child of node.Checks) {
            validateCompletionNode(ctx, stepLabel, child);
        }
    }
}

function validateTourRecord(ctx: TourValidationContext, rawRecord: unknown): void {
    if (typeof rawRecord !== 'object' || rawRecord === null) return;
    const syncRec = rawRecord as SyncMetadataRecord;
    if (syncRec.deleteRecord?.delete === true) return;

    const tourFields = syncRec.fields ?? (rawRecord as Record<string, unknown>);
    const tourKey = typeof tourFields['TourKey'] === 'string' ? tourFields['TourKey'].trim() : '';
    if (tourKey && !isTemplateVar(tourKey) && ctx.AllowedPrefixes.length > 0 && !hasPrefix(tourKey, ctx.AllowedPrefixes)) {
        ctx.Violations.push({
            File: ctx.RelFile,
            Line: findLineNumber(ctx.RawText, tourKey),
            Message:
                `TourKey "${tourKey}" must start with one of allowedPrefixes [${ctx.AllowedPrefixes.join(', ')}].`,
        });
    }

    const stepsRaw =
        syncRec.relatedEntities?.['MJ: Tour Steps'] ??
        (Array.isArray(tourFields['Steps']) ? (tourFields['Steps'] as unknown[]) : []);

    for (let i = 0; i < stepsRaw.length; i++) {
        const stepEntry = stepsRaw[i];
        if (typeof stepEntry !== 'object' || stepEntry === null) continue;
        const stepSync = stepEntry as SyncMetadataRecord;
        if (stepSync.deleteRecord?.delete === true) continue;
        const stepFields = stepSync.fields ?? (stepEntry as Record<string, unknown>);

        const stepKey = typeof stepFields['StepKey'] === 'string' ? stepFields['StepKey'].trim() : '';
        const stepLabel = stepKey || `step #${i + 1}`;

        const stepType = extractStepTypeName(stepFields);
        if (stepType && !ctx.KnownStepTypes.has(stepType)) {
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, stepType),
                Message:
                    `Step "${stepLabel}" references unknown step type "${stepType}". ` +
                    `Known step types: ${[...ctx.KnownStepTypes].join(', ')}.`,
            });
        }

        const allowSelector = stepConfigAllowsSelector(stepFields['Configuration']);
        validateAnchor(ctx, stepLabel, stepFields['Anchor'], allowSelector);
        validateCompletionNode(ctx, stepLabel, stepFields['Completion']);
    }

    const triggersRaw =
        syncRec.relatedEntities?.['MJ: Tour Triggers'] ??
        (Array.isArray(tourFields['Triggers']) ? (tourFields['Triggers'] as unknown[]) : []);

    for (const trigEntry of triggersRaw) {
        if (typeof trigEntry !== 'object' || trigEntry === null) continue;
        const trigSync = trigEntry as SyncMetadataRecord;
        if (trigSync.deleteRecord?.delete === true) continue;
        const trigFields = trigSync.fields ?? (trigEntry as Record<string, unknown>);

        const triggerType =
            typeof trigFields['TriggerType'] === 'string' ? trigFields['TriggerType'].trim() : '';
        if (triggerType && !ctx.KnownTriggerTypes.has(triggerType)) {
            ctx.Violations.push({
                File: ctx.RelFile,
                Line: findLineNumber(ctx.RawText, triggerType),
                Message:
                    `Tour trigger uses unknown TriggerType "${triggerType}". ` +
                    `Known trigger types: ${[...ctx.KnownTriggerTypes].join(', ')}.`,
            });
        }

        if (triggerType === 'Signal') {
            const trigConfig = parseJsonIfString(trigFields['Configuration']);
            const trigConfigObj =
                typeof trigConfig === 'object' && trigConfig !== null
                    ? (trigConfig as Record<string, unknown>)
                    : null;
            const sigRaw =
                trigConfigObj?.['Signal'] ??
                trigConfigObj?.['SignalName'] ??
                trigConfigObj?.['Key'] ??
                trigFields['Signal'];
            const sig = typeof sigRaw === 'string' ? sigRaw.trim() : '';
            if (sig && !isTemplateVar(sig) && ctx.AllowedPrefixes.length > 0 && !hasPrefix(sig, ctx.AllowedPrefixes)) {
                ctx.Violations.push({
                    File: ctx.RelFile,
                    Line: findLineNumber(ctx.RawText, sig),
                    Message:
                        `Signal key "${sig}" in tour trigger must start with one of ` +
                        `allowedPrefixes [${ctx.AllowedPrefixes.join(', ')}].`,
                });
            }
        }
    }
}

/** The registered `tour-anchors` standard check. */
export const TourAnchorsCheck: StandardCheck = {
    Id: 'tour-anchors',
    Title: 'Guided tour anchors, prefixes, and plugin keys must resolve statically',
    Since: '6.3.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/plans/guided-tours.md',
    Description:
        'Validates metadata/tours/ JSON files against repo templates, @memberjunction/ng-tours core anchor manifest, ' +
        'generated entity schemas, registered tour plugin keys, and allowedPrefixes namespace governance.',
    DefaultRoots: ['metadata', 'packages'],
    DefaultOptions: {
        allowedPrefixes: [] as string[],
        knownStepTypes: [...DEFAULT_KNOWN_STEP_TYPES],
        knownStrategies: [...DEFAULT_KNOWN_ANCHOR_STRATEGIES],
        knownCompletionTypes: [...DEFAULT_KNOWN_COMPLETION_TYPES],
        knownTriggerTypes: [...DEFAULT_KNOWN_TRIGGER_TYPES],
    },

    Run(context: CheckContext): CheckResult {
        const tourFiles = findTourJsonFiles(context.RepoRoot, context.Roots);
        if (tourFiles.length === 0) {
            return {
                Violations: [],
                Notes: ['0 tour metadata file(s) scanned (metadata/tours empty or absent).'],
            };
        }

        const allowedPrefixes = readStringOptionArray(context.Options, 'allowedPrefixes') ?? [];
        const configuredManifest =
            typeof context.Options['coreAnchorManifestPath'] === 'string'
                ? context.Options['coreAnchorManifestPath']
                : undefined;

        const repoData = collectRepoSourceData(context.RepoRoot, context.Roots);
        const seededStepTypes = collectSeededStepTypes(context.RepoRoot, context.Roots);
        const coreManifest = LoadCoreAnchorManifest(context.RepoRoot, configuredManifest);

        const knownStepTypes = new Set<string>([
            ...(readStringOptionArray(context.Options, 'knownStepTypes') ?? DEFAULT_KNOWN_STEP_TYPES),
            ...seededStepTypes,
            ...repoData.StepTypes,
        ]);
        const knownStrategies = new Set<string>([
            ...(readStringOptionArray(context.Options, 'knownStrategies') ?? DEFAULT_KNOWN_ANCHOR_STRATEGIES),
            ...repoData.Strategies,
        ]);
        const knownCompletionTypes = new Set<string>([
            ...(readStringOptionArray(context.Options, 'knownCompletionTypes') ?? DEFAULT_KNOWN_COMPLETION_TYPES),
            ...repoData.CompletionTypes,
        ]);
        const knownTriggerTypes = new Set<string>([
            ...(readStringOptionArray(context.Options, 'knownTriggerTypes') ?? DEFAULT_KNOWN_TRIGGER_TYPES),
            ...repoData.TriggerTypes,
        ]);

        const violations: Violation[] = [];
        for (const file of tourFiles) {
            const relFile = relative(context.RepoRoot, file);
            const rawText = readFileSync(file, 'utf8');
            let parsed: unknown;
            try {
                parsed = JSON.parse(rawText);
            } catch (e) {
                violations.push({
                    File: relFile,
                    Line: 1,
                    Message: `Invalid tour metadata JSON: ${e instanceof Error ? e.message : String(e)}`,
                });
                continue;
            }

            const ctx: TourValidationContext = {
                RelFile: relFile,
                RawText: rawText,
                AllowedPrefixes: allowedPrefixes,
                KnownStepTypes: knownStepTypes,
                KnownStrategies: knownStrategies,
                KnownCompletionTypes: knownCompletionTypes,
                KnownTriggerTypes: knownTriggerTypes,
                RepoRegisteredAnchors: repoData.RegisteredAnchors,
                CoreManifestAnchors: coreManifest.Keys,
                GeneratedEntities: repoData.Entities,
                Violations: violations,
            };

            const records = Array.isArray(parsed) ? parsed : [parsed];
            for (const rec of records) {
                validateTourRecord(ctx, rec);
            }
        }

        return {
            Violations: violations,
            Notes: [
                `${tourFiles.length} tour metadata file(s) scanned; ` +
                    `${repoData.RegisteredAnchors.size} repo anchor(s), ` +
                    `${coreManifest.Keys.size} manifest anchor(s), ` +
                    `${repoData.Entities.size} generated entit(y/ies) indexed.`,
            ],
        };
    },
};
