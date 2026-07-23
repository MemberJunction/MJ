/**
 * @fileoverview Shared types for the composed shell (SLICE-S1+).
 *
 * The shell owns an INTERNAL navigation state model instead of Angular Router
 * (Generic packages must stay Router-free); the host translates `viewChanged`
 * events to URLs and feeds state back via inputs.
 *
 * @module @memberjunction/ng-conversations
 */

/**
 * The composed shell's top-level views. `chat` = an open conversation thread
 * (Quiet Desk). `frontdoor` = the app-open landing (content arrives in S3).
 * `chats` / `projects` / `collections` / `routines` are the workspace surfaces
 * (W0a/W0b/W2/W3 — content arrives in S2/S4; S1 renders honest placeholders).
 */
export type ShellView =
    | 'frontdoor'
    | 'chat'
    | 'chats'
    | 'projects'
    | 'collections'
    | 'routines';

/** Appearance choice surfaced in the shell's Settings panel (host owns actual theming). */
export type ShellAppearance = 'system' | 'light' | 'dark';
