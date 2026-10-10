/**
 * Unit tests for the PURE model-catalog configuration layer (`generic/modelConfiguration.ts`):
 * tolerant parsing of one `ModelConfiguration` column value, and the base-first deep-merge that
 * resolves the three-level catalog cascade (AIModelType < AIModel < AIModelVendor).
 *
 * Both functions are deliberately total — a malformed catalog row must contribute NOTHING rather
 * than fail a session — so the negative cases below are the contract, not edge-case trivia.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import {
    AIModelConfiguration,
    IsPrefixPromptCache,
    IsZeroDataRetention,
    ParseModelConfiguration,
    ParseVendorConfiguration,
    RealtimeUnitPrice,
    ResolveEffectiveModelConfiguration,
    ResolveIsModelFullDuplex,
} from '../generic/modelConfiguration';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('ParseModelConfiguration — tolerant single-layer parse', () => {
    it('returns null for absent / blank input', () => {
        expect(ParseModelConfiguration(null)).toBeNull();
        expect(ParseModelConfiguration(undefined)).toBeNull();
        expect(ParseModelConfiguration('')).toBeNull();
        expect(ParseModelConfiguration('   \n\t ')).toBeNull();
    });

    it('returns null for malformed JSON instead of throwing', () => {
        expect(ParseModelConfiguration('{ not json')).toBeNull();
        expect(ParseModelConfiguration('{"Realtime": }')).toBeNull();
    });

    it('returns null for valid JSON that is not a plain object', () => {
        // A bag must be an object — arrays and scalars are structurally wrong for every consumer.
        expect(ParseModelConfiguration('[]')).toBeNull();
        expect(ParseModelConfiguration('[{"Realtime":{}}]')).toBeNull();
        expect(ParseModelConfiguration('"semanticVad"')).toBeNull();
        expect(ParseModelConfiguration('42')).toBeNull();
        expect(ParseModelConfiguration('null')).toBeNull();
    });

    it('parses a well-formed bag', () => {
        const parsed = ParseModelConfiguration('{"Realtime":{"TurnDetection":{"Mode":"semanticVad","Eagerness":"auto"}}}');
        expect(parsed).toEqual({ Realtime: { TurnDetection: { Mode: 'semanticVad', Eagerness: 'auto' } } });
    });

    it('parses an empty object as an empty bag (present but contributing nothing)', () => {
        expect(ParseModelConfiguration('{}')).toEqual({});
    });
});

describe('ResolveEffectiveModelConfiguration — the three-level cascade', () => {
    it('returns null when there are no layers, or every layer is absent', () => {
        expect(ResolveEffectiveModelConfiguration()).toBeNull();
        expect(ResolveEffectiveModelConfiguration(null, undefined, null)).toBeNull();
    });

    it('returns null when every layer is present but empty', () => {
        expect(ResolveEffectiveModelConfiguration({}, {}, {})).toBeNull();
    });

    it('passes a single contributing layer through', () => {
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        expect(ResolveEffectiveModelConfiguration(null, model, null)).toEqual(model);
    });

    it('merges per key so a vendor override of ONE knob keeps the model layer\'s others', () => {
        const type: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'serverVad', Threshold: 0.5 } } };
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Eagerness: 'auto' } } };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };

        expect(ResolveEffectiveModelConfiguration(type, model, vendor)).toEqual({
            Realtime: { TurnDetection: { Mode: 'semanticVad', Threshold: 0.5, Eagerness: 'auto' } },
        });
    });

    it('keeps sibling sections a later layer does not mention', () => {
        const model: AIModelConfiguration = {
            LLM: { effortLevel: 'high' },
            Realtime: { TurnDetection: { Mode: 'serverVad' } },
        };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };

        expect(ResolveEffectiveModelConfiguration(model, vendor)).toEqual({
            LLM: { effortLevel: 'high' },
            Realtime: { TurnDetection: { Mode: 'semanticVad' } },
        });
    });

    it('replaces (does not merge) arrays and scalars', () => {
        const base: AIModelConfiguration = { LLM: { stops: ['a', 'b'], temperature: 0.2 } };
        const top: AIModelConfiguration = { LLM: { stops: ['c'], temperature: 0.9 } };
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({ LLM: { stops: ['c'], temperature: 0.9 } });
    });

    it('lets a later layer replace an object with a scalar (last writer wins on type change)', () => {
        const base = { Realtime: { TurnDetection: { Mode: 'serverVad' } } } as AIModelConfiguration;
        const top = { Realtime: { TurnDetection: null } } as unknown as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({ Realtime: { TurnDetection: null } });
    });

    it('skips undefined VALUES within a layer rather than blanking the base', () => {
        const base: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const top = { Realtime: undefined } as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({
            Realtime: { TurnDetection: { Mode: 'semanticVad' } },
        });
    });

    it('never mutates its inputs and never aliases nested objects into the result', () => {
        const type: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'serverVad', Threshold: 0.5 } } };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const typeSnapshot = JSON.parse(JSON.stringify(type)) as AIModelConfiguration;
        const vendorSnapshot = JSON.parse(JSON.stringify(vendor)) as AIModelConfiguration;

        const merged = ResolveEffectiveModelConfiguration(type, vendor);

        expect(type).toEqual(typeSnapshot);
        expect(vendor).toEqual(vendorSnapshot);
        // A cached catalog entity must not be corrupted by a caller mutating the resolved bag.
        expect(merged?.Realtime).not.toBe(type.Realtime);
        expect(merged?.Realtime?.TurnDetection).not.toBe(type.Realtime?.TurnDetection);
        expect(merged?.Realtime?.TurnDetection).not.toBe(vendor.Realtime?.TurnDetection);
    });

    it('ignores non-object layers entirely', () => {
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const bogus = ['not', 'a', 'bag'] as unknown as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(bogus, model, bogus)).toEqual(model);
    });

    it('merges Realtime.Reasoning configuration properly across layers', () => {
        const type: AIModelConfiguration = {
            Realtime: {
                Reasoning: {
                    Plane: 'local',
                },
            },
        };
        const vendor: AIModelConfiguration = {
            Realtime: {
                Reasoning: {
                    Plane: 'remote',
                    Remote: {
                        Kind: 'model',
                        Ref: 'gpt-5.6-terra',
                        Effort: 'medium',
                    },
                },
            },
        };
        const merged = ResolveEffectiveModelConfiguration(type, vendor);
        expect(merged).toEqual({
            Realtime: {
                Reasoning: {
                    Plane: 'remote',
                    Remote: {
                        Kind: 'model',
                        Ref: 'gpt-5.6-terra',
                        Effort: 'medium',
                    },
                },
            },
        });
    });
});

describe('LLM section — native tool-calling flags (implementation plan §4.1)', () => {
    it('inherits a model-level capability flag when the vendor layer omits it', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: { DefaultToNativeToolCalling: true } }
        );
        // The vendor layer set a DIFFERENT key, so per-key deep merge must preserve the model's.
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
        expect(resolved?.LLM?.DefaultToNativeToolCalling).toBe(true);
    });

    it('lets an explicit vendor false override a model true — a serving path that lacks tools', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: { SupportsNativeToolCalling: false } }
        );
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(false);
    });

    it('distinguishes absent from false: an absent property inherits rather than disabling', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: {} },
            { LLM: {} }
        );
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
    });

    it('resolves to a falsy value when no layer expresses an opinion — today behavior, untouched', () => {
        const resolved = ResolveEffectiveModelConfiguration(null, null, null);
        expect(resolved?.LLM?.SupportsNativeToolCalling ?? false).toBe(false);
        expect(resolved?.LLM?.DefaultToNativeToolCalling ?? false).toBe(false);
    });

    it('does not let a tool-calling flag disturb another modality section', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { Realtime: { TurnDetection: { Mode: 'serverVad' } } },
            { LLM: { SupportsNativeToolCalling: true } }
        );
        expect(resolved?.Realtime?.TurnDetection?.Mode).toBe('serverVad');
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
    });
});

describe('LLM control-flow knobs', () => {
    it('carries NativeControlFlow and NativeToolResults through the cascade like the other LLM knobs', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { SupportsNativeToolCalling: true, NativeControlFlow: 'implicit' } },
            { LLM: { NativeToolResults: true } }
        );
        expect(merged?.LLM?.NativeControlFlow).toBe('implicit');
        expect(merged?.LLM?.NativeToolResults).toBe(true);
        expect(merged?.LLM?.SupportsNativeToolCalling).toBe(true);
    });

    it('an explicit null at a higher layer REPLACES (tri-state), it does not inherit', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { NativeControlFlow: 'implicit' } },
            { LLM: { NativeControlFlow: null } }
        );
        expect(merged?.LLM?.NativeControlFlow).toBeNull();
    });
});

describe('IsPrefixPromptCache — the catalog answers "is this serving path a byte-prefix cache?"', () => {
    it('is false when no layer declares the flag (callers then replace in place)', () => {
        expect(IsPrefixPromptCache(null)).toBe(false);
        expect(IsPrefixPromptCache(undefined)).toBe(false);
        expect(IsPrefixPromptCache({})).toBe(false);
        expect(IsPrefixPromptCache({ LLM: {} })).toBe(false);
        expect(IsPrefixPromptCache({ LLM: { PrefixPromptCache: null } })).toBe(false);
        expect(IsPrefixPromptCache({ LLM: { PrefixPromptCache: false } })).toBe(false);
    });

    it('is true only for a literal true; a truthy string in stored JSON is not a flag', () => {
        expect(IsPrefixPromptCache({ LLM: { PrefixPromptCache: true } })).toBe(true);
        const stored = ParseModelConfiguration('{"LLM":{"PrefixPromptCache":"yes"}}');
        expect(IsPrefixPromptCache(stored)).toBe(false);
    });

    it("Type < Model < Vendor.ModelDefaults < ModelVendor: the vendor default beats the model's bag, the serving row beats everything, and sibling knobs survive", () => {
        const type: AIModelConfiguration = { LLM: { PrefixPromptCache: false } };
        const model: AIModelConfiguration = { LLM: { PrefixPromptCache: false, SupportsNativeToolCalling: true } };
        const vendorDefaults: AIModelConfiguration = { LLM: { PrefixPromptCache: true } };
        const modelVendor: AIModelConfiguration = { LLM: { PrefixPromptCache: false } };

        expect(IsPrefixPromptCache(ResolveEffectiveModelConfiguration(type, model))).toBe(false);
        expect(IsPrefixPromptCache(ResolveEffectiveModelConfiguration(type, model, vendorDefaults))).toBe(true); // the vendor default wins over the model's own false
        const effective = ResolveEffectiveModelConfiguration(type, model, vendorDefaults, modelVendor);
        expect(IsPrefixPromptCache(effective)).toBe(false); // the serving row is the tie-breaker
        expect(effective?.LLM?.SupportsNativeToolCalling).toBe(true); // ...without wiping the model's other knobs
    });

    it('ParseVendorConfiguration is as tolerant as ParseModelConfiguration and exposes ModelDefaults', () => {
        expect(ParseVendorConfiguration(null)).toBeNull();
        expect(ParseVendorConfiguration('{ nope')).toBeNull();
        expect(ParseVendorConfiguration('[1,2]')).toBeNull();
        expect(ParseVendorConfiguration('{"ModelDefaults":{"LLM":{"PrefixPromptCache":true}}}')?.ModelDefaults?.LLM?.PrefixPromptCache).toBe(true);
        expect(ParseVendorConfiguration('{"SomethingElse":1}')?.ModelDefaults).toBeUndefined();
    });
});

describe('Decision section — per-model typed-decision limits', () => {
    it('lets a vendor layer narrow one limit while keeping the model layer\'s others', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { Decision: { MaxChoiceOptions: 255, MaxScoreLevels: 10, MaxStateTokens: 32000 } },
            { Decision: { MaxStateTokens: 16000 } }
        );
        expect(merged?.Decision).toEqual({ MaxChoiceOptions: 255, MaxScoreLevels: 10, MaxStateTokens: 16000 });
    });

    it('does not disturb another modality section', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { SupportsNativeToolCalling: true } },
            { Decision: { MaxQuestionsPerCall: 32 } }
        );
        expect(merged?.LLM?.SupportsNativeToolCalling).toBe(true);
        expect(merged?.Decision?.MaxQuestionsPerCall).toBe(32);
    });

    it('leaves the section absent when no layer declares limits', () => {
        const merged = ResolveEffectiveModelConfiguration({ LLM: { NativeToolResults: true } });
        expect(merged?.Decision).toBeUndefined();
    });
});

describe('Privacy.ZeroDataRetention', () => {
    it('is true only for an explicit true', () => {
        expect(IsZeroDataRetention({ Privacy: { ZeroDataRetention: true } })).toBe(true);
        expect(IsZeroDataRetention({ Privacy: { ZeroDataRetention: false } })).toBe(false);
        expect(IsZeroDataRetention({ Privacy: { ZeroDataRetention: null } })).toBe(false);
        expect(IsZeroDataRetention({ Privacy: {} })).toBe(false);
        expect(IsZeroDataRetention({})).toBe(false);
        expect(IsZeroDataRetention(null)).toBe(false);
        expect(IsZeroDataRetention(undefined)).toBe(false);
    });

    it('survives a tolerant parse of a catalog row', () => {
        const parsed = ParseModelConfiguration('{"Privacy":{"ZeroDataRetention":true}}');
        expect(IsZeroDataRetention(parsed)).toBe(true);
    });

    it('cascades like every other section: the vendor row can declare it for a model that did not', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { NativeToolResults: true } },
            { Privacy: { ZeroDataRetention: true } }
        );
        expect(IsZeroDataRetention(merged)).toBe(true);
        expect(merged?.LLM?.NativeToolResults).toBe(true);
    });

    it('the most specific layer wins, even when it withdraws the claim', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { Privacy: { ZeroDataRetention: true } },
            { Privacy: { ZeroDataRetention: false } }
        );
        expect(IsZeroDataRetention(merged)).toBe(false);
    });
});
describe('ResolveIsModelFullDuplex — metadata wins over driver fallback', () => {
    it('returns true when metadata FullDuplex is true, regardless of driver capability', () => {
        expect(ResolveIsModelFullDuplex({ Realtime: { FullDuplex: true } }, false)).toBe(true);
        expect(ResolveIsModelFullDuplex({ Realtime: { FullDuplex: true } }, undefined)).toBe(true);
    });

    it('returns false when metadata FullDuplex is false, even if driver capability is true', () => {
        expect(ResolveIsModelFullDuplex({ Realtime: { FullDuplex: false } }, true)).toBe(false);
    });

    it('falls back to driver capability when metadata FullDuplex is omitted or null', () => {
        expect(ResolveIsModelFullDuplex({ Realtime: { FullDuplex: null } }, true)).toBe(true);
        expect(ResolveIsModelFullDuplex({ Realtime: {} }, true)).toBe(true);
        expect(ResolveIsModelFullDuplex(null, true)).toBe(true);
        expect(ResolveIsModelFullDuplex(null, false)).toBe(false);
        expect(ResolveIsModelFullDuplex(null, undefined)).toBe(false);
    });
});

describe('Realtime.Pricing — prices for output the token cost rows do not cover', () => {
    const avatarVideo: RealtimeUnitPrice = { Price: 0.37152, Unit: 'Per Minute', Currency: 'USD' };

    it('resolves from the model-vendor row beside the Realtime knobs of the lower layers', () => {
        const model: AIModelConfiguration = { Realtime: { FullDuplex: true, TurnDetection: { Coverage: 'audioActivityAndAllVideo' } } };
        const row: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: avatarVideo } } };

        expect(ResolveEffectiveModelConfiguration(null, model, null, row)?.Realtime).toEqual({
            FullDuplex: true,
            TurnDetection: { Coverage: 'audioActivityAndAllVideo' },
            Pricing: { AvatarVideoOutput: avatarVideo },
        });
    });

    it('merges per key: a more specific layer that sets only Price keeps Unit and Currency', () => {
        const vendorDefaults: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: avatarVideo } } };
        const row: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: { Price: 0.5 } } } };

        expect(ResolveEffectiveModelConfiguration(null, null, vendorDefaults, row)?.Realtime?.Pricing?.AvatarVideoOutput)
            .toEqual({ Price: 0.5, Unit: 'Per Minute', Currency: 'USD' });
    });

    it('an explicit null on a more specific layer withdraws an inherited price', () => {
        const model: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: avatarVideo } } };
        const row: AIModelConfiguration = { Realtime: { Pricing: { AvatarVideoOutput: null } } };

        expect(ResolveEffectiveModelConfiguration(model, row)?.Realtime?.Pricing?.AvatarVideoOutput).toBeNull();
    });
});

/** The fields of a MetadataSync record that the seed tests read. */
interface SeedFields {
    Name?: string;
    VendorID?: string;
    TypeID?: string;
    ModelConfiguration?: AIModelConfiguration;
}

/** A MetadataSync record of `metadata/ai-models`, with its nested model-vendor rows. */
interface SeedRecord {
    fields: SeedFields;
    relatedEntities?: { 'MJ: AI Model Vendors'?: SeedRecord[] };
}

/**
 * Reads a seeded model's bag and one of its inference-provider rows' bag the way the database holds them:
 * MetadataSync stores each object as its JSON text, which `ParseModelConfiguration` reads back.
 */
function seededLayers(modelName: string, vendorName: string): { Model: AIModelConfiguration | null; Row: AIModelConfiguration | null } {
    const records: SeedRecord[] = JSON.parse(readFileSync(resolve(HERE, '../../../../../metadata/ai-models/.ai-models.json'), 'utf8'));
    const model = records.find((r) => r.fields.Name === modelName);
    const row = model?.relatedEntities?.['MJ: AI Model Vendors']?.find((r) =>
        r.fields.VendorID === `@lookup:MJ: AI Vendors.Name=${vendorName}` && r.fields.TypeID?.endsWith('.Name=Inference Provider') === true
    );
    if (!model || !row) {
        throw new Error(`metadata/ai-models seeds no ${vendorName} inference-provider row for ${modelName}`);
    }
    return {
        Model: ParseModelConfiguration(JSON.stringify(model.fields.ModelConfiguration ?? null)),
        Row: ParseModelConfiguration(JSON.stringify(row.fields.ModelConfiguration ?? null)),
    };
}

describe('Realtime.Pricing as seeded for Gemini 3.8 Live (metadata/ai-models)', () => {
    it('Vertex AI prices avatar video per minute in USD: $1.00 per 1M tokens at 6,192 tokens per second', () => {
        const { Model, Row } = seededLayers('Gemini 3.8 Live', 'Vertex AI');
        const price = ResolveEffectiveModelConfiguration(Model, Row)?.Realtime?.Pricing?.AvatarVideoOutput;

        expect(price).toEqual({ Price: 0.37152, Unit: 'Per Minute', Currency: 'USD' });
        expect(price?.Price).toBeCloseTo((1 / 1_000_000) * 6192 * 60, 10);
    });

    it('the Google row (the Gemini Developer API, which renders no avatar) carries no price', () => {
        const { Model, Row } = seededLayers('Gemini 3.8 Live', 'Google');

        expect(ResolveEffectiveModelConfiguration(Model, Row)?.Realtime?.Pricing).toBeUndefined();
    });

    it('the Vertex AI row states the Google row\'s Realtime knobs, so only the price and the turn coverage differ', () => {
        const { Pricing, TurnDetection: vertexTurns, ...vertexKnobs } = seededLayers('Gemini 3.8 Live', 'Vertex AI').Row?.Realtime ?? {};
        const { TurnDetection: googleTurns, ...googleKnobs } = seededLayers('Gemini 3.8 Live', 'Google').Row?.Realtime ?? {};

        expect(Pricing).toBeDefined();
        expect(vertexTurns?.Coverage, 'Vertex AI refuses TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO at session setup').toBe('audioActivityOnly');
        expect(vertexKnobs).toEqual(googleKnobs);
        expect({ ...vertexTurns, Coverage: undefined }).toEqual({ ...googleTurns, Coverage: undefined });
    });
});

/** A top-level declaration's shape as written: an interface's members (sorted), or a type alias's type. */
type DeclarationShape = { Kind: 'interface'; Members: string[] } | { Kind: 'type'; Text: string };

/** One declaration of the JSONType source, with the Core name it is compared against. */
interface SourceDeclaration {
    Name: string;
    CoreName: string;
    Shape: DeclarationShape;
}

/** The JSONType source's per-table outer types, and the Core declaration each has the members of. */
const OUTER_TYPE_COUNTERPARTS: ReadonlyMap<string, string> = new Map([
    ['IAIModelConfiguration', 'AIConfigurationSections'],
    ['IAIPromptConfiguration', 'AIConfigurationSections'],
    ['IAIPromptModelConfiguration', 'AIConfigurationSections'],
    ['IAIVendorConfiguration', 'AIVendorConfiguration'],
]);

/** How a member type that names an outer type is spelled in Core. */
const OUTER_TYPE_REFERENCES: ReadonlyMap<string, string> = new Map([
    ['IAIModelConfiguration', 'AIModelConfiguration'],
    ['IAIPromptConfiguration', 'AIPromptConfiguration'],
    ['IAIPromptModelConfiguration', 'AIPromptModelConfiguration'],
    ['IAIVendorConfiguration', 'AIVendorConfiguration'],
]);

/** A member as `Name?: Type`, or the whole signature for an index signature, with whitespace collapsed. */
function memberText(member: ts.TypeElement, source: ts.SourceFile): string {
    const text = ts.isPropertySignature(member)
        ? `${member.name.getText(source)}${member.questionToken ? '?' : ''}: ${member.type?.getText(source) ?? ''}`
        : member.getText(source).replace(/;$/, '');
    return text.replace(/\s+/g, ' ').trim();
}

/** Every top-level interface and type alias of a file, by name, with type references renamed through `references`. */
function declarationShapes(file: string, references: ReadonlyMap<string, string> = new Map()): Map<string, DeclarationShape> {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const rename = (text: string): string => text.replace(/\b[A-Za-z_]\w*\b/g, (id) => references.get(id) ?? id).replace(/\s+/g, ' ').trim();
    const shapes = new Map<string, DeclarationShape>();
    for (const statement of source.statements) {
        if (ts.isInterfaceDeclaration(statement)) {
            shapes.set(statement.name.text, { Kind: 'interface', Members: statement.members.map((m) => rename(memberText(m, source))).sort() });
        } else if (ts.isTypeAliasDeclaration(statement)) {
            shapes.set(statement.name.text, { Kind: 'type', Text: rename(statement.type.getText(source)) });
        }
    }
    return shapes;
}

/** The type names a declaration's members or alias text refer to. */
function referencedNames(shape: DeclarationShape): string[] {
    const text = shape.Kind === 'interface' ? shape.Members.join(' ') : shape.Text;
    return text.match(/\b[A-Z]\w*\b/g) ?? [];
}

describe('Lockstep — the JSONType source CodeGen generates from declares what this mirror declares', () => {
    const jsonTypeSource = resolve(HERE, '../../../../../metadata/entities/JSONType-interfaces/IAIConfiguration.ts');
    const core = new Map([
        ...declarationShapes(resolve(HERE, '../generic/modelConfiguration.ts')),
        ...declarationShapes(resolve(HERE, '../generic/realtimeTracks.ts')),
    ]);
    const source: SourceDeclaration[] = [...declarationShapes(jsonTypeSource, OUTER_TYPE_REFERENCES)].map(([Name, Shape]) => ({
        Name,
        CoreName: OUTER_TYPE_COUNTERPARTS.get(Name) ?? Name,
        Shape,
    }));

    it('every interface and type in the source has the same members (or type) as its Core counterpart', () => {
        expect(source.length).toBeGreaterThan(0);
        for (const declaration of source) {
            expect(core.get(declaration.CoreName), `${declaration.Name} (Core: ${declaration.CoreName})`).toEqual(declaration.Shape);
        }
    });

    it('every type the Core configuration bags reach is declared in the source', () => {
        const declaredInSource = new Set([...source.map((d) => d.CoreName), ...OUTER_TYPE_REFERENCES.values()]);
        const reached = new Set<string>();
        const pending = ['AIConfigurationSections', 'AIVendorConfiguration'];
        while (pending.length > 0) {
            const name = pending.pop()!;
            const shape = core.get(name);
            if (!shape || reached.has(name)) {
                continue;
            }
            reached.add(name);
            pending.push(...referencedNames(shape));
        }

        expect([...reached].filter((name) => !declaredInSource.has(name)).sort()).toEqual([]);
    });

    it("the price units it declares are names of seeded MJ: AI Model Price Unit Types rows: 'Per Minute' and 'Per 1M Tokens'", () => {
        const unitTypes: Array<{ fields: { Name: string } }> = JSON.parse(
            readFileSync(resolve(HERE, '../../../../../metadata/ai-model-price-unit-types/.ai-model-price-unit-types.json'), 'utf8')
        );
        const seeded = new Set(unitTypes.map((row) => row.fields.Name));
        const shape = core.get('RealtimeUnitPrice');
        const unit = shape?.Kind === 'interface' ? shape.Members.find((member) => member.startsWith('Unit?:')) : undefined;
        const declared = [...(unit ?? '').matchAll(/'([^']*)'/g)].map((match) => match[1]);

        expect(declared).toEqual(['Per Minute', 'Per 1M Tokens']);
        expect(declared.filter((name) => !seeded.has(name))).toEqual([]);
    });
});

