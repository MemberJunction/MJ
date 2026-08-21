// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same reasoning as RemoteBrowserSnapshot.test.ts: vitest's esbuild transform does not apply
// `emitDecoratorMetadata`, so the decorated resolver cannot be imported for its GraphQL schema. This
// exercises the plain TS selection logic, which is where all four defects lived.
vi.mock('type-graphql', () => {
  const noopDecorator = () => () => undefined;
  return {
    Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
    ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
    Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
    Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
    createUnionType: () => class {},
    Float: class {}, Int: class {}, ID: class {},
  };
});

import { AIEngine } from '@memberjunction/aiengine';
import { RunAIPromptResolver } from '../resolvers/RunAIPromptResolver.js';

// ──────────────────────────────────────────────────────────────────────────────
// #3532 — ExecuteSimplePrompt could not run at all: four defects stacked, each reporting as
// something unrelated to its cause. DriverClass and APIName moved to the model's VENDOR, so
// selecting a model without also selecting a vendor yields something unrunnable — and the errors
// blamed API keys for every one of the causes.
// ──────────────────────────────────────────────────────────────────────────────

const LLM_TYPE_ID = 'type-llm';
const OTHER_TYPE_ID = 'type-embedding';
const INFERENCE_VENDOR_TYPE = 'vt-inference';

interface FakeVendor {
  ModelID: string; VendorID: string; Status: string; Priority: number;
  DriverClass: string | null; APIName: string | null; TypeID: string;
}
interface FakeModel {
  ID: string; Name: string; IsActive: boolean; AIModelTypeID: string; PowerRank: number;
  AIModelType?: string; APIName?: string | null; DriverClass?: string | null;
  APINameOrName: string; ModelVendors: FakeVendor[];
}

const model = (over: Partial<FakeModel> = {}): FakeModel => {
  const base: FakeModel = {
    ID: 'm1', Name: 'Gemini 3.1 Flash', IsActive: true, AIModelTypeID: LLM_TYPE_ID, PowerRank: 5,
    // Deliberately ABSENT: this virtual column is not populated on the engine's cached objects, and
    // reading it directly is defect 2. Tests that set it are testing the fallback.
    AIModelType: undefined,
    // Deliberately null: both moved to the vendor (defects 3 and 4).
    APIName: null, DriverClass: null,
    APINameOrName: 'Gemini 3.1 Flash',
    ModelVendors: [],
    ...over,
  };
  return base;
};

const vendor = (over: Partial<FakeVendor> = {}): FakeVendor => ({
  ModelID: 'm1', VendorID: 'v1', Status: 'Active', Priority: 10,
  DriverClass: 'GeminiLLM', APIName: 'gemini-3.1-flash', TypeID: INFERENCE_VENDOR_TYPE,
  ...over,
});

/** Points AIEngine.Instance at a fixed model set, with the vendor-type predicate MJ itself uses. */
function stubEngine(models: FakeModel[]): void {
  const byModel = new Map<string, FakeVendor[]>();
  for (const m of models) {
    byModel.set(m.ID, m.ModelVendors);
  }
  const fake = {
    Config: vi.fn(async () => undefined),
    Models: models,
    ModelTypesByID: new Map([
      [LLM_TYPE_ID, { ID: LLM_TYPE_ID, Name: 'LLM' }],
      [OTHER_TYPE_ID, { ID: OTHER_TYPE_ID, Name: 'Embeddings' }],
    ]),
    ModelVendorsByModelID: byModel,
    IsInferenceProvider: (v: FakeVendor) => v.TypeID === INFERENCE_VENDOR_TYPE,
  };
  vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue(fake as unknown as AIEngine);
}

/** The private selection method under test. */
interface SelectorInternals {
  selectModelForSimplePrompt(
    preferred: string[] | undefined, power: string, user: unknown,
  ): Promise<{ Model: { Name: string }; DriverClass: string; APIName: string }>;
}
const select = (r: RunAIPromptResolver) => r as unknown as SelectorInternals;

describe('selectModelForSimplePrompt (#3532)', () => {
  let resolver: RunAIPromptResolver;

  beforeEach(() => {
    vi.restoreAllMocks();
    resolver = new RunAIPromptResolver();
    process.env['AI_VENDOR_API_KEY__GEMINILLM'] = 'sk-gemini';
  });

  it('finds the LLM through its TYPE ID, not the unpopulated AIModelType column', async () => {
    // Defect 2: the filter read `m.AIModelType`, a view column absent from the engine's objects, so
    // the candidate list came out empty and the caller was told the problem was API KEYS.
    stubEngine([model({ ModelVendors: [vendor()] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.Model.Name).toBe('Gemini 3.1 Flash');
  });

  it('takes the driver class and wire name from the VENDOR', async () => {
    // Defects 3 and 4. Reading them off the model gives null and an empty `chatParams.model`, which
    // the provider answers with a 404 carrying an empty error message.
    stubEngine([model({ ModelVendors: [vendor({ DriverClass: 'GeminiLLM', APIName: 'gemini-3.1-flash' })] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.DriverClass).toBe('GeminiLLM');
    expect(choice.APIName).toBe('gemini-3.1-flash');
  });

  it('falls back to the model\'s own name when the vendor sets no APIName', async () => {
    stubEngine([model({ ModelVendors: [vendor({ APIName: null })] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.APIName).toBe('Gemini 3.1 Flash');
  });

  it('never picks a vendor that is not an inference provider', async () => {
    // A vendor can be attached as the model's DEVELOPER without serving an endpoint. Treating those
    // as runnable gives you a driver that instantiates and then cannot answer.
    process.env['AI_VENDOR_API_KEY__DEVELOPERONLYLLM'] = 'sk-dev';
    stubEngine([model({ ModelVendors: [
      vendor({ DriverClass: 'DeveloperOnlyLLM', TypeID: 'vt-developer', Priority: 99 }),
      vendor({ DriverClass: 'GeminiLLM', Priority: 1 }),
    ] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.DriverClass).toBe('GeminiLLM');
    delete process.env['AI_VENDOR_API_KEY__DEVELOPERONLYLLM'];
  });

  it('prefers the highest-priority vendor whose key actually resolves', async () => {
    stubEngine([model({ ModelVendors: [
      vendor({ DriverClass: 'NoKeyLLM', Priority: 99 }),   // higher priority, no key in the env
      vendor({ DriverClass: 'GeminiLLM', Priority: 10 }),
    ] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.DriverClass).toBe('GeminiLLM');
  });

  it('picks the higher-PRIORITY vendor when both could serve the model', async () => {
    // Two working providers for one model is the normal case (a model available direct and via a
    // gateway). Priority is the deployment saying which it wants; ignoring it means the answer
    // depends on row order, so the same request can hit a different provider after a data edit.
    process.env['AI_VENDOR_API_KEY__PRIMARYLLM'] = 'sk-primary';
    process.env['AI_VENDOR_API_KEY__SECONDARYLLM'] = 'sk-secondary';
    stubEngine([model({ ModelVendors: [
      vendor({ DriverClass: 'SecondaryLLM', APIName: 'via-gateway', Priority: 1 }),
      vendor({ DriverClass: 'PrimaryLLM', APIName: 'direct', Priority: 99 }),
    ] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.DriverClass).toBe('PrimaryLLM');
    expect(choice.APIName).toBe('direct');
    delete process.env['AI_VENDOR_API_KEY__PRIMARYLLM'];
    delete process.env['AI_VENDOR_API_KEY__SECONDARYLLM'];
  });

  it('skips a vendor row with no driver class instead of throwing', async () => {
    // Defect 1's blast radius: one malformed row used to take out prompt execution entirely.
    stubEngine([model({ ModelVendors: [vendor({ DriverClass: null, Priority: 99 }), vendor()] })]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.DriverClass).toBe('GeminiLLM');
  });

  it('ignores inactive models, inactive vendors and non-LLM types', async () => {
    stubEngine([
      model({ ID: 'm-inactive', Name: 'Inactive', IsActive: false, ModelVendors: [vendor({ ModelID: 'm-inactive' })] }),
      model({ ID: 'm-embed', Name: 'Embedder', AIModelTypeID: OTHER_TYPE_ID, ModelVendors: [vendor({ ModelID: 'm-embed' })] }),
      model({ ID: 'm-dead', Name: 'Dead Vendor', ModelVendors: [vendor({ ModelID: 'm-dead', Status: 'Deprecated' })] }),
      model({ ID: 'm-ok', Name: 'Live One', ModelVendors: [vendor({ ModelID: 'm-ok' })] }),
    ]);

    const choice = await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(choice.Model.Name).toBe('Live One');
  });

  it('honours a preferred model by name or by the vendor wire name', async () => {
    process.env['AI_VENDOR_API_KEY__OPENAILLM'] = 'sk-openai';
    stubEngine([
      model({ ID: 'm-a', Name: 'Gemini 3.1 Flash', PowerRank: 9, ModelVendors: [vendor({ ModelID: 'm-a' })] }),
      model({ ID: 'm-b', Name: 'GPT-5', PowerRank: 1, ModelVendors: [vendor({ ModelID: 'm-b', DriverClass: 'OpenAILLM', APIName: 'gpt-5' })] }),
    ]);

    expect((await select(resolver).selectModelForSimplePrompt(['GPT-5'], 'highest', {})).Model.Name).toBe('GPT-5');
    expect((await select(resolver).selectModelForSimplePrompt(['gpt-5'], 'highest', {})).Model.Name).toBe('GPT-5');
    delete process.env['AI_VENDOR_API_KEY__OPENAILLM'];
  });

  describe('the error says WHICH wall was hit — the expensive part of the original bug', () => {
    it('no LLM models at all', async () => {
      stubEngine([model({ AIModelTypeID: OTHER_TYPE_ID, ModelVendors: [vendor()] })]);

      await expect(select(resolver).selectModelForSimplePrompt(undefined, 'highest', {}))
        .rejects.toThrow(/No Active LLM models/i);
    });

    it('LLMs exist but none has an Active inference vendor', async () => {
      stubEngine([model({ ModelVendors: [vendor({ Status: 'Inactive' })] })]);

      await expect(select(resolver).selectModelForSimplePrompt(undefined, 'highest', {}))
        .rejects.toThrow(/inference-provider vendor/i);
    });

    it('vendors exist but no key resolves — and only THEN is it about keys', async () => {
      // The old message said this for all three causes, which is what sent people to their
      // environment for a metadata problem. A driver class with no env var anywhere — AIAPIKeys
      // caches resolved keys process-wide, so deleting an env var another test set proves nothing.
      stubEngine([model({ ModelVendors: [vendor({ DriverClass: 'NoKeyAnywhereLLM' })] })]);

      await expect(select(resolver).selectModelForSimplePrompt(undefined, 'highest', {}))
        .rejects.toThrow(/AI_VENDOR_API_KEY__/);
    });
  });

  it('does not write the winning vendor back onto the cached model entity', async () => {
    // Those entities are the engine's process-wide cache. Stamping the driver onto one would leak
    // into every other caller and make the next request's answer depend on this one's.
    const m = model({ ModelVendors: [vendor()] });
    stubEngine([m]);

    await select(resolver).selectModelForSimplePrompt(undefined, 'highest', {});

    expect(m.DriverClass).toBeNull();
    expect(m.APIName).toBeNull();
  });
});
