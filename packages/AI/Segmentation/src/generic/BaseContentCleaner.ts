/**
 * @fileoverview Pluggable content cleaning — the stage that runs before segmentation.
 *
 * @module @memberjunction/ai-segmentation
 */

import { LogError } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/** Options common to every cleaner. */
export interface ContentCleaningOptions {
    /**
     * CSS selectors whose content is the ONLY content to keep. When set, everything
     * outside these selectors is discarded before any exclusion is applied.
     *
     * This is the highest-leverage knob for messy sources: pointing at `.article-body`
     * removes navigation, sidebars, and advertising in one stroke, without having to
     * enumerate every block you *don't* want.
     */
    IncludeSelectors?: string[];
    /**
     * CSS selectors to remove. Applied after `IncludeSelectors`. Use for the blocks that
     * survive the include (inline ad slots, share widgets, cookie banners).
     */
    ExcludeSelectors?: string[];
    /** Collapse runs of whitespace and blank lines. Default: true. */
    NormalizeWhitespace?: boolean;
    /** Maximum characters to retain; content beyond this is dropped. Unset = no limit. */
    MaxLength?: number;
}

/** Input to a cleaning pass. */
export interface ContentCleaningParams<TOptions extends ContentCleaningOptions = ContentCleaningOptions> {
    /** Raw content — markup or plain text. */
    Content: string;
    /** Mime type of `Content`, when known; lets a cleaner pick its parser. */
    MimeType?: string;
    /** Cleaner-specific options. */
    Options?: TOptions;
}

/** Result of a cleaning pass. Never throws for content-shaped problems. */
export interface ContentCleaningResult {
    Success: boolean;
    /** Cleaned text. Equal to the input when `Success` is false. */
    Content: string;
    /** Registration key of the cleaner that ran. */
    CleanerKey: string;
    ErrorMessage?: string;
    Warnings: string[];
    /** Characters removed by cleaning — a cheap signal that a selector is wrong. */
    CharactersRemoved: number;
}

/**
 * Base class for content cleaning strategies.
 *
 * Cleaning is deliberately a **separate stage from segmentation**, and a separate
 * plug-in point. The two answer different questions — cleaning asks *which text is
 * actually content*, segmentation asks *where that content divides* — and they change for
 * different reasons: a new CMS template needs new selectors, not a new chunking strategy.
 * Splitting them also means the cleaning rules apply once and benefit every downstream
 * consumer (embedding chunks, tagging chunks, full-text indexing) instead of being
 * reimplemented per pipeline.
 *
 * Garbage that survives this stage is expensive: it gets embedded, stored, retrieved, and
 * eventually shown to a user or an agent. Navigation chrome repeated across a thousand
 * pages produces a thousand near-identical vectors that crowd out real answers.
 *
 * ```typescript
 * @RegisterClass(BaseContentCleaner, 'MyCleaner')
 * export class MyCleaner extends BaseContentCleaner {
 *     public get Key(): string { return 'MyCleaner'; }
 *     protected CleanCore(params: ContentCleaningParams): string { return strip(params.Content); }
 * }
 * ```
 */
export abstract class BaseContentCleaner {
    /** Registration key; must match the key passed to `@RegisterClass`. */
    public abstract get Key(): string;

    /** Perform the cleaning. The base class handles validation, whitespace, and truncation. */
    protected abstract CleanCore(params: ContentCleaningParams): string;

    /**
     * Clean content ahead of segmentation.
     *
     * Never throws for content-shaped problems — inspect `Success`/`ErrorMessage`. On
     * failure the ORIGINAL content is returned rather than an empty string, so a bad
     * selector degrades to "not cleaned" instead of silently discarding the document.
     */
    public Clean(params: ContentCleaningParams): ContentCleaningResult {
        const warnings: string[] = [];
        const original = params.Content ?? '';
        if (original.trim().length === 0) {
            return this.buildResult('', original, warnings);
        }

        try {
            const cleaned = this.CleanCore(params);
            const finished = this.applyCommonRules(cleaned, params.Options, warnings);
            if (finished.trim().length === 0 && original.trim().length > 0) {
                warnings.push('Cleaning removed all content; falling back to the original text.');
                return this.buildResult(original, original, warnings);
            }
            return this.buildResult(finished, original, warnings);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`Content cleaner '${this.Key}' failed: ${message}`);
            return {
                Success: false,
                Content: original,
                CleanerKey: this.Key,
                ErrorMessage: message,
                Warnings: warnings,
                CharactersRemoved: 0,
            };
        }
    }

    /**
     * Resolve a registered cleaner by key.
     *
     * Uses `TryCreateInstance` because `CreateInstance` never returns null for an unknown
     * key — it silently yields a hollow base instance whose abstract members are undefined.
     */
    public static Resolve(key: string): BaseContentCleaner | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseContentCleaner>(
            BaseContentCleaner,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }

    /** Whitespace normalization and truncation, shared by every cleaner. */
    protected applyCommonRules(content: string, options?: ContentCleaningOptions, warnings?: string[]): string {
        let output = content;
        if (options?.NormalizeWhitespace !== false) {
            output = this.normalizeWhitespace(output);
        }
        if (options?.MaxLength && output.length > options.MaxLength) {
            warnings?.push(`Truncated to ${options.MaxLength} characters (was ${output.length}).`);
            output = output.slice(0, options.MaxLength);
        }
        return output.trim();
    }

    /**
     * Collapse horizontal whitespace and runs of blank lines, while preserving the single
     * blank line that marks a paragraph break — segmenters rely on it as a boundary signal.
     */
    protected normalizeWhitespace(content: string): string {
        return content
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t ]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n');
    }

    /** Build a successful result with the removal delta computed. */
    private buildResult(content: string, original: string, warnings: string[]): ContentCleaningResult {
        return {
            Success: true,
            Content: content,
            CleanerKey: this.Key,
            Warnings: warnings,
            CharactersRemoved: Math.max(original.length - content.length, 0),
        };
    }
}
