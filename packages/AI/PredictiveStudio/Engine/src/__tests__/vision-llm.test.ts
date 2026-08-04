import { describe, it, expect } from 'vitest';
import type { ChatMessageContentBlock } from '@memberjunction/ai';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { FeatureStepGraph, SourceBinding, LeakageGuard, VisionLLMFeatureStep } from '@memberjunction/predictive-studio-core';
import {
  FeatureAssemblyExecutor,
  type FeatureAssemblyParams,
  type IFeatureDataAccess,
  type FetchRowsParams,
  type FetchRowsResult,
  type SourceRow,
  type IVisionPromptRunner,
  type VisionPromptResolver,
  VisionFeatureExtractor,
  buildVisionUserMessage,
  parseVisionOutput,
  readImageRef,
} from '../feature-assembly';

/**
 * Unit tests for the multimodal vision-LLM-as-feature step (plan §11 / PS-MM-1).
 * NO live model — the prompt runner is a fake implementing {@link IVisionPromptRunner}.
 */

/** Minimal in-memory data access (no DB). */
class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.rowsByEntity[params.EntityName];
    return rows ? { Success: true, Rows: rows } : { Success: false, Rows: [], ErrorMessage: `no fixture: ${params.EntityName}` };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

/**
 * A fake vision runner. Records the params it was called with and returns a
 * scripted structured result. `respond` maps the seen image ref → a result body.
 */
class FakeVisionRunner implements IVisionPromptRunner {
  public calls: AIPromptParams[] = [];
  constructor(private readonly respond: (imageRef: string | null, params: AIPromptParams) => AIPromptRunResult<unknown>) {}

  async ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
    this.calls.push(params);
    const imageRef = extractImageRefFromParams(params);
    return this.respond(imageRef, params) as AIPromptRunResult<T>;
  }
}

/** Pull the image_url block content out of the params' user turn (for fake assertions). */
function extractImageRefFromParams(params: AIPromptParams): string | null {
  const msg = params.conversationMessages?.[0];
  if (!msg || typeof msg.content === 'string') {
    return null;
  }
  const block = (msg.content as ChatMessageContentBlock[]).find((b) => b.type === 'image_url');
  return block?.content ?? null;
}

/** Build a successful structured result with a single named field. */
function structuredResult(field: string, value: string | number): AIPromptRunResult<unknown> {
  return {
    success: true,
    result: { [field]: value },
    rawResult: JSON.stringify({ [field]: value }),
    chatResult: { success: true } as AIPromptRunResult<unknown>['chatResult'],
  };
}

// A stub prompt entity — the fake runner never inspects it, so a cast-free
// placeholder object is fine for the resolver's return.
const stubPrompt = { Name: 'Vision: classify condition' } as unknown as AIPromptParams['prompt'];
const resolver: VisionPromptResolver = () => stubPrompt;

const noLeakGuard: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };
const sources: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Assets' }];

function visionStep(overrides: Partial<VisionLLMFeatureStep> = {}): VisionLLMFeatureStep {
  return {
    Id: 'v1',
    Kind: 'vision-llm',
    ImageColumn: 'photo_url',
    Prompt: { PromptRef: 'Vision: classify condition' },
    Output: { FeatureName: 'condition', Kind: 'category', AllowedCategories: ['good', 'damaged'] },
    ...overrides,
  };
}

describe('VisionFeatureExtractor — per-row extraction', () => {
  it('produces the expected category feature from a fake runner', async () => {
    const runner = new FakeVisionRunner((imageRef) =>
      structuredResult('condition', imageRef === 'http://img/a.png' ? 'damaged' : 'good'),
    );
    const extractor = new VisionFeatureExtractor(runner);

    const r1 = await extractor.extract(visionStep(), { ID: 'a', photo_url: 'http://img/a.png' }, stubPrompt);
    const r2 = await extractor.extract(visionStep(), { ID: 'b', photo_url: 'http://img/b.png' }, stubPrompt);

    expect(r1.value).toBe('damaged');
    expect(r2.value).toBe('good');
    // The image rode on a multimodal image_url content block.
    expect(extractImageRefFromParams(runner.calls[0])).toBe('http://img/a.png');
  });

  it('parses a scalar output into a number', async () => {
    const runner = new FakeVisionRunner(() => structuredResult('item_count', '7'));
    const extractor = new VisionFeatureExtractor(runner);
    const step = visionStep({ Output: { FeatureName: 'item_count', Kind: 'scalar' } });
    const r = await extractor.extract(step, { ID: 'a', photo_url: 'data:image/png;base64,AAAA' }, stubPrompt);
    expect(r.value).toBe(7);
  });

  it('coerces an out-of-set category to null (closed allowed set)', () => {
    const out = parseVisionOutput(structuredResult('condition', 'pristine'), {
      FeatureName: 'condition',
      Kind: 'category',
      AllowedCategories: ['good', 'damaged'],
    });
    expect(out).toBeNull();
  });

  it('parses from rawResult JSON when no structured result object is present', () => {
    const res: AIPromptRunResult<unknown> = {
      success: true,
      rawResult: JSON.stringify({ condition: 'good' }),
      chatResult: { success: true } as AIPromptRunResult<unknown>['chatResult'],
    };
    expect(parseVisionOutput(res, { FeatureName: 'condition', Kind: 'category' })).toBe('good');
  });

  it('returns null when the run was unsuccessful', () => {
    const res: AIPromptRunResult<unknown> = { success: false, chatResult: { success: false } as AIPromptRunResult<unknown>['chatResult'] };
    expect(parseVisionOutput(res, { FeatureName: 'condition', Kind: 'category' })).toBeNull();
  });

  it('buildVisionUserMessage includes the inline prompt, instruction, and image block', () => {
    const msg = buildVisionUserMessage('http://img/x.png', { FeatureName: 'condition', Kind: 'category', AllowedCategories: ['good', 'damaged'] }, 'Look at the asset.');
    const blocks = msg.content as ChatMessageContentBlock[];
    expect(msg.role).toBe('user');
    expect(blocks.some((b) => b.type === 'image_url' && b.content === 'http://img/x.png')).toBe(true);
    expect(blocks.some((b) => b.type === 'text' && b.content === 'Look at the asset.')).toBe(true);
    // Instruction enumerates the allowed categories.
    expect(blocks.some((b) => b.type === 'text' && b.content.includes('good, damaged'))).toBe(true);
  });

  it('readImageRef returns null for null / blank values', () => {
    expect(readImageRef({ ID: 'a', photo_url: null }, 'photo_url')).toBeNull();
    expect(readImageRef({ ID: 'a', photo_url: '   ' }, 'photo_url')).toBeNull();
    expect(readImageRef({ ID: 'a' }, 'photo_url')).toBeNull();
    expect(readImageRef({ ID: 'a', photo_url: 'http://x' }, 'photo_url')).toBe('http://x');
  });
});

describe('FeatureAssemblyExecutor — vision-llm step integration', () => {
  function assembleWith(params: Partial<FeatureAssemblyParams>, runner?: IVisionPromptRunner) {
    const assets: SourceRow[] = (params.records as SourceRow[]) ?? [];
    const dataAccess = new InMemoryDataAccess({ Assets: assets });
    const steps: FeatureStepGraph = { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }, visionStep()] };
    const full: FeatureAssemblyParams = {
      targetEntityName: 'Assets',
      records: assets,
      sources,
      steps,
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      dataAccess,
      visionRunner: runner,
      visionPromptResolver: runner ? resolver : undefined,
      ...params,
    };
    return new FeatureAssemblyExecutor().assemble(full);
  }

  it('assembles a small pipeline with one vision step end-to-end', async () => {
    const runner = new FakeVisionRunner((imageRef) =>
      structuredResult('condition', imageRef === 'http://img/a.png' ? 'damaged' : 'good'),
    );
    const result = await assembleWith(
      {
        records: [
          { ID: 'a', tenure: 5, photo_url: 'http://img/a.png' },
          { ID: 'b', tenure: 9, photo_url: 'http://img/b.png' },
        ],
      },
      runner,
    );

    // Schema: select column, then the vision category column.
    expect(result.featureSchema.map((s) => s.Name)).toEqual(['tenure', 'condition']);
    expect(result.featureSchema.find((s) => s.Name === 'condition')?.Kind).toBe('categorical');
    expect(result.matrix.columns).toEqual(['tenure', 'condition']);
    expect(result.matrix.rows[0]).toEqual([5, 'damaged']);
    expect(result.matrix.rows[1]).toEqual([9, 'good']);
    // It produces a RAW column (no preprocessing op — exempt from fit-once/apply).
    expect(result.preprocessing).toEqual([]);
  });

  it('a scalar vision feature schema-types as numeric', async () => {
    const runner = new FakeVisionRunner(() => structuredResult('item_count', 4));
    const dataAccess = new InMemoryDataAccess({ Assets: [{ ID: 'a', photo_url: 'http://img/a.png' }] });
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Assets',
      records: [{ ID: 'a', photo_url: 'http://img/a.png' }],
      sources,
      steps: { Steps: [visionStep({ Output: { FeatureName: 'item_count', Kind: 'scalar' } })] },
      asOf: { Mode: 'none' },
      leakageGuard: noLeakGuard,
      dataAccess,
      visionRunner: runner,
      visionPromptResolver: resolver,
    });
    expect(result.featureSchema).toEqual([{ Name: 'item_count', Kind: 'numeric' }]);
    expect(result.matrix.rows[0]).toEqual([4]);
  });

  it('handles a null/missing image field gracefully (null feature, no model call)', async () => {
    const runner = new FakeVisionRunner(() => structuredResult('condition', 'good'));
    const result = await assembleWith(
      {
        records: [
          { ID: 'a', tenure: 1, photo_url: null }, // missing image
          { ID: 'b', tenure: 2, photo_url: 'http://img/b.png' },
        ],
      },
      runner,
    );
    expect(result.matrix.rows[0]).toEqual([1, null]); // null image → null feature
    expect(result.matrix.rows[1]).toEqual([2, 'good']);
    // Only ONE model call — the null-image row short-circuited before invoking the runner.
    expect(runner.calls).toHaveLength(1);
  });

  it('vision-on-own-image PASSES the leakage guard (it is a property of the record)', async () => {
    // A deny-list on an UNRELATED field must not strip the vision feature; the
    // vision feature is derived from the row's own image and is allowed.
    const runner = new FakeVisionRunner(() => structuredResult('condition', 'damaged'));
    const dataAccess = new InMemoryDataAccess({ Assets: [{ ID: 'a', tenure: 5, leaky: 9, photo_url: 'http://img/a.png' }] });
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Assets',
      records: [{ ID: 'a', tenure: 5, leaky: 9, photo_url: 'http://img/a.png' }],
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure', 'leaky'] }, visionStep()] },
      asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: ['leaky'], SingleFeatureDominanceThreshold: 0.6 },
      dataAccess,
      visionRunner: runner,
      visionPromptResolver: resolver,
    });
    // leaky stripped; tenure + vision condition survive.
    expect(result.matrix.columns).toEqual(['tenure', 'condition']);
    expect(result.matrix.rows[0]).toEqual([5, 'damaged']);
  });

  it('respects an explicit deny-list ON the vision feature name (operator override)', async () => {
    const runner = new FakeVisionRunner(() => structuredResult('condition', 'damaged'));
    const dataAccess = new InMemoryDataAccess({ Assets: [{ ID: 'a', tenure: 5, photo_url: 'http://img/a.png' }] });
    const result = await new FeatureAssemblyExecutor().assemble({
      targetEntityName: 'Assets',
      records: [{ ID: 'a', tenure: 5, photo_url: 'http://img/a.png' }],
      sources,
      steps: { Steps: [{ Id: 's', Kind: 'select', Columns: ['tenure'] }, visionStep()] },
      asOf: { Mode: 'none' },
      leakageGuard: { DenyFields: ['condition'], SingleFeatureDominanceThreshold: 0.6 },
      dataAccess,
      visionRunner: runner,
      visionPromptResolver: resolver,
    });
    expect(result.matrix.columns).toEqual(['tenure']);
  });

  it('uses the image present on the as-of-resolved row (as-of semantics)', async () => {
    // The executor resolves records as-of their decision date; the vision step
    // reads the image from THAT row, never reaching forward in time. Here we feed
    // a record whose photo_url is the as-of-correct image and assert it's used.
    const runner = new FakeVisionRunner((imageRef) => structuredResult('condition', imageRef === 'asof-image.png' ? 'damaged' : 'good'));
    const result = await assembleWith(
      { records: [{ ID: 'a', tenure: 5, photo_url: 'asof-image.png', DecisionDate: '2026-03-01T00:00:00Z' }], asOf: { Mode: 'column', Column: 'DecisionDate' } },
      runner,
    );
    expect(result.matrix.rows[0]).toEqual([5, 'damaged']);
  });

  it('yields null vision values when NO runner is wired (no model call path)', async () => {
    const result = await assembleWith({ records: [{ ID: 'a', tenure: 5, photo_url: 'http://img/a.png' }] }); // no runner
    expect(result.matrix.columns).toEqual(['tenure', 'condition']);
    expect(result.matrix.rows[0]).toEqual([5, null]);
  });
});
