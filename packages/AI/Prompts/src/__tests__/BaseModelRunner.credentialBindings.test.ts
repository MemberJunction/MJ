/**
 * Tests for the ModelVendor tier of BaseModelRunner's credential lookup (HasCredentialsAvailable and
 * ResolveCredentialForExecution).
 *
 * A vendor that both develops and serves a model has two Active rows for the pair: a Model Developer
 * row and an Inference Provider row. A credential bound to the Inference Provider row must be found
 * whichever order the engine holds the rows in; the database returns them in key order, so the order
 * is an accident of the rows' IDs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { BaseModelRunner } from '../BaseModelRunner';

const h = vi.hoisted(() => {
    const norm = (s: string): string => s.trim().toLowerCase();
    const INFERENCE_TYPE_ID = 'type-inference-provider';
    const DEVELOPER_TYPE_ID = 'type-model-developer';

    interface ModelVendorRow {
        ID: string;
        ModelID: string;
        VendorID: string;
        TypeID: string;
        Status: string;
    }

    const state = {
        rows: [] as ModelVendorRow[],
        /** IDs of the model-vendor rows that have a ModelVendor credential binding. */
        bound: new Set<string>(),
    };

    const engine = {
        Config: vi.fn().mockResolvedValue(undefined),
        get ModelVendorsByModelID(): Map<string, ModelVendorRow[]> {
            const map = new Map<string, ModelVendorRow[]>();
            for (const row of state.rows) {
                const key = norm(row.ModelID);
                map.set(key, [...(map.get(key) ?? []), row]);
            }
            return map;
        },
        IsInferenceProvider(row: { TypeID: string }): boolean {
            return row.TypeID === INFERENCE_TYPE_ID;
        },
        HasCredentialBindings(bindingType: string, targetId: string): boolean {
            return bindingType === 'ModelVendor' && state.bound.has(norm(targetId));
        },
        GetCredentialBindingsForTarget(bindingType: string, targetId: string): Array<{ CredentialID: string; Priority: number }> {
            return bindingType === 'ModelVendor' && state.bound.has(norm(targetId))
                ? [{ CredentialID: `credential-for-${norm(targetId)}`, Priority: 1 }]
                : [];
        },
        PromptModels: [],
        VendorsByID: new Map(),
    };

    return { state, engine, norm, INFERENCE_TYPE_ID, DEVELOPER_TYPE_ID };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, AIEngine: { Instance: h.engine } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    // No legacy key: only a binding can make a candidate credentialed.
    return { ...actual, GetAIAPIKey: () => '' };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>().catch(() => ({}));
    return {
        ...actual,
        CredentialEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                getCredentialById: (id: string) => ({ ID: id, Name: id, IsActive: true, ExpiresAt: null }),
                getCredential: vi.fn(async (_name: string, options: { credentialId: string }) => ({ values: { apiKey: `key-of-${options.credentialId}` } })),
            },
        },
    };
});

const MODEL = 'model-decider';
const OTHER_MODEL = 'model-other';
const VENDOR = 'vendor-perplexity';
const DEVELOPER_ROW = { ID: 'row-developer', ModelID: MODEL, VendorID: VENDOR, TypeID: h.DEVELOPER_TYPE_ID, Status: 'Active' };
const INFERENCE_ROW = { ID: 'row-inference', ModelID: MODEL, VendorID: VENDOR, TypeID: h.INFERENCE_TYPE_ID, Status: 'Active' };
const OTHER_MODEL_ROW = { ID: 'row-other-model', ModelID: OTHER_MODEL, VendorID: VENDOR, TypeID: h.INFERENCE_TYPE_ID, Status: 'Active' };

/** The real credential lookup, with its two protected entry points opened. */
class CredentialLookupRunner extends BaseModelRunner {
    public get RequiredModelType(): string {
        return 'Decision';
    }

    public HasCredentials(modelId: string): boolean {
        return this.HasCredentialsAvailable('PerplexityDecision', undefined, modelId, VENDOR, new AIPromptParams());
    }

    public Resolve(modelId: string): Promise<string> {
        return this.ResolveCredentialForExecution('PerplexityDecision', undefined, modelId, VENDOR, new AIPromptParams());
    }
}

describe('BaseModelRunner ModelVendor credential bindings', () => {
    let runner: CredentialLookupRunner;

    beforeEach(() => {
        h.state.rows = [];
        h.state.bound = new Set();
        runner = new CredentialLookupRunner();
    });

    it.each([
        ['the Model Developer row comes first', [DEVELOPER_ROW, INFERENCE_ROW]],
        ['the Inference Provider row comes first', [INFERENCE_ROW, DEVELOPER_ROW]],
    ])('finds a binding on the Inference Provider row when %s', async (_order, rows) => {
        h.state.rows = rows;
        h.state.bound.add(INFERENCE_ROW.ID);

        expect(runner.HasCredentials(MODEL)).toBe(true);
        expect(await runner.Resolve(MODEL)).toBe(JSON.stringify({ apiKey: 'key-of-credential-for-row-inference' }));
    });

    it("prefers the Inference Provider row's binding when both rows have one", async () => {
        h.state.rows = [DEVELOPER_ROW, INFERENCE_ROW];
        h.state.bound.add(DEVELOPER_ROW.ID);
        h.state.bound.add(INFERENCE_ROW.ID);

        expect(await runner.Resolve(MODEL)).toBe(JSON.stringify({ apiKey: 'key-of-credential-for-row-inference' }));
    });

    it("still reads a binding on the model's only row for the vendor", async () => {
        h.state.rows = [DEVELOPER_ROW];
        h.state.bound.add(DEVELOPER_ROW.ID);

        expect(runner.HasCredentials(MODEL)).toBe(true);
        expect(await runner.Resolve(MODEL)).toBe(JSON.stringify({ apiKey: 'key-of-credential-for-row-developer' }));
    });

    it("ignores a binding on another model's row for the same vendor", async () => {
        h.state.rows = [DEVELOPER_ROW, INFERENCE_ROW, OTHER_MODEL_ROW];
        h.state.bound.add(OTHER_MODEL_ROW.ID);

        expect(runner.HasCredentials(MODEL)).toBe(false);
        expect(await runner.Resolve(MODEL)).toBe('');
    });

    it('ignores a binding on an inactive row', async () => {
        h.state.rows = [DEVELOPER_ROW, { ...INFERENCE_ROW, Status: 'Inactive' }];
        h.state.bound.add(INFERENCE_ROW.ID);

        expect(runner.HasCredentials(MODEL)).toBe(false);
        expect(await runner.Resolve(MODEL)).toBe('');
    });
});
