/**
 * @fileoverview The data shape a mention-suggestion engine returns.
 *
 * ## Why this lives here and not in the composer
 *
 * `@memberjunction/ng-composer` declares a structurally identical `MentionSuggestion` as its
 * **rendering** contract — what a dropdown row and an inserted chip display. This is the
 * **data** contract: what a suggestion engine produces, independent of anything drawing it.
 *
 * They are the same shape today because the Angular composer was the only consumer. Now that a
 * React Native host renders the same suggestions with entirely different primitives, the producer
 * needs a home that does not live inside one renderer's package — a native app cannot depend on an
 * Angular library for a plain object, and MJ does not permit cross-package re-exports.
 *
 * The shapes are kept assignable on purpose, so the Angular shim can hand a runtime suggestion
 * straight to the composer with no mapping layer.
 */

/**
 * A configuration preset attached to a mention suggestion (e.g. an agent's Fast / Standard /
 * High Power presets).
 *
 * Deliberately generic — a suggestion engine has no knowledge of what a preset IS. Producers map
 * their domain objects (e.g. `MJ: AI Agent Configurations` rows) into this shape.
 */
export interface MentionSuggestionPreset {
    /** Stable identifier, carried by the inserted chip. */
    ID: string;
    /** Machine name, carried by the inserted chip. */
    Name: string;
    /** Friendly label shown in a preset picker (falls back to {@link Name}). */
    DisplayName?: string;
    /** Optional descriptive text shown under the preset label. */
    Description?: string;
    /** The preset preselected on insert. First preset wins when none is flagged. */
    IsDefault?: boolean;
}

/**
 * One item in a mention-autocomplete list, and the payload an inserted mention carries.
 *
 * `type` is an open string so a host can add its own vocabulary; the shipped producers use
 * `'agent' | 'user' | 'entity' | 'query' | 'skill'`. Renderers use it only for cosmetics (chip
 * palette, badge label) and for the plain-text serialization prefix.
 */
export interface MentionSuggestion {
    /** Open discriminator chosen by the producer. */
    type: string;
    /** Record id the mention resolves to. */
    id: string;
    /** Machine name. */
    name: string;
    /** Name as shown to a person. */
    displayName: string;
    /** Secondary line — an agent's description, a user's email. */
    description?: string;
    /** Image for the row and the chip (e.g. an agent's `LogoURL`). */
    imageUrl?: string;
    /** Font Awesome (or custom) icon class for the row and the chip. */
    icon?: string;
    /** Accent colour for the chip/badge (e.g. a skill's own Color metadata). */
    color?: string;
    /** Optional presets — 2+ presets warrant a preset picker on the inserted chip. */
    presets?: MentionSuggestionPreset[];
    /** Producer-defined extra payload; renderers never inspect it. */
    data?: Record<string, unknown>;
}
