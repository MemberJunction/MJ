/**
 * Seed test for Video Studio multimodal LLM modality rows (VS-MOD-1, Plan §13.1):
 * - Gemini 3.8 Flash (Image, Audio, Video, File Input)
 * - Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5 (Image, File Input)
 *
 * Resolves `metadata/ai-models/.ai-models.json` and `metadata/ai-modalities/.ai-modalities.json`
 * the way MetadataSync resolves `@lookup` and `@parent:ID`, seeds `AIEngineBase` (including the
 * baseline LLM `MJ: AI Model Types` row so `InheritTypeModalities: true` inherits Text Input/Output),
 * and verifies `ModelSupportsModality`, `GetModelModalities`, and parity with driver `GetFileCapabilities`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, RegisterClass: () => () => {} };
});

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
}));

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        static _instance: unknown = undefined;
        static getInstance<U>(): U {
            if (!this._instance) {
                this._instance = new this();
            }
            return this._instance as U;
        }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        Metadata: class {
            static Provider = { EntityByName: () => undefined };
        },
        RunView: class {},
        UserInfo: class {},
        RegisterForStartup: () => () => {},
        IStartupSink: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => {
    const cls = () => class { ID = ''; Name = '' };
    return {
        ArtifactMetadataEngine: { Instance: { ArtifactTypes: [], Config: vi.fn().mockResolvedValue(undefined) } },
        MJAIActionEntity: cls(), MJAIAgentActionEntity: cls(), MJAIAgentNoteEntity: cls(),
        MJAIAgentNoteTypeEntity: cls(), MJAIModelActionEntity: cls(), MJAIPromptModelEntity: cls(),
        MJAIPromptTypeEntity: cls(), MJAIResultCacheEntity: cls(), MJAIVendorTypeDefinitionEntity: cls(),
        MJArtifactTypeEntity: cls(), MJEntityAIActionEntity: cls(), MJVectorDatabaseEntity: cls(),
        MJAIAgentPromptEntity: cls(), MJAIAgentTypeEntity: cls(), MJAIVendorEntity: cls(),
        MJAIModelVendorEntity: cls(), MJAIModelTypeEntity: cls(), MJAIModelCostEntity: cls(),
        MJAIModelPriceTypeEntity: cls(), MJAIModelPriceUnitTypeEntity: cls(),
        MJAIConfigurationEntity: cls(), MJAIConfigurationParamEntity: cls(),
        MJAIAgentStepEntity: cls(), MJAIAgentStepPathEntity: cls(),
        MJAIAgentRelationshipEntity: cls(), MJAIAgentPermissionEntity: cls(),
        MJAIAgentDataSourceEntity: cls(), MJAIAgentConfigurationEntity: cls(),
        MJAIAgentExampleEntity: cls(), MJAICredentialBindingEntity: cls(),
        MJAIModalityEntity: cls(), MJAIAgentModalityEntity: cls(), MJAIModelModalityEntity: cls(),
        MJAIPersonaEntity: cls(), MJAIPersonaVendorEntity: cls(), MJAIModelPersonaEntity: cls(), MJAIAgentPersonaEntity: cls(),
        MJCredentialEntity: cls(), MJAIAgentEntity: cls(),
    };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIPromptEntityExtended: class {},
    MJAIPromptCategoryEntityExtended: class {},
    MJAIModelEntityExtended: class {},
    MJAIAgentEntityExtended: class {},
}));

vi.mock('../AIAgentPermissionHelper', () => ({ AIAgentPermissionHelper: {}, EffectiveAgentPermissions: class {} }));

import { AIEngineBase } from '../BaseAIEngine';

/** A field value in a seed file. */
type SeedValue = string | number | boolean | null | SeedObject;

/** A JSON object inside a seed field. */
interface SeedObject {
    [key: string]: SeedValue;
}

/** A MetadataSync record. */
interface SeedRecord {
    _comments?: string[];
    fields: Record<string, SeedValue>;
    primaryKey?: { ID: string };
    relatedEntities?: Record<string, SeedRecord[]>;
}

/** A seeded row as the engine holds it: field values with every reference resolved to a key. */
type EngineRow = Record<string, SeedValue>;

const METADATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../metadata');

/**
 * Baseline LLM model type ID (`migrations/v5/B202607091514__v5.46.x__Baseline.sql:23631`).
 * DefaultInputModalityID and DefaultOutputModalityID both point to the Text modality.
 */
const LLM_MODEL_TYPE_ID = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E';

/**
 * Driver `GetFileCapabilities` constants (mirrored here so `@memberjunction/ai-engine-base` does not depend on provider packages):
 * - `AnthropicLLM.GetFileCapabilities` (`packages/AI/Providers/Anthropic/src/models/anthropic.ts:97-104`)
 * - `GeminiLLM.GetFileCapabilities` (`packages/AI/Providers/Gemini/src/index.ts:119-133`)
 */
const ANTHROPIC_FILE_CAPABILITIES = {
    SupportedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    MaxFileSize: 32 * 1024 * 1024, // 33554432
    MaxFilesPerRequest: 5,
} as const;

const GEMINI_FILE_CAPABILITIES = {
    SupportedMimeTypes: [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'audio/mp3', 'audio/wav', 'audio/ogg',
        'video/mp4', 'video/webm',
        'text/plain', 'text/csv', 'text/html',
    ],
    MaxFileSize: 20 * 1024 * 1024, // 20971520
    MaxFilesPerRequest: 10,
} as const;

const CLAUDE_MODELS = ['Claude Opus 5.5', 'Claude Fable 5.1', 'Claude Sonnet 5.5'] as const;
const GEMINI_FLASH = 'Gemini 3.8 Flash';
const CONTROL_MODEL = 'DeepSeek V4.1 Flash';

function readSeed(path: string): SeedRecord[] {
    return JSON.parse(readFileSync(resolve(METADATA, path), 'utf8'));
}

const seeds = {
    Models: readSeed('ai-models/.ai-models.json'),
    Modalities: readSeed('ai-modalities/.ai-modalities.json'),
};

/** Name → key for the entities the rows look up by name, plus `MJ: AI Model Types.Name=LLM`. */
const KEYS = new Map<string, Map<string, string>>([
    [
        'MJ: AI Models',
        new Map(seeds.Models.map((r) => [String(r.fields['Name']).toLowerCase(), r.primaryKey?.ID ?? ''])),
    ],
    [
        'MJ: AI Modalities',
        new Map(seeds.Modalities.map((r) => [String(r.fields['Name']).toLowerCase(), r.primaryKey?.ID ?? ''])),
    ],
    [
        'MJ: AI Model Types',
        new Map([['llm', LLM_MODEL_TYPE_ID]]),
    ],
]);

/** Resolves `@parent:ID` and `@lookup:<entity>.Name=<name>`; a lookup this test does not load stays as written. */
function resolveReference(value: SeedValue, parentID: string): SeedValue {
    if (value === '@parent:ID') {
        return parentID;
    }
    const lookup = typeof value === 'string' ? /^@lookup:(MJ: [^.]+)\.Name=(.+)$/.exec(value) : null;
    return lookup ? (KEYS.get(lookup[1])?.get(lookup[2].toLowerCase()) ?? value) : value;
}

function toEngineRow(record: SeedRecord, parentID = ''): EngineRow {
    const row: EngineRow = { ID: record.primaryKey?.ID ?? '' };
    for (const [field, value] of Object.entries(record.fields)) {
        row[field] = resolveReference(value, parentID);
    }
    return row;
}

/** The nested rows of one kind under every model, resolved against their model. */
function nestedRows(entity: string): EngineRow[] {
    return seeds.Models.flatMap((m) =>
        (m.relatedEntities?.[entity] ?? []).map((r) => toEngineRow(r, m.primaryKey?.ID ?? ''))
    );
}

function keyOf(entity: string, name: string): string {
    const key = KEYS.get(entity)?.get(name.toLowerCase());
    if (!key) {
        throw new Error(`metadata seeds no ${entity} row named ${name}`);
    }
    return key;
}

function setEngineRows(field: string, rows: EngineRow[] | null): void {
    (AIEngineBase.Instance as unknown as Record<string, EngineRow[] | null>)[field] = rows;
}

const TEXT_MODALITY_ID = keyOf('MJ: AI Modalities', 'Text');
const modelModalities = nestedRows('MJ: AI Model Modalities');

beforeAll(() => {
    setEngineRows('_models', seeds.Models.map((m) => toEngineRow(m)));
    setEngineRows('_modelTypes', [
        {
            ID: LLM_MODEL_TYPE_ID,
            Name: 'LLM',
            DefaultInputModalityID: TEXT_MODALITY_ID,
            DefaultOutputModalityID: TEXT_MODALITY_ID,
        },
    ]);
    setEngineRows('_modalities', seeds.Modalities.map((m) => toEngineRow(m)));
    setEngineRows('_modelModalities', modelModalities);
    setEngineRows('_modelsByID', null);
    setEngineRows('_modelTypesByID', null);
});

describe('Video Studio LLM modality seed rows (VS-MOD-1)', () => {
    it('Gemini 3.8 Flash supports Image, Audio, Video, File, and Text Input plus Text Output, and not Image/Audio/Video Output', () => {
        const geminiId = keyOf('MJ: AI Models', GEMINI_FLASH);
        const engine = AIEngineBase.Instance;

        expect(engine.ModelSupportsModality(geminiId, 'Image', 'Input')).toBe(true);
        expect(engine.ModelSupportsModality(geminiId, 'Audio', 'Input')).toBe(true);
        expect(engine.ModelSupportsModality(geminiId, 'Video', 'Input')).toBe(true);
        expect(engine.ModelSupportsModality(geminiId, 'File', 'Input')).toBe(true);
        expect(engine.ModelSupportsModality(geminiId, 'Text', 'Input')).toBe(true);
        expect(engine.ModelSupportsModality(geminiId, 'Text', 'Output')).toBe(true);

        expect(engine.ModelSupportsModality(geminiId, 'Image', 'Output')).toBe(false);
        expect(engine.ModelSupportsModality(geminiId, 'Audio', 'Output')).toBe(false);
        expect(engine.ModelSupportsModality(geminiId, 'Video', 'Output')).toBe(false);
    });

    it('Claude Opus 5.5, Claude Fable 5.1, and Claude Sonnet 5.5 support Image and File Input plus Text both ways, and not Video/Audio Input', () => {
        const engine = AIEngineBase.Instance;

        for (const modelName of CLAUDE_MODELS) {
            const id = keyOf('MJ: AI Models', modelName);

            expect(engine.ModelSupportsModality(id, 'Image', 'Input'), `${modelName} Image Input`).toBe(true);
            expect(engine.ModelSupportsModality(id, 'File', 'Input'), `${modelName} File Input`).toBe(true);
            expect(engine.ModelSupportsModality(id, 'Text', 'Input'), `${modelName} Text Input`).toBe(true);
            expect(engine.ModelSupportsModality(id, 'Text', 'Output'), `${modelName} Text Output`).toBe(true);

            expect(engine.ModelSupportsModality(id, 'Video', 'Input'), `${modelName} Video Input`).toBe(false);
            expect(engine.ModelSupportsModality(id, 'Audio', 'Input'), `${modelName} Audio Input`).toBe(false);
        }
    });

    it('GetModelModalities(id, "Input") returns sorted modality names for Gemini 3.8 Flash and each Claude model', () => {
        const engine = AIEngineBase.Instance;
        const inputNames = (name: string): string[] =>
            engine
                .GetModelModalities(keyOf('MJ: AI Models', name), 'Input')
                .map((m) => m.Name)
                .sort();

        expect(inputNames(GEMINI_FLASH)).toEqual(['Audio', 'File', 'Image', 'Text', 'Video']);
        for (const modelName of CLAUDE_MODELS) {
            expect(inputNames(modelName), modelName).toEqual(['File', 'Image', 'Text']);
        }
    });

    it('modality rows match GeminiLLM.GetFileCapabilities and AnthropicLLM.GetFileCapabilities (MIME types, MaxSizeBytes, MaxCountPerMessage)', () => {
        const geminiId = keyOf('MJ: AI Models', GEMINI_FLASH);
        const geminiRows = modelModalities.filter((mm) => mm['ModelID'] === geminiId);
        expect(geminiRows).toHaveLength(4);

        const geminiSupportedSet = new Set<string>(GEMINI_FILE_CAPABILITIES.SupportedMimeTypes);
        for (const row of geminiRows) {
            const formats = String(row['SupportedFormats'] ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            expect(formats.length).toBeGreaterThan(0);
            for (const mime of formats) {
                expect(geminiSupportedSet.has(mime), `Gemini format ${mime}`).toBe(true);
            }
            expect(row['MaxSizeBytes']).toBe(GEMINI_FILE_CAPABILITIES.MaxFileSize);
            expect(row['MaxCountPerMessage']).toBe(GEMINI_FILE_CAPABILITIES.MaxFilesPerRequest);
            expect(row['Direction']).toBe('Input');
            expect(row['IsSupported']).toBe(true);
        }

        const anthropicSupportedSet = new Set<string>(ANTHROPIC_FILE_CAPABILITIES.SupportedMimeTypes);
        for (const modelName of CLAUDE_MODELS) {
            const claudeId = keyOf('MJ: AI Models', modelName);
            const claudeRows = modelModalities.filter((mm) => mm['ModelID'] === claudeId);
            expect(claudeRows, modelName).toHaveLength(2);

            for (const row of claudeRows) {
                const formats = String(row['SupportedFormats'] ?? '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                expect(formats.length).toBeGreaterThan(0);
                for (const mime of formats) {
                    expect(anthropicSupportedSet.has(mime), `${modelName} format ${mime}`).toBe(true);
                }
                expect(row['MaxSizeBytes'], modelName).toBe(ANTHROPIC_FILE_CAPABILITIES.MaxFileSize);
                expect(row['MaxCountPerMessage'], modelName).toBe(ANTHROPIC_FILE_CAPABILITIES.MaxFilesPerRequest);
                expect(row['Direction'], modelName).toBe('Input');
                expect(row['IsSupported'], modelName).toBe(true);
            }
        }
    });

    it('control model with no explicit modality rows (DeepSeek V4.1 Flash) stays ["Text"] both ways', () => {
        const controlId = keyOf('MJ: AI Models', CONTROL_MODEL);
        const engine = AIEngineBase.Instance;

        expect(modelModalities.filter((mm) => mm['ModelID'] === controlId)).toHaveLength(0);
        expect(engine.GetModelModalities(controlId, 'Input').map((m) => m.Name)).toEqual(['Text']);
        expect(engine.GetModelModalities(controlId, 'Output').map((m) => m.Name)).toEqual(['Text']);
    });
});
