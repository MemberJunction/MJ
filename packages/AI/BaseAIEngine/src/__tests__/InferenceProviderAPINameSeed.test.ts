/**
 * Catalog guard: every ACTIVE Inference Provider row in `metadata/ai-models/*.json` names the model
 * it calls (`APIName`) (#5237).
 *
 * The prompt and embedding runners pass the vendor row's `APIName` to the driver. A row without one
 * falls back to the driver's default model: the OpenAI embedding rows for ada-002 and 3-large had no
 * `APIName`, so both silently embedded with text-embedding-3-small, and indexes that claimed to be
 * ada-002 or 3-large held 3-small vectors.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

interface VendorRow {
    fields: { VendorID?: string; TypeID?: string; Status?: string; APIName?: string | null; DriverClass?: string };
    primaryKey?: { ID?: string };
}

interface ModelRecord {
    fields: { Name?: string; IsActive?: boolean };
    relatedEntities?: { 'MJ: AI Model Vendors'?: VendorRow[] };
}

/**
 * Active models whose driver picks the voice, avatar or agent at call time, so a model name has no
 * meaning for them.
 */
const ALLOWED_WITHOUT_APINAME: Readonly<Record<string, string>> = {
    'Eleven Labs': 'text-to-speech: the voice and ElevenLabs model are chosen per request',
    'HeyGen': 'video: the avatar is chosen per request; the API takes no model name',
    'ElevenLabs Agents': 'realtime: the session names an ElevenLabs agent, not a model'
};

const here = dirname(fileURLToPath(import.meta.url));
const catalogDir = resolve(here, '../../../../../metadata/ai-models');

function catalogModels(): Array<{ file: string; model: ModelRecord }> {
    return readdirSync(catalogDir)
        .filter((f) => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')
        .flatMap((file) => {
            const parsed: ModelRecord | ModelRecord[] = JSON.parse(readFileSync(resolve(catalogDir, file), 'utf8'));
            return (Array.isArray(parsed) ? parsed : [parsed]).map((model) => ({ file, model }));
        });
}

function isActiveInferenceProvider(row: VendorRow): boolean {
    return (row.fields.TypeID ?? '').endsWith('Name=Inference Provider') && (row.fields.Status ?? 'Active') === 'Active';
}

describe('AI model catalog: Inference Provider rows carry an APIName', () => {
    it('every active Inference Provider row of an active model has an APIName, apart from the allowlist', () => {
        const missing = catalogModels()
            .filter(({ model }) => model.fields.IsActive !== false && !(model.fields.Name! in ALLOWED_WITHOUT_APINAME))
            .flatMap(({ file, model }) =>
                (model.relatedEntities?.['MJ: AI Model Vendors'] ?? [])
                    .filter((row) => isActiveInferenceProvider(row) && !row.fields.APIName?.trim())
                    .map((row) => `${file} ${model.fields.Name} (${row.primaryKey?.ID})`)
            );
        expect(missing).toEqual([]);
    });

    it('names each OpenAI embedding model for itself, not the driver default (#5237)', () => {
        const apiNames = new Map(
            catalogModels()
                .filter(({ model }) => (model.fields.Name ?? '').startsWith('text-embedding-'))
                .map(({ model }) => [
                    model.fields.Name!,
                    (model.relatedEntities?.['MJ: AI Model Vendors'] ?? []).find(isActiveInferenceProvider)?.fields.APIName
                ])
        );
        expect(apiNames.get('text-embedding-3-small')).toBe('text-embedding-3-small');
        expect(apiNames.get('text-embedding-3-large')).toBe('text-embedding-3-large');
        expect(apiNames.get('text-embedding-ada-002')).toBe('text-embedding-ada-002');
    });

    it('keeps the allowlist to models that still exist and still lack an APIName', () => {
        const byName = new Map(catalogModels().map(({ model }) => [model.fields.Name, model]));
        for (const name of Object.keys(ALLOWED_WITHOUT_APINAME)) {
            const rows = byName.get(name)?.relatedEntities?.['MJ: AI Model Vendors'] ?? [];
            expect(rows.some((r) => isActiveInferenceProvider(r) && !r.fields.APIName), `${name} is allowlisted`).toBe(true);
        }
    });
});
