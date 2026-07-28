/**
 * @fileoverview LLM-driven semantic segmenter — finds topic boundaries in prose.
 *
 * @module @memberjunction/ai-segmentation
 */

import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { BaseSegmenter } from './BaseSegmenter';
import { StructuralTextSegmenter } from './StructuralTextSegmenter';
import { ContentModality, RawSegment, SegmentationOptions, SegmentationParams } from './Segmentation.types';

/** Registration key for {@link SemanticTextSegmenter}. */
export const SEMANTIC_TEXT_SEGMENTER_KEY = 'SemanticText';

/** Default name of the `MJ: AI Prompts` record driving boundary detection. */
export const SEMANTIC_SEGMENTATION_PROMPT_NAME = 'Content Semantic Segmentation';

/** Options specific to {@link SemanticTextSegmenter}. */
export interface SemanticTextSegmentationOptions extends SegmentationOptions {
    /** Name of the `MJ: AI Prompts` record to run. Default: {@link SEMANTIC_SEGMENTATION_PROMPT_NAME}. */
    PromptName?: string;
    /** Optional model override (an `MJ: AI Models` ID) for the boundary pass. */
    ModelID?: string;
    /**
     * Skip the LLM call entirely when the document estimates below this many
     * tokens — short documents rarely contain multiple topics and the call would
     * not repay its cost. Default: 750.
     */
    MinTokensForLLM?: number;
    /**
     * Maximum characters of each block shown to the model. Boundary detection only
     * needs the opening of a block, so truncating keeps the prompt cheap on long
     * documents. Default: 240.
     */
    BlockPreviewChars?: number;
    /** Maximum blocks sent in one pass. Default: 300. */
    MaxBlocks?: number;
}

/** One candidate block the model may mark as a topic start. */
interface DocumentBlock {
    Index: number;
    Text: string;
    StartOffset: number;
    EndOffset: number;
}

/** Shape returned by the segmentation prompt. */
interface BoundaryResponse {
    boundaries?: { startBlock?: number; title?: string }[];
}

/**
 * Segments prose by asking an LLM where the topics change.
 *
 * Structure-aware segmentation only works when the author left structure behind.
 * Transcripts, scanned reports, and long-form articles frequently have none — the
 * topic shifts, but no heading marks it. This segmenter finds those latent
 * boundaries and names them, producing titled sections that behave like headings
 * the document never had.
 *
 * ## Cost posture
 *
 * The LLM pass is the expensive part of ingestion, so this class is written to
 * avoid it whenever it wouldn't pay off: short documents short-circuit to
 * structural segmentation, blocks are truncated to a preview before being shown to
 * the model, and any failure degrades to `StructuralText` rather than failing the
 * ingestion run. The model is asked to classify *block indices*, never character
 * offsets — models are unreliable at arithmetic over long strings, and a wrong
 * offset would silently corrupt chunk provenance.
 *
 * Because it runs through `AIPromptRunner`, every pass is a tracked `MJ: AI Prompt
 * Run` with full token and cost attribution, and the prompt itself is versioned
 * metadata rather than a string literal in code.
 */
@RegisterClass(BaseSegmenter, SEMANTIC_TEXT_SEGMENTER_KEY)
export class SemanticTextSegmenter extends BaseSegmenter {
    public get Key(): string {
        return SEMANTIC_TEXT_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['text'];
    }

    protected async SegmentCore(params: SegmentationParams<SemanticTextSegmentationOptions>): Promise<RawSegment[]> {
        const text = params.Text ?? '';
        if (text.trim().length === 0) {
            return [];
        }
        const minTokens = params.Options?.MinTokensForLLM ?? 750;
        if (this.tokensOf({ Modality: 'text', Text: text }) < minTokens) {
            return this.fallback(params);
        }

        const blocks = this.buildBlocks(text, params.Options);
        if (blocks.length < 2) {
            return this.fallback(params);
        }

        const boundaries = await this.proposeBoundaries(blocks, params);
        if (!boundaries || boundaries.length === 0) {
            return this.fallback(params);
        }
        return this.buildSegments(blocks, boundaries);
    }

    // ─────────────────────────────────────────────
    // Block preparation
    // ─────────────────────────────────────────────

    /** Split the document into paragraph blocks with real offsets. */
    private buildBlocks(text: string, options?: SemanticTextSegmentationOptions): DocumentBlock[] {
        const blocks: DocumentBlock[] = [];
        const regex = /\n\s*\n/g;
        let cursor = 0;
        let match = regex.exec(text);
        while (match !== null) {
            this.pushBlock(blocks, text, cursor, match.index);
            cursor = match.index + match[0].length;
            match = regex.exec(text);
        }
        this.pushBlock(blocks, text, cursor, text.length);
        return blocks.slice(0, options?.MaxBlocks ?? 300);
    }

    /** Append a block when the slice has content. */
    private pushBlock(blocks: DocumentBlock[], text: string, start: number, end: number): void {
        const body = text.slice(start, end).trim();
        if (body.length > 0) {
            blocks.push({ Index: blocks.length, Text: body, StartOffset: start, EndOffset: end });
        }
    }

    // ─────────────────────────────────────────────
    // LLM boundary detection
    // ─────────────────────────────────────────────

    /** Run the segmentation prompt and return validated boundary block indices. */
    private async proposeBoundaries(
        blocks: DocumentBlock[],
        params: SegmentationParams<SemanticTextSegmentationOptions>,
    ): Promise<{ startBlock: number; title?: string }[] | null> {
        const promptName = params.Options?.PromptName ?? SEMANTIC_SEGMENTATION_PROMPT_NAME;
        const prompt = AIEngine.Instance.Prompts.find((p) => p.Name === promptName && p.Status === 'Active');
        if (!prompt) {
            LogStatus(`[SemanticTextSegmenter] Prompt '${promptName}' not found — falling back to structural segmentation.`);
            return null;
        }

        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.contextUser = params.ContextUser;
        promptParams.data = { document: this.renderBlocks(blocks, params.Options), blockCount: blocks.length };
        promptParams.attemptJSONRepair = true;
        promptParams.additionalParameters = { temperature: 0.0 };
        if (params.Options?.ModelID) {
            promptParams.override = { modelId: params.Options.ModelID };
        }

        const result = await new AIPromptRunner().ExecutePrompt<BoundaryResponse>(promptParams);
        if (!result.success) {
            LogError(`[SemanticTextSegmenter] Boundary prompt failed: ${result.errorMessage ?? 'unknown error'}`);
            return null;
        }
        return this.sanitizeBoundaries(this.parseResult(result.result), blocks.length);
    }

    /** Render numbered, truncated blocks for the prompt. */
    private renderBlocks(blocks: DocumentBlock[], options?: SemanticTextSegmentationOptions): string {
        const previewChars = options?.BlockPreviewChars ?? 240;
        return blocks.map((b) => `[${b.Index}] ${b.Text.slice(0, previewChars)}`).join('\n\n');
    }

    /** Accept either a parsed object or a JSON string from the runner. */
    private parseResult(raw: BoundaryResponse | string | undefined): BoundaryResponse | null {
        if (!raw) {
            return null;
        }
        if (typeof raw !== 'string') {
            return raw;
        }
        try {
            return JSON.parse(raw) as BoundaryResponse;
        } catch {
            LogError(`[SemanticTextSegmenter] Could not parse boundary JSON: ${raw.substring(0, 200)}`);
            return null;
        }
    }

    /**
     * Clamp, dedupe, and sort model output. A hallucinated or out-of-range block
     * index must never become a chunk offset, so anything unusable is dropped here.
     */
    private sanitizeBoundaries(
        response: BoundaryResponse | null,
        blockCount: number,
    ): { startBlock: number; title?: string }[] {
        const raw = response?.boundaries ?? [];
        const seen = new Set<number>();
        const cleaned: { startBlock: number; title?: string }[] = [];

        for (const entry of raw) {
            const index = Number(entry?.startBlock);
            if (!Number.isInteger(index) || index < 0 || index >= blockCount || seen.has(index)) {
                continue;
            }
            seen.add(index);
            cleaned.push({ startBlock: index, title: entry.title?.trim() || undefined });
        }
        cleaned.sort((a, b) => a.startBlock - b.startBlock);
        if (cleaned.length > 0 && cleaned[0].startBlock !== 0) {
            cleaned.unshift({ startBlock: 0 });
        }
        return cleaned;
    }

    // ─────────────────────────────────────────────
    // Segment assembly
    // ─────────────────────────────────────────────

    /** Join blocks between consecutive boundaries into one segment each. */
    private buildSegments(blocks: DocumentBlock[], boundaries: { startBlock: number; title?: string }[]): RawSegment[] {
        return boundaries.map((boundary, i) => {
            const endBlock = i + 1 < boundaries.length ? boundaries[i + 1].startBlock : blocks.length;
            const slice = blocks.slice(boundary.startBlock, endBlock);
            const body = slice.map((b) => b.Text).join('\n\n');
            return {
                Modality: 'text',
                Title: boundary.title,
                Text: boundary.title ? `${boundary.title}\n${body}` : body,
                StartOffset: slice[0]?.StartOffset,
                EndOffset: slice[slice.length - 1]?.EndOffset,
            };
        });
    }

    /** Degrade to structural segmentation — never fail an ingestion run over segmentation. */
    private async fallback(params: SegmentationParams<SemanticTextSegmentationOptions>): Promise<RawSegment[]> {
        const structural = new StructuralTextSegmenter();
        const result = await structural.Segment({ Text: params.Text, MimeType: params.MimeType, Options: params.Options });
        return result.Segments.map((s) => ({
            Modality: s.Modality,
            Text: s.Text,
            Title: s.Title,
            StartOffset: s.StartOffset,
            EndOffset: s.EndOffset,
        }));
    }
}
