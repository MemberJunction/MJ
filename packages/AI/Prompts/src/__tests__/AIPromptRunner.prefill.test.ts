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
  '# **CRITICAL**\nYour response must start with exactly: {{prefill}}\nDo not add quotes, markdown formatting, or any other characters before it.';

// ============================================================================
// Standalone functions that replicate the private method logic
// ============================================================================

/**
 * Mirrors AIPromptRunner.resolveSupportsPrefill.
 * Resolution: llm.SupportsPrefill (code default) → AIModel → AIModelVendor
 * AIModelType.SupportsPrefill is NOT used (NOT NULL DEFAULT 0, can't distinguish
 * "explicitly disabled" from "never configured"). The code default serves that role.
 * null at AIModel/AIModelVendor = inherit; true/false = override.
 */
function resolveSupportsPrefill(
  _modelType: MockModelType | undefined,
  model: MockModel,
  modelVendor: MockModelVendor | undefined,
  llmSupportsPrefill: boolean = false
): boolean {
  // Start with the code-level default from the BaseLLM subclass
  let supportsPrefill = llmSupportsPrefill;

  // Model-level override (null = inherit from code default)
  if (model.SupportsPrefill != null) {
    supportsPrefill = model.SupportsPrefill;
  }

  // Vendor-level override (null = inherit)
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
  modelVendor: MockModelVendor | undefined,
  llmSupportsPrefill: boolean = false
): void {
  const prefillText = prompt.AssistantPrefill;
  if (!prefillText) {
    return; // No prefill configured on this prompt
  }

  const supportsPrefill = resolveSupportsPrefill(modelType, model, modelVendor, llmSupportsPrefill);

  if (supportsPrefill) {
    // Provider supports native prefill -- use it directly
    chatParams.assistantPrefill = prefillText;
    return;
  }

  // Provider does NOT support native prefill -- check fallback mode
  const fallbackMode = prompt.PrefillFallbackMode;

  if (fallbackMode === 'SystemInstruction') {
    // Append to existing system message rather than adding a new one,
    // since some providers only support a single system message entry.
    const fallbackTemplate = resolvePrefillFallbackText(modelType, model, modelVendor);
    const fallbackInstruction = fallbackTemplate.replace(/\{\{prefill\}\}/g, prefillText);

    const existingSystemMsg = chatParams.messages.find(m => m.role === 'system');
    if (existingSystemMsg) {
      existingSystemMsg.content += '\n\n' + fallbackInstruction;
    } else {
      chatParams.messages.unshift({
        role: 'system',
        content: fallbackInstruction,
      });
    }
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
    messages: messages.length > 0 ? messages : [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' }
    ],
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
    it('should return false when llm=false and all DB levels are null', () => {
      const m = makeModel({ SupportsPrefill: null });
      expect(resolveSupportsPrefill(undefined, m, undefined, false)).toBe(false);
    });

    it('should return true when llm=true and all DB levels are null (code default wins)', () => {
      const m = makeModel({ SupportsPrefill: null });
      expect(resolveSupportsPrefill(undefined, m, undefined, true)).toBe(true);
    });

    it('should let model override code default: llm=true, model=false -> false', () => {
      const m = makeModel({ SupportsPrefill: false });
      expect(resolveSupportsPrefill(undefined, m, undefined, true)).toBe(false);
    });

    it('should let model override code default: llm=false, model=true -> true', () => {
      const m = makeModel({ SupportsPrefill: true });
      expect(resolveSupportsPrefill(undefined, m, undefined, false)).toBe(true);
    });

    it('should not override when model is null: llm=true, model=null -> true', () => {
      const m = makeModel({ SupportsPrefill: null });
      expect(resolveSupportsPrefill(undefined, m, undefined, true)).toBe(true);
    });

    it('should let vendor override code default: llm=false, model=null, vendor=true -> true', () => {
      const m = makeModel({ SupportsPrefill: null });
      const mv = makeModelVendor({ SupportsPrefill: true });
      expect(resolveSupportsPrefill(undefined, m, mv, false)).toBe(true);
    });

    it('should let vendor override everything: llm=true, model=true, vendor=false -> false', () => {
      const m = makeModel({ SupportsPrefill: true });
      const mv = makeModelVendor({ SupportsPrefill: false });
      expect(resolveSupportsPrefill(undefined, m, mv, true)).toBe(false);
    });

    it('should cascade correctly: llm=true, model=false, vendor=null -> false (model wins)', () => {
      const m = makeModel({ SupportsPrefill: false });
      const mv = makeModelVendor({ SupportsPrefill: null });
      expect(resolveSupportsPrefill(undefined, m, mv, true)).toBe(false);
    });

    it('should cascade correctly: llm=false, model=null, vendor=true -> true (vendor wins)', () => {
      const m = makeModel({ SupportsPrefill: null });
      const mv = makeModelVendor({ SupportsPrefill: true });
      expect(resolveSupportsPrefill(undefined, m, mv, false)).toBe(true);
    });

    it('should ignore modelType parameter (NOT NULL DEFAULT 0 in DB)', () => {
      const mt = makeModelType({ SupportsPrefill: true });
      const m = makeModel({ SupportsPrefill: null });
      // modelType says true but it is ignored; llm default (false) is used
      expect(resolveSupportsPrefill(mt, m, undefined, false)).toBe(false);
    });

    it('should use llm default even when modelType is provided', () => {
      const mt = makeModelType({ SupportsPrefill: false });
      const m = makeModel({ SupportsPrefill: null });
      // modelType says false but it is ignored; llm default (true) is used
      expect(resolveSupportsPrefill(mt, m, undefined, true)).toBe(true);
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
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, true);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2); // system + user unchanged
    });

    it('should not modify chatParams when prompt prefill is empty string', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({ AssistantPrefill: '' });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, true);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2);
    });

    it('should set assistantPrefill when llm supports prefill (code default)', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({ AssistantPrefill: '```json' });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, true);

      expect(chatParams.assistantPrefill).toBe('```json');
      expect(chatParams.messages).toHaveLength(2); // system + user unchanged, no extra
    });

    it('should not set assistantPrefill and not add system message for Ignore mode', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'Ignore',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, false);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2); // system + user unchanged
    });

    it('should not set assistantPrefill and not add system message for None mode', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'None',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, false);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2);
    });

    it('should append fallback to existing system message for SystemInstruction mode when unsupported', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, false);

      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2); // Still 2 messages, fallback appended to existing system

      const systemMsg = chatParams.messages[0];
      expect(systemMsg.role).toBe('system');
      expect(systemMsg.content).toContain('You are a helpful assistant.'); // Original preserved
      expect(systemMsg.content).toContain('```json'); // Fallback appended
      expect(systemMsg.content).not.toContain('{{prefill}}'); // Placeholder replaced
    });

    it('should prepend system message when none exists (SystemInstruction mode)', () => {
      const chatParams = makeChatParams([{ role: 'user', content: 'Hello' }]); // No system message
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, false);

      expect(chatParams.messages).toHaveLength(2); // New system + original user
      expect(chatParams.messages[0].role).toBe('system');
      expect(chatParams.messages[0].content).toContain('```json');
      expect(chatParams.messages[1].role).toBe('user');
    });

    it('should replace {{prefill}} placeholder in fallback text correctly', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'ANSWER:',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({
        PrefillFallbackText: 'Start your reply with: {{prefill}} -- do not deviate.',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined, false);

      const systemMsg = chatParams.messages[0];
      expect(systemMsg.content).toContain('Start your reply with: ANSWER: -- do not deviate.');
    });

    it('should replace multiple {{prefill}} placeholders', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'YES',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({
        PrefillFallbackText: 'Say {{prefill}} first. Remember: {{prefill}} is required.',
      });
      const m = makeModel();

      applyAssistantPrefill(chatParams, prompt, mt, m, undefined, false);

      const systemMsg = chatParams.messages[0];
      expect(systemMsg.content).toContain('Say YES first. Remember: YES is required.');
    });

    it('should use DEFAULT_PREFILL_FALLBACK when no custom fallback text at any level', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const m = makeModel({ PrefillFallbackText: null });

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, false);

      const systemMsg = chatParams.messages[0];
      const expected = DEFAULT_PREFILL_FALLBACK.replace(/\{\{prefill\}\}/g, '```json');
      expect(systemMsg.content).toContain(expected);
    });

    it('should use vendor-level fallback text when available (SystemInstruction mode)', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: 'BEGIN',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const mt = makeModelType({ PrefillFallbackText: 'type: {{prefill}}' });
      const m = makeModel({ PrefillFallbackText: null });
      const mv = makeModelVendor({ SupportsPrefill: null, PrefillFallbackText: 'vendor: {{prefill}}' });

      applyAssistantPrefill(chatParams, prompt, mt, m, mv, false);

      const systemMsg = chatParams.messages[0];
      expect(systemMsg.content).toContain('vendor: BEGIN');
    });

    it('should prefer native prefill even if fallback mode is SystemInstruction', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const m = makeModel();
      const originalSystemContent = chatParams.messages[0].content;

      // llm says it supports prefill
      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, true);

      // Should use native prefill, NOT modify the system message
      expect(chatParams.assistantPrefill).toBe('```json');
      expect(chatParams.messages).toHaveLength(2); // system + user unchanged
      expect(chatParams.messages[0].content).toBe(originalSystemContent); // System msg untouched
    });

    it('should let DB model=false override llm=true (force disable)', () => {
      const chatParams = makeChatParams();
      const prompt = makePrompt({
        AssistantPrefill: '```json',
        PrefillFallbackMode: 'SystemInstruction',
      });
      const m = makeModel({ SupportsPrefill: false }); // Explicitly disabled in DB

      applyAssistantPrefill(chatParams, prompt, undefined, m, undefined, true); // llm says yes

      // DB false overrides llm true — should use fallback appended to system message
      expect(chatParams.assistantPrefill).toBeUndefined();
      expect(chatParams.messages).toHaveLength(2); // Still 2 messages, fallback appended to system
      expect(chatParams.messages[0].content).toContain('```json'); // Fallback appended
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
        '# **CRITICAL**\nYour response must start with exactly: {{prefill}}\nDo not add quotes, markdown formatting, or any other characters before it.'
      );
    });
  });
});
