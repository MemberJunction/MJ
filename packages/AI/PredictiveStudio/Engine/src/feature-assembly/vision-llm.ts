/**
 * @module feature-assembly/vision-llm
 *
 * **Multimodal vision-LLM-as-feature** (plan §11 / §5.6, PS-MM-1) — the per-row
 * extraction engine behind a {@link VisionLLMFeatureStep}. For each target
 * record it builds an {@link AIPromptParams} whose user turn carries the row's
 * image as a multimodal `image_url` content block plus the configured vision
 * prompt, runs it through an **injected** prompt-runner seam, and parses the
 * model's single structured output (a named category or scalar) into the feature
 * column's value.
 *
 * ## Why this is exempt from the fit-once/apply-everywhere split (§6.2)
 *
 * Preprocessing steps (`impute`/`standardize`/`onehot`/`bin`) learn parameters
 * from the training distribution (a mean, a vocabulary, bin edges) that MUST be
 * frozen and replayed identically at scoring — otherwise train/serve skew. The
 * vision-LLM step has **no fitted state**: the same prompt is applied to each
 * row independently and statelessly, so the row's own image fully determines the
 * output. There is nothing to fit on the training set and replay at scoring, so
 * it produces a RAW feature column directly — exactly like `select`/`embedding`
 * — and is wired into the executor's data-assembly path, not the preprocessing
 * recipe. (Any downstream `onehot` of the resulting category IS a preprocessing
 * step and goes through the normal fit/replay split.)
 *
 * ## As-of and leakage
 *
 * - **As-of**: the image is read from the row *as of* the assembly's as-of time —
 *   we use the image column value present on the record the executor resolved for
 *   that as-of date. The vision extraction never reaches forward in time; it only
 *   looks at the row's own image.
 * - **Leakage guard**: a feature derived from the row's OWN image is allowed —
 *   it is a property of the record itself, not a proxy for the future label
 *   (the deny-list only blocks fields/sources known to leak the target). The
 *   output feature name is still passed through the guard so an operator can
 *   deny-list a specific vision feature if it proves leaky post-train.
 */

import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { VisionLLMFeatureStep, VisionLLMOutput } from '@memberjunction/predictive-studio-core';
import type { UserInfo } from '@memberjunction/core';

import type { SourceRow } from './data-access';

/**
 * The injected prompt-runner seam. The production binding wraps
 * `@memberjunction/ai-prompts`' `AIPromptRunner.ExecutePrompt`; unit tests supply
 * a fake so the vision-LLM step assembles end-to-end WITHOUT a live model.
 *
 * The contract is deliberately narrowed to the single method the vision step
 * needs, so the engine does not take a hard dependency on the (heavy) concrete
 * runner — only on the real `AIPromptParams` / `AIPromptRunResult` shapes.
 */
export interface IVisionPromptRunner {
  /**
   * Execute a (multimodal) prompt and return its result. Mirrors
   * `AIPromptRunner.ExecutePrompt`'s signature so the production binding is a
   * direct passthrough.
   */
  ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>>;
}

/**
 * Per-record output of a vision extraction. `value` is the parsed feature cell
 * (or `null` when the image is missing or the output couldn't be parsed).
 */
export interface VisionExtractionResult {
  /** The parsed feature value for the row, or `null`. */
  value: string | number | null;
}

/**
 * Runs a {@link VisionLLMFeatureStep} over a single record: builds the
 * multimodal prompt params, invokes the injected runner, and parses the
 * structured output. Stateless — construct once and reuse across rows.
 */
export class VisionFeatureExtractor {
  /**
   * @param runner the injected prompt-runner seam (mocked in tests)
   * @param contextUser request user — passed to the runner for isolation/audit
   */
  constructor(
    private readonly runner: IVisionPromptRunner,
    private readonly contextUser?: UserInfo,
  ) {}

  /**
   * Extract the vision feature for one record. Returns `{ value: null }` without
   * calling the model when the row's image column is null/missing/blank.
   *
   * @param step the vision-llm step spec
   * @param record the target record (already resolved as-of its decision date)
   * @param promptEntity the resolved prompt entity to run (caller resolves it
   *   from `step.Prompt` against `MJ: AI Prompts`); typed loosely so the engine
   *   doesn't depend on the entity class just to thread it through
   */
  public async extract(
    step: VisionLLMFeatureStep,
    record: SourceRow,
    promptEntity: AIPromptParams['prompt'],
  ): Promise<VisionExtractionResult> {
    const imageRef = readImageRef(record, step.ImageColumn);
    if (imageRef === null) {
      // Graceful: no image for this row → null feature, no model call.
      return { value: null };
    }

    const params = this.buildPromptParams(step, imageRef, promptEntity);
    const runResult = await this.runner.ExecutePrompt<unknown>(params);
    return { value: parseVisionOutput(runResult, step.Output) };
  }

  /**
   * Build the {@link AIPromptParams} for one row: the vision prompt as the system
   * template plus a user turn whose content carries the image as an `image_url`
   * multimodal content block alongside an instruction to emit the structured
   * output.
   */
  private buildPromptParams(step: VisionLLMFeatureStep, imageRef: string, promptEntity: AIPromptParams['prompt']): AIPromptParams {
    const params = new AIPromptParams();
    params.prompt = promptEntity;
    params.contextUser = this.contextUser;
    // The vision prompt template is the system turn; the image rides on a user turn.
    params.templateMessageRole = 'system';
    params.conversationMessages = [buildVisionUserMessage(imageRef, step.Output, step.Prompt.InlinePrompt)];
    if (step.ModelRef) {
      // Surface the model override to the prompt run via data (the runner's model
      // selection honors an explicit override key); pinned into model Lineage.
      params.data = { ...(params.data ?? {}), visionModelRef: step.ModelRef };
    }
    return params;
  }
}

/**
 * Read the image reference (URL or binary/data ref) from a record's image
 * column. Returns `null` for null/undefined/blank values so the caller can skip
 * the model call gracefully.
 */
export function readImageRef(record: SourceRow, imageColumn: string): string | null {
  const raw = record[imageColumn];
  if (raw === null || raw === undefined) {
    return null;
  }
  const str = typeof raw === 'string' ? raw : String(raw);
  const trimmed = str.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Build the user-turn {@link ChatMessage} carrying the image as an `image_url`
 * multimodal content block plus a text block asking the model to emit the
 * structured output named by {@link VisionLLMOutput.FeatureName}.
 */
export function buildVisionUserMessage(imageRef: string, output: VisionLLMOutput, inlinePrompt?: string): ChatMessage {
  const blocks: ChatMessageContentBlock[] = [];
  if (inlinePrompt && inlinePrompt.trim().length > 0) {
    blocks.push({ type: 'text', content: inlinePrompt.trim() });
  }
  blocks.push({ type: 'text', content: buildOutputInstruction(output) });
  blocks.push({ type: 'image_url', content: imageRef });
  return { role: 'user', content: blocks };
}

/**
 * Compose the instruction asking the model to emit exactly the named structured
 * output. For a closed category set, the allowed values are enumerated so the
 * model stays in-set.
 */
export function buildOutputInstruction(output: VisionLLMOutput): string {
  const base = `Analyze the image and respond with a JSON object containing a single key "${output.FeatureName}"`;
  if (output.Kind === 'scalar') {
    return `${base} whose value is a number.`;
  }
  if (output.AllowedCategories && output.AllowedCategories.length > 0) {
    return `${base} whose value is exactly one of: ${output.AllowedCategories.join(', ')}.`;
  }
  return `${base} whose value is a short category label string.`;
}

/**
 * Parse the runner's result into the feature cell value per the output contract.
 * Handles both a structured `result` object (preferred) and a raw JSON/text
 * `rawResult` fallback. Returns `null` on failure, an unsuccessful run, or an
 * out-of-set category.
 */
export function parseVisionOutput(runResult: AIPromptRunResult<unknown>, output: VisionLLMOutput): string | number | null {
  if (!runResult.success) {
    return null;
  }
  const raw = extractNamedValue(runResult, output.FeatureName);
  if (raw === null) {
    return null;
  }
  return output.Kind === 'scalar' ? coerceScalar(raw) : coerceCategory(raw, output.AllowedCategories);
}

/**
 * Pull the named output value from a prompt run result, preferring the parsed
 * structured `result` object and falling back to parsing `rawResult` as JSON.
 */
function extractNamedValue(runResult: AIPromptRunResult<unknown>, featureName: string): unknown {
  const fromStructured = readKey(runResult.result, featureName);
  if (fromStructured !== undefined) {
    return fromStructured ?? null;
  }
  const parsed = tryParseJSON(runResult.rawResult);
  const fromRaw = readKey(parsed, featureName);
  return fromRaw === undefined ? null : (fromRaw ?? null);
}

/** Read a string-keyed property from an unknown value when it's a plain object. */
function readKey(value: unknown, key: string): unknown {
  if (value !== null && typeof value === 'object' && key in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

/** Parse a string as JSON, returning `null` on any failure or non-string input. */
function tryParseJSON(raw: string | undefined): unknown {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Coerce a raw value into a finite number, or `null` when it isn't numeric. */
function coerceScalar(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Coerce a raw value into a category label string, enforcing the closed set when
 * one is configured (out-of-set → `null` so an unexpected label never enters the
 * matrix). Matching is case-insensitive but returns the canonical configured value.
 */
function coerceCategory(raw: unknown, allowed?: string[]): string | null {
  const label = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (label.length === 0) {
    return null;
  }
  if (!allowed || allowed.length === 0) {
    return label;
  }
  const match = allowed.find((a) => a.toLowerCase() === label.toLowerCase());
  return match ?? null;
}
