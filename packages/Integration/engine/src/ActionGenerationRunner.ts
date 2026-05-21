/**
 * Orchestrates the end-to-end "connector → mj-sync action JSON files" pipeline.
 *
 * `ActionMetadataGenerator` is pure (records in → records out). This runner
 * adds the file-IO + merge layer: it reads existing JSON files, preserves
 * primaryKey/sync blocks populated by prior `mj sync pull` runs, and writes
 * the merged result back to disk.
 *
 * Consumed by:
 *  - the `mj codegen integration-actions` CLI command (downstream consumers)
 *  - the internal `packages/Integration/connectors/src/generate-integration-actions.ts`
 *    script (MJ's own connector library)
 */

import * as fs from 'fs';
import * as path from 'path';
import { ActionMetadataGenerator } from './ActionMetadataGenerator.js';
import type { BaseIntegrationConnector } from './BaseIntegrationConnector.js';

/** Shape of an mj-sync record with optional primaryKey/sync populated by `mj sync pull`. */
export interface MjSyncRecord {
    fields: Record<string, unknown>;
    primaryKey?: Record<string, string>;
    sync?: { lastModified: string; checksum: string };
    relatedEntities?: Record<string, MjSyncRecord[]>;
}

/** One connector input to the runner. */
export interface ConnectorRunInput {
    /** Connector instance to generate actions for. */
    Connector: BaseIntegrationConnector;
    /**
     * Output filename for this connector's actions (without directory).
     * Should start with `.` to align with mj-sync's hidden-file convention.
     * If omitted, derived from the connector's IntegrationName.
     */
    FileName?: string;
}

/** Options passed to ActionGenerationRunner.Run(). */
export interface ActionGenerationRunnerOptions {
    /** Connectors to generate actions for. */
    Connectors: ConnectorRunInput[];
    /**
     * Base output directory. Actions are written under
     * `<OutputDir>/actions/integrations-auto-generated/` and categories under
     * `<OutputDir>/action-categories/`. Defaults to `./metadata`.
     */
    OutputDir?: string;
    /** Optional progress logger (default: noop). */
    OnProgress?: (message: string) => void;
}

/** Result of running the action generator. */
export interface ActionGenerationRunnerResult {
    /** Per-connector breakdown. */
    Connectors: Array<{
        IntegrationName: string;
        FileName: string;
        ActionCount: number;
        CategoryCount: number;
        Skipped: boolean;
        Reason?: string;
    }>;
    /** Total actions written across all connectors. */
    TotalActions: number;
    /** Total category records merged into the categories file. */
    TotalCategories: number;
    /** Absolute path of the actions output directory. */
    ActionsDir: string;
    /** Absolute path of the categories output directory. */
    CategoriesDir: string;
}

/**
 * Orchestrates action-metadata generation for one or more
 * `BaseIntegrationConnector` instances.
 *
 * Stateless — each `.Run(...)` call is independent.
 */
export class ActionGenerationRunner {
    public async Run(options: ActionGenerationRunnerOptions): Promise<ActionGenerationRunnerResult> {
        const outputBase = path.resolve(options.OutputDir ?? './metadata');
        const actionsDir = path.join(outputBase, 'actions/integrations-auto-generated');
        const categoriesDir = path.join(outputBase, 'action-categories');
        const onProgress = options.OnProgress ?? (() => undefined);

        fs.mkdirSync(actionsDir, { recursive: true });
        fs.mkdirSync(categoriesDir, { recursive: true });

        const generator = new ActionMetadataGenerator();
        const perConnector: ActionGenerationRunnerResult['Connectors'] = [];
        const allCategoryRecords: MjSyncRecord[] = [];
        let totalActions = 0;

        for (const input of options.Connectors) {
            const integrationName = input.Connector.IntegrationName;
            const fileName = input.FileName ?? deriveFileName(integrationName);
            const config = input.Connector.GetActionGeneratorConfig();

            if (!config) {
                onProgress(`${integrationName}: connector returned no action config — skipping`);
                perConnector.push({
                    IntegrationName: integrationName,
                    FileName: fileName,
                    ActionCount: 0,
                    CategoryCount: 0,
                    Skipped: true,
                    Reason: 'GetActionGeneratorConfig() returned null',
                });
                continue;
            }

            const result = generator.Generate(config);
            const actionsPath = path.join(actionsDir, fileName);
            const existingActions = readJsonArrayIfExists(actionsPath);
            const merged = mergeActionRecords(existingActions, result.ActionRecords);
            fs.writeFileSync(actionsPath, JSON.stringify(merged, null, 2) + '\n');

            onProgress(`${config.IntegrationName}: ${result.ActionRecords.length} action(s) → ${fileName}`);
            totalActions += result.ActionRecords.length;

            if (result.CategoryRecords.length > 0) {
                allCategoryRecords.push(...result.CategoryRecords);
            }

            perConnector.push({
                IntegrationName: config.IntegrationName,
                FileName: fileName,
                ActionCount: result.ActionRecords.length,
                CategoryCount: result.CategoryRecords.length,
                Skipped: false,
            });
        }

        if (totalActions > 0) {
            const syncConfig = generator.Generate({
                IntegrationName: '_', CategoryName: '_', Objects: [],
            }).SyncConfig;
            fs.writeFileSync(
                path.join(actionsDir, '.mj-sync.json'),
                JSON.stringify(syncConfig, null, 2) + '\n'
            );
        }

        let totalCategories = 0;
        if (allCategoryRecords.length > 0) {
            const categoryFile = path.join(categoriesDir, '.integration-categories.json');
            const existing = readJsonArrayIfExists(categoryFile);
            const merged = mergeCategories(existing, allCategoryRecords);
            fs.writeFileSync(categoryFile, JSON.stringify(merged, null, 2) + '\n');
            totalCategories = merged.length;
            onProgress(`Wrote ${merged.length} category record(s) → .integration-categories.json`);
        }

        return {
            Connectors: perConnector,
            TotalActions: totalActions,
            TotalCategories: totalCategories,
            ActionsDir: actionsDir,
            CategoriesDir: categoriesDir,
        };
    }
}

/**
 * Derives a default output filename from an IntegrationName. Lowercases,
 * replaces non-alphanumeric runs with hyphens, strips leading/trailing
 * hyphens, and prefixes with a `.` to match mj-sync's hidden-file convention.
 * Example: "Sage Intacct" → ".sage-intacct-actions.json"
 */
export function deriveFileName(integrationName: string): string {
    const slug = integrationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `.${slug}-actions.json`;
}

function readJsonArrayIfExists(filePath: string): MjSyncRecord[] {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MjSyncRecord[];
}

/**
 * Merges newly generated action records with existing ones, preserving primaryKey/sync
 * blocks that were populated by a prior `mj sync pull`. Matches actions by Name.
 * Also preserves primaryKey/sync on nested relatedEntities (e.g., Action Params).
 */
export function mergeActionRecords(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const existingByName = buildNameIndex(existing);

    return incoming.map(newRec => {
        const name = newRec.fields['Name'] as string | undefined;
        if (!name) return newRec;

        const oldRec = existingByName.get(name.toLowerCase());
        if (!oldRec) return newRec;

        const merged: MjSyncRecord = { ...newRec };
        if (oldRec.primaryKey) merged.primaryKey = oldRec.primaryKey;
        if (oldRec.sync) merged.sync = oldRec.sync;

        if (newRec.relatedEntities && oldRec.relatedEntities) {
            const mergedRelated: Record<string, MjSyncRecord[]> = {};
            for (const [entityName, newChildren] of Object.entries(newRec.relatedEntities)) {
                const oldChildren = oldRec.relatedEntities[entityName];
                if (!oldChildren) {
                    mergedRelated[entityName] = newChildren;
                    continue;
                }
                mergedRelated[entityName] = mergeChildRecords(oldChildren, newChildren);
            }
            merged.relatedEntities = mergedRelated;
        }

        return merged;
    });
}

/** Merges child records (e.g., Action Params) by matching on Name field. */
export function mergeChildRecords(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const existingByName = buildNameIndex(existing);

    return incoming.map(newRec => {
        const name = newRec.fields['Name'] as string | undefined;
        if (!name) return newRec;

        const oldRec = existingByName.get(name.toLowerCase());
        if (!oldRec) return newRec;

        const merged: MjSyncRecord = { ...newRec };
        if (oldRec.primaryKey) merged.primaryKey = oldRec.primaryKey;
        if (oldRec.sync) merged.sync = oldRec.sync;
        return merged;
    });
}

/** Merges new category records into existing ones, preserving primaryKey/sync for matches by Name. */
export function mergeCategories(
    existing: MjSyncRecord[],
    incoming: MjSyncRecord[]
): MjSyncRecord[] {
    const byName = buildNameIndex(existing);
    for (const rec of incoming) {
        const name = rec.fields['Name'] as string | undefined;
        if (!name) continue;
        const key = name.toLowerCase();
        const old = byName.get(key);
        if (old) {
            const merged: MjSyncRecord = { fields: rec.fields };
            if (old.primaryKey) merged.primaryKey = old.primaryKey;
            if (old.sync) merged.sync = old.sync;
            byName.set(key, merged);
        } else {
            byName.set(key, rec);
        }
    }
    return Array.from(byName.values());
}

/** Builds a Map from lowercase Name → record for quick lookup. */
function buildNameIndex(records: MjSyncRecord[]): Map<string, MjSyncRecord> {
    const index = new Map<string, MjSyncRecord>();
    for (const rec of records) {
        const name = rec.fields['Name'] as string | undefined;
        if (name) index.set(name.toLowerCase(), rec);
    }
    return index;
}
