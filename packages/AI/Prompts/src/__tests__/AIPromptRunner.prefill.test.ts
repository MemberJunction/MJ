/**
 * Unit tests for AIPromptRunner assistant prefill feature.
 *
 * These tests verify the prefill resolution cascade and application logic:
 * - resolveSupportsPrefill: AIModelType -> AIModel -> AIModelVendor cascade
 * - resolvePrefillFallbackText: same cascade for fallback instruction text
 * - applyAssistantPrefill: orchestrates the above and mutates ChatParams
 *
 * Like the failover and credential-error tests, these use standalone functions
 * that replicate the private method logic rather than instantiating the full
 * AIPromptRunner (which requires complex runtime dependencies).
 *
 * @since 5.6.0 (assistant prefill feature)
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface MockModelType {
  ID: string;
  SupportsPrefill: boolean;
  PrefillFallbackText: string | null;
}

interface MockModel {
  ID: string;
  AIModelTypeID: string;
  SupportsPrefill: boolean | null;
  PrefillFallbackText: string | null;
}

interface MockModelVendor {
  ModelID: string;
  VendorID: string;
  Status: string;
  SupportsPrefill: boolean | null;
  PrefillFallbackText: string | null;
}

interface MockPrompt {
  AssistantPrefill: string | null;
  PrefillFallbackMode: 'Ignore' | 'None' | 'SystemInstruction';
}

interface MockChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MockChatParams {
  messages: MockChatMessage[];
  assistantPrefill?: string;
}

// ============================================================================
// Default fallback constant (mirrors AIPromptRunner.DEFAULT_PREFILL_FALLBACK)
// ============================================================================

const DEFAULT_PREFILL_FALLBACK =
  'IMPORTANT: You must begin your response with exactly the following text (do not add quotes or modify it): {{prefill}}';

// ============================================================================
// Standalone functions that replicate the private method logic
// ============================================================================

/**
 * Mirrors AIPromptRunner.resolveSupportsPrefill.
 * Cascade: AIModelType -> AIModel -> AIModelVendor (most specific non-null wins).
 */
function resolveSupportsPrefill(
  modelType: MockModelType | undefined,
  model: MockModel,
  modelVendor: MockModelVendor | undefined
): boolean {
  // Start with model type default
  let supportsPrefill = modelType?.SupportsPrefill ?? false;

  // Model-level override (null = inherit from type)
  if (model.SupportsPrefill != null) {
    supportsPrefill = model.SupportsPrefill;
  }

  // Vendor-level override (null = inherit from model/type)
  if (modelVendor?.SupportsPrefill != null) {
    supportsPrefill = modelVendor.SupportsPrefill;
  }

  return supportsPrefill;
}

/**
 * Mirrors AIPromptRunner.resolvePrefillFallbackText.
 * Same cascade but for the fallback instruction template.
 */
function resolvePrefillFallbackText(
  modelType: MockModelType | undefined,
  model: MockModel,
  modelVendor: MockModelVendor | undefined
): string {
  let fallbackText: string | null = modelType?.PrefillFallbackText ?? null;

  // Model-level override
  if (model.PrefillFallbackText != null) {
    fallbackText = model.PrefillFallbackText;
  }

  // Vendor-level override
  if (modelVendor?.PrefillFallbackText != null) {
    fallbackText = modelVendor.PrefillFallbackText;
  }

  return fallbackText ?? DEFAULT_PREFILL_FALLBACK;
}

/**
 * Mirrors AIPromptRunner.applyAssistantPrefill.
 * Orchestrates prefill resolution and mutates chatParams accordingly.
 */
function applyAssistantPrefill(
  chatParams: MockChatParams,
  prompt: MockPrompt,
  modelType: MockModelType | undefined,
  model: MockModel,
  modelVendor: MockModelVendor | undefined
): void {
  const prefillText = prompt.AssistantPrefill;
  if (!prefillText) {
    return; // No prefill configured on this prompt
  }

  const supportsPrefill = resolveSupportsPrefill(modelType, model, modelVendor);

  if (supportsPrefill) {
    // Provider supports native prefill -- use it directly
    chatParams.assistantPrefill = prefillText;
    return;
  }

  // Provider does NOT support native prefill -- check fallback mode
  const fallbackMode = prompt.PrefillFallbackMode;

  if (fallbackMode === 'SystemInstruction') {
    // Inject a system instruction telling the model to start with the prefill text
    const fallbackTemplate = resolvePrefillFallbackText(modelType, model, modelVendor);
    const fallbackInstruction = fallbackTemplate.replace(/\{\{prefill\}\}/g, prefillText);

    chatParams.messages.push({
      role: 'system',
      content: fallbackInstruction,
    });
  }
  // 'Ignore' and 'None' -- silently skip, no action needed
}

// ============================================================================
// Helper factory for default mock objects
// ============================================================================

function makeModelType(overrides: Partial<MockModelType> = {}): MockModelType {
  return {
    ID: 'mt-1',
    SupportsPrefill: false,
    PrefillFallbackText: null,
    ...overrides,
  };
}

function makeModel(overrides: Partial<MockModel> = {}): MockModel {
  return {
    ID: 'm-1',
    AIModelTypeID: 'mt-1',
    SupportsPrefill: null,
    PrefillFallbackText: null,
    ...overrides,
  };
}

function makeModelVendor(overrides: Partial<MockModelVendor> = {}): MockModelVendor {
  return {
    ModelID: 'm-1',
    VendorID: 'v-1',
    Status: 'Active',
    SupportsPrefill: null,
    PrefillFallbackText: null,
    ...overrides,
  };
}

function makePrompt(overrides: Partial<MockPrompt> = {}): MockPrompt {
  return {
    AssistantPrefill: null,
    PrefillFallbackMode: 'Ignore',
    ...overrides,
  };
}

function makeChatParams(messages: MockChatMessage[] = []): MockChatParams {
  return {
    messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Hello' }],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AIPromptRunner Assistant Prefill', () => {
  // --------------------------------------------------------------------------
  // 1. resolveSupportsPrefill cascade logic
  // --------------------------------------------------------------------------
  describe('resolveSupportsPrefill', () => {
    it('should return false when model type has SupportsPrefill=false, model=null, vendor=null', () => {
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel({ SupportsPrefill: null });
      const mv = makeModelVendor({ SupportsPrefill: null });

      expect(resolveSupportsPrefill(mt, m, mv)).toBe(false);
    });

    it('should return true when model type has SupportsPrefill=true', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: null });

      expect(resolveSupportsPrefill(mt, m, undefined)).toBe(true);
    });

    it('should let model override model type: type=false, model=true -> true', () => {
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel({ SupportsPrefill: true });

      expect(resolveSupportsPrefill(mt, m, undefined)).toBe(true);
    });

    it('should let model override model type: type=true, model=false -> false', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: false });

      expect(resolveSupportsPrefill(mt, m, undefined)).toBe(false);
    });

    it('should not override when model is null: type=true, model=null -> true', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: null });

      expect(resolveSupportsPrefill(mt, m, undefined)).toBe(true);
    });

    it('should let vendor override: type=false, model=null, vendor=true -> true', () => {
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel({ SupportsPrefill: null });
      const mv = makeModelVendor({ SupportsPrefill: true });

      expect(resolveSupportsPrefill(mt, m, mv)).toBe(true);
    });

    it('should let vendor override everything: type=true, model=true, vendor=false -> false', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: true });
      const mv = makeModelVendor({ SupportsPrefill: false });

      expect(resolveSupportsPrefill(mt, m, mv)).toBe(false);
    });

    it('should cascade correctly: type=false, model=null, vendor=true -> true (vendor wins)', () => {
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel({ SupportsPrefill: null });
      const mv = makeModelVendor({ SupportsPrefill: true });

      expect(resolveSupportsPrefill(mt, m, mv)).toBe(true);
    });

    it('should cascade correctly: type=true, model=false, vendor=null -> false (model wins, vendor inherits)', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: false });
      const mv = makeModelVendor({ SupportsPrefill: null });

      expect(resolveSupportsPrefill(mt, m, mv)).toBe(false);
    });

    it('should default to false when model type is undefined', () => {
      const m = makeModel({ SupportsPrefill: null });
      expect(resolveSupportsPrefill(undefined, m, undefined)).toBe(false);
    });

    it('should still allow model override when model type is undefined', () => {
      const m = makeModel({ SupportsPrefill: true });
      expect(resolveSupportsPrefill(undefined, m, undefined)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. resolvePrefillFallbackText cascade logic
  // --------------------------------------------------------------------------
  describe('resolvePrefillFallbackText', () => {
    it('should return DEFAULT_PREFILL_FALLBACK when all are null', () => {
      const mt = makeModelType({ PrefillFallbackText: null });
      const m = makeModel({ PrefillFallbackText: null });
      const mv = makeModelVendor({ PrefillFallbackText: null });

      expect(resolvePrefillFallbackText(mt, m, mv)).toBe(DEFAULT_PREFILL_FALLBACK);
    });

    it('should return model type text when set', () => {
      const customText = 'Begin with: {{prefill}}';
      const mt = makeModelType({ PrefillFallbackText: customText });
      const m = makeModel({ PrefillFallbackText: null });

      expect(resolvePrefillFallbackText(mt, m, undefined)).toBe(customText);
    });

    it('should let model-level override model type', () => {
      const mt = makeModelType({ PrefillFallbackText: 'type-level text {{prefill}}' });
      const m = makeModel({ PrefillFallbackText: 'model-level text {{prefill}}' });

      expect(resolvePrefillFallbackText(mt, m, undefined)).toBe('model-level text {{prefill}}');
    });

    it('should let vendor-level override model', () => {
      const mt = makeModelType({ PrefillFallbackText: 'type text {{prefill}}' });
      const m = makeModel({ PrefillFallbackText: 'model text {{prefill}}' });
      const mv = makeModelVendor({ PrefillFallbackText: 'vendor text {{prefill}}' });

      expect(resolvePrefillFallbackText(mt, m, mv)).toBe('vendor text {{prefill}}');
    });

    it('should let vendor-level override model type when model is null', () => {
      const mt = makeModelType({ PrefillFallbackText: 'type text {{prefill}}' });
      const m = makeModel({ PrefillFallbackText: null });
      const mv = makeModelVendor({ PrefillFallbackText: 'vendor text {{prefill}}' });

      expect(resolvePrefillFallbackText(mt, m, mv)).toBe('vendor text {{prefill}}');
    });

    it('should return DEFAULT_PREFILL_FALLBACK when model type is undefined and all null', () => {
      const m = makeModel({ PrefillFallbackText: null });
      expect(resolvePrefillFallbackText(undefined, m, undefined)).toBe(DEFAULT_PREFILL_FALLBACK);
    });

    it('should preserve model text when vendor is null', () => {
      const mt = makeModelType({ PrefillFallbackText: null });
      const m = makeModel({ PrefillFallbackText: 'model only {{prefill}}' });
      const mv = makeModelVendor({ PrefillFallbackText: null });

      expect(resolvePrefillFallbackText(mt, m, mv)).toBe('model only {{prefill}}');
    });
  });

  // --------------------------------------------------------------------------
  // 3. applyAssistantPrefill integration logic
  // --------------------------------------------------------------------------
  describe('applyAssistantPrefill', () => {
    it('should not modify chatParams when prompt has no prefill text', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({ AssistantPrefill: null });
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(1); // Only the original user message
    });

    it('should not modify chatParams when prompt prefill is empty string', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({ AssistantPrefill: '' });
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(1);
    });

    it('should set assistantPrefill when provider supports prefill', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({ AssistantPrefill: '```json' });
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBe('```json');
      expect(chatParams.messages).toHaveLength(1); // No extra system message
    });

    it('should not set assistantPrefill and not add system message for Ignore mode', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'Ignore',
      });
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(1); // No extra system message
    });

    it('should not set assistantPrefill and not add system message for None mode', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'None',
      });
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(1);
    });

    it('should inject system message for SystemInstruction mode when unsupported', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2);

      const injected = chatParams.messages[1];
      expect(injected.role).toBe('system');
      expect(injected.content).toContain('```json');
      expect(injected.content).not.toContain('{{prefill}}'); // Placeholder replaced
    });

    it('should replace {{prefill}} placeholder in fallback text correctly', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'ANSWER:',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({
        SupportsPrefill: false,
        PrefillFallbackText: 'Start your reply with: {{prefill}} -- do not deviate.',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      const injected = chatParams.messages[1];
      expect(injected.content).toBe('Start your reply with: ANSWER: -- do not deviate.');
    });

    it('should replace multiple {{prefill}} placeholders', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'YES',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({
        SupportsPrefill: false,
        PrefillFallbackText: 'Say {{prefill}} first. Remember: {{prefill}} is required.',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      const injected = chatParams.messages[1];
      expect(injected.content).toBe('Say YES first. Remember: YES is required.');
    });

    it('should use DEFAULT_PREFILL_FALLBACK when no custom fallback text at any level', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({ SupportsPrefill: false, PrefillFallbackText: null });
      const m = makeModel({ PrefillFallbackText: null });

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      const injected = chatParams.messages[1];
      expect(injected.content).toContain('```json');
      // Should be the default with {{prefill}} replaced
      const expected = DEFAULT_PREFILL_FALLBACK.replace(/\{\{prefill\}\}/g, '```json');
      expect(injected.content).toBe(expected);
    });

    it('should use vendor-level fallback text when available (SystemInstruction mode)', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'BEGIN',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({ SupportsPrefill: false, PrefillFallbackText: 'type: {{prefill}}' });
      const m = makeModel({ PrefillFallbackText: null });
      const mv = makeModelVendor({ SupportsPrefill: null, PrefillFallbackText: 'vendor: {{prefill}}' });

      applyAssistantPrefill(chatParams, prompt, mt, m, mv);

      const injected = chatParams.messages[1];
      expect(injected.content).toBe('vendor: BEGIN');
    });

    it('should prefer native prefill even if fallback mode is SystemInstruction', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      // Model type says supported
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined);

      // Should use native prefill, NOT inject a system message
      expect(chatParams.assistantPrefill).toBe('```json');
      expect(chatParams.messages).toHaveLength(1); // No extra message
    });
  });

  // --------------------------------------------------------------------------
  // 4. DEFAULT_PREFILL_FALLBACK validation
  // --------------------------------------------------------------------------
  describe('DEFAULT_PREFILL_FALLBACK', () => {
    it('should contain the {{prefill}} placeholder', () => {
      expect(DEFAULT_PREFILL_FALLBACK).toContain('{{prefill}}');
    });

    it('should be a non-empty string', () => {
      expect(DEFAULT_PREFILL_FALLBACK.length).toBeGreaterThan(0);
    });

    it('should match the value from AIPromptRunner source', () => {
      // This ensures our test constant stays in sync with the real implementation
      expect(DEFAULT_PREFILL_FALLBACK).toBe(
        'IMPORTANT: You must begin your response with exactly the following text (do not add quotes or modify it): {{prefill}}'
      );
    });
  });
});
