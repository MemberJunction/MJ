/**
 * Unit tests for the RequireSpecificModels / power-matched fallback feature.
 *
 * When SelectionStrategy='Specific' and RequireSpecificModels is false (default),
 * the system appends fallback candidates from the global model pool sorted by
 * proximity to the configured models' weighted-average power rank. This ensures
 * graceful degradation when configured models lack valid API credentials, while
 * selecting fallback models of similar capability.
 *
 * Tests cover:
 * - computeTargetPowerRank (weighted average calculation)
 * - sortByPowerProximity (proximity-based sorting)
 * - appendPowerMatchedFallbackCandidates (integration of both)
 * - buildCandidatesForSpecificStrategy behavior changes
 * - Edge cases (empty lists, zero power ranks, single model, etc.)
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface MockModel {
  ID: string;
  Name: string;
  PowerRank: number;
  IsActive: boolean;
  AIModelTypeID: string | null;
  DriverClass: string;
  APIName: string;
  SupportsEffortLevel: boolean;
}

interface MockPromptModel {
  ID: string;
  PromptID: string;
  ModelID: string;
  Priority: number;
  Status: 'Active' | 'Preview' | 'Deprecated' | 'Inactive';
  ConfigurationID: string | null;
  VendorID: string | null;
}

interface MockModelVendor {
  ModelID: string;
  VendorID: string;
  Vendor: string;
  DriverClass: string;
  APIName: string;
  Status: string;
  Priority: number;
  SupportsEffortLevel: boolean;
  VendorTypeID: string; // inference provider type
}

interface MockCandidate {
  modelId: string;
  modelName: string;
  powerRank: number;
  priority: number;
  source: 'explicit' | 'prompt-model' | 'model-type' | 'power-rank' | 'power-match-fallback';
}

// ============================================================================
// Standalone implementations mirroring AIPromptRunner methods
// ============================================================================

/**
 * Mirrors AIPromptRunner.computeTargetPowerRank
 * Weighted average of configured models' power ranks by priority.
 */
function computeTargetPowerRank(
  promptModels: MockPromptModel[],
  allModels: MockModel[]
): number {
  if (promptModels.length === 0) return 0;

  const modelsWithPower = promptModels.map(pm => {
    const model = allModels.find(m => m.ID === pm.ModelID);
    return { powerRank: model?.PowerRank ?? 0, priority: pm.Priority || 1 };
  });

  const totalWeight = modelsWithPower.reduce((sum, m) => sum + m.priority, 0);
  if (totalWeight === 0) {
    return Math.round(
      modelsWithPower.reduce((sum, m) => sum + m.powerRank, 0) / modelsWithPower.length
    );
  }

  const weightedSum = modelsWithPower.reduce(
    (sum, m) => sum + m.powerRank * m.priority,
    0
  );
  return Math.round(weightedSum / totalWeight);
}

/**
 * Mirrors AIPromptRunner.sortByPowerProximity
 * Sorts models by closeness to target, tie-break by higher power.
 */
function sortByPowerProximity(
  models: MockModel[],
  targetPowerRank: number
): MockModel[] {
  return [...models].sort((a, b) => {
    const distA = Math.abs((a.PowerRank ?? 0) - targetPowerRank);
    const distB = Math.abs((b.PowerRank ?? 0) - targetPowerRank);
    if (distA !== distB) return distA - distB;
    return (b.PowerRank ?? 0) - (a.PowerRank ?? 0);
  });
}

/**
 * Mirrors AIPromptRunner.appendPowerMatchedFallbackCandidates
 * Appends fallback candidates from the global pool, sorted by power proximity,
 * with priorities below any specific candidate.
 */
function appendPowerMatchedFallbackCandidates(
  candidates: MockCandidate[],
  promptModelTypeID: string | null,
  configuredPromptModels: MockPromptModel[],
  allModels: MockModel[]
): void {
  const targetPowerRank = computeTargetPowerRank(configuredPromptModels, allModels);

  const existingModelIds = new Set(candidates.map(c => c.modelId));
  const fallbackPool = allModels.filter(
    m =>
      m.IsActive &&
      !existingModelIds.has(m.ID) &&
      (!promptModelTypeID || m.AIModelTypeID === promptModelTypeID)
  );

  if (fallbackPool.length === 0) return;

  const sorted = sortByPowerProximity(fallbackPool, targetPowerRank);

  const lowestSpecificPriority =
    candidates.length > 0 ? Math.min(...candidates.map(c => c.priority)) : 1000;
  const fallbackBasePriority = lowestSpecificPriority - 100;

  sorted.forEach((model, index) => {
    candidates.push({
      modelId: model.ID,
      modelName: model.Name,
      powerRank: model.PowerRank,
      priority: fallbackBasePriority - index * 10,
      source: 'power-match-fallback',
    });
  });
}

/**
 * Simulates the full buildCandidatesForSpecificStrategy flow
 * including the RequireSpecificModels fallback behavior.
 */
function buildCandidatesForSpecificStrategy(
  promptName: string,
  promptModelTypeID: string | null,
  requireSpecificModels: boolean,
  promptModels: MockPromptModel[],
  allModels: MockModel[]
): MockCandidate[] {
  // Build candidates from prompt models (simplified — real code also handles vendors)
  const candidates: MockCandidate[] = promptModels
    .filter(pm => pm.Status === 'Active' || pm.Status === 'Preview')
    .sort((a, b) => (b.Priority || 0) - (a.Priority || 0))
    .map((pm, index) => {
      const model = allModels.find(m => m.ID === pm.ModelID);
      return {
        modelId: pm.ModelID,
        modelName: model?.Name || 'Unknown',
        powerRank: model?.PowerRank ?? 0,
        priority: 10000 - index * 10,
        source: 'prompt-model' as const,
      };
    });

  // If RequireSpecificModels and no candidates, throw
  if (candidates.length === 0 && requireSpecificModels) {
    throw new Error(
      `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${promptName}".`
    );
  }

  // Append fallback candidates when RequireSpecificModels is false
  if (!requireSpecificModels) {
    appendPowerMatchedFallbackCandidates(
      candidates,
      promptModelTypeID,
      promptModels.filter(pm => pm.Status === 'Active' || pm.Status === 'Preview'),
      allModels
    );
  }

  // Final check — even with fallback, if still empty, throw
  if (candidates.length === 0) {
    throw new Error(
      `SelectionStrategy is 'Specific' but no valid AIPromptModel candidates found for prompt "${promptName}".`
    );
  }

  return candidates;
}

// ============================================================================
// Test Data Factories
// ============================================================================

function createModel(overrides: Partial<MockModel> & { ID: string; Name: string }): MockModel {
  return {
    PowerRank: 0,
    IsActive: true,
    AIModelTypeID: 'llm-type',
    DriverClass: 'TestLLM',
    APIName: 'test-model',
    SupportsEffortLevel: false,
    ...overrides,
  };
}

function createPromptModel(
  overrides: Partial<MockPromptModel> & { ModelID: string }
): MockPromptModel {
  return {
    ID: `pm-${overrides.ModelID}`,
    PromptID: 'prompt-1',
    Priority: 1,
    Status: 'Active',
    ConfigurationID: null,
    VendorID: null,
    ...overrides,
  };
}

// ============================================================================
// Tests: computeTargetPowerRank
// ============================================================================

describe('computeTargetPowerRank', () => {
  const models: MockModel[] = [
    createModel({ ID: 'model-low', Name: 'Low Power', PowerRank: 5 }),
    createModel({ ID: 'model-mid', Name: 'Mid Power', PowerRank: 50 }),
    createModel({ ID: 'model-high', Name: 'High Power', PowerRank: 100 }),
  ];

  it('returns 0 for empty prompt models list', () => {
    expect(computeTargetPowerRank([], models)).toBe(0);
  });

  it('returns exact power rank for a single configured model', () => {
    const promptModels = [createPromptModel({ ModelID: 'model-mid', Priority: 1 })];
    expect(computeTargetPowerRank(promptModels, models)).toBe(50);
  });

  it('computes simple average when all priorities are equal', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-low', Priority: 1 }),
      createPromptModel({ ModelID: 'model-high', Priority: 1 }),
    ];
    // (5 * 1 + 100 * 1) / (1 + 1) = 52.5 → 53
    expect(computeTargetPowerRank(promptModels, models)).toBe(53);
  });

  it('weights by priority — higher priority model dominates', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-low', Priority: 1 }),
      createPromptModel({ ModelID: 'model-high', Priority: 10 }),
    ];
    // (5 * 1 + 100 * 10) / (1 + 10) = 1005 / 11 ≈ 91
    expect(computeTargetPowerRank(promptModels, models)).toBe(91);
  });

  it('weights by priority — lower priority model dominates when it has higher weight', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-low', Priority: 10 }),
      createPromptModel({ ModelID: 'model-high', Priority: 1 }),
    ];
    // (5 * 10 + 100 * 1) / (10 + 1) = 150 / 11 ≈ 14
    expect(computeTargetPowerRank(promptModels, models)).toBe(14);
  });

  it('treats null/zero priority as 1 for weighting', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-low', Priority: 0 }),
      createPromptModel({ ModelID: 'model-high', Priority: 0 }),
    ];
    // Both become priority=1 internally: (5 + 100) / 2 = 52.5 → 53
    // But since totalWeight=0, uses simple average path: (5 + 100) / 2 = 52.5 → 53
    expect(computeTargetPowerRank(promptModels, models)).toBe(53);
  });

  it('handles model not found in allModels gracefully (treats as PowerRank 0)', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-mid', Priority: 1 }),
      createPromptModel({ ModelID: 'nonexistent-model', Priority: 1 }),
    ];
    // (50 * 1 + 0 * 1) / 2 = 25
    expect(computeTargetPowerRank(promptModels, models)).toBe(25);
  });

  it('handles three models with different priorities', () => {
    const promptModels = [
      createPromptModel({ ModelID: 'model-low', Priority: 3 }),
      createPromptModel({ ModelID: 'model-mid', Priority: 2 }),
      createPromptModel({ ModelID: 'model-high', Priority: 1 }),
    ];
    // (5*3 + 50*2 + 100*1) / (3+2+1) = (15 + 100 + 100) / 6 = 215 / 6 ≈ 36
    expect(computeTargetPowerRank(promptModels, models)).toBe(36);
  });
});

// ============================================================================
// Tests: sortByPowerProximity
// ============================================================================

describe('sortByPowerProximity', () => {
  const models: MockModel[] = [
    createModel({ ID: 'a', Name: 'PowerRank 10', PowerRank: 10 }),
    createModel({ ID: 'b', Name: 'PowerRank 50', PowerRank: 50 }),
    createModel({ ID: 'c', Name: 'PowerRank 90', PowerRank: 90 }),
    createModel({ ID: 'd', Name: 'PowerRank 30', PowerRank: 30 }),
    createModel({ ID: 'e', Name: 'PowerRank 70', PowerRank: 70 }),
  ];

  it('sorts closest to target first', () => {
    const sorted = sortByPowerProximity(models, 50);
    // b(50)=dist 0, e(70)=dist 20, d(30)=dist 20 (tie-break: higher power first),
    // c(90)=dist 40, a(10)=dist 40 (tie-break: higher power first)
    expect(sorted.map(m => m.ID)).toEqual(['b', 'e', 'd', 'c', 'a']);
  });

  it('when target is 0, lowest power ranks come first', () => {
    const sorted = sortByPowerProximity(models, 0);
    expect(sorted[0].ID).toBe('a'); // PowerRank 10 closest to 0
    expect(sorted[1].ID).toBe('d'); // PowerRank 30
  });

  it('when target is 100, highest power ranks come first', () => {
    const sorted = sortByPowerProximity(models, 100);
    expect(sorted[0].ID).toBe('c'); // PowerRank 90 closest to 100
    expect(sorted[1].ID).toBe('e'); // PowerRank 70
  });

  it('tie-breaks equidistant models by preferring higher power', () => {
    // Target 50: model at 30 (dist=20) and model at 70 (dist=20) are equidistant
    const sorted = sortByPowerProximity(models, 50);
    const dist20Models = sorted.filter(
      m => Math.abs(m.PowerRank - 50) === 20
    );
    // PowerRank 70 should come before PowerRank 30 (higher power preferred in ties)
    expect(dist20Models[0].PowerRank).toBe(70);
    expect(dist20Models[1].PowerRank).toBe(30);
  });

  it('handles single model', () => {
    const single = [createModel({ ID: 'x', Name: 'Solo', PowerRank: 42 })];
    const sorted = sortByPowerProximity(single, 99);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].ID).toBe('x');
  });

  it('handles empty model list', () => {
    const sorted = sortByPowerProximity([], 50);
    expect(sorted).toHaveLength(0);
  });

  it('handles all models at same power rank', () => {
    const sameRank = [
      createModel({ ID: 'x', Name: 'A', PowerRank: 25 }),
      createModel({ ID: 'y', Name: 'B', PowerRank: 25 }),
      createModel({ ID: 'z', Name: 'C', PowerRank: 25 }),
    ];
    const sorted = sortByPowerProximity(sameRank, 50);
    expect(sorted).toHaveLength(3);
    // All equidistant, all same power — order is stable
  });

  it('does not mutate the original array', () => {
    const original = [...models];
    sortByPowerProximity(models, 50);
    expect(models.map(m => m.ID)).toEqual(original.map(m => m.ID));
  });
});

// ============================================================================
// Tests: appendPowerMatchedFallbackCandidates
// ============================================================================

describe('appendPowerMatchedFallbackCandidates', () => {
  const allModels: MockModel[] = [
    createModel({ ID: 'configured-1', Name: 'Configured Model A', PowerRank: 40 }),
    createModel({ ID: 'configured-2', Name: 'Configured Model B', PowerRank: 60 }),
    createModel({ ID: 'fallback-low', Name: 'Fallback Low', PowerRank: 10 }),
    createModel({ ID: 'fallback-mid', Name: 'Fallback Mid', PowerRank: 45 }),
    createModel({ ID: 'fallback-high', Name: 'Fallback High', PowerRank: 95 }),
    createModel({ ID: 'inactive', Name: 'Inactive Model', PowerRank: 50, IsActive: false }),
    createModel({ ID: 'wrong-type', Name: 'Wrong Type', PowerRank: 50, AIModelTypeID: 'image-type' }),
  ];

  it('appends fallback models sorted by power proximity to configured models', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 10000, source: 'prompt-model' },
      { modelId: 'configured-2', modelName: 'B', powerRank: 60, priority: 9990, source: 'prompt-model' },
    ];
    const promptModels = [
      createPromptModel({ ModelID: 'configured-1', Priority: 1 }),
      createPromptModel({ ModelID: 'configured-2', Priority: 1 }),
    ];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    // Should have original 2 + 3 fallback (excluding inactive and wrong-type)
    expect(candidates).toHaveLength(5);

    // Fallback candidates should all have source 'power-match-fallback'
    const fallbacks = candidates.filter(c => c.source === 'power-match-fallback');
    expect(fallbacks).toHaveLength(3);

    // Target power rank = (40 + 60) / 2 = 50
    // fallback-mid (45): dist=5, fallback-low (10): dist=40, fallback-high (95): dist=45
    expect(fallbacks[0].modelId).toBe('fallback-mid');
    expect(fallbacks[1].modelId).toBe('fallback-low');
    expect(fallbacks[2].modelId).toBe('fallback-high');
  });

  it('fallback candidates have lower priority than all specific candidates', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 500, source: 'prompt-model' },
    ];
    const promptModels = [createPromptModel({ ModelID: 'configured-1', Priority: 1 })];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    const fallbacks = candidates.filter(c => c.source === 'power-match-fallback');
    const lowestSpecific = Math.min(
      ...candidates.filter(c => c.source === 'prompt-model').map(c => c.priority)
    );

    for (const fb of fallbacks) {
      expect(fb.priority).toBeLessThan(lowestSpecific);
    }
  });

  it('excludes inactive models from fallback pool', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 10000, source: 'prompt-model' },
    ];
    const promptModels = [createPromptModel({ ModelID: 'configured-1', Priority: 1 })];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    const fallbackIds = candidates
      .filter(c => c.source === 'power-match-fallback')
      .map(c => c.modelId);
    expect(fallbackIds).not.toContain('inactive');
  });

  it('excludes models that do not match prompt AIModelTypeID', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 10000, source: 'prompt-model' },
    ];
    const promptModels = [createPromptModel({ ModelID: 'configured-1', Priority: 1 })];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    const fallbackIds = candidates
      .filter(c => c.source === 'power-match-fallback')
      .map(c => c.modelId);
    expect(fallbackIds).not.toContain('wrong-type');
  });

  it('includes all model types when promptModelTypeID is null', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 10000, source: 'prompt-model' },
    ];
    const promptModels = [createPromptModel({ ModelID: 'configured-1', Priority: 1 })];

    appendPowerMatchedFallbackCandidates(candidates, null, promptModels, allModels);

    const fallbackIds = candidates
      .filter(c => c.source === 'power-match-fallback')
      .map(c => c.modelId);
    // Should include wrong-type since no type filter
    expect(fallbackIds).toContain('wrong-type');
    // Still should not include inactive
    expect(fallbackIds).not.toContain('inactive');
  });

  it('does not duplicate already-present models', () => {
    const candidates: MockCandidate[] = [
      { modelId: 'configured-1', modelName: 'A', powerRank: 40, priority: 10000, source: 'prompt-model' },
      { modelId: 'configured-2', modelName: 'B', powerRank: 60, priority: 9990, source: 'prompt-model' },
    ];
    const promptModels = [
      createPromptModel({ ModelID: 'configured-1', Priority: 1 }),
      createPromptModel({ ModelID: 'configured-2', Priority: 1 }),
    ];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    const allIds = candidates.map(c => c.modelId);
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });

  it('does nothing when no fallback models are available', () => {
    // All models either configured or excluded
    const tinyPool = [
      createModel({ ID: 'only-one', Name: 'Only', PowerRank: 50 }),
    ];
    const candidates: MockCandidate[] = [
      { modelId: 'only-one', modelName: 'Only', powerRank: 50, priority: 10000, source: 'prompt-model' },
    ];
    const promptModels = [createPromptModel({ ModelID: 'only-one', Priority: 1 })];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, tinyPool);

    expect(candidates).toHaveLength(1); // No change
  });

  it('handles empty specific candidates (all models become fallback)', () => {
    const candidates: MockCandidate[] = [];
    const promptModels: MockPromptModel[] = [];

    appendPowerMatchedFallbackCandidates(candidates, 'llm-type', promptModels, allModels);

    // With no configured models, target power = 0, so lowest power models first
    const fallbacks = candidates.filter(c => c.source === 'power-match-fallback');
    // 5 active LLM-type models in allModels
    expect(fallbacks.length).toBe(5);
    // Closest to 0 should be first
    expect(fallbacks[0].modelId).toBe('fallback-low'); // PowerRank 10
  });
});

// ============================================================================
// Tests: buildCandidatesForSpecificStrategy (integration)
// ============================================================================

describe('buildCandidatesForSpecificStrategy', () => {
  const allModels: MockModel[] = [
    createModel({ ID: 'gpt-oss-120b', Name: 'GPT-OSS-120B', PowerRank: 30 }),
    createModel({ ID: 'gpt-5-nano', Name: 'GPT 5-nano', PowerRank: 15 }),
    createModel({ ID: 'claude-opus', Name: 'Claude Opus', PowerRank: 95 }),
    createModel({ ID: 'claude-haiku', Name: 'Claude Haiku', PowerRank: 25 }),
    createModel({ ID: 'gemini-flash', Name: 'Gemini Flash', PowerRank: 20 }),
    createModel({ ID: 'llama-70b', Name: 'Llama 70B', PowerRank: 35 }),
  ];

  describe('RequireSpecificModels = false (default)', () => {
    it('includes both specific and fallback candidates', () => {
      const promptModels = [
        createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),
        createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1 }),
      ];

      const candidates = buildCandidatesForSpecificStrategy(
        'Test Prompt', 'llm-type', false, promptModels, allModels
      );

      const specific = candidates.filter(c => c.source === 'prompt-model');
      const fallback = candidates.filter(c => c.source === 'power-match-fallback');

      expect(specific).toHaveLength(2);
      expect(fallback).toHaveLength(4); // 6 total models - 2 configured
      expect(candidates).toHaveLength(6);
    });

    it('specific candidates always have higher priority than fallback', () => {
      const promptModels = [
        createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),
        createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1 }),
      ];

      const candidates = buildCandidatesForSpecificStrategy(
        'Test Prompt', 'llm-type', false, promptModels, allModels
      );

      const lowestSpecific = Math.min(
        ...candidates.filter(c => c.source === 'prompt-model').map(c => c.priority)
      );
      const highestFallback = Math.max(
        ...candidates.filter(c => c.source === 'power-match-fallback').map(c => c.priority)
      );

      expect(lowestSpecific).toBeGreaterThan(highestFallback);
    });

    it('fallback models are sorted by proximity to configured models power level', () => {
      // Configured: GPT-OSS-120B (PR=30, priority=3) and GPT-5-nano (PR=15, priority=1)
      // Weighted target = (30*3 + 15*1) / (3+1) = 105/4 ≈ 26
      const promptModels = [
        createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),
        createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1 }),
      ];

      const candidates = buildCandidatesForSpecificStrategy(
        'Test Prompt', 'llm-type', false, promptModels, allModels
      );

      const fallback = candidates.filter(c => c.source === 'power-match-fallback');
      // Target ~26: Claude Haiku (25, dist=1), Gemini Flash (20, dist=6),
      // Llama 70B (35, dist=9), Claude Opus (95, dist=69)
      expect(fallback[0].modelName).toBe('Claude Haiku');     // dist=1
      expect(fallback[1].modelName).toBe('Gemini Flash');     // dist=6
      expect(fallback[2].modelName).toBe('Llama 70B');        // dist=9
      expect(fallback[3].modelName).toBe('Claude Opus');      // dist=69
    });

    it('does not throw when no specific prompt models exist', () => {
      // No configured models but RequireSpecificModels=false
      // Should still get fallback candidates
      const candidates = buildCandidatesForSpecificStrategy(
        'Test Prompt', 'llm-type', false, [], allModels
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(c => c.source === 'power-match-fallback')).toBe(true);
    });

    it('still throws when no candidates at all (empty model pool)', () => {
      expect(() =>
        buildCandidatesForSpecificStrategy('Test Prompt', 'llm-type', false, [], [])
      ).toThrow(/no valid AIPromptModel candidates/i);
    });
  });

  describe('RequireSpecificModels = true', () => {
    it('does NOT append fallback candidates', () => {
      const promptModels = [
        createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),
      ];

      const candidates = buildCandidatesForSpecificStrategy(
        'Test Prompt', 'llm-type', true, promptModels, allModels
      );

      expect(candidates.every(c => c.source === 'prompt-model')).toBe(true);
      expect(candidates).toHaveLength(1);
    });

    it('throws when no specific prompt models exist', () => {
      expect(() =>
        buildCandidatesForSpecificStrategy('Test Prompt', 'llm-type', true, [], allModels)
      ).toThrow(/no valid AIPromptModel candidates/i);
    });

    it('throws when all prompt models are inactive/deprecated', () => {
      const promptModels = [
        createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3, Status: 'Deprecated' }),
        createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1, Status: 'Inactive' }),
      ];

      expect(() =>
        buildCandidatesForSpecificStrategy('Test Prompt', 'llm-type', true, promptModels, allModels)
      ).toThrow(/no valid AIPromptModel candidates/i);
    });
  });
});

// ============================================================================
// Tests: Sage-like real-world scenario
// ============================================================================

describe('Real-world scenario: Sage agent fallback', () => {
  // Models resembling a real deployment
  const allModels: MockModel[] = [
    createModel({ ID: 'gpt-oss-120b', Name: 'GPT-OSS-120B', PowerRank: 10 }),
    createModel({ ID: 'gpt-5-nano', Name: 'GPT 5-nano', PowerRank: 12 }),
    createModel({ ID: 'claude-haiku', Name: 'Claude Haiku 4.5', PowerRank: 15 }),
    createModel({ ID: 'gemini-flash', Name: 'Gemini 3 Flash', PowerRank: 14 }),
    createModel({ ID: 'claude-sonnet', Name: 'Claude Sonnet 4.6', PowerRank: 60 }),
    createModel({ ID: 'gpt-5', Name: 'GPT 5', PowerRank: 70 }),
    createModel({ ID: 'claude-opus', Name: 'Claude Opus 4.6', PowerRank: 95 }),
  ];

  it('when all Sage models unavailable, picks models at similar power level — not Opus', () => {
    // Sage configured with fast/cheap models (PowerRank 10-12)
    const sagePromptModels = [
      createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),  // PR=10
      createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1 }),     // PR=12
    ];

    const candidates = buildCandidatesForSpecificStrategy(
      'Sage - System Prompt', 'llm-type', false, sagePromptModels, allModels
    );

    const fallback = candidates.filter(c => c.source === 'power-match-fallback');

    // Target power = (10*3 + 12*1) / 4 = 42/4 ≈ 11
    // Closest models to PR=11:
    // Gemini Flash (14, dist=3), Claude Haiku (15, dist=4),
    // Claude Sonnet (60, dist=49), GPT 5 (70, dist=59), Claude Opus (95, dist=84)
    expect(fallback[0].modelName).toBe('Gemini 3 Flash');   // Closest to 11
    expect(fallback[1].modelName).toBe('Claude Haiku 4.5'); // Second closest

    // Claude Opus should be LAST — farthest from the configured power level
    expect(fallback[fallback.length - 1].modelName).toBe('Claude Opus 4.6');
  });

  it('when configured with high-power models, fallback prefers high-power models', () => {
    // Hypothetical prompt configured for high-power models
    const highPowerPromptModels = [
      createPromptModel({ ModelID: 'claude-opus', Priority: 2 }),   // PR=95
      createPromptModel({ ModelID: 'gpt-5', Priority: 1 }),          // PR=70
    ];

    const candidates = buildCandidatesForSpecificStrategy(
      'Complex Analysis Prompt', 'llm-type', false, highPowerPromptModels, allModels
    );

    const fallback = candidates.filter(c => c.source === 'power-match-fallback');

    // Target power = (95*2 + 70*1) / 3 ≈ 87
    // Closest: Claude Sonnet (60, dist=27), Claude Haiku (15, dist=72)...
    expect(fallback[0].modelName).toBe('Claude Sonnet 4.6');

    // Low-power models should be last
    const lastFallback = fallback[fallback.length - 1];
    expect(lastFallback.powerRank).toBeLessThan(15);
  });

  it('configured specific candidates always come before any fallback', () => {
    const sagePromptModels = [
      createPromptModel({ ModelID: 'gpt-oss-120b', Priority: 3 }),
      createPromptModel({ ModelID: 'gpt-5-nano', Priority: 1 }),
    ];

    const candidates = buildCandidatesForSpecificStrategy(
      'Sage - System Prompt', 'llm-type', false, sagePromptModels, allModels
    );

    // When iterating by priority (highest first), all specific should come before all fallback
    const sortedByPriority = [...candidates].sort((a, b) => b.priority - a.priority);
    const firstFallbackIndex = sortedByPriority.findIndex(
      c => c.source === 'power-match-fallback'
    );
    const lastSpecificIndex = sortedByPriority.reduce(
      (lastIdx, c, i) => (c.source === 'prompt-model' ? i : lastIdx),
      -1
    );

    expect(lastSpecificIndex).toBeLessThan(firstFallbackIndex);
  });
});

// ============================================================================
// Tests: Edge cases
// ============================================================================

describe('Edge cases', () => {
  it('all models have PowerRank 0', () => {
    const zeroModels = [
      createModel({ ID: 'a', Name: 'A', PowerRank: 0 }),
      createModel({ ID: 'b', Name: 'B', PowerRank: 0 }),
      createModel({ ID: 'c', Name: 'C', PowerRank: 0 }),
    ];
    const promptModels = [createPromptModel({ ModelID: 'a', Priority: 1 })];

    const candidates = buildCandidatesForSpecificStrategy(
      'Zero Power Prompt', 'llm-type', false, promptModels, zeroModels
    );

    // Should not throw, should have specific + fallback
    expect(candidates).toHaveLength(3);
    const fallback = candidates.filter(c => c.source === 'power-match-fallback');
    expect(fallback).toHaveLength(2);
  });

  it('single model in entire system — no fallback possible', () => {
    const singleModel = [createModel({ ID: 'solo', Name: 'Solo', PowerRank: 50 })];
    const promptModels = [createPromptModel({ ModelID: 'solo', Priority: 1 })];

    const candidates = buildCandidatesForSpecificStrategy(
      'Solo Prompt', 'llm-type', false, promptModels, singleModel
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe('prompt-model');
  });

  it('configured model is inactive but fallback models available', () => {
    const models = [
      createModel({ ID: 'inactive-configured', Name: 'Dead', PowerRank: 50, IsActive: false }),
      createModel({ ID: 'available', Name: 'Available', PowerRank: 45 }),
    ];
    const promptModels = [
      createPromptModel({ ModelID: 'inactive-configured', Priority: 1 }),
    ];

    // The prompt model references an inactive model — buildCandidatesFromPromptModels
    // would normally skip it. In our simplified test, the model just won't be in allModels
    // for candidate building. The fallback should still find the available model.
    const candidates = buildCandidatesForSpecificStrategy(
      'Inactive Config Prompt', 'llm-type', false, promptModels, models
    );

    // Should have the configured model (even though inactive — real code filters at credential check)
    // plus the available model as fallback
    const fallback = candidates.filter(c => c.source === 'power-match-fallback');
    expect(fallback.length).toBeGreaterThanOrEqual(1);
    expect(fallback.some(c => c.modelId === 'available')).toBe(true);
  });

  it('very large power rank gap — fallback still works correctly', () => {
    const models = [
      createModel({ ID: 'tiny', Name: 'Tiny', PowerRank: 1 }),
      createModel({ ID: 'massive', Name: 'Massive', PowerRank: 10000 }),
    ];
    const promptModels = [createPromptModel({ ModelID: 'tiny', Priority: 1 })];

    const candidates = buildCandidatesForSpecificStrategy(
      'Gap Prompt', 'llm-type', false, promptModels, models
    );

    const fallback = candidates.filter(c => c.source === 'power-match-fallback');
    expect(fallback).toHaveLength(1);
    expect(fallback[0].modelId).toBe('massive');
  });

  it('prompt with Preview status models includes them in specific candidates', () => {
    const models = [
      createModel({ ID: 'preview-model', Name: 'Preview', PowerRank: 50 }),
      createModel({ ID: 'fallback-model', Name: 'Fallback', PowerRank: 55 }),
    ];
    const promptModels = [
      createPromptModel({ ModelID: 'preview-model', Priority: 1, Status: 'Preview' }),
    ];

    const candidates = buildCandidatesForSpecificStrategy(
      'Preview Prompt', 'llm-type', false, promptModels, models
    );

    const specific = candidates.filter(c => c.source === 'prompt-model');
    expect(specific).toHaveLength(1);
    expect(specific[0].modelId).toBe('preview-model');
  });

  it('fallback priority values decrease monotonically', () => {
    const models = [
      createModel({ ID: 'c1', Name: 'C1', PowerRank: 50 }),
      createModel({ ID: 'f1', Name: 'F1', PowerRank: 40 }),
      createModel({ ID: 'f2', Name: 'F2', PowerRank: 60 }),
      createModel({ ID: 'f3', Name: 'F3', PowerRank: 30 }),
      createModel({ ID: 'f4', Name: 'F4', PowerRank: 70 }),
    ];
    const promptModels = [createPromptModel({ ModelID: 'c1', Priority: 1 })];

    const candidates = buildCandidatesForSpecificStrategy(
      'Priority Test', 'llm-type', false, promptModels, models
    );

    const fallback = candidates.filter(c => c.source === 'power-match-fallback');
    for (let i = 1; i < fallback.length; i++) {
      expect(fallback[i].priority).toBeLessThan(fallback[i - 1].priority);
    }
  });
});
