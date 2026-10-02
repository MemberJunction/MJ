/**
 * @fileoverview Angular DI shim over the framework-agnostic `MentionParser` from
 * `@memberjunction/conversations-runtime`.
 *
 * Previously this service owned the regex-based mention-parsing logic. That logic
 * moved into the runtime in PR 1; this file is now a thin pass-through so existing
 * `inject(MentionParserService)` call sites keep working without changes.
 *
 * **For new code:** prefer `ConversationsRuntime.Instance.Mentions` directly.
 */

import { Injectable } from '@angular/core';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import type { Mention, MentionParseResult } from '@memberjunction/conversations-runtime';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo } from '@memberjunction/core';

import { ConversationsRuntimeBootstrap } from './conversations-runtime-bootstrap.service';

// NOTE: `Mention` and `MentionParseResult` are NOT re-exported from this file —
// the model's `conversation-state.model.ts` already exports `MentionParseResult`,
// and re-exporting here causes a public-api ambiguity. Consumers wanting the
// runtime's types should import from `@memberjunction/conversations-runtime`.

@Injectable({ providedIn: 'root' })
export class MentionParserService {
    constructor(_bootstrap: ConversationsRuntimeBootstrap) {
        // Injecting the bootstrap forces adapter registration on first construction.
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Mentions.parseMentions}. */
    ParseMentions(
        text: string,
        availableAgents: MJAIAgentEntityExtended[],
        availableUsers?: UserInfo[]
    ): MentionParseResult {
        return ConversationsRuntime.Instance.Mentions.parseMentions(
            text,
            availableAgents,
            availableUsers
        );
    }

    /** @deprecated Use {@link ParseMentions}. */
    parseMentions(
        text: string,
        availableAgents: MJAIAgentEntityExtended[],
        availableUsers?: UserInfo[]
    ): MentionParseResult {
        return this.ParseMentions(text, availableAgents, availableUsers);
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Mentions.validateMentions}. */
    ValidateMentions(
        text: string,
        availableAgents: MJAIAgentEntityExtended[],
        availableUsers?: UserInfo[]
    ): string[] {
        return ConversationsRuntime.Instance.Mentions.validateMentions(
            text,
            availableAgents,
            availableUsers
        );
    }

    /** @deprecated Use {@link ValidateMentions}. */
    validateMentions(
        text: string,
        availableAgents: MJAIAgentEntityExtended[],
        availableUsers?: UserInfo[]
    ): string[] {
        return this.ValidateMentions(text, availableAgents, availableUsers);
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Mentions.extractMentionNames}. */
    ExtractMentionNames(text: string): string[] {
        return ConversationsRuntime.Instance.Mentions.extractMentionNames(text);
    }

    /** @deprecated Use {@link ExtractMentionNames}. */
    extractMentionNames(text: string): string[] {
        return this.ExtractMentionNames(text);
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Mentions.formatMentions}. */
    FormatMentions(text: string, mentions: Mention[]): string {
        return ConversationsRuntime.Instance.Mentions.formatMentions(text, mentions);
    }

    /** @deprecated Use {@link FormatMentions}. */
    formatMentions(text: string, mentions: Mention[]): string {
        return this.FormatMentions(text, mentions);
    }

    /** Pass-through to {@link ConversationsRuntime.Instance.Mentions.toPlainText}. */
    ToPlainText(
        text: string,
        agents?: MJAIAgentEntityExtended[],
        users?: UserInfo[]
    ): string {
        return ConversationsRuntime.Instance.Mentions.toPlainText(text, agents, users);
    }

    /** @deprecated Use {@link ToPlainText}. */
    toPlainText(
        text: string,
        agents?: MJAIAgentEntityExtended[],
        users?: UserInfo[]
    ): string {
        return this.ToPlainText(text, agents, users);
    }
}
