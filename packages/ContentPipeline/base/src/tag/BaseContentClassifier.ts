/**
 * @fileoverview Classification — what a piece of content is about.
 *
 * The Tag stage does not classify. It delegates to a registered classifier, because how
 * classification happens is a deployment's decision: an AI prompt against a governed tag hierarchy,
 * a rules table, a call to something external. Keeping it behind a contract is what stops the stage
 * from growing an opinion it has no business having.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** What a classifier is given. */
export interface ClassifyRequest {
    /** The text to classify. */
    Text: string;
    /** The record's title, when it has one — often the strongest short signal. */
    Title: string | null;
    /** The Content Item being classified. */
    RecordID: string | null;
    /**
     * The Content Source it belongs to, so a classifier can read what the source and its content
     * type say about classifying it — tag counts, attributes, classification context.
     */
    ContentSourceID?: string | null;
    /** The source's type-specific settings. */
    Parameters: Readonly<Record<string, string>>;
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to read through. */
    Provider: IMetadataProvider;
    /** Fires when the run is asked to stop. */
    Signal: AbortSignal;
    /** Report progress during a long classification. */
    ReportProgress(message: string): void;
}

/** One thing a classifier concluded. */
export interface ClassifiedTag {
    /** The tag's text. */
    Name: string;
    /** How confident the classifier is, 0–1. Left to the consumer to threshold. */
    Score?: number;
    /** An existing `MJ: Tags` row this matched, when the classifier resolved one. */
    TagID?: string;
    /** A parent the classifier suggested, used to nest the tag when it is new to the taxonomy. */
    Parent?: string | null;
    /** The classifier's reasoning for this tag, when available. */
    Reasoning?: string | null;
}

/** What a classifier concluded. */
export interface ClassifyResult {
    /** The tags, in whatever order the classifier considers meaningful. */
    Tags: ClassifiedTag[];
    /** The `MJ: AI Prompt Runs` ID that produced these tags, when classified by a prompt. */
    PromptRunID?: string | null;
    /** False when the classifier judged the text not to be the configured content type. */
    IsValidContent?: boolean;
    /** Anything else the deployment wants carried forward, under the classifier's own keys. */
    Extensions?: Record<string, unknown>;
}

/**
 * A registered way of deciding what content is about.
 *
 * @example
 * ```ts
 * @RegisterClass(BaseContentClassifier, 'Prompt')
 * export class PromptClassifier extends BaseContentClassifier {
 *     public readonly Key = 'Prompt';
 *     public async Classify(request: ClassifyRequest): Promise<ClassifyResult> { ... }
 * }
 * ```
 */
export abstract class BaseContentClassifier {
    /** The registration key. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Key: string;

    /** Decide what this content is about. */
    public abstract Classify(request: ClassifyRequest): Promise<ClassifyResult>;

    /** Resolve a registered classifier by key, returning null rather than a hollow base instance. */
    public static Resolve(key: string): BaseContentClassifier | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseContentClassifier>(
            BaseContentClassifier,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
