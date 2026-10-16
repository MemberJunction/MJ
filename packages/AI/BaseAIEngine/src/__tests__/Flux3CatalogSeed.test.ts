/**
 * Seed test for the `Per Second` price unit type and the FLUX 3 Video / FLUX 3 Image catalog rows in `metadata/`.
 *
 * Reads the actual metadata seed files, resolves `@lookup` and `@parent:ID` references the same way MetadataSync
 * does, loads them into `AIEngineBase`, and verifies:
 * 1. The `Per Second` price unit row (`DriverClass: 'Linear'`, `UnitsPerBillingUnit: 1`, `UsageTypeID` -> `Seconds`)
 *    and the `metadata/.mj-sync.json` push order (`ai-usage-types` < `ai-model-price-unit-types` < `ai-models`).
 * 2. Linear per-second pricing (`LinearPriceUnitType`) against the FLUX 3 Video cost row ($0.80/s -> $9.60 for 12 s)
 *    and measure-filtered `GetActiveModelCost` (`'Seconds'` matches, `'Tokens'` returns null).
 * 3. Model types, `IsActive: false` rollout guard, and BFL Model Developer / Inference Provider vendor bindings.
 * 4. Effective model modalities via `GetModelModalities` combining baseline model-type defaults with junction rows.
 * 5. Absence of deprecated `PriceTypeID` on the FLUX 3 Video cost row and absence of any cost row on FLUX 3 Image.
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
        protected GetConfigData<E>(propertyName: string): E[] {
            return ((this as Record<string, unknown>)[propertyName] as E[]) ?? [];
        }
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
        MJAIModelPriceTypeEntity: cls(), MJAIModelPriceUnitTypeEntity: cls(), MJAIUsageTypeEntity: cls(),
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

import type { MJAIModelCostEntity, MJAIModelPriceUnitTypeEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '../BaseAIEngine';
import { LinearPriceUnitType } from '../PriceUnitTypes';

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

/** Root metadata/.mj-sync.json structure. */
interface RootSyncConfig {
    directoryOrder: string[];
}

/** A seeded row as the engine holds it: field values with every reference resolved to a key. */
type EngineRow = Record<string, SeedValue>;

const METADATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../metadata');
const FLUX_3_VIDEO = 'FLUX 3 Video';
const FLUX_3_IMAGE = 'FLUX 3 Image';

function readSeed(path: string): SeedRecord[] {
    return JSON.parse(readFileSync(resolve(METADATA, path), 'utf8'));
}

function readRootSyncConfig(): RootSyncConfig {
    return JSON.parse(readFileSync(resolve(METADATA, '.mj-sync.json'), 'utf8'));
}

/**
 * Video and Image Generator model types shipped in the v5 baseline migration
 * (`migrations/v5/B202607091514__v5.46.x__Baseline.sql:23630,23632`) rather than `metadata/ai-model-types/`.
 */
const BASELINE_MODEL_TYPE_SEEDS: SeedRecord[] = [
    {
        fields: {
            Name: 'Video',
            DefaultInputModalityID: '@lookup:MJ: AI Modalities.Name=Text',
            DefaultOutputModalityID: '@lookup:MJ: AI Modalities.Name=Video',
        },
        primaryKey: { ID: '6175433E-F36B-1410-8D99-00021F8B792E' },
    },
    {
        fields: {
            Name: 'Image Generator',
            DefaultInputModalityID: '@lookup:MJ: AI Modalities.Name=Text',
            DefaultOutputModalityID: '@lookup:MJ: AI Modalities.Name=Image',
        },
        primaryKey: { ID: 'E9A5CCEC-6A37-EF11-86D4-000D3A4E707E' },
    },
];

const seeds = {
    Models: readSeed('ai-models/.ai-models.json'),
    Vendors: readSeed('ai-vendors/.ai-vendors.json'),
    Modalities: readSeed('ai-modalities/.ai-modalities.json'),
    UsageTypes: readSeed('ai-usage-types/.ai-usage-types.json'),
    PriceUnitTypes: readSeed('ai-model-price-unit-types/.ai-model-price-unit-types.json'),
    ModelTypes: [...readSeed('ai-model-types/.ai-model-types.json'), ...BASELINE_MODEL_TYPE_SEEDS],
};

/** Name -> key for the entities the rows look up by name. */
const KEYS = new Map<string, Map<string, string>>(
    ([
        ['MJ: AI Models', seeds.Models],
        ['MJ: AI Vendors', seeds.Vendors],
        ['MJ: AI Modalities', seeds.Modalities],
        ['MJ: AI Usage Types', seeds.UsageTypes],
        ['MJ: AI Model Price Unit Types', seeds.PriceUnitTypes],
        ['MJ: AI Model Types', seeds.ModelTypes],
    ] as const).map(([entity, records]) => [
        entity,
        new Map(records.map((r) => [String(r.fields['Name']).toLowerCase(), r.primaryKey?.ID ?? ''])),
    ]),
);

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
        (m.relatedEntities?.[entity] ?? []).map((r) => toEngineRow(r, m.primaryKey?.ID ?? '')),
    );
}

function keyOf(entity: string, name: string): string {
    const key = KEYS.get(entity)?.get(name.toLowerCase());
    if (!key) {
        throw new Error(`metadata seeds no ${entity} row named ${name}`);
    }
    return key;
}

function setEngineRows(field: string, rows: EngineRow[]): void {
    (AIEngineBase.Instance as unknown as Record<string, EngineRow[]>)[field] = rows;
}

const VIDEO_MODEL = keyOf('MJ: AI Models', FLUX_3_VIDEO);
const IMAGE_MODEL = keyOf('MJ: AI Models', FLUX_3_IMAGE);
const BFL = keyOf('MJ: AI Vendors', 'Black Forest Labs');
const VIDEO_TYPE = keyOf('MJ: AI Model Types', 'Video');
const IMAGE_GENERATOR_TYPE = keyOf('MJ: AI Model Types', 'Image Generator');
const SECONDS_USAGE_TYPE = keyOf('MJ: AI Usage Types', 'Seconds');
const PER_SECOND_UNIT_TYPE = keyOf('MJ: AI Model Price Unit Types', 'Per Second');

const usageTypeNameByID = new Map<string, string>(
    seeds.UsageTypes.map((u) => [u.primaryKey?.ID ?? '', String(u.fields['Name'])]),
);

const priceUnitTypes: EngineRow[] = seeds.PriceUnitTypes.map((r) => {
    const row = toEngineRow(r);
    row['UsageType'] = usageTypeNameByID.get(String(row['UsageTypeID'])) ?? null;
    return row;
});

const modelVendors = nestedRows('MJ: AI Model Vendors');
const modelCosts = nestedRows('MJ: AI Model Costs');

beforeAll(() => {
    const engine = AIEngineBase.Instance as unknown as Record<string, unknown>;
    engine['_modelsByID'] = null;
    engine['_vendorsByID'] = null;
    engine['_modelTypesByID'] = null;
    engine['_modelVendorsByModelID'] = null;

    setEngineRows('_models', seeds.Models.map((m) => toEngineRow(m)));
    setEngineRows('_modelTypes', seeds.ModelTypes.map((mt) => toEngineRow(mt)));
    setEngineRows('_modalities', seeds.Modalities.map((m) => toEngineRow(m)));
    setEngineRows('_modelModalities', nestedRows('MJ: AI Model Modalities'));
    setEngineRows('_modelVendors', modelVendors);
    setEngineRows('_modelCosts', modelCosts);
    setEngineRows('_modelPriceUnitTypes', priceUnitTypes);
    setEngineRows('_usageTypes', seeds.UsageTypes.map((u) => toEngineRow(u)));
});

describe('Per Second price unit type and metadata push order', () => {
    it('defines Per Second as a Linear driver row with UnitsPerBillingUnit = 1 and UsageType = Seconds', () => {
        const perSecond = priceUnitTypes.find((put) => put['ID'] === PER_SECOND_UNIT_TYPE);

        expect(perSecond).toMatchObject({
            Name: 'Per Second',
            DriverClass: 'Linear',
            UnitsPerBillingUnit: 1,
            UsageTypeID: SECONDS_USAGE_TYPE,
            UsageType: 'Seconds',
        });
    });

    it('orders ai-model-price-unit-types after ai-usage-types and before ai-models in metadata/.mj-sync.json', () => {
        const { directoryOrder } = readRootSyncConfig();
        const usageIdx = directoryOrder.indexOf('ai-usage-types');
        const unitTypesIdx = directoryOrder.indexOf('ai-model-price-unit-types');
        const modelsIdx = directoryOrder.indexOf('ai-models');

        expect(usageIdx).toBeGreaterThanOrEqual(0);
        expect(unitTypesIdx).toBeGreaterThan(usageIdx);
        expect(modelsIdx).toBeGreaterThan(unitTypesIdx);
    });
});

describe('FLUX 3 Video cost calculation from output seconds', () => {
    it('prices 12 output seconds at $9.60 via LinearPriceUnitType and filters GetActiveModelCost by measure', () => {
        const perSecondRow = priceUnitTypes.find(
            (put) => put['ID'] === PER_SECOND_UNIT_TYPE,
        ) as unknown as MJAIModelPriceUnitTypeEntity;
        const calculator = new LinearPriceUnitType(perSecondRow);

        expect(calculator.UnitKind).toBe('Seconds');

        const activeSecondsCost = AIEngineBase.Instance.GetActiveModelCost(VIDEO_MODEL, BFL, 'Realtime', 'Seconds');
        expect(activeSecondsCost).not.toBeNull();
        expect(activeSecondsCost?.OutputPricePerUnit).toBe(0.8);
        expect(activeSecondsCost?.InputPricePerUnit).toBe(0);

        const cost = calculator.CalculateCost(activeSecondsCost as MJAIModelCostEntity, { input: 0, output: 12 });
        expect(Number(cost.toFixed(8))).toBe(9.6);

        const activeTokensCost = AIEngineBase.Instance.GetActiveModelCost(VIDEO_MODEL, BFL, 'Realtime', 'Tokens');
        expect(activeTokensCost).toBeNull();
    });
});

describe('FLUX 3 Video and FLUX 3 Image models and vendor bindings', () => {
    it('seeds both models with the right model type and IsActive: false', () => {
        const models = seeds.Models.map((m) => toEngineRow(m));
        const videoModel = models.find((m) => m['ID'] === VIDEO_MODEL);
        const imageModel = models.find((m) => m['ID'] === IMAGE_MODEL);

        expect(videoModel).toMatchObject({
            Name: FLUX_3_VIDEO,
            AIModelTypeID: VIDEO_TYPE,
            IsActive: false,
            PowerRank: 10,
            SpeedRank: 2,
            CostRank: 9,
            InheritTypeModalities: true,
        });

        expect(imageModel).toMatchObject({
            Name: FLUX_3_IMAGE,
            AIModelTypeID: IMAGE_GENERATOR_TYPE,
            IsActive: false,
            PowerRank: 11,
            SpeedRank: 7,
            CostRank: 6,
            InheritTypeModalities: true,
        });
    });

    it('binds Model Developer (no driver) and Inference Provider (driver + APIName) under Black Forest Labs for both models', () => {
        const videoVendors = modelVendors.filter((mv) => mv['ModelID'] === VIDEO_MODEL && mv['VendorID'] === BFL);
        expect(videoVendors).toHaveLength(2);

        const videoDev = videoVendors.find(
            (mv) => mv['TypeID'] === '@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer',
        );
        const videoInf = videoVendors.find(
            (mv) => mv['TypeID'] === '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider',
        );
        expect(videoDev).toMatchObject({ Priority: 0, Status: 'Active' });
        expect(videoDev).not.toHaveProperty('DriverClass');
        expect(videoInf).toMatchObject({
            DriverClass: 'FLUX3VideoGenerator',
            APIName: 'flux-3-video',
            Priority: 1,
            Status: 'Active',
            MaxInputTokens: 10000,
        });

        const imageVendors = modelVendors.filter((mv) => mv['ModelID'] === IMAGE_MODEL && mv['VendorID'] === BFL);
        expect(imageVendors).toHaveLength(2);

        const imageDev = imageVendors.find(
            (mv) => mv['TypeID'] === '@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer',
        );
        const imageInf = imageVendors.find(
            (mv) => mv['TypeID'] === '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider',
        );
        expect(imageDev).toMatchObject({ Priority: 0, Status: 'Active' });
        expect(imageDev).not.toHaveProperty('DriverClass');
        expect(imageInf).toMatchObject({
            DriverClass: 'FLUXImageGenerator',
            APIName: 'flux-3-image',
            Priority: 1,
            Status: 'Active',
            MaxInputTokens: 10000,
        });
    });
});

describe('FLUX 3 effective model modalities', () => {
    const modalityNames = (modelID: string, direction: 'Input' | 'Output'): string[] =>
        AIEngineBase.Instance.GetModelModalities(modelID, direction)
            .map((m) => m.Name)
            .sort();

    it('resolves FLUX 3 Video Input to [Image, Text] and Output to [Audio, Video]', () => {
        expect(modalityNames(VIDEO_MODEL, 'Input')).toEqual(['Image', 'Text']);
        expect(modalityNames(VIDEO_MODEL, 'Output')).toEqual(['Audio', 'Video']);
    });

    it('resolves FLUX 3 Image Input to [Image, Text] and Output to [Image]', () => {
        expect(modalityNames(IMAGE_MODEL, 'Input')).toEqual(['Image', 'Text']);
        expect(modalityNames(IMAGE_MODEL, 'Output')).toEqual(['Image']);
    });
});

describe('FLUX 3 cost row invariants', () => {
    it('omits deprecated PriceTypeID on the FLUX 3 Video cost row and seeds no cost row on FLUX 3 Image', () => {
        const videoCosts = modelCosts.filter((c) => c['ModelID'] === VIDEO_MODEL);
        expect(videoCosts).toHaveLength(1);
        expect(videoCosts[0]).not.toHaveProperty('PriceTypeID');

        const imageCosts = modelCosts.filter((c) => c['ModelID'] === IMAGE_MODEL);
        expect(imageCosts).toHaveLength(0);
    });
});
