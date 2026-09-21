import { MentionAutocomplete } from '@memberjunction/conversations-runtime';

/**
 * @fileoverview Angular alias for the framework-agnostic `MentionAutocomplete` engine in
 * `@memberjunction/conversations-runtime`.
 *
 * The engine — permission-filtered agent / user / entity / query / skill caches, the `/` picker's
 * target-agent narrowing, and the per-trigger ranking — moved into the runtime. It had never
 * imported anything from `@angular/*` and carried no decorator; it was Angular-coupled only by
 * which package it happened to sit in, which meant a React Native host could not reach it without
 * a second implementation of the same permission rules.
 *
 * This alias keeps every existing `MentionAutocompleteService.Instance` call site working
 * unchanged. It is a `const`, not a subclass, so there is exactly one instance and one cache
 * warm-up shared with the ClassFactory-instantiated trigger providers and any non-Angular host.
 *
 * **For new code:** import `MentionAutocomplete` from `@memberjunction/conversations-runtime`.
 */
export const MentionAutocompleteService = MentionAutocomplete;

/** The engine's type, for call sites that annotate it. */
export type MentionAutocompleteService = MentionAutocomplete;
