/**
 * Catalog guard: no two ACTIVE models in `metadata/ai-models/*.json` share a name (#6121).
 *
 * Model lookups across MJ resolve by name (`@lookup:MJ: AI Models.Name=…`, prompt-model wiring,
 * the AI engine's name lookups), so two active rows with one name make the result depend on load
 * order. A duplicate shipped once when the same model was added in two catalog files; this test
 * reads every catalog file so the next one fails here instead of in a deployment.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

interface CatalogModelRecord {
    fields: {
        Name?: string;
        IsActive?: boolean;
    };
    primaryKey?: { ID?: string };
}

const here = dirname(fileURLToPath(import.meta.url));
const catalogDir = resolve(here, '../../../../../metadata/ai-models');

function catalogFiles(): string[] {
    return readdirSync(catalogDir)
        .filter((f) => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')
        .map((f) => resolve(catalogDir, f));
}

function loadModels(file: string): CatalogModelRecord[] {
    const parsed: CatalogModelRecord | CatalogModelRecord[] = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [parsed];
}

/** Active model names that appear more than once, with the files and IDs that define them. */
function duplicateActiveModelNames(files: string[]): Map<string, string[]> {
    const byName = new Map<string, string[]>();
    for (const file of files) {
        for (const record of loadModels(file)) {
            const name = record.fields?.Name?.trim();
            // IsActive defaults to true on the entity, so an absent value counts as active.
            if (!name || record.fields.IsActive === false) {
                continue;
            }
            const key = name.toLowerCase();
            const where = `${file.split('/').pop()} ${record.primaryKey?.ID ?? '(no ID)'}`;
            byName.set(key, [...(byName.get(key) ?? []), where]);
        }
    }
    return new Map([...byName].filter(([, where]) => where.length > 1));
}

describe('AI model catalog: unique active names', () => {
    it('reads at least the main catalog file', () => {
        expect(catalogFiles().some((f) => f.endsWith('.ai-models.json'))).toBe(true);
    });

    it('has no two active models with the same name across metadata/ai-models', () => {
        const duplicates = duplicateActiveModelNames(catalogFiles());
        expect(Object.fromEntries(duplicates)).toEqual({});
    });

    it('keeps exactly one active Nano Banana 2.1 (#6121)', () => {
        const active = catalogFiles()
            .flatMap(loadModels)
            .filter((r) => r.fields.Name === 'Nano Banana 2.1' && r.fields.IsActive !== false);
        expect(active).toHaveLength(1);
        expect(active[0].primaryKey?.ID?.toUpperCase().startsWith('FA13CE5E')).toBe(true);
    });
});
