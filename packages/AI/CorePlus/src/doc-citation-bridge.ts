/**
 * @fileoverview Deterministic bidirectional citation bridge uniting MJ Docs `DocRecordLink`
 * (`[[EntityName|RecordID|DisplayName]]`, artifact/version wiki links, and durable
 * `@{"_mode":"mention","type":"record",...}` tokens) with `@memberjunction/ai-core-plus`
 * `MessageCitation` and `MJ: Artifact Uses` (`MJArtifactUseEntity`) attribution payloads.
 *
 * Pure, browser- and server-safe with zero cross-package re-exports, zero `any`,
 * zero lazy `unknown` casts, and zero `.Get()`/`.Set()` entity access.
 *
 * @module @memberjunction/ai-core-plus
 */

import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJArtifactUseEntity } from '@memberjunction/core-entities';
import { IsValidUUID, NormalizeUUID } from '@memberjunction/global';
import {
    FindMarkdownCodeRanges,
    IsIndexInCodeRange,
    ParseWikiCitationKeys,
    ScanWikiCitationTokens,
    type RawWikiCitationMatch,
} from './conversation-citation-scanner';
import { type MessageCitation } from './conversation-citations';
import { ConversationUtility, type MentionContent } from './conversation-utility';

const ARTIFACTS_ENTITY_NAME = 'MJ: Artifacts';
const ARTIFACT_VERSIONS_ENTITY_NAME = 'MJ: Artifact Versions';
const DEFAULT_USAGE_SOURCE = 'doc-citation-bridge';

/** Supported source token syntaxes for {@link DocRecordLink}. */
export type DocRecordLinkSyntax = 'wiki' | 'mention';

/** High-level target classification of a {@link DocRecordLink}. */
export type DocRecordLinkTargetKind = 'record' | 'artifact';

/** Strongly-typed usage verb derived directly from generated `MJArtifactUseEntity['UsageType']`. */
export type ArtifactCitationUsageType = MJArtifactUseEntity['UsageType'];

/**
 * Canonical representation of a document record or artifact/version reference extracted from
 * wiki syntax (`[[...]]`) or durable mention syntax (`@{"_mode":"mention","type":"record",...}`).
 */
export interface DocRecordLink {
    /** Whether this reference points to a general entity record or an MJ Artifact / Artifact Version. */
    TargetKind: DocRecordLinkTargetKind;
    /** Syntax that produced this link (`'wiki'` or `'mention'`). */
    Syntax: DocRecordLinkSyntax;
    /** Canonical MJ entity name (e.g., `'MJ: Companies'`, `'MJ: Artifacts'`, `'MJ: Artifact Versions'`). */
    EntityName: string;
    /** Primary key string or semicolon-delimited composite key expression. */
    RecordID: string;
    /** Parsed primary key field map. */
    Keys: Record<string, string | number>;
    /** Human-readable display label (falls back to `EntityName` when omitted). */
    DisplayName: string;
    /** True when an explicit non-empty display label was supplied by the source token. */
    HasExplicitDisplayName: boolean;
    /** Target `MJ: Artifacts.ID` when `TargetKind === 'artifact'` and artifact ID is known. */
    ArtifactID?: string;
    /** Target `MJ: Artifact Versions.ID` when pinned to a specific artifact version UUID. */
    ArtifactVersionID?: string;
    /** Target numeric artifact version number (e.g., `2` from `@v2`) when specified. */
    VersionNumber?: number;
    /** Case-insensitive deduplication key uniquely identifying the link target (including version). */
    DeduplicationKey: string;
    /** Exact raw token substring from source text (or canonical `[[...]]` string when synthesized). */
    RawToken: string;
    /** Inclusive start character offset in source text, or `-1` when synthesized programmatically. */
    StartIndex: number;
    /** Exclusive end character offset in source text, or `-1` when synthesized programmatically. */
    EndIndex: number;
}

/**
 * Structured JSON metadata stored in `MJArtifactUseEntity.UsageContext` for cited artifacts.
 */
export interface ArtifactUseCitationContext {
    /** Subsystem origin marker (defaults to `'doc-citation-bridge'`). */
    Source: string;
    /** Optional conversation ID where the citation appeared. */
    ConversationID?: string;
    /** Optional conversation detail/message ID where the citation appeared. */
    ConversationDetailID?: string;
    /** Optional source document artifact ID when one document cites another. */
    SourceArtifactID?: string;
    /** 1-based citation index from the unified `MessageCitation`, when present. */
    CitationIndex?: number;
    /** Canonical `[[...]]` link representation for round-trip auditability. */
    CanonicalLink: string;
    /** Canonical entity name from the originating link. */
    EntityName?: string;
}

/**
 * Strongly-typed `MJ: Artifact Uses` attribution payload produced from a cited artifact link.
 */
export interface ArtifactUseCitationPayload {
    /** Target `MJ: Artifact Versions.ID` required by `MJ: Artifact Uses`. */
    ArtifactVersionID: string;
    /** Target `MJ: Artifacts.ID` when known. */
    ArtifactID?: string;
    /** Target numeric version number when known. */
    VersionNumber?: number;
    /** Acting `MJ: Users.ID` performing the citation/view action. */
    UserID: string;
    /** Strongly-typed usage verb derived from `MJArtifactUseEntity['UsageType']`. */
    UsageType: ArtifactCitationUsageType;
    /** Structured context object mirrored as JSON in `UsageContextJSON`. */
    UsageContext: ArtifactUseCitationContext;
    /** Deterministic JSON string ready for `MJArtifactUseEntity.UsageContext`. */
    UsageContextJSON: string;
    /** Human-readable display label of the cited artifact. */
    DisplayName: string;
}

/**
 * Options for building an {@link ArtifactUseCitationPayload} from a link or citation.
 */
export interface ArtifactUseMappingOptions {
    /** Acting `MJ: Users.ID`. */
    UserID: string;
    /** Usage verb (defaults to `'Viewed'`). */
    UsageType?: ArtifactCitationUsageType;
    /** Optional conversation ID for provenance tracking. */
    ConversationID?: string;
    /** Optional conversation detail ID for provenance tracking. */
    ConversationDetailID?: string;
    /** Optional source document artifact ID when a document cites another artifact. */
    SourceArtifactID?: string;
    /** Optional 1-based citation index. */
    CitationIndex?: number;
    /** Explicit `ArtifactVersionID` override when the link itself did not specify one. */
    ArtifactVersionID?: string;
    /** Optional resolver mapping an artifact link to its active `ArtifactVersionID`. */
    ResolveArtifactVersionID?: (link: DocRecordLink) => string | null | undefined;
}

/**
 * Options for {@link BridgeDocLinksToCitationsAndArtifactUses}.
 */
export interface DocCitationBridgeOptions {
    /** Skip fenced code blocks and inline backtick code spans (defaults to `true`). */
    SkipCode?: boolean;
    /** Acting `MJ: Users.ID` used to construct `ArtifactUseCitationPayload` entries. */
    UserID?: string;
    /** Usage verb for generated `ArtifactUse` payloads (defaults to `'Viewed'`). */
    UsageType?: ArtifactCitationUsageType;
    /** Optional conversation ID recorded in `ArtifactUseCitationContext`. */
    ConversationID?: string;
    /** Optional conversation detail ID recorded in `ArtifactUseCitationContext`. */
    ConversationDetailID?: string;
    /** Optional source document artifact ID recorded in `ArtifactUseCitationContext`. */
    SourceArtifactID?: string;
    /** Optional resolver mapping an artifact link without a pinned version ID to an `ArtifactVersionID`. */
    ResolveArtifactVersionID?: (link: DocRecordLink) => string | null | undefined;
}

/**
 * Single unified entry pairing a deduplicated {@link DocRecordLink}, its {@link MessageCitation},
 * its canonical `[[...]]` representation, and an optional {@link ArtifactUseCitationPayload}.
 */
export interface BridgedDocCitationEntry {
    /** Deduplicated canonical document link. */
    Link: DocRecordLink;
    /** Unified `MessageCitation` with 1-based `Index`. */
    Citation: MessageCitation;
    /** Canonical `[[...]]` wiki link formatted from `Link`. */
    CanonicalWikiLink: string;
    /** Optional `MJ: Artifact Uses` attribution payload when target is a version-resolved artifact. */
    ArtifactUse?: ArtifactUseCitationPayload;
}

/**
 * Complete output returned by {@link BridgeDocLinksToCitationsAndArtifactUses}.
 */
export interface DocCitationBridgeResult {
    /** Deduplicated links in 1-based order of first appearance. */
    Links: DocRecordLink[];
    /** All raw link occurrences in source order before deduplication. */
    Occurrences: DocRecordLink[];
    /** Unified `MessageCitation[]` in 1-based order of first appearance. */
    Citations: MessageCitation[];
    /** Deduplicated `MJ: Artifact Uses` attribution payloads ready for persistence. */
    ArtifactUses: ArtifactUseCitationPayload[];
    /** Paired entries mapping each link to its citation, canonical `[[...]]` text, and artifact use. */
    Entries: BridgedDocCitationEntry[];
}

/**
 * Result returned by {@link RecordCitedArtifactUse}.
 */
export interface RecordCitedArtifactUseResult {
    Success: boolean;
    ArtifactUseID?: string;
    ErrorMessage?: string;
}

interface ParsedArtifactMetadata {
    TargetKind: DocRecordLinkTargetKind;
    CanonicalEntityName: string;
    BaseRecordID: string;
    Keys: Record<string, string | number>;
    ArtifactID?: string;
    ArtifactVersionID?: string;
    VersionNumber?: number;
}

function normalizeIdentifier(value: string): string {
    const trimmed = value.trim();
    return IsValidUUID(trimmed) ? NormalizeUUID(trimmed) : trimmed.toLowerCase();
}

function parsePositiveVersionNumber(raw: string | number | undefined): number | undefined {
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
        return raw;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim().replace(/^v/i, '');
        if (/^\d+$/.test(trimmed)) {
            const parsed = Number.parseInt(trimmed, 10);
            if (parsed > 0) {
                return parsed;
            }
        }
    }
    return undefined;
}

function readCaseInsensitiveKey(
    keys: Record<string, string | number>,
    candidates: ReadonlyArray<string>
): string | number | undefined {
    const lowerTargets = new Set(candidates.map((c) => c.toLowerCase()));
    for (const [k, v] of Object.entries(keys)) {
        if (lowerTargets.has(k.toLowerCase()) && v !== undefined && String(v).trim() !== '') {
            return v;
        }
    }
    return undefined;
}

function normalizeArtifactEntityName(rawEntityName: string): {
    TargetKind: DocRecordLinkTargetKind;
    CanonicalEntityName: string;
} {
    const trimmed = rawEntityName.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'mj: artifacts' || lower === 'artifact' || lower === 'artifacts') {
        return { TargetKind: 'artifact', CanonicalEntityName: ARTIFACTS_ENTITY_NAME };
    }
    if (lower === 'mj: artifact versions' || lower === 'artifact version' || lower === 'artifact versions') {
        return { TargetKind: 'artifact', CanonicalEntityName: ARTIFACT_VERSIONS_ENTITY_NAME };
    }
    return { TargetKind: 'record', CanonicalEntityName: trimmed };
}

function splitArtifactVersionQualifier(rawRecordId: string): {
    BaseId: string;
    VersionNumber?: number;
    ArtifactVersionID?: string;
} {
    const trimmed = rawRecordId.trim();
    const versionNumMatch = trimmed.match(/^([^@#;]+)[@#]v(\d+)$/i);
    if (versionNumMatch) {
        return {
            BaseId: versionNumMatch[1].trim(),
            VersionNumber: parsePositiveVersionNumber(versionNumMatch[2]),
        };
    }
    const versionUuidMatch = trimmed.match(/^([^@#;]+)[@#]([0-9a-f-]{36})$/i);
    if (versionUuidMatch && IsValidUUID(versionUuidMatch[2])) {
        return {
            BaseId: versionUuidMatch[1].trim(),
            ArtifactVersionID: versionUuidMatch[2].trim(),
        };
    }
    return { BaseId: trimmed };
}

function resolveArtifactMetadata(
    rawEntityName: string,
    rawRecordId: string,
    rawKeys: Record<string, string | number>
): ParsedArtifactMetadata {
    const { TargetKind, CanonicalEntityName } = normalizeArtifactEntityName(rawEntityName);
    const keys: Record<string, string | number> = { ...rawKeys };

    if (TargetKind === 'record') {
        return {
            TargetKind: 'record',
            CanonicalEntityName,
            BaseRecordID: rawRecordId.trim(),
            Keys: keys,
        };
    }

    if (CanonicalEntityName === ARTIFACT_VERSIONS_ENTITY_NAME) {
        const versionIdFromKey = readCaseInsensitiveKey(keys, ['ID', 'ArtifactVersionID']);
        const artifactVersionId = versionIdFromKey ? String(versionIdFromKey).trim() : rawRecordId.trim();
        const artifactIdRaw = readCaseInsensitiveKey(keys, ['ArtifactID']);
        const artifactId = artifactIdRaw ? String(artifactIdRaw).trim() : undefined;
        const versionNumber = parsePositiveVersionNumber(readCaseInsensitiveKey(keys, ['VersionNumber', 'Version']));
        if (artifactVersionId && !keys.ID) {
            keys.ID = artifactVersionId;
        }
        return {
            TargetKind: 'artifact',
            CanonicalEntityName,
            BaseRecordID: artifactVersionId,
            Keys: keys,
            ArtifactID: artifactId,
            ArtifactVersionID: artifactVersionId || undefined,
            VersionNumber: versionNumber,
        };
    }

    // MJ: Artifacts target
    let baseId = rawRecordId.trim();
    let artifactVersionId: string | undefined;
    let versionNumber: number | undefined;

    if (!rawRecordId.includes('=')) {
        const split = splitArtifactVersionQualifier(rawRecordId);
        baseId = split.BaseId;
        artifactVersionId = split.ArtifactVersionID;
        versionNumber = split.VersionNumber;
        if (baseId) {
            keys.ID = baseId;
        }
    } else {
        const idFromKey = readCaseInsensitiveKey(keys, ['ID', 'ArtifactID']);
        baseId = idFromKey ? String(idFromKey).trim() : baseId;
    }

    const keyVersionId = readCaseInsensitiveKey(keys, ['ArtifactVersionID', 'VersionID']);
    if (!artifactVersionId && keyVersionId) {
        artifactVersionId = String(keyVersionId).trim();
    }
    const keyVersionNum = parsePositiveVersionNumber(readCaseInsensitiveKey(keys, ['VersionNumber', 'Version']));
    if (versionNumber === undefined && keyVersionNum !== undefined) {
        versionNumber = keyVersionNum;
    }

    if (artifactVersionId) {
        keys.ArtifactVersionID = artifactVersionId;
    }
    if (versionNumber !== undefined) {
        keys.VersionNumber = versionNumber;
    }

    return {
        TargetKind: 'artifact',
        CanonicalEntityName,
        BaseRecordID: baseId,
        Keys: keys,
        ArtifactID: baseId || undefined,
        ArtifactVersionID: artifactVersionId,
        VersionNumber: versionNumber,
    };
}

function buildDocRecordLinkDedupKey(meta: {
    TargetKind: DocRecordLinkTargetKind;
    EntityName: string;
    RecordID: string;
    Keys: Record<string, string | number>;
    ArtifactID?: string;
    ArtifactVersionID?: string;
    VersionNumber?: number;
}): string {
    if (meta.TargetKind === 'artifact') {
        const artPart = meta.ArtifactID ? normalizeIdentifier(meta.ArtifactID) : '';
        const verIdPart = meta.ArtifactVersionID ? normalizeIdentifier(meta.ArtifactVersionID) : '';
        const verNumPart = meta.VersionNumber !== undefined ? `v${meta.VersionNumber}` : '';
        if (artPart) {
            return `artifact:${artPart}:${verIdPart}:${verNumPart}`;
        }
        if (verIdPart) {
            return `artifact-version:${verIdPart}:${verNumPart}`;
        }
        return `artifact:${normalizeIdentifier(meta.RecordID)}`;
    }

    const entityKey = meta.EntityName.trim().toLowerCase();
    const keyEntries = Object.entries(meta.Keys)
        .filter(([, v]) => v !== undefined && String(v).trim() !== '')
        .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map(([k, v]) => `${k.toLowerCase()}=${normalizeIdentifier(String(v))}`);

    if (keyEntries.length > 0) {
        return `record:${entityKey}:${keyEntries.join(';')}`;
    }
    return `record:${entityKey}:${normalizeIdentifier(meta.RecordID)}`;
}

function buildRecordIdFromKeyMap(keys: Record<string, string | number>): string {
    const entries = Object.entries(keys).filter(([, v]) => v !== undefined && String(v).trim() !== '');
    if (entries.length === 0) {
        return '';
    }
    if (entries.length === 1) {
        return String(entries[0][1]).trim();
    }
    return entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v).trim()}`)
        .join(';');
}

function buildDocRecordLinkFromWikiMatch(match: RawWikiCitationMatch): DocRecordLink | null {
    const inner = match.RawToken.slice(2, -2);
    const parts = inner.split('|');
    const rawEntity = (parts[0] ?? '').trim();
    const rawRecordId = (parts[1] ?? '').trim();
    if (!rawEntity || !rawRecordId) {
        return null;
    }

    // Support optional 4-part version shorthand: [[MJ: Artifacts|<ArtifactID>|v<N>|<DisplayName>]]
    let explicitVersionFromPart: number | undefined;
    let rawDisplayName = '';
    if (parts.length >= 4 && /^v\d+$/i.test(parts[2].trim())) {
        explicitVersionFromPart = parsePositiveVersionNumber(parts[2].trim());
        rawDisplayName = parts.slice(3).join('|').trim();
    } else if (parts.length >= 3) {
        rawDisplayName = parts.slice(2).join('|').trim();
    }

    const rawKeys = ParseWikiCitationKeys(rawRecordId);
    if (explicitVersionFromPart !== undefined) {
        rawKeys.VersionNumber = explicitVersionFromPart;
    }

    const meta = resolveArtifactMetadata(rawEntity, rawRecordId, rawKeys);
    if (!meta.BaseRecordID && !meta.ArtifactID && !meta.ArtifactVersionID) {
        return null;
    }

    const hasExplicitDisplayName = rawDisplayName.length > 0;
    const displayName = hasExplicitDisplayName ? rawDisplayName : meta.CanonicalEntityName;

    return {
        TargetKind: meta.TargetKind,
        Syntax: 'wiki',
        EntityName: meta.CanonicalEntityName,
        RecordID: meta.BaseRecordID,
        Keys: meta.Keys,
        DisplayName: displayName,
        HasExplicitDisplayName: hasExplicitDisplayName,
        ArtifactID: meta.ArtifactID,
        ArtifactVersionID: meta.ArtifactVersionID,
        VersionNumber: meta.VersionNumber,
        DeduplicationKey: buildDocRecordLinkDedupKey({
            TargetKind: meta.TargetKind,
            EntityName: meta.CanonicalEntityName,
            RecordID: meta.BaseRecordID,
            Keys: meta.Keys,
            ArtifactID: meta.ArtifactID,
            ArtifactVersionID: meta.ArtifactVersionID,
            VersionNumber: meta.VersionNumber,
        }),
        RawToken: match.RawToken,
        StartIndex: match.StartIndex,
        EndIndex: match.EndIndex,
    };
}

function buildDocRecordLinkFromMentionToken(
    mention: MentionContent,
    rawToken: string,
    startIndex: number,
    endIndex: number
): DocRecordLink | null {
    if (mention.type !== 'record' || !mention.entityName?.trim()) {
        return null;
    }
    const rawEntity = mention.entityName.trim();
    const rawKeys = ConversationUtility.RecordLinkKeyMap(mention);
    const rawRecordId = buildRecordIdFromKeyMap(rawKeys);
    if (!rawRecordId) {
        return null;
    }

    const meta = resolveArtifactMetadata(rawEntity, rawRecordId, rawKeys);
    if (!meta.BaseRecordID && !meta.ArtifactID && !meta.ArtifactVersionID) {
        return null;
    }

    const explicitName = (mention.name ?? '').trim();
    const hasExplicitDisplayName = explicitName.length > 0;
    const displayName = hasExplicitDisplayName ? explicitName : meta.CanonicalEntityName;

    return {
        TargetKind: meta.TargetKind,
        Syntax: 'mention',
        EntityName: meta.CanonicalEntityName,
        RecordID: meta.BaseRecordID,
        Keys: meta.Keys,
        DisplayName: displayName,
        HasExplicitDisplayName: hasExplicitDisplayName,
        ArtifactID: meta.ArtifactID,
        ArtifactVersionID: meta.ArtifactVersionID,
        VersionNumber: meta.VersionNumber,
        DeduplicationKey: buildDocRecordLinkDedupKey({
            TargetKind: meta.TargetKind,
            EntityName: meta.CanonicalEntityName,
            RecordID: meta.BaseRecordID,
            Keys: meta.Keys,
            ArtifactID: meta.ArtifactID,
            ArtifactVersionID: meta.ArtifactVersionID,
            VersionNumber: meta.VersionNumber,
        }),
        RawToken: rawToken,
        StartIndex: startIndex,
        EndIndex: endIndex,
    };
}

/**
 * Deterministically extracts all {@link DocRecordLink} occurrences (`[[...]]` wiki links and
 * durable `@{"_mode":"mention","type":"record",...}` tokens) from markdown or conversation text
 * in ascending order of appearance, skipping fenced code blocks and inline code spans by default.
 */
export function ParseDocRecordLinks(
    text: string,
    options?: { SkipCode?: boolean }
): DocRecordLink[] {
    if (!text || (!text.includes('[[') && !text.includes('@{'))) {
        return [];
    }

    const skipCode = options?.SkipCode ?? true;
    const codeRanges = skipCode ? FindMarkdownCodeRanges(text) : [];
    const candidates: DocRecordLink[] = [];

    if (text.includes('[[')) {
        const wikiMatches = ScanWikiCitationTokens(text, codeRanges);
        for (const match of wikiMatches) {
            const parsed = buildDocRecordLinkFromWikiMatch(match);
            if (parsed) {
                candidates.push(parsed);
            }
        }
    }

    if (text.includes('@{')) {
        const specialTokens = ConversationUtility.ParseSpecialContent(text);
        for (const token of specialTokens) {
            if (token.mode !== 'mention') {
                continue;
            }
            if (skipCode && IsIndexInCodeRange(token.startIndex, codeRanges)) {
                continue;
            }
            const mention = token.content as MentionContent;
            const parsed = buildDocRecordLinkFromMentionToken(
                mention,
                token.originalText,
                token.startIndex,
                token.endIndex
            );
            if (parsed) {
                candidates.push(parsed);
            }
        }
    }

    candidates.sort((a, b) => a.StartIndex - b.StartIndex || a.EndIndex - b.EndIndex);

    const nonOverlapping: DocRecordLink[] = [];
    let lastEnd = -1;
    for (const candidate of candidates) {
        if (candidate.StartIndex < lastEnd) {
            continue;
        }
        lastEnd = candidate.EndIndex;
        nonOverlapping.push(candidate);
    }
    return nonOverlapping;
}

/**
 * Deduplicates {@link DocRecordLink} items by {@link DocRecordLink.DeduplicationKey} while
 * preserving first-appearance order and upgrading fallback display labels when a later
 * occurrence supplies an explicit `DisplayName`. Does not mutate input link objects.
 */
export function DeduplicateDocRecordLinks(links: ReadonlyArray<DocRecordLink>): DocRecordLink[] {
    const result: DocRecordLink[] = [];
    const byKey = new Map<string, DocRecordLink>();

    for (const link of links) {
        const existing = byKey.get(link.DeduplicationKey);
        if (!existing) {
            const copy: DocRecordLink = {
                ...link,
                Keys: { ...link.Keys },
            };
            result.push(copy);
            byKey.set(link.DeduplicationKey, copy);
            continue;
        }

        if (!existing.HasExplicitDisplayName && link.HasExplicitDisplayName) {
            existing.DisplayName = link.DisplayName;
            existing.HasExplicitDisplayName = true;
        }
        if (!existing.ArtifactID && link.ArtifactID) {
            existing.ArtifactID = link.ArtifactID;
        }
        if (!existing.ArtifactVersionID && link.ArtifactVersionID) {
            existing.ArtifactVersionID = link.ArtifactVersionID;
        }
        if (existing.VersionNumber === undefined && link.VersionNumber !== undefined) {
            existing.VersionNumber = link.VersionNumber;
        }
    }

    return result;
}

/**
 * Formats a {@link DocRecordLink} into its canonical `[[...]]` wiki link representation,
 * preserving composite keys, artifact version IDs, and numeric version numbers losslessly.
 */
export function FormatDocRecordLink(
    link: Pick<
        DocRecordLink,
        | 'TargetKind'
        | 'EntityName'
        | 'RecordID'
        | 'Keys'
        | 'DisplayName'
        | 'HasExplicitDisplayName'
        | 'ArtifactID'
        | 'ArtifactVersionID'
        | 'VersionNumber'
    >
): string {
    const entityName = link.EntityName.trim();
    const recordSegment = formatRecordSegment(link);
    const displayName = (link.DisplayName ?? '').trim();
    const includeDisplayName =
        link.HasExplicitDisplayName || (displayName.length > 0 && displayName !== entityName);

    if (includeDisplayName && displayName.length > 0) {
        return `[[${entityName}|${recordSegment}|${displayName}]]`;
    }
    return `[[${entityName}|${recordSegment}]]`;
}

function formatRecordSegment(
    link: Pick<
        DocRecordLink,
        'TargetKind' | 'EntityName' | 'RecordID' | 'Keys' | 'ArtifactID' | 'ArtifactVersionID' | 'VersionNumber'
    >
): string {
    if (link.TargetKind === 'artifact') {
        if (link.EntityName.trim().toLowerCase() === ARTIFACT_VERSIONS_ENTITY_NAME.toLowerCase()) {
            const parts: string[] = [];
            const versionId = link.ArtifactVersionID ?? link.RecordID;
            if (link.ArtifactID || link.VersionNumber !== undefined) {
                parts.push(`ID=${versionId}`);
                if (link.ArtifactID) {
                    parts.push(`ArtifactID=${link.ArtifactID}`);
                }
                if (link.VersionNumber !== undefined) {
                    parts.push(`VersionNumber=${link.VersionNumber}`);
                }
                return parts.join(';');
            }
            return versionId;
        }

        const artifactId = link.ArtifactID ?? link.RecordID;
        if (link.ArtifactVersionID && link.VersionNumber !== undefined) {
            return `ID=${artifactId};ArtifactVersionID=${link.ArtifactVersionID};VersionNumber=${link.VersionNumber}`;
        }
        if (link.ArtifactVersionID) {
            return `${artifactId}@${link.ArtifactVersionID}`;
        }
        if (link.VersionNumber !== undefined) {
            return `${artifactId}@v${link.VersionNumber}`;
        }
        return artifactId;
    }

    const keyEntries = Object.entries(link.Keys ?? {}).filter(
        ([, v]) => v !== undefined && String(v).trim() !== ''
    );
    if (keyEntries.length > 1) {
        return keyEntries
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${String(v).trim()}`)
            .join(';');
    }
    if (keyEntries.length === 1 && keyEntries[0][0].toLowerCase() !== 'id') {
        return `${keyEntries[0][0]}=${String(keyEntries[0][1]).trim()}`;
    }
    return link.RecordID.trim();
}

/**
 * Converts a {@link DocRecordLink} into a unified `@memberjunction/ai-core-plus`
 * {@link MessageCitation} with 1-based `Index` and preserved entity/record/artifact/version metadata.
 */
export function DocRecordLinkToMessageCitation(link: DocRecordLink, index: number): MessageCitation {
    const keysCopy: Record<string, string | number> = { ...link.Keys };
    if (link.ArtifactVersionID) {
        keysCopy.ArtifactVersionID = link.ArtifactVersionID;
    }
    if (link.VersionNumber !== undefined) {
        keysCopy.VersionNumber = link.VersionNumber;
    }

    return {
        Index: index,
        Kind: link.TargetKind === 'artifact' ? 'artifact' : 'record',
        EntityName: link.EntityName,
        RecordID: link.RecordID,
        Keys: Object.keys(keysCopy).length > 0 ? keysCopy : undefined,
        DisplayName: link.DisplayName,
        ArtifactID: link.TargetKind === 'artifact' ? link.ArtifactID : undefined,
        RawToken: link.RawToken,
    };
}

/**
 * Converts a {@link MessageCitation} (`Kind: 'record' | 'artifact'`) back into a canonical
 * {@link DocRecordLink}. Returns `null` for `Kind === 'url'` or incomplete citations.
 */
export function MessageCitationToDocRecordLink(citation: MessageCitation): DocRecordLink | null {
    if (!citation || citation.Kind === 'url') {
        return null;
    }

    const rawKeys: Record<string, string | number> = citation.Keys ? { ...citation.Keys } : {};
    const isArtifactCitation =
        citation.Kind === 'artifact' ||
        Boolean(citation.ArtifactID?.trim()) ||
        normalizeArtifactEntityName(citation.EntityName ?? '').TargetKind === 'artifact';

    const rawEntityName =
        citation.EntityName?.trim() || (isArtifactCitation ? ARTIFACTS_ENTITY_NAME : '');
    const rawRecordId =
        citation.RecordID?.trim() ||
        citation.ArtifactID?.trim() ||
        buildRecordIdFromKeyMap(rawKeys);

    if (!rawEntityName || !rawRecordId) {
        return null;
    }

    if (citation.ArtifactID?.trim() && !rawKeys.ID) {
        rawKeys.ID = citation.ArtifactID.trim();
    }

    const meta = resolveArtifactMetadata(rawEntityName, rawRecordId, rawKeys);
    if (!meta.BaseRecordID && !meta.ArtifactID && !meta.ArtifactVersionID) {
        return null;
    }

    const displayName = (citation.DisplayName ?? '').trim() || meta.CanonicalEntityName;
    const hasExplicitDisplayName =
        Boolean((citation.DisplayName ?? '').trim()) && displayName !== meta.CanonicalEntityName;

    const synthesized: DocRecordLink = {
        TargetKind: meta.TargetKind,
        Syntax: 'wiki',
        EntityName: meta.CanonicalEntityName,
        RecordID: meta.BaseRecordID,
        Keys: meta.Keys,
        DisplayName: displayName,
        HasExplicitDisplayName: hasExplicitDisplayName,
        ArtifactID:
            meta.CanonicalEntityName === ARTIFACT_VERSIONS_ENTITY_NAME
                ? meta.ArtifactID
                : (meta.ArtifactID ?? (citation.ArtifactID?.trim() || undefined)),
        ArtifactVersionID: meta.ArtifactVersionID,
        VersionNumber: meta.VersionNumber,
        DeduplicationKey: '',
        RawToken: '',
        StartIndex: -1,
        EndIndex: -1,
    };

    synthesized.DeduplicationKey = buildDocRecordLinkDedupKey(synthesized);
    synthesized.RawToken = citation.RawToken?.trim() || FormatDocRecordLink(synthesized);
    return synthesized;
}

/**
 * Formats a {@link MessageCitation} back into a canonical `[[...]]` link string.
 * Returns `null` when the citation cannot be represented as a record or artifact link (e.g., `'url'`).
 */
export function FormatMessageCitationAsDocLink(citation: MessageCitation): string | null {
    const link = MessageCitationToDocRecordLink(citation);
    if (!link) {
        return null;
    }
    return FormatDocRecordLink(link);
}

/**
 * Maps an artifact-targeting {@link DocRecordLink} into a strongly-typed
 * {@link ArtifactUseCitationPayload} compatible with `MJ: Artifact Uses` (`MJArtifactUseEntity`).
 *
 * Returns `null` when `link` is not an artifact reference, when `options.UserID` is missing,
 * or when no concrete `ArtifactVersionID` is available (via the link, `options.ArtifactVersionID`,
 * or `options.ResolveArtifactVersionID`).
 */
export function DocRecordLinkToArtifactUse(
    link: DocRecordLink,
    options: ArtifactUseMappingOptions
): ArtifactUseCitationPayload | null {
    if (link.TargetKind !== 'artifact') {
        return null;
    }
    const userId = (options?.UserID ?? '').trim();
    if (!userId) {
        return null;
    }

    const resolvedVersionId = (
        options.ArtifactVersionID ??
        link.ArtifactVersionID ??
        options.ResolveArtifactVersionID?.(link) ??
        ''
    ).trim();
    if (!resolvedVersionId) {
        return null;
    }

    const usageType: ArtifactCitationUsageType = options.UsageType ?? 'Viewed';
    const canonicalLink = FormatDocRecordLink(link);
    const context: ArtifactUseCitationContext = {
        Source: DEFAULT_USAGE_SOURCE,
        CanonicalLink: canonicalLink,
        EntityName: link.EntityName,
    };
    if (options.ConversationID?.trim()) {
        context.ConversationID = options.ConversationID.trim();
    }
    if (options.ConversationDetailID?.trim()) {
        context.ConversationDetailID = options.ConversationDetailID.trim();
    }
    if (options.SourceArtifactID?.trim()) {
        context.SourceArtifactID = options.SourceArtifactID.trim();
    }
    if (options.CitationIndex !== undefined) {
        context.CitationIndex = options.CitationIndex;
    }

    return {
        ArtifactVersionID: resolvedVersionId,
        ArtifactID: link.ArtifactID,
        VersionNumber: link.VersionNumber,
        UserID: userId,
        UsageType: usageType,
        UsageContext: context,
        UsageContextJSON: JSON.stringify(context),
        DisplayName: link.DisplayName,
    };
}

/**
 * Maps an artifact-targeting {@link MessageCitation} directly into an
 * {@link ArtifactUseCitationPayload} compatible with `MJ: Artifact Uses`.
 */
export function MessageCitationToArtifactUse(
    citation: MessageCitation,
    options: ArtifactUseMappingOptions
): ArtifactUseCitationPayload | null {
    const link = MessageCitationToDocRecordLink(citation);
    if (!link) {
        return null;
    }
    return DocRecordLinkToArtifactUse(link, {
        ...options,
        CitationIndex: options.CitationIndex ?? citation.Index,
    });
}

/**
 * End-to-end deterministic citation bridge for document markdown and AI conversation messages:
 * 1. Parses all `[[...]]` and `@{"_mode":"mention","type":"record",...}` links outside code ranges,
 * 2. Deduplicates links in 1-based first-appearance order,
 * 3. Converts every link into a unified {@link MessageCitation} and canonical `[[...]]` string, and
 * 4. Builds deduplicated {@link ArtifactUseCitationPayload} records for version-resolved artifact links.
 */
export function BridgeDocLinksToCitationsAndArtifactUses(
    text: string,
    options?: DocCitationBridgeOptions
): DocCitationBridgeResult {
    const occurrences = ParseDocRecordLinks(text, { SkipCode: options?.SkipCode ?? true });
    const links = DeduplicateDocRecordLinks(occurrences);
    const citations: MessageCitation[] = [];
    const artifactUses: ArtifactUseCitationPayload[] = [];
    const entries: BridgedDocCitationEntry[] = [];
    const seenUsageKeys = new Set<string>();

    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const citationIndex = i + 1;
        const citation = DocRecordLinkToMessageCitation(link, citationIndex);
        const canonicalWikiLink = FormatDocRecordLink(link);
        citations.push(citation);

        let artifactUse: ArtifactUseCitationPayload | undefined;
        if (options?.UserID?.trim()) {
            const candidateUse = DocRecordLinkToArtifactUse(link, {
                UserID: options.UserID,
                UsageType: options.UsageType,
                ConversationID: options.ConversationID,
                ConversationDetailID: options.ConversationDetailID,
                SourceArtifactID: options.SourceArtifactID,
                CitationIndex: citationIndex,
                ResolveArtifactVersionID: options.ResolveArtifactVersionID,
            });
            if (candidateUse) {
                const usageDedupKey = `${normalizeIdentifier(candidateUse.ArtifactVersionID)}::${normalizeIdentifier(candidateUse.UserID)}::${candidateUse.UsageType}`;
                if (!seenUsageKeys.has(usageDedupKey)) {
                    seenUsageKeys.add(usageDedupKey);
                    artifactUses.push(candidateUse);
                }
                artifactUse = candidateUse;
            }
        }

        entries.push({
            Link: link,
            Citation: citation,
            CanonicalWikiLink: canonicalWikiLink,
            ArtifactUse: artifactUse,
        });
    }

    return {
        Links: links,
        Occurrences: occurrences,
        Citations: citations,
        ArtifactUses: artifactUses,
        Entries: entries,
    };
}

/**
 * Persists an {@link ArtifactUseCitationPayload} into `MJ: Artifact Uses` using strongly-typed
 * `MJArtifactUseEntity` accessors and explicit `contextUser` / `provider` forwarding.
 * Fails closed when `contextUser`, `provider`, `ArtifactVersionID`, or `UserID` is missing.
 */
export async function RecordCitedArtifactUse(
    payload: ArtifactUseCitationPayload,
    contextUser: UserInfo | null | undefined,
    provider?: IMetadataProvider
): Promise<RecordCitedArtifactUseResult> {
    if (!contextUser || !IsValidUUID(contextUser.ID)) {
        return {
            Success: false,
            ErrorMessage: 'Authenticated contextUser with a valid UUID is required to record artifact usage.',
        };
    }
    const activeProvider = provider ?? Metadata.Provider;
    if (!activeProvider) {
        return {
            Success: false,
            ErrorMessage: 'Metadata provider is not available.',
        };
    }
    if (!payload?.ArtifactVersionID?.trim() || !payload?.UserID?.trim()) {
        return {
            Success: false,
            ErrorMessage: 'ArtifactVersionID and UserID are required on ArtifactUseCitationPayload.',
        };
    }

    const use = await activeProvider.GetEntityObject<MJArtifactUseEntity>('MJ: Artifact Uses', contextUser);
    use.NewRecord();
    use.ArtifactVersionID = payload.ArtifactVersionID;
    use.UserID = payload.UserID;
    use.UsageType = payload.UsageType;
    use.UsageContext = payload.UsageContextJSON;

    const saved = await use.Save();
    if (!saved) {
        return {
            Success: false,
            ErrorMessage: use.LatestResult?.CompleteMessage ?? 'Failed to save MJ: Artifact Uses record.',
        };
    }

    return {
        Success: true,
        ArtifactUseID: use.ID,
    };
}
