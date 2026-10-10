/**
 * Seed test for Gemini 3.8 Live on Gemini Enterprise (Vertex AI): the rows `metadata/` ships, resolved the way
 * MetadataSync resolves them (`@lookup` by name, `@parent:ID`) and loaded into the engine, then asked what a realtime
 * session would get. Like the AI Usage Types check in `PriceUnitTypes.test.ts`, it reads the seed files themselves,
 * because they are the source of the rows.
 *
 * What it pins, and why a wrong value would otherwise only show in a live session:
 * - the Vertex AI model-vendor row: the Enterprise driver, `gemini-3.8-live`, Active, and a Priority above Google's,
 *   so a deployment with the Enterprise key runs on Vertex AI and one without it is unchanged; and the Video / Output
 *   modality the model gains;
 * - the voices on Vertex AI: the five Gemini voice personas plus Ben, in the model's order, Ben's face as a preset;
 * - the Google side: unchanged, and Ben never appears there;
 * - the Vertex AI token cost row, which mirrors Google's.
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

import { ParseModelConfiguration, ResolveEffectiveModelConfiguration, type AIModelConfiguration } from '@memberjunction/ai';
import { AIEngineBase } from '../BaseAIEngine';
import { PerMillionTokensPriceUnitType } from '../PriceUnitTypes';
import { ExcludeAvatarVideoTokens, PriceAvatarVideoOutput, RoundCost } from '../RealtimeCostLines';

/** A field value in a seed file. */
type SeedValue = string | number | boolean | null | SeedObject;

/** A JSON object inside a seed field, such as `VendorSettings`. */
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
const GEMINI_38_LIVE = 'Gemini 3.8 Live';
const GEMINI_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'];

function readSeed(path: string): SeedRecord[] {
    return JSON.parse(readFileSync(resolve(METADATA, path), 'utf8'));
}

const seeds = {
    Models: readSeed('ai-models/.ai-models.json'),
    Vendors: readSeed('ai-vendors/.ai-vendors.json'),
    Modalities: readSeed('ai-modalities/.ai-modalities.json'),
    Personas: readSeed('ai-personas/.ai-personas.json'),
    PersonaVendors: readSeed('ai-persona-vendors/.ai-persona-vendors.json'),
    ModelPersonas: readSeed('ai-model-personas/.ai-model-personas.json'),
};

/** Name → key for the entities the rows look up by name. */
const KEYS = new Map<string, Map<string, string>>(
    ([['MJ: AI Models', seeds.Models], ['MJ: AI Vendors', seeds.Vendors], ['MJ: AI Modalities', seeds.Modalities], ['MJ: AI Personas', seeds.Personas]] as const)
        .map(([entity, records]) => [entity, new Map(records.map((r) => [String(r.fields['Name']).toLowerCase(), r.primaryKey?.ID ?? '']))])
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
    return seeds.Models.flatMap((m) => (m.relatedEntities?.[entity] ?? []).map((r) => toEngineRow(r, m.primaryKey?.ID ?? '')));
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

const MODEL = keyOf('MJ: AI Models', GEMINI_38_LIVE);
const VERTEX = keyOf('MJ: AI Vendors', 'Vertex AI');
const GOOGLE = keyOf('MJ: AI Vendors', 'Google');
const AUDIO = keyOf('MJ: AI Modalities', 'Audio');
const VIDEO = keyOf('MJ: AI Modalities', 'Video');
const BEN = keyOf('MJ: AI Personas', 'Ben');

const modelVendors = nestedRows('MJ: AI Model Vendors');
const modelCosts = nestedRows('MJ: AI Model Costs');
const personaVendors = seeds.PersonaVendors.map((r) => toEngineRow(r));

/** The model's Active vendor rows that carry a driver, highest Priority first: the order realtime vendor selection walks. */
function activeDriverRows(modelID: string): EngineRow[] {
    return modelVendors
        .filter((mv) => mv['ModelID'] === modelID && mv['Status'] === 'Active' && typeof mv['DriverClass'] === 'string')
        .sort((a, b) => Number(b['Priority'] ?? 0) - Number(a['Priority'] ?? 0));
}

/** The model's configuration on a vendor, as the database stores it (JSON text): the model's bag under the model-vendor row's. */
function configurationOn(vendorID: string): AIModelConfiguration | null {
    const text = (value: SeedValue | undefined): string | null => (value ? JSON.stringify(value) : null);
    const model = seeds.Models.find((m) => m.primaryKey?.ID === MODEL);
    const row = modelVendors.find((mv) => mv['ModelID'] === MODEL && mv['VendorID'] === vendorID);
    return ResolveEffectiveModelConfiguration(ParseModelConfiguration(text(model?.fields['ModelConfiguration'])), ParseModelConfiguration(text(row?.['ModelConfiguration'])));
}

/** The persona names and wire names the engine resolves for the model on a vendor, in the model's order. */
function personasOn(vendorID: string, modality: 'Audio' | 'Video'): Array<[string, string]> {
    return AIEngineBase.Instance.GetModelPersonas(MODEL, modality, vendorID).map((p) => [p.Persona.Name, p.PersonaVendor.APIName]);
}

beforeAll(() => {
    setEngineRows('_models', seeds.Models.map((m) => toEngineRow(m)));
    setEngineRows('_modalities', seeds.Modalities.map((m) => toEngineRow(m)));
    setEngineRows('_modelModalities', nestedRows('MJ: AI Model Modalities'));
    setEngineRows('_modelVendors', modelVendors);
    setEngineRows('_modelCosts', modelCosts);
    setEngineRows('_personas', seeds.Personas.map((p) => toEngineRow(p)));
    setEngineRows('_personaVendors', personaVendors);
    setEngineRows('_modelPersonas', seeds.ModelPersonas.map((r) => toEngineRow(r)));
});

describe('Gemini 3.8 Live on Vertex AI — the model-vendor row', () => {
    it('runs on the Enterprise driver under the Gemini API name, Active, as an inference provider', () => {
        const vertex = modelVendors.filter((mv) => mv['ModelID'] === MODEL && mv['VendorID'] === VERTEX);

        expect(vertex).toHaveLength(1);
        expect(vertex[0]).toMatchObject({
            DriverClass: 'GeminiEnterpriseRealtime',
            APIName: 'gemini-3.8-live',
            Status: 'Active',
            Priority: 1,
            TypeID: '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider',
        });
    });

    it('is tried before the Google row, which is unchanged, with no Priority tie', () => {
        const rows = activeDriverRows(MODEL);

        expect(rows.map((r) => [r['VendorID'], r['DriverClass'], r['Priority']])).toEqual([
            [VERTEX, 'GeminiEnterpriseRealtime', 1],
            [GOOGLE, 'GeminiRealtime', 0],
        ]);
    });

    it('no other model gains a Vertex AI realtime row', () => {
        const enterprise = modelVendors.filter((mv) => mv['DriverClass'] === 'GeminiEnterpriseRealtime');

        expect(enterprise.map((mv) => mv['ModelID'])).toEqual([MODEL]);
    });

    it('the catalog says the model outputs video, and its inputs are unchanged', () => {
        const names = (direction: 'Input' | 'Output'): string[] =>
            AIEngineBase.Instance.GetModelModalities(MODEL, direction).map((m) => m.Name).sort();

        expect(names('Output')).toEqual(['Audio', 'Text', 'Video']);
        expect(names('Input')).toEqual(['Audio', 'Image', 'Text', 'Video']);
    });
});

describe('Gemini 3.8 Live on Vertex AI — voices and the avatar', () => {
    it('lists the five Gemini voices, then Ben speaking as Puck, in the model\'s order', () => {
        expect(personasOn(VERTEX, 'Audio')).toEqual([
            ...GEMINI_VOICES.map((v): [string, string] => [v, v]),
            ['Ben', 'Puck'],
        ]);
    });

    it('offers one face: Ben, the "Ben" preset', () => {
        const faces = AIEngineBase.Instance.GetModelPersonas(MODEL, 'Video', VERTEX);

        expect(faces.map((f) => [f.Persona.Name, f.PersonaVendor.APIName])).toEqual([['Ben', 'Ben']]);
        expect(seeds.PersonaVendors.find((r) => r.primaryKey?.ID === faces[0].PersonaVendor.ID)?.fields['VendorSettings'])
            .toEqual({ Avatar: { Kind: 'preset' } });
    });

    it('binds Ben only on Vertex AI: Audio Puck and Video Ben', () => {
        const ben = personaVendors.filter((pv) => pv['PersonaID'] === BEN);

        expect(ben.map((pv) => [pv['VendorID'], pv['ModalityID'], pv['APIName'], pv['Status']]).sort()).toEqual(
            [[VERTEX, AUDIO, 'Puck', 'Active'], [VERTEX, VIDEO, 'Ben', 'Active']].sort()
        );
    });

    it('binds each Gemini voice on Vertex AI exactly as on Google', () => {
        const binding = (persona: string, vendor: string): EngineRow[] => personaVendors.filter((pv) =>
            pv['PersonaID'] === keyOf('MJ: AI Personas', persona) && pv['VendorID'] === vendor && pv['ModalityID'] === AUDIO);

        for (const voice of GEMINI_VOICES) {
            const [vertex] = binding(voice, VERTEX);
            const [google] = binding(voice, GOOGLE);
            expect(binding(voice, VERTEX), voice).toHaveLength(1);
            expect([vertex['APIName'], vertex['Status'], vertex['Priority']], voice).toEqual([google['APIName'], google['Status'], google['Priority']]);
        }
    });

    it('says on every Vertex AI binding that its name is unverified until the spike', () => {
        const vertexBindings = seeds.PersonaVendors.filter((r) => resolveReference(r.fields['VendorID'], '') === VERTEX);

        expect(vertexBindings).toHaveLength(GEMINI_VOICES.length + 2);
        for (const binding of vertexBindings) {
            expect((binding._comments ?? []).join(' '), String(binding.fields['PersonaID'])).toMatch(/unverified until the Vertex AI spike/);
        }
    });
});

describe('Gemini 3.8 Live — the model persona rows', () => {
    it('lists the six personas explicitly, all supported, Ben last, with no Sequence shared', () => {
        const rows = seeds.ModelPersonas.map((r) => toEngineRow(r)).filter((mp) => mp['ModelID'] === MODEL);
        const ordered = [...rows].sort((a, b) => Number(a['Sequence']) - Number(b['Sequence']));

        expect(ordered.map((mp) => mp['PersonaID'])).toEqual([...GEMINI_VOICES, 'Ben'].map((p) => keyOf('MJ: AI Personas', p)));
        expect(rows.every((mp) => mp['IsSupported'] === true)).toBe(true);
        expect(new Set(rows.map((mp) => mp['Sequence'])).size).toBe(rows.length);
    });
});

describe('Gemini 3.8 Live on Google — unchanged', () => {
    it('lists the five Gemini voices and no Ben', () => {
        expect(personasOn(GOOGLE, 'Audio')).toEqual(GEMINI_VOICES.map((v): [string, string] => [v, v]));
    });

    it('offers no face', () => {
        expect(personasOn(GOOGLE, 'Video')).toEqual([]);
    });
});

describe('Gemini 3.8 Live on Vertex AI — the token cost row', () => {
    it('prices Realtime tokens as Google does: $0.75 / $4.50 per 1M, USD, Active', () => {
        const vertex = AIEngineBase.Instance.GetActiveModelCost(MODEL, VERTEX, 'Realtime');
        const google = modelCosts.find((c) => c['ModelID'] === MODEL && c['VendorID'] === GOOGLE && c['UnitTypeID'] === '@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens');

        expect(vertex).toMatchObject({
            InputPricePerUnit: 0.75,
            OutputPricePerUnit: 4.5,
            UnitTypeID: '@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens',
            Currency: 'USD',
            Status: 'Active',
            ProcessingType: 'Realtime',
        });
        expect([vertex?.InputPricePerUnit, vertex?.OutputPricePerUnit]).toEqual([google?.['InputPricePerUnit'], google?.['OutputPricePerUnit']]);
    });

    it('is the only Vertex AI cost row, leaves the deprecated PriceTypeID to the database default, and says VERIFY', () => {
        const rows = modelCosts.filter((c) => c['ModelID'] === MODEL && c['VendorID'] === VERTEX);

        expect(rows).toHaveLength(1);
        expect(rows[0]).not.toHaveProperty('PriceTypeID');
        expect(String(rows[0]['Comments'])).toMatch(/VERIFY against the Vertex AI price list/);
    });
});

describe('Gemini 3.8 Live on Vertex AI — the avatar video price, as pricing reads it', () => {
    /** One speaking minute: Google counts the avatar's 60 s of video as 371,520 of the 373,520 output tokens. */
    const minute = { Output: { AudioTokens: 2000, VideoTokens: 371520, VideoSeconds: 60 } };

    it("prices a speaking minute on Vertex AI: the token row's $0.0165 plus the row's $0.37152 of video, $0.38802", () => {
        const costRow = AIEngineBase.Instance.GetActiveModelCost(MODEL, VERTEX, 'Realtime');
        if (!costRow) {
            throw new Error('metadata seeds no Vertex AI token cost row for Gemini 3.8 Live');
        }
        const video = PriceAvatarVideoOutput(minute, configurationOn(VERTEX), costRow.Currency);
        const tokens = new PerMillionTokensPriceUnitType().CalculateCost(costRow, ExcludeAvatarVideoTokens({ input: 10000, output: 373520 }, 371520).Usage);

        expect(video).toEqual({ Priced: true, Measure: 'Seconds', Seconds: 60, Cost: 0.37152, VideoTokens: 371520 });
        expect(RoundCost(tokens)).toBe(0.0165);
        expect(RoundCost(tokens + (video?.Priced ? video.Cost : 0))).toBe(0.38802);
    });

    it('has no avatar video price on Google: the price sits on the Vertex AI row, not on the model', () => {
        expect(PriceAvatarVideoOutput(minute, configurationOn(GOOGLE), 'USD')).toEqual({ Priced: false, Reason: 'no-price' });
    });
});

describe('Gemini 3.8 Live on Vertex AI — the turn coverage a session asks for', () => {
    /** The model's own `ModelConfiguration`, without any vendor row. */
    const modelConfiguration = (): AIModelConfiguration | null =>
        ParseModelConfiguration(JSON.stringify(seeds.Models.find((m) => m.primaryKey?.ID === MODEL)?.fields['ModelConfiguration'] ?? null));
    /** The Realtime section of the model's configuration on a vendor, empty when there is none. */
    const realtimeOn = (vendorID: string): NonNullable<AIModelConfiguration['Realtime']> => configurationOn(vendorID)?.Realtime ?? {};

    it('asks for audioActivityOnly on Vertex AI, which refuses TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO at setup', () => {
        expect(realtimeOn(VERTEX).TurnDetection?.Coverage).toBe('audioActivityOnly');
    });

    it('keeps audioActivityAndAllVideo on the model and on Google, whose Developer API accepts it', () => {
        expect(modelConfiguration()?.Realtime?.TurnDetection?.Coverage).toBe('audioActivityAndAllVideo');
        expect(realtimeOn(GOOGLE).TurnDetection?.Coverage).toBe('audioActivityAndAllVideo');
    });

    it("differs from Google's Realtime configuration only in the coverage and the avatar video price", () => {
        const { TurnDetection: vertexTurns, Pricing: _pricing, ...vertex } = realtimeOn(VERTEX);
        const { TurnDetection: googleTurns, ...google } = realtimeOn(GOOGLE);
        expect(vertex).toEqual(google);
        expect({ ...vertexTurns, Coverage: undefined }).toEqual({ ...googleTurns, Coverage: undefined });
    });
});
