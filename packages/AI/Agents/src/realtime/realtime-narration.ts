/**
 * @fileoverview Shared narration helpers for BOTH realtime topologies.
 *
 * Two concerns live here so they exist exactly once:
 *
 * 1. **DB template resolution** — {@link ResolveNarrationInstructionsTemplate} looks up the
 *    seeded `Realtime Co-Agent - Progress Narration` prompt (with the deprecated pre-rename
 *    fallback) in {@link AIEngine}'s cached prompts. The client-direct path threads the
 *    template to the browser at session mint; the server-bridged path
 *    ({@link import('./realtime-session-runner').RealtimeSessionRunner}) consumes it directly.
 * 2. **Instruction building** — {@link BuildServerNarrationInstructions} substitutes the
 *    template's placeholders (or falls back to the documented built-in first-person wording)
 *    for the server-bridged runner's spoken progress updates. The Angular voice session has
 *    its own richer builder (it also chains the model's PRIOR spoken narrations, which only
 *    the browser can observe); this server-side builder is deliberately compact.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { LogStatus } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * The seeded name of the `MJ: AI Prompts` row whose `TemplateText` carries the first-person
 * progress-narration instructions (with a `{{ progressMessage }}` placeholder).
 */
export const NARRATION_PROMPT_NAME = 'Realtime Co-Agent - Progress Narration';

/**
 * DEPRECATED legacy name of {@link NARRATION_PROMPT_NAME}, from before the co-agent's rename
 * from "Voice Co-Agent" to "Realtime Co-Agent". Deployments that have not re-synced the prompt
 * seed still carry this name, so {@link ResolveNarrationInstructionsTemplate} falls back to it
 * (with a deprecation log).
 */
export const LEGACY_NARRATION_PROMPT_NAME = 'Voice Co-Agent - Progress Narration';

/** Placeholder token variants substituted by {@link BuildServerNarrationInstructions}. */
const PROGRESS_TOKENS = ['{{ progressMessage }}', '{{progressMessage}}'];
const PRIOR_TOKENS = ['{{ priorNarrations }}', '{{priorNarrations}}'];
const NUMBER_TOKENS = ['{{ updateNumber }}', '{{updateNumber}}'];

/**
 * Resolves the DB-driven progress-narration instruction template: the Active `MJ: AI Prompts`
 * row named {@link NARRATION_PROMPT_NAME}, read from {@link AIEngine}'s cached prompts. When
 * the current name is absent, falls back to the DEPRECATED {@link LEGACY_NARRATION_PROMPT_NAME}
 * (pre-rename seed) with a deprecation log. **Tolerant**: returns `null` (never throws) when
 * neither prompt is present, the text is empty, or the engine cache is unavailable — consumers
 * fall back to the built-in narration instruction wording.
 *
 * @returns The template text (containing a `{{ progressMessage }}` placeholder), or `null`.
 */
export function ResolveNarrationInstructionsTemplate(): string | null {
    try {
        const current = findActiveNarrationPromptText(NARRATION_PROMPT_NAME);
        if (current) {
            return current;
        }
        const legacy = findActiveNarrationPromptText(LEGACY_NARRATION_PROMPT_NAME);
        if (legacy) {
            LogStatus(
                `Realtime narration: resolved the narration prompt via its DEPRECATED legacy name ` +
                    `'${LEGACY_NARRATION_PROMPT_NAME}'. Re-sync the prompt seed metadata to rename it to ` +
                    `'${NARRATION_PROMPT_NAME}'.`
            );
            return legacy;
        }
        return null;
    } catch {
        return null; // engine cache unavailable — tolerated, consumers fall back
    }
}

/**
 * Finds the Active `MJ: AI Prompts` row with the given name (case/whitespace-insensitive) in
 * {@link AIEngine}'s cached prompts and returns its non-empty `TemplateText`, or `null`.
 */
function findActiveNarrationPromptText(promptName: string): string | null {
    const wanted = promptName.toLowerCase();
    const prompt = (AIEngine.Instance.Prompts ?? []).find(
        p => p.Name?.trim().toLowerCase() === wanted && p.Status === 'Active'
    );
    const text = prompt?.TemplateText;
    return text && text.trim().length > 0 ? text : null;
}

/** Replaces every occurrence of each token variant with the value. */
function replaceTokens(text: string, tokens: string[], value: string): string {
    let out = text;
    for (const t of tokens) {
        out = out.split(t).join(value);
    }
    return out;
}

/**
 * The documented BUILT-IN fallback wording for a server-bridged spoken progress update —
 * strictly first person (the co-agent owns the work), one short sentence, no repetition.
 * Used when no DB template resolved for the deployment.
 *
 * @param digest The aggregated progress digest (one or more updates, oldest first).
 * @param updateNumber 1-based number of this spoken update within the current task.
 * @returns The complete spoken-update instruction text.
 */
export function DefaultServerNarrationInstructions(digest: string, updateNumber: number): string {
    return (
        `Live progress on the work YOU are doing for the user (oldest first): ${digest}. ` +
        `This is spoken update #${updateNumber} for this task. ` +
        `Say ONE short, natural sentence in the FIRST PERSON continuing the story of what you are doing ` +
        `("I'm pulling that up now", "Got the first part — grabbing the rest"). VARY the phrasing across ` +
        `updates and never repeat information you've already conveyed — only add what's new. Strictly first ` +
        `person: the words "it" and the agent's name must not be the subject of your sentence, and never say ` +
        `generic filler like "it's still running in the background".`
    );
}

/**
 * Builds the spoken-update instructions for the server-bridged runner from the DB template
 * (substituting `{{ progressMessage }}` / `{{ updateNumber }}`, space and no-space variants),
 * falling back to {@link DefaultServerNarrationInstructions} when the template is absent or
 * blank. The `{{ priorNarrations }}` placeholder is substituted with a neutral note — the
 * server-bridged path cannot observe what the model actually SAID (those transcripts ride the
 * provider socket), unlike the browser host which chains them.
 *
 * @param template The DB-driven instruction template, or `null`/`undefined` when unavailable.
 * @param digest The aggregated progress digest (one or more updates, oldest first).
 * @param updateNumber 1-based number of this spoken update within the current task.
 * @returns The complete spoken-update instruction text.
 */
export function BuildServerNarrationInstructions(
    template: string | null | undefined,
    digest: string,
    updateNumber: number
): string {
    if (!template || template.trim().length === 0) {
        return DefaultServerNarrationInstructions(digest, updateNumber);
    }
    let out = replaceTokens(template, PROGRESS_TOKENS, digest);
    out = replaceTokens(
        out,
        PRIOR_TOKENS,
        updateNumber <= 1
            ? 'Nothing yet — this is your first spoken update for this task.'
            : `You have already spoken ${updateNumber - 1} update(s) for this task — do not repeat yourself; only add what's new.`
    );
    out = replaceTokens(out, NUMBER_TOKENS, String(updateNumber));
    return out;
}
