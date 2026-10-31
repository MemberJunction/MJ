/**
 * JSON shapes for the `MJ: Brand Kits` columns that store structured brand tokens,
 * voice settings, generation policy, and guardrail rules.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Named brand color token in a brand kit palette. */
export interface IBrandColor {
    /** Token name identifying this color in the palette (for example Primary, Accent, Surface). */
    Name: string;
    /** CSS hex color value, for example #0076B6. */
    Value: string;
    /** Optional notes describing when and how to apply this color. */
    Usage?: string;
}

/** Typography assignment for a text role in a brand kit. */
export interface IBrandTypeface {
    /** Semantic text role (for example Headline, Body, Caption, Monospace). */
    Role: string;
    /** Font family name to apply for this role. */
    FontFamily: string;
    /** Optional `MJ: Brand Kit Assets` ID of a Font asset providing the font file. */
    FontAssetID?: string;
    /** Optional numeric font weight (for example 400, 600, 700). */
    Weight?: number;
    /** Optional typography usage notes or sizing guidance. */
    Notes?: string;
}

/** Motion timing rule for a specific class of animated object. */
export interface IBrandMotionRule {
    /** Free text naming what moves (for example Headline, Panel, Camera). */
    ObjectClass: string;
    /** CSS or cubic-bezier easing curve to apply to this object class. */
    Easing: string;
    /** Optional standard transition duration in milliseconds. */
    DurationMs?: number;
    /** Optional motion guidance notes for this object class. */
    Notes?: string;
}

/** Motion rules and guidance used by motion and video generators. */
export interface IBrandMotion {
    /** Per-object-class motion timing and easing rules. */
    Rules?: IBrandMotionRule[];
    /** General motion direction and choreography notes. */
    Notes?: string;
}

/** BrandKit.Style — visual and motion style tokens for a brand kit. */
export interface IBrandStyle {
    /** Brand color palette tokens. */
    Palette: IBrandColor[];
    /** Brand typography role assignments. */
    Typography: IBrandTypeface[];
    /** Optional guidance describing the brand's imagery and illustration style. */
    ImageryStyle?: string;
    /** Optional visual patterns and qualities to preserve on brand. */
    Keep?: string[];
    /** Optional visual patterns and clichés to avoid. */
    Avoid?: string[];
    /** Optional motion rules used by motion and video generators. */
    Motion?: IBrandMotion;
}

/** BrandKit.Voice — default text-to-speech voice configuration for a brand kit. */
export interface IBrandVoice {
    /** Speech synthesis provider name (for example ElevenLabs, OpenAI). */
    Provider: string;
    /** Provider-specific voice identifier. */
    VoiceID: string;
    /** Optional speech model name override for the provider. */
    ModelName?: string;
    /** Optional provider-specific voice settings such as stability or similarity boost. */
    Settings?: Record<string, string | number | boolean>;
    /** Optional pronunciation guide for brand terms, acronyms, and proper nouns. */
    PronunciationNotes?: string;
}

/**
 * BrandKit.GenerationPolicy — media generation permissions and guardrails for a brand kit.
 * NULL on the column means "the defaults", and the defaults live in `BrandKitEngine` (VS-FND-5), not here.
 */
export interface IBrandGenerationPolicy {
    /** Whether AI-generated still images are permitted (default true). */
    AllowGeneratedImages?: boolean;
    /** Whether AI-generated video clips are permitted (default true). */
    AllowGeneratedVideo?: boolean;
    /** Whether synthetic people may be generated; a generated person may never be presented as a real member, customer, employee, speaker or beneficiary, and leaving it unset means not allowed (§3.4, default false). */
    AllowSyntheticPeople?: boolean;
    /** Optional brand style prompt prepended or merged into media generation prompts. */
    StylePrompt?: string;
    /** Optional subjects or motifs that media generators must never depict. */
    AvoidSubjects?: string[];
    /** Optional maximum media generation spend in USD per run, like MJ: AI Agents.MaxCostPerRun. */
    MaxGenerationCostPerRun?: number;
}

/** Single guardrail rule in `BrandKit.NeverInvent` naming a fact or claim that must never be fabricated. */
export type BrandNeverInventItem = string;
