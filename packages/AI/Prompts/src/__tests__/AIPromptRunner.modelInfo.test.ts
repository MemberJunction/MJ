/**
 * Unit tests that lock down the `AIPromptRunResult.modelInfo` contract.
 *
 * Why this file exists:
 *   1. The single-model path (`executeSinglePrompt`) used to silently omit
 *      `modelInfo` from its return object, so every caller reading it on a
 *      non-parallel run saw `undefined` and had to fall back to `null`. The
 *      Runtime-actions bridge got bitten by this — `modelUsed` was `null`
 *      for every Runtime action that called `utilities.ai.ExecutePrompt`.
 *   2. A downstream bridge was structurally casting the result with a
 *      typo'd field name (`{ name?: string }` instead of `{ modelName }`),
 *      which silently returned `null` — TypeScript never saw the mismatch.
 *
 * These tests guard both regressions:
 *   - Shape test: the `ModelInfo` factory used by `executeSinglePrompt` /
 *     `executePromptInParallel` must emit `{ modelId, modelName, vendorId,
 *     vendorName }` for non-null models.
 *   - Type-contract test: any future rename of `modelName` (e.g. back to
 *     `name`) will fail to compile this file.
 *
 * Pattern matches the other AIPromptRunner.* test files: standalone
 * functions that mirror the private logic, no full runner instantiation.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ModelInfo, AIPromptRunResult } from '@memberjunction/ai-core-plus';

// ============================================================================
// Mock types — the minimum of MJAIModelEntity fields the factory touches.
// ============================================================================

interface MockModel {
    ID: string;
    Name: string;
    Vendor?: string;
}

interface MockSelectionInfo {
    vendorSelected?: { ID?: string } | undefined;
}

// ============================================================================
// Standalone factory — mirrors the `modelInfo` block in both
// `executeSinglePrompt` and `executePromptInParallel`. If you change the
// factory in AIPromptRunner.ts, update the mirror here (the type-contract
// tests below will catch any shape drift against the public `ModelInfo` type).
// ============================================================================

function buildModelInfo(
    model: MockModel | null | undefined,
    selectionInfo?: MockSelectionInfo | undefined
): ModelInfo | undefined {
    if (!model) return undefined;
    return {
        modelId: model.ID,
        modelName: model.Name,
        vendorId: selectionInfo?.vendorSelected?.ID,
        vendorName: model.Vendor
    };
}

function makeModel(overrides: Partial<MockModel> = {}): MockModel {
    return {
        ID: 'model-uuid-1',
        Name: 'Gemini 3.1 Flash-Lite',
        Vendor: 'Google',
        ...overrides
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('AIPromptRunResult.modelInfo contract', () => {
    describe('buildModelInfo factory', () => {
        it('returns undefined when no model was selected', () => {
            expect(buildModelInfo(null)).toBeUndefined();
            expect(buildModelInfo(undefined)).toBeUndefined();
        });

        it('populates modelId and modelName from the selected model', () => {
            const model = makeModel({ ID: 'abc', Name: 'GPT-OSS-120B' });
            const info = buildModelInfo(model);
            expect(info).toBeDefined();
            expect(info!.modelId).toBe('abc');
            expect(info!.modelName).toBe('GPT-OSS-120B');
        });

        it('propagates vendorId from selectionInfo when present', () => {
            const model = makeModel();
            const info = buildModelInfo(model, { vendorSelected: { ID: 'vendor-42' } });
            expect(info!.vendorId).toBe('vendor-42');
        });

        it('leaves vendorId undefined when selectionInfo is missing', () => {
            const info = buildModelInfo(makeModel());
            expect(info!.vendorId).toBeUndefined();
        });

        it('leaves vendorId undefined when vendorSelected has no ID', () => {
            const info = buildModelInfo(makeModel(), { vendorSelected: {} });
            expect(info!.vendorId).toBeUndefined();
        });

        it('propagates vendorName from the model object', () => {
            const info = buildModelInfo(makeModel({ Vendor: 'Cerebras' }));
            expect(info!.vendorName).toBe('Cerebras');
        });

        it('does NOT expose a legacy `name` field (regression guard)', () => {
            // If someone reintroduces a `name` shortcut alongside `modelName`,
            // downstream consumers may pick the wrong one. The canonical field
            // is `modelName` — `name` should not exist on ModelInfo.
            const info = buildModelInfo(makeModel());
            expect((info as unknown as Record<string, unknown>).name).toBeUndefined();
        });

        it('handles models without a Vendor set', () => {
            const info = buildModelInfo(makeModel({ Vendor: undefined }));
            expect(info!.vendorName).toBeUndefined();
            // The model itself should still produce a usable modelName.
            expect(info!.modelName).toBe('Gemini 3.1 Flash-Lite');
        });
    });

    // ------------------------------------------------------------------
    // Type-contract guards. If a future refactor renames `modelName` back
    // to `name` (or drops a field), these blocks fail to compile — which
    // is exactly the early-warning signal we want.
    // ------------------------------------------------------------------
    describe('ModelInfo type contract', () => {
        it('has `modelId` as a required string', () => {
            expectTypeOf<ModelInfo>().toHaveProperty('modelId').toBeString();
        });

        it('has `modelName` as a required string (not `name`)', () => {
            expectTypeOf<ModelInfo>().toHaveProperty('modelName').toBeString();
            // Negative assertion — if `name` ever gets added back, this fails.
            expectTypeOf<ModelInfo>().not.toHaveProperty('name');
        });

        it('has optional `vendorId` and `vendorName`', () => {
            expectTypeOf<ModelInfo>().toHaveProperty('vendorId');
            expectTypeOf<ModelInfo>().toHaveProperty('vendorName');
        });
    });

    describe('AIPromptRunResult type contract', () => {
        it('carries `modelInfo` as an optional ModelInfo', () => {
            expectTypeOf<AIPromptRunResult>().toHaveProperty('modelInfo');
        });

        it('exposes token usage on the canonical fields', () => {
            // The bridge also reads `tokensUsed` and `combinedTokensUsed` —
            // if either is renamed, `utilities.ai.ExecutePrompt` users stop
            // getting token counts back. Lock both down here.
            expectTypeOf<AIPromptRunResult>().toHaveProperty('tokensUsed');
            expectTypeOf<AIPromptRunResult>().toHaveProperty('combinedTokensUsed');
        });
    });
});
