/**
 * @fileoverview Strongly-typed citation parser for AI conversation messages.
 *
 * Parses inline record citations in both the lightweight wiki syntax
 * (`[[EntityName|RecordID|DisplayName]]` and 2-part `[[EntityName|RecordID]]`)
 * and MemberJunction's existing `@{type:"record",...}` mention syntax, skipping
 * fenced code blocks and inline code spans and deduplicating references in
 * 1-based order of first appearance.
 *
 * @module @memberjunction/ai-core-plus
 */

import { ConversationUtility, type MentionContent } from './conversation-utility';
import {
    FindMarkdownCodeRanges,
    IsIndexInCodeRange,
    ScanWikiCitationTokens,
} from './conversation-citation-scanner';

export type MessageCitationKind = 'record' | 'url' | 'artifact';

export interface MessageCitation {
    /** 1-based citation index in order of first appearance. */
    Index: number;
    /** Citation category. */
    Kind: MessageCitationKind;
    /** MJ entity name (set when Kind === 'record'). */
    EntityName?: string;
    /** Primary key string or semicolon-delimited composite key string (set when Kind === 'record'). */
    RecordID?: string;
    /** Parsed primary key field map (set when Kind === 'record'). */
    Keys?: Record<string, string | number>;
    /** Human-readable display label. */
    DisplayName: string;
    /** Target URL (set when Kind === 'url'). */
    Url?: string;
    /** Target artifact ID (set when Kind === 'artifact'). */
    ArtifactID?: string;
    /** Original raw token from the message text (first appearance). */
    RawToken: string;
}

export interface MessageCitationOccurrence {
    /** Start character index (inclusive) in the input text. */
    StartIndex: number;
    /** End character index (exclusive) in the input text. */
    EndIndex: number;
    /** Token syntax that produced this citation occurrence. */
    Syntax: 'wiki' | 'mention';
    /** Exact token substring from the input text. */
    RawToken: string;
    /** Reference to the deduplicated citation entry sharing its 1-based Index. */
    Citation: MessageCitation;
}

export interface ParsedCitationsResult {
    /** Deduplicated citations in order of first appearance (Index 1..N). */
    Citations: MessageCitation[];
    /** All citation occurrences outside code blocks/spans, sorted by StartIndex ascending. */
    Occurrences: MessageCitationOccurrence[];
}

interface CandidateOccurrence {
    StartIndex: number;
    EndIndex: number;
    Syntax: 'wiki' | 'mention';
    RawToken: string;
    Kind: MessageCitationKind;
    EntityName?: string;
    RecordID?: string;
    Keys?: Record<string, string | number>;
    DisplayName: string;
    HasExplicitDisplayName: boolean;
    Url?: string;
    ArtifactID?: string;
}

function buildRecordIdFromKeyMap(keys: Record<string, string | number>): string | undefined {
    const entries = Object.entries(keys).filter(([, v]) => v != null && String(v).trim() !== '');
    if (entries.length === 0) {
        return undefined;
    }
    if (entries.length === 1) {
        return String(entries[0][1]).trim();
    }
    return entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v).trim()}`)
        .join(';');
}

function buildDeduplicationKey(candidate: CandidateOccurrence): string {
    if (candidate.Kind === 'record') {
        const entityKey = (candidate.EntityName ?? '').trim().toLowerCase();
        const keyEntries = Object.entries(candidate.Keys ?? {})
            .filter(([, v]) => v != null && String(v).trim() !== '')
            .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .map(([k, v]) => `${k.toLowerCase()}=${String(v).trim().toLowerCase()}`);

        if (keyEntries.length > 0) {
            return `record:${entityKey}:${keyEntries.join(';')}`;
        }
        return `record:${entityKey}:${(candidate.RecordID ?? '').trim().toLowerCase()}`;
    }
    if (candidate.Kind === 'url') {
        return `url:${(candidate.Url ?? '').trim().toLowerCase()}`;
    }
    return `artifact:${(candidate.ArtifactID ?? '').trim().toLowerCase()}`;
}

/**
 * Parses inline record citations (`[[EntityName|RecordID|DisplayName]]`, `[[EntityName|RecordID]]`,
 * and `@{type:"record",...}`) from a conversation message while skipping fenced code blocks and
 * inline code spans. Deduplicates citations in order of first appearance with 1-based `Index`.
 */
export function ParseMessageCitations(text: string): ParsedCitationsResult {
    if (!text) {
        return { Citations: [], Occurrences: [] };
    }

    const codeRanges = FindMarkdownCodeRanges(text);
    const candidates: CandidateOccurrence[] = [];

    // 1. Scan wiki-style citations: [[EntityName|RecordID|DisplayName]] and [[EntityName|RecordID]]
    const wikiMatches = ScanWikiCitationTokens(text, codeRanges);
    for (const match of wikiMatches) {
        candidates.push({
            StartIndex: match.StartIndex,
            EndIndex: match.EndIndex,
            Syntax: 'wiki',
            RawToken: match.RawToken,
            Kind: 'record',
            EntityName: match.EntityName,
            RecordID: match.RecordID,
            Keys: match.Keys,
            DisplayName: match.DisplayName,
            HasExplicitDisplayName: match.HasExplicitDisplayName,
        });
    }

    // 2. Scan existing @{type:"record",...} special content tokens outside code blocks/spans
    const specialTokens = ConversationUtility.ParseSpecialContent(text);
    for (const token of specialTokens) {
        if (token.mode !== 'mention') continue;
        if (IsIndexInCodeRange(token.startIndex, codeRanges)) continue;

        const mention = token.content as MentionContent;
        if (mention.type !== 'record' || !mention.entityName?.trim()) continue;

        const entityName = mention.entityName.trim();
        const keys = ConversationUtility.RecordLinkKeyMap(mention);
        const recordId = buildRecordIdFromKeyMap(keys);
        const explicitName = (mention.name ?? '').trim();
        const hasExplicitDisplayName = explicitName.length > 0;
        const displayName = hasExplicitDisplayName ? explicitName : entityName;

        candidates.push({
            StartIndex: token.startIndex,
            EndIndex: token.endIndex,
            Syntax: 'mention',
            RawToken: token.originalText,
            Kind: 'record',
            EntityName: entityName,
            RecordID: recordId,
            Keys: Object.keys(keys).length > 0 ? keys : undefined,
            DisplayName: displayName,
            HasExplicitDisplayName: hasExplicitDisplayName,
        });
    }

    if (candidates.length === 0) {
        return { Citations: [], Occurrences: [] };
    }

    // Sort in order of appearance in the message
    candidates.sort((a, b) => a.StartIndex - b.StartIndex || a.EndIndex - b.EndIndex);

    const citations: MessageCitation[] = [];
    const occurrences: MessageCitationOccurrence[] = [];
    const byKey = new Map<string, { citation: MessageCitation; hasExplicitName: boolean }>();
    let lastEnd = -1;

    for (const candidate of candidates) {
        // Guard against overlapping tokens
        if (candidate.StartIndex < lastEnd) {
            continue;
        }
        lastEnd = candidate.EndIndex;

        const dedupKey = buildDeduplicationKey(candidate);
        let entry = byKey.get(dedupKey);
        if (!entry) {
            const citation: MessageCitation = {
                Index: citations.length + 1,
                Kind: candidate.Kind,
                EntityName: candidate.EntityName,
                RecordID: candidate.RecordID,
                Keys: candidate.Keys ? { ...candidate.Keys } : undefined,
                DisplayName: candidate.DisplayName,
                Url: candidate.Url,
                ArtifactID: candidate.ArtifactID,
                RawToken: candidate.RawToken,
            };
            citations.push(citation);
            entry = { citation, hasExplicitName: candidate.HasExplicitDisplayName };
            byKey.set(dedupKey, entry);
        } else if (!entry.hasExplicitName && candidate.HasExplicitDisplayName) {
            // Upgrade fallback entity-name label if a later occurrence supplies an explicit DisplayName
            entry.citation.DisplayName = candidate.DisplayName;
            entry.hasExplicitName = true;
        }

        occurrences.push({
            StartIndex: candidate.StartIndex,
            EndIndex: candidate.EndIndex,
            Syntax: candidate.Syntax,
            RawToken: candidate.RawToken,
            Citation: entry.citation,
        });
    }

    return {
        Citations: citations,
        Occurrences: occurrences,
    };
}
