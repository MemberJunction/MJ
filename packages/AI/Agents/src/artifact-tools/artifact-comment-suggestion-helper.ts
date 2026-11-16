/**
 * @fileoverview Shared NW-3 anchored comment, suggestion, and embedded-artifact
 * access validation helpers for `DocumentToolLibrary`, `SpreadsheetToolLibrary`,
 * and `SlideDeckToolLibrary`.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
    EscapeSQLString,
    GetGlobalObjectStore,
    NormalizeUUID,
    UUIDsEqual,
} from '@memberjunction/global';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    ConversationEngine,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJConversationEntity_IConversationAnchorMetadata,
} from '@memberjunction/core-entities';
import type {
    ArtifactJsonValue,
    ArtifactToolArgs,
    ArtifactToolDefinition,
    ArtifactToolExecutionContext,
    ArtifactToolResult,
} from '@memberjunction/ai-core-plus';
import { GetArtifactLiveContentReaderHook } from '../artifact-presence-locator';

export type ArtifactSuggestionDomain = 'document' | 'spreadsheet' | 'slides';

export interface ArtifactSuggestionAnchor {
    Domain: ArtifactSuggestionDomain;
    BlockId?: string;
    Heading?: string;
    Quote?: string;
    Sheet?: string;
    SheetId?: string;
    Range?: string;
    CellAddress?: string;
    SlideId?: string;
    SlideNumber?: number;
    ElementId?: string;
    RegionId?: string;
    [key: string]: ArtifactJsonValue | undefined;
}

export interface ArtifactSuggestionRecord {
    SuggestionID: string;
    Domain: ArtifactSuggestionDomain;
    ArtifactID?: string;
    Anchor: ArtifactToolArgs;
    OriginalSlice: string;
    ProposedReplacement: string;
    Rationale: string;
    AuthorName: string;
    AuthorUserID?: string;
    CreatedAt: string;
    Status: 'Pending' | 'Accepted' | 'Rejected';
    ReviewedByUserID?: string;
    ReviewedAt?: string;
    ReviewComment?: string;
    [key: string]: ArtifactJsonValue | undefined;
}

export interface EmbeddedArtifactAccessResult {
    Ok: boolean;
    ErrorMessage?: string;
    ArtifactTypeName?: string;
    DriverClass?: string;
}

const ARTIFACT_SUGGESTIONS_STORE_KEY = '___MJ_ARTIFACT_SUGGESTIONS_STORE___';

function getSuggestionStore(): Map<string, ArtifactSuggestionRecord[]> {
    const globalStore = GetGlobalObjectStore();
    if (!globalStore) {
        return new Map<string, ArtifactSuggestionRecord[]>();
    }
    const existing = globalStore[ARTIFACT_SUGGESTIONS_STORE_KEY];
    if (existing instanceof Map) {
        return existing as Map<string, ArtifactSuggestionRecord[]>;
    }
    const created = new Map<string, ArtifactSuggestionRecord[]>();
    globalStore[ARTIFACT_SUGGESTIONS_STORE_KEY] = created;
    return created;
}

export function ComputeArtifactSuggestionStoreKey(
    domain: ArtifactSuggestionDomain,
    content: string | Buffer,
    context?: ArtifactToolExecutionContext
): string {
    if (context?.artifactId?.trim()) {
        return `artifact:${NormalizeUUID(context.artifactId.trim())}`;
    }
    const hash = createHash('sha256')
        .update(typeof content === 'string' ? content : new Uint8Array(content.buffer, content.byteOffset, content.byteLength))
        .digest('hex')
        .slice(0, 24);
    return `ephemeral:${domain}:${hash}`;
}

export function GetStoredArtifactSuggestions(key: string): ArtifactSuggestionRecord[] {
    const list = getSuggestionStore().get(key);
    return list ? list.map((s) => ({ ...s, Anchor: { ...s.Anchor } })) : [];
}

export function SetStoredArtifactSuggestions(key: string, suggestions: ArtifactSuggestionRecord[]): void {
    getSuggestionStore().set(
        key,
        suggestions.map((s) => ({ ...s, Anchor: { ...s.Anchor } }))
    );
}

/**
 * Validates embedded artifact references against self-embedding, user `CanRead`
 * permissions, version ownership (`MJ: Artifact Versions.ArtifactID`), and
 * resolves `ArtifactTypeName` / `DriverClass` from `ArtifactMetadataEngine`.
 */
export async function ValidateEmbeddedArtifactAccess(params: {
    targetArtifactId: string;
    targetVersionId?: string | null;
    context?: ArtifactToolExecutionContext;
}): Promise<EmbeddedArtifactAccessResult> {
    const targetId = params.targetArtifactId.trim();
    if (!targetId) {
        return { Ok: false, ErrorMessage: 'Embedded artifact requires a non-empty artifactId.' };
    }
    if (params.context?.artifactId && UUIDsEqual(targetId, params.context.artifactId)) {
        return { Ok: false, ErrorMessage: `Cannot embed artifact '${targetId}' inside itself.` };
    }

    const user = params.context?.contextUser;
    if (!user) {
        return { Ok: true };
    }

    const provider: IMetadataProvider = params.context?.provider ?? Metadata.Provider;
    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, targetId, user);
    if (!perms.CanRead) {
        return {
            Ok: false,
            ErrorMessage: `Access denied: you do not have read permission for embedded artifact '${targetId}'.`,
        };
    }

    let artifactTypeName: string | undefined;
    let driverClass: string | undefined;

    const runViewProvider: Partial<{ RunView: IMetadataProvider['constructor'] }> = provider as object;
    void runViewProvider;
    try {
        const rv = RunView.FromMetadataProvider(provider);
        const artRes = await rv.RunView<MJArtifactEntity>(
            {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${EscapeSQLString(targetId)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            user
        );
        if (!artRes.Success) {
            return {
                Ok: false,
                ErrorMessage: artRes.ErrorMessage || `Failed to verify embedded artifact '${targetId}'.`,
            };
        }
        const artRow = artRes.Results?.[0];
        if (!artRow) {
            return {
                Ok: false,
                ErrorMessage: `Embedded artifact '${targetId}' was not found or is inaccessible.`,
            };
        }

        if (artRow.TypeID) {
            await ArtifactMetadataEngine.Instance.Config(false, user, provider);
            const artType = ArtifactMetadataEngine.Instance.ArtifactTypes.find((t) =>
                UUIDsEqual(t.ID, artRow.TypeID)
            );
            if (artType) {
                artifactTypeName = artType.Name;
                driverClass = artType.DriverClass ?? undefined;
            }
        }

        if (params.targetVersionId) {
            const verRes = await rv.RunView<MJArtifactVersionEntity>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ID='${EscapeSQLString(params.targetVersionId)}'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                user
            );
            if (!verRes.Success) {
                return {
                    Ok: false,
                    ErrorMessage: verRes.ErrorMessage || `Failed to verify embedded artifact version '${params.targetVersionId}'.`,
                };
            }
            const verRow = verRes.Results?.[0];
            if (!verRow) {
                return {
                    Ok: false,
                    ErrorMessage: `Embedded version '${params.targetVersionId}' was not found or is inaccessible.`,
                };
            }
            if (!UUIDsEqual(verRow.ArtifactID, targetId)) {
                return {
                    Ok: false,
                    ErrorMessage: `Version '${params.targetVersionId}' does not belong to embedded artifact '${targetId}'.`,
                };
            }
        }
    } catch (err) {
        return {
            Ok: false,
            ErrorMessage: `Failed to validate embedded artifact access: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    return { Ok: true, ArtifactTypeName: artifactTypeName, DriverClass: driverClass };
}

export function GetSharedCommentAndSuggestionToolDefinitions(
    domain: ArtifactSuggestionDomain
): ArtifactToolDefinition[] {
    const anchorExample =
        domain === 'spreadsheet'
            ? '{ "domain": "spreadsheet", "sheet": "Summary", "range": "B2:D6" }'
            : domain === 'slides'
              ? '{ "domain": "slides", "slideId": "slide-1", "slideNumber": 1, "elementId": "region-body" }'
              : '{ "domain": "document", "blockId": "blk-2", "heading": "Summary", "quote": "exact text" }';

    return [
        {
            name: 'list_comments',
            description: 'Lists anchored comment threads and replies on this artifact, optionally filtered by status or anchor.',
            inputSchema: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['open', 'resolved', 'all'],
                        description: 'Filter threads by resolution status (default: "all").',
                    },
                    anchorFilter: {
                        type: 'object',
                        description: 'Optional anchor filter (heading, blockId, sheet, range, slideNumber, slideId, elementId).',
                        properties: {
                            heading: { type: 'string' },
                            blockId: { type: 'string' },
                            sheet: { type: 'string' },
                            range: { type: 'string' },
                            slideNumber: { type: 'number' },
                            slideId: { type: 'string' },
                            elementId: { type: 'string' },
                        },
                    },
                },
            },
        },
        {
            name: 'add_comment',
            description: `Creates a new anchored comment thread on the artifact. Example anchor: ${anchorExample}.`,
            inputSchema: {
                type: 'object',
                properties: {
                    anchor: {
                        type: 'object',
                        description: `Target anchor coordinates (${anchorExample}).`,
                    },
                    body: { type: 'string', description: 'Opening comment text.' },
                },
                required: ['anchor', 'body'],
            },
        },
        {
            name: 'reply_comment',
            description: 'Posts a reply message to an existing anchored comment thread on this artifact.',
            inputSchema: {
                type: 'object',
                properties: {
                    threadId: { type: 'string', description: 'Conversation ID of the existing anchored thread.' },
                    body: { type: 'string', description: 'Reply body text.' },
                },
                required: ['threadId', 'body'],
            },
        },
        {
            name: 'resolve_comment',
            description: 'Resolves (or re-opens) an anchored comment thread with an optional resolution note.',
            inputSchema: {
                type: 'object',
                properties: {
                    threadId: { type: 'string', description: 'Conversation ID of the anchored thread.' },
                    resolved: { type: 'boolean', description: 'True to resolve (default), false to reopen.' },
                    resolutionNote: { type: 'string', description: 'Optional note posted to the thread.' },
                },
                required: ['threadId'],
            },
        },
        {
            name: 'propose_suggestion',
            description:
                'Creates a non-destructive Suggest-Mode edit proposal anchored to a block, cell range, or slide element without modifying canonical artifact content.',
            inputSchema: {
                type: 'object',
                properties: {
                    anchor: {
                        type: 'object',
                        description: `Target anchor coordinates (${anchorExample}).`,
                    },
                    originalSlice: { type: 'string', description: 'Exact existing text or JSON cell payload being proposed for change.' },
                    proposedReplacement: { type: 'string', description: 'Suggested replacement text or value.' },
                    rationale: { type: 'string', description: 'Concise rationale explaining why this edit is proposed.' },
                    expectedRevisionHash: { type: 'string', description: 'Optional optimistic concurrency revision hash.' },
                },
                required: ['anchor', 'originalSlice', 'proposedReplacement', 'rationale'],
            },
        },
        {
            name: 'review_suggestion',
            description:
                'Accepts or rejects a pending tracked suggestion by suggestionId. Accepting enforces artifact lock checks and updates canonical content.',
            inputSchema: {
                type: 'object',
                properties: {
                    suggestionId: { type: 'string', description: 'Identifier of the suggestion returned by propose_suggestion.' },
                    decision: { type: 'string', enum: ['accept', 'reject'], description: 'Whether to apply or reject the suggestion.' },
                    comment: { type: 'string', description: 'Optional reviewer comment.' },
                    expectedRevisionHash: { type: 'string', description: 'Optional optimistic concurrency revision hash.' },
                },
                required: ['suggestionId', 'decision'],
            },
        },
        {
            name: 'list_suggestions',
            description:
                'Lists Suggest-Mode proposals on this artifact, reading from the live collaboration room and persisted version configuration, optionally filtered by status.',
            inputSchema: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['Pending', 'Accepted', 'Rejected', 'All'],
                        description: 'Optional status filter (defaults to All).',
                    },
                },
            },
        },
    ];
}

function domainToAnchorType(domain: ArtifactSuggestionDomain): 'DocBlock' | 'SheetRange' | 'SlideRegion' {
    switch (domain) {
        case 'spreadsheet':
            return 'SheetRange';
        case 'slides':
            return 'SlideRegion';
        case 'document':
            return 'DocBlock';
    }
}

export function ParseSuggestionAnchor(
    rawAnchor: ArtifactJsonValue | undefined,
    defaultDomain: ArtifactSuggestionDomain
): ArtifactSuggestionAnchor {
    const obj =
        rawAnchor && typeof rawAnchor === 'object' && !Array.isArray(rawAnchor)
            ? (rawAnchor as ArtifactToolArgs)
            : {};

    const rawDomainVal = obj.domain ?? obj.Domain;
    const rawDomain = typeof rawDomainVal === 'string' ? rawDomainVal.trim().toLowerCase() : '';
    const domain: ArtifactSuggestionDomain =
        rawDomain === 'spreadsheet' || rawDomain === 'sheet'
            ? 'spreadsheet'
            : rawDomain === 'slides' || rawDomain === 'slide'
              ? 'slides'
              : rawDomain === 'document' || rawDomain === 'doc'
                ? 'document'
                : defaultDomain;

    const str = (val: ArtifactJsonValue | undefined): string | undefined =>
        typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;

    return {
        Domain: domain,
        BlockId: str(obj.blockId ?? obj.BlockId ?? obj.BlockID),
        Heading: str(obj.heading ?? obj.Heading),
        Quote: str(obj.quote ?? obj.quotedText ?? obj.Quote),
        Sheet: str(obj.sheet ?? obj.sheetName ?? obj.Sheet),
        SheetId: str(obj.sheetId ?? obj.SheetId ?? obj.SheetID),
        Range: str(obj.range ?? obj.Range),
        CellAddress: str(obj.cellAddress ?? obj.cell ?? obj.CellAddress),
        SlideId: str(obj.slideId ?? obj.SlideId ?? obj.SlideID),
        SlideNumber:
            typeof obj.slideNumber === 'number' && Number.isFinite(obj.slideNumber)
                ? Math.trunc(obj.slideNumber)
                : typeof obj.SlideNumber === 'number' && Number.isFinite(obj.SlideNumber)
                  ? Math.trunc(obj.SlideNumber)
                  : undefined,
        ElementId: str(obj.elementId ?? obj.ElementId ?? obj.regionId ?? obj.RegionId ?? obj.RegionID ?? obj.ElementID),
        RegionId: str(obj.regionId ?? obj.RegionId ?? obj.elementId ?? obj.ElementId ?? obj.RegionID ?? obj.ElementID),
    };
}

function serializeSuggestionAnchorForRecord(anchor: ArtifactSuggestionAnchor): ArtifactToolArgs {
    return {
        domain: anchor.Domain,
        ...(anchor.BlockId !== undefined ? { blockId: anchor.BlockId } : {}),
        ...(anchor.Heading !== undefined ? { heading: anchor.Heading } : {}),
        ...(anchor.Quote !== undefined ? { quote: anchor.Quote } : {}),
        ...(anchor.Sheet !== undefined ? { sheet: anchor.Sheet } : {}),
        ...(anchor.SheetId !== undefined ? { sheetId: anchor.SheetId } : {}),
        ...(anchor.Range !== undefined ? { range: anchor.Range } : {}),
        ...(anchor.CellAddress !== undefined ? { cellAddress: anchor.CellAddress } : {}),
        ...(anchor.SlideId !== undefined ? { slideId: anchor.SlideId } : {}),
        ...(anchor.SlideNumber !== undefined ? { slideNumber: anchor.SlideNumber } : {}),
        ...(anchor.ElementId !== undefined ? { elementId: anchor.ElementId } : {}),
        ...(anchor.RegionId !== undefined ? { regionId: anchor.RegionId } : {}),
    };
}

function buildCanonicalAnchorKey(anchor: ArtifactSuggestionAnchor): {
    anchorKey: string;
    displayName: string;
    metadata: MJConversationEntity_IConversationAnchorMetadata;
} {
    if (anchor.Domain === 'spreadsheet') {
        const sheet = anchor.Sheet ?? anchor.SheetId ?? 'Sheet1';
        const range = anchor.Range ?? anchor.CellAddress ?? 'A1';
        const key = `${sheet}!${range}`;
        return {
            anchorKey: key,
            displayName: key,
            metadata: {
                anchorDisplayName: key,
                sheetId: anchor.SheetId ?? sheet,
                cellRange: range,
                quotedValue: anchor.Quote,
            },
        };
    }
    if (anchor.Domain === 'slides') {
        const slideRef = anchor.SlideId ?? (anchor.SlideNumber !== undefined ? `slide-${anchor.SlideNumber}` : 'slide-1');
        const regionRef = anchor.RegionId ?? anchor.ElementId;
        const key = regionRef ? `${slideRef}:${regionRef}` : slideRef;
        return {
            anchorKey: key,
            displayName: anchor.SlideNumber !== undefined ? `Slide ${anchor.SlideNumber}` : key,
            metadata: {
                anchorDisplayName: anchor.SlideNumber !== undefined ? `Slide ${anchor.SlideNumber}` : key,
                slideId: slideRef,
                regionId: regionRef,
                quotedText: anchor.Quote,
            },
        };
    }

    const docKey = anchor.BlockId ?? anchor.Heading ?? 'document';
    return {
        anchorKey: docKey,
        displayName: anchor.Heading ?? docKey,
        metadata: {
            anchorDisplayName: anchor.Heading ?? docKey,
            blockId: anchor.BlockId ?? docKey,
            quotedText: anchor.Quote,
        },
    };
}

function matchesAnchorFilter(
    conv: MJConversationEntity,
    filter: ArtifactToolArgs | undefined
): boolean {
    if (!filter) {
        return true;
    }
    const meta = conv.AnchorMetadataObject;
    const keyLower = (conv.AnchorKey ?? '').toLowerCase();
    const check = (val: ArtifactJsonValue | undefined, ...candidates: Array<string | undefined | null>): boolean => {
        if (typeof val !== 'string' || !val.trim()) {
            return true;
        }
        const needle = val.trim().toLowerCase();
        return candidates.some((c) => (c ?? '').toLowerCase().includes(needle)) || keyLower.includes(needle);
    };

    if (!check(filter.blockId, meta?.blockId)) return false;
    if (!check(filter.heading, meta?.anchorDisplayName, meta?.sectionDisplayName)) return false;
    if (!check(filter.sheet, meta?.sheetId)) return false;
    if (!check(filter.range, meta?.cellRange)) return false;
    if (!check(filter.slideId, meta?.slideId)) return false;
    if (!check(filter.elementId, meta?.regionId)) return false;
    if (typeof filter.slideNumber === 'number' && Number.isFinite(filter.slideNumber)) {
        const slideLabel = `slide ${Math.trunc(filter.slideNumber)}`;
        const slideKey = `slide-${Math.trunc(filter.slideNumber)}`;
        const disp = (meta?.anchorDisplayName ?? '').toLowerCase();
        if (!disp.includes(slideLabel) && !keyLower.includes(slideKey)) {
            return false;
        }
    }
    return true;
}

function resolveArtifactsEntityId(provider: IMetadataProvider): string | null {
    return provider.EntityByName('MJ: Artifacts')?.ID ?? null;
}

export async function ExecuteArtifactCommentTool(params: {
    toolName: string;
    domain: ArtifactSuggestionDomain;
    input: ArtifactToolArgs;
    context?: ArtifactToolExecutionContext;
}): Promise<ArtifactToolResult> {
    const user: UserInfo | undefined = params.context?.contextUser;
    const artifactId = params.context?.artifactId?.trim();
    if (!user || !artifactId) {
        return {
            success: false,
            data: null,
            errorMessage: `${params.toolName} requires an authenticated user and a persisted artifactId context.`,
        };
    }

    const provider = params.context?.provider ?? Metadata.Provider;
    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
    if (!perms.CanRead) {
        return {
            success: false,
            data: null,
            errorMessage: `Access denied: you do not have read permission for artifact '${artifactId}'.`,
        };
    }

    const artifactsEntityId = resolveArtifactsEntityId(provider);
    if (!artifactsEntityId) {
        return {
            success: false,
            data: null,
            errorMessage: "Unable to resolve 'MJ: Artifacts' entity metadata.",
        };
    }

    switch (params.toolName) {
        case 'list_comments': {
            const rawStatus = typeof params.input.status === 'string' ? params.input.status.trim().toLowerCase() : 'all';
            const threads = await ConversationEngine.Instance.LoadAnchoredConversations(
                artifactsEntityId,
                artifactId,
                user,
                {
                    includeResolved: rawStatus !== 'open',
                    provider,
                    bypassCache: true,
                }
            );
            const filterObj =
                params.input.anchorFilter && typeof params.input.anchorFilter === 'object' && !Array.isArray(params.input.anchorFilter)
                    ? (params.input.anchorFilter as ArtifactToolArgs)
                    : undefined;
            const filtered = threads.filter((t) => {
                if (rawStatus === 'resolved' && !t.IsResolved) return false;
                if (rawStatus === 'open' && t.IsResolved) return false;
                return matchesAnchorFilter(t, filterObj);
            });
            const detailsMap = await ConversationEngine.Instance.LoadAnchoredConversationDetails(
                filtered.map((t) => t.ID),
                user,
                provider,
                true
            );

            return {
                success: true,
                data: {
                    threads: filtered.map((t) => {
                        const replies = detailsMap.get(NormalizeUUID(t.ID)) ?? [];
                        return {
                            threadId: t.ID,
                            name: t.Name ?? '',
                            anchorType: t.AnchorType ?? null,
                            anchorKey: t.AnchorKey ?? null,
                            anchorMetadata: (t.AnchorMetadataObject as ArtifactToolArgs | null) ?? null,
                            isResolved: Boolean(t.IsResolved),
                            resolvedAt: t.ResolvedAt ? t.ResolvedAt.toISOString() : null,
                            messages: replies.map((d) => ({
                                commentId: d.ID,
                                role: d.Role,
                                userId: d.UserID,
                                message: d.Message,
                                createdAt: d.__mj_CreatedAt ? d.__mj_CreatedAt.toISOString() : null,
                            })),
                        };
                    }),
                },
            };
        }

        case 'add_comment': {
            const body = typeof params.input.body === 'string' ? params.input.body.trim() : '';
            if (!body) {
                return { success: false, data: null, errorMessage: 'add_comment requires a non-empty body.' };
            }
            const parsedAnchor = ParseSuggestionAnchor(params.input.anchor, params.domain);
            const { anchorKey, displayName, metadata } = buildCanonicalAnchorKey(parsedAnchor);
            const anchorType = domainToAnchorType(parsedAnchor.Domain);
            const created = await ConversationEngine.Instance.CreateAnchoredConversation(
                {
                    name: displayName,
                    linkedEntityId: artifactsEntityId,
                    linkedRecordId: artifactId,
                    anchorType,
                    anchorKey,
                    anchorMetadata: metadata,
                    initialMessage: body,
                    provider,
                },
                user
            );
            return {
                success: true,
                data: {
                    threadId: created.Conversation.ID,
                    commentId: created.InitialDetail?.ID ?? null,
                    anchorType,
                    anchorKey,
                },
            };
        }

        case 'reply_comment': {
            const threadId = typeof params.input.threadId === 'string' ? params.input.threadId.trim() : '';
            const body = typeof params.input.body === 'string' ? params.input.body.trim() : '';
            if (!threadId || !body) {
                return { success: false, data: null, errorMessage: 'reply_comment requires both threadId and body.' };
            }
            const threads = await ConversationEngine.Instance.LoadAnchoredConversations(
                artifactsEntityId,
                artifactId,
                user,
                { includeResolved: true, provider, bypassCache: true }
            );
            const target = threads.find((t) => UUIDsEqual(t.ID, threadId));
            if (!target) {
                return {
                    success: false,
                    data: null,
                    errorMessage: `Comment thread '${threadId}' was not found on artifact '${artifactId}'.`,
                };
            }
            const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                user
            );
            detail.NewRecord();
            detail.ConversationID = target.ID;
            detail.UserID = user.ID;
            detail.Role = params.context?.agentName ? 'AI' : 'User';
            detail.Message = body;
            const saved = await detail.Save();
            if (!saved) {
                return {
                    success: false,
                    data: null,
                    errorMessage: detail.LatestResult?.CompleteMessage || detail.LatestResult?.Message || 'Failed to post reply.',
                };
            }
            return {
                success: true,
                data: {
                    threadId: target.ID,
                    commentId: detail.ID,
                },
            };
        }

        case 'resolve_comment': {
            const threadId = typeof params.input.threadId === 'string' ? params.input.threadId.trim() : '';
            if (!threadId) {
                return { success: false, data: null, errorMessage: 'resolve_comment requires threadId.' };
            }
            const resolvedFlag = params.input.resolved !== false;
            const threads = await ConversationEngine.Instance.LoadAnchoredConversations(
                artifactsEntityId,
                artifactId,
                user,
                { includeResolved: true, provider, bypassCache: true }
            );
            const target = threads.find((t) => UUIDsEqual(t.ID, threadId));
            if (!target) {
                return {
                    success: false,
                    data: null,
                    errorMessage: `Comment thread '${threadId}' was not found on artifact '${artifactId}'.`,
                };
            }
            if (!perms.CanEdit && !UUIDsEqual(target.UserID, user.ID)) {
                return {
                    success: false,
                    data: null,
                    errorMessage: 'Access denied: resolving another user comment thread requires edit permission.',
                };
            }

            const note = typeof params.input.resolutionNote === 'string' ? params.input.resolutionNote.trim() : '';
            if (note) {
                const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
                    'MJ: Conversation Details',
                    user
                );
                detail.NewRecord();
                detail.ConversationID = target.ID;
                detail.UserID = user.ID;
                detail.Role = params.context?.agentName ? 'AI' : 'User';
                detail.Message = note;
                await detail.Save();
            }

            await ConversationEngine.Instance.SetConversationResolved(target.ID, resolvedFlag, user, provider);
            return {
                success: true,
                data: {
                    threadId: target.ID,
                    resolved: resolvedFlag,
                },
            };
        }

        default:
            return { success: false, data: null, errorMessage: `Unsupported comment tool '${params.toolName}'.` };
    }
}

function normalizeSuggestionRecords(rawItems: ArtifactJsonValue[]): ArtifactSuggestionRecord[] {
    const out: ArtifactSuggestionRecord[] = [];
    for (const item of rawItems) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const rec = item as ArtifactToolArgs;
        const suggestionId = typeof rec.SuggestionID === 'string' ? rec.SuggestionID.trim() : '';
        if (!suggestionId) continue;
        const rawDomain = typeof rec.Domain === 'string' ? rec.Domain.trim().toLowerCase() : 'document';
        const domain: ArtifactSuggestionDomain =
            rawDomain === 'spreadsheet' || rawDomain === 'sheet'
                ? 'spreadsheet'
                : rawDomain === 'slides' || rawDomain === 'slide'
                  ? 'slides'
                  : 'document';
        const anchor = ParseSuggestionAnchor(rec.Anchor, domain);
        const rawStatus = typeof rec.Status === 'string' ? rec.Status.trim() : 'Pending';
        const status: 'Pending' | 'Accepted' | 'Rejected' =
            rawStatus === 'Accepted' || rawStatus === 'Rejected' ? rawStatus : 'Pending';
        out.push({
            ...rec,
            SuggestionID: suggestionId,
            Domain: domain,
            ArtifactID: typeof rec.ArtifactID === 'string' ? rec.ArtifactID : undefined,
            Anchor: anchor,
            OriginalSlice: typeof rec.OriginalSlice === 'string' ? rec.OriginalSlice : '',
            ProposedReplacement: typeof rec.ProposedReplacement === 'string' ? rec.ProposedReplacement : '',
            Rationale: typeof rec.Rationale === 'string' ? rec.Rationale : '',
            AuthorName: typeof rec.AuthorName === 'string' && rec.AuthorName.trim() ? rec.AuthorName : 'Author',
            AuthorUserID: typeof rec.AuthorUserID === 'string' ? rec.AuthorUserID : undefined,
            CreatedAt: typeof rec.CreatedAt === 'string' && rec.CreatedAt ? rec.CreatedAt : new Date(0).toISOString(),
            Status: status,
            ReviewedByUserID: typeof rec.ReviewedByUserID === 'string' ? rec.ReviewedByUserID : undefined,
            ReviewedAt: typeof rec.ReviewedAt === 'string' ? rec.ReviewedAt : undefined,
            ReviewComment: typeof rec.ReviewComment === 'string' ? rec.ReviewComment : undefined,
        });
    }
    return out;
}

function parseSuggestionsFromConfiguration(cfgRaw: string | null | undefined): ArtifactSuggestionRecord[] | null {
    if (!cfgRaw || typeof cfgRaw !== 'string' || !cfgRaw.trim()) {
        return null;
    }
    try {
        const parsed = JSON.parse(cfgRaw) as { suggestions?: ArtifactJsonValue[] };
        if (Array.isArray(parsed?.suggestions)) {
            return normalizeSuggestionRecords(parsed.suggestions);
        }
    } catch {
        // Ignore malformed JSON configuration
    }
    return null;
}

export async function LoadSuggestionsForArtifact(
    storeKey: string,
    context?: ArtifactToolExecutionContext
): Promise<ArtifactSuggestionRecord[]> {
    const artifactId = context?.artifactId?.trim();
    let liveRoomHadSnapshot = false;

    if (artifactId) {
        const liveReader = GetArtifactLiveContentReaderHook();
        if (liveReader) {
            try {
                const liveSnapshot = await liveReader(artifactId, context?.contextUser);
                if (liveSnapshot) {
                    liveRoomHadSnapshot = true;
                    if (Array.isArray(liveSnapshot.Suggestions) && liveSnapshot.Suggestions.length > 0) {
                        const normalized = normalizeSuggestionRecords(liveSnapshot.Suggestions);
                        SetStoredArtifactSuggestions(storeKey, normalized);
                        return GetStoredArtifactSuggestions(storeKey);
                    }
                    const fromLiveConfig = parseSuggestionsFromConfiguration(liveSnapshot.Configuration);
                    if (fromLiveConfig) {
                        SetStoredArtifactSuggestions(storeKey, fromLiveConfig);
                        return GetStoredArtifactSuggestions(storeKey);
                    }
                    // Active live room explicitly exists with empty suggestions; do not fall back to stale memory
                    if (Array.isArray(liveSnapshot.Suggestions) && liveSnapshot.Suggestions.length === 0) {
                        return [];
                    }
                }
            } catch {
                // Fall back to DB Configuration lookup if live reader hook fails
            }
        }
    }

    if (context?.provider && context?.contextUser && artifactId) {
        try {
            const rv = RunView.FromMetadataProvider(context.provider);
            const verRes = await rv.RunView<MJArtifactVersionEntity>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
                    OrderBy: 'VersionNumber DESC',
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                context.contextUser
            );
            const cfgRaw = verRes.Success ? verRes.Results?.[0]?.Configuration : null;
            const fromDb = parseSuggestionsFromConfiguration(cfgRaw);
            if (fromDb) {
                SetStoredArtifactSuggestions(storeKey, fromDb);
                return GetStoredArtifactSuggestions(storeKey);
            }
        } catch {
            // Fall back to in-memory store if provider mock doesn't support Configuration lookup
        }
    }

    if (!liveRoomHadSnapshot) {
        const inMemory = GetStoredArtifactSuggestions(storeKey);
        if (inMemory.length > 0) {
            return inMemory;
        }
    }
    return [];
}

export async function ExecuteListSuggestionsTool(params: {
    domain: ArtifactSuggestionDomain;
    artifactContent: string | Buffer;
    input: ArtifactToolArgs;
    context?: ArtifactToolExecutionContext;
}): Promise<ArtifactToolResult> {
    const rawStatus = typeof params.input.status === 'string' ? params.input.status.trim() : 'All';
    const normalizedStatus = rawStatus.toLowerCase();
    const statusFilter: 'Pending' | 'Accepted' | 'Rejected' | 'All' =
        normalizedStatus === 'pending'
            ? 'Pending'
            : normalizedStatus === 'accepted'
              ? 'Accepted'
              : normalizedStatus === 'rejected'
                ? 'Rejected'
                : 'All';

    const storeKey = ComputeArtifactSuggestionStoreKey(params.domain, params.artifactContent, params.context);
    const all = await LoadSuggestionsForArtifact(storeKey, params.context);
    const suggestions = statusFilter === 'All' ? all : all.filter((s) => s.Status === statusFilter);
    return {
        success: true,
        data: {
            suggestions,
            count: suggestions.length,
            totalCount: all.length,
            statusFilter,
        },
    };
}

export async function ExecuteProposeSuggestionTool(params: {
    domain: ArtifactSuggestionDomain;
    artifactContent: string | Buffer;
    input: ArtifactToolArgs;
    context?: ArtifactToolExecutionContext;
    validateTarget: (
        anchor: ArtifactSuggestionAnchor,
        originalSlice: string
    ) => { ok: true; resolvedAnchor?: ArtifactSuggestionAnchor } | { ok: false; errorMessage: string };
}): Promise<ArtifactToolResult> {
    const originalSlice = typeof params.input.originalSlice === 'string' ? params.input.originalSlice : '';
    const proposedReplacement = typeof params.input.proposedReplacement === 'string' ? params.input.proposedReplacement : '';
    const rationale = typeof params.input.rationale === 'string' ? params.input.rationale.trim() : '';
    if (!rationale) {
        return { success: false, data: null, errorMessage: 'propose_suggestion requires a non-empty rationale.' };
    }
    if (params.input.originalSlice === undefined || params.input.proposedReplacement === undefined) {
        return {
            success: false,
            data: null,
            errorMessage: 'propose_suggestion requires both originalSlice and proposedReplacement.',
        };
    }

    const anchor = ParseSuggestionAnchor(params.input.anchor, params.domain);
    const targetValidation = params.validateTarget(anchor, originalSlice);
    if (targetValidation.ok === false) {
        return { success: false, data: null, errorMessage: targetValidation.errorMessage };
    }

    const storeKey = ComputeArtifactSuggestionStoreKey(params.domain, params.artifactContent, params.context);
    const existing = await LoadSuggestionsForArtifact(storeKey, params.context);
    const finalAnchor = targetValidation.resolvedAnchor ?? anchor;
    const suggestion: ArtifactSuggestionRecord = {
        SuggestionID: randomUUID(),
        Domain: params.domain,
        ArtifactID: params.context?.artifactId,
        Anchor: serializeSuggestionAnchorForRecord(finalAnchor),
        OriginalSlice: originalSlice,
        ProposedReplacement: proposedReplacement,
        Rationale: rationale,
        AuthorName: params.context?.agentName ?? params.context?.contextUser?.Name ?? 'Agent',
        AuthorUserID: params.context?.actorUserId ?? params.context?.contextUser?.ID,
        CreatedAt: new Date().toISOString(),
        Status: 'Pending',
    };
    const updatedList = [...existing, suggestion];
    SetStoredArtifactSuggestions(storeKey, updatedList);

    return {
        success: true,
        data: {
            suggestionId: suggestion.SuggestionID,
            status: suggestion.Status,
            suggestion,
            suggestions: updatedList,
            configurationPatch: { suggestions: updatedList },
        },
    };
}

export async function ExecuteReviewSuggestionTool(params: {
    domain: ArtifactSuggestionDomain;
    artifactContent: string | Buffer;
    input: ArtifactToolArgs;
    context?: ArtifactToolExecutionContext;
    applyAcceptedSuggestion: (
        suggestion: ArtifactSuggestionRecord
    ) => Promise<
        | { ok: true; updatedContent: string; revisionHash: string; xlsxBase64?: string; extra?: ArtifactToolArgs }
        | { ok: false; errorMessage: string }
    >;
}): Promise<ArtifactToolResult> {
    const suggestionId = typeof params.input.suggestionId === 'string' ? params.input.suggestionId.trim() : '';
    const decisionRaw = typeof params.input.decision === 'string' ? params.input.decision.trim().toLowerCase() : '';
    if (!suggestionId) {
        return { success: false, data: null, errorMessage: 'review_suggestion requires suggestionId.' };
    }
    if (decisionRaw !== 'accept' && decisionRaw !== 'reject') {
        return { success: false, data: null, errorMessage: `Invalid decision '${decisionRaw}'. Must be 'accept' or 'reject'.` };
    }

    const storeKey = ComputeArtifactSuggestionStoreKey(params.domain, params.artifactContent, params.context);
    const list = await LoadSuggestionsForArtifact(storeKey, params.context);
    const idx = list.findIndex((s) => UUIDsEqual(s.SuggestionID, suggestionId));
    if (idx < 0) {
        return {
            success: false,
            data: null,
            errorMessage: `Suggestion '${suggestionId}' was not found.`,
        };
    }

    const target = list[idx];
    if (target.Status !== 'Pending') {
        return {
            success: false,
            data: null,
            errorMessage: `Suggestion '${suggestionId}' has already been ${target.Status.toLowerCase()}.`,
        };
    }

    const comment = typeof params.input.comment === 'string' ? params.input.comment.trim() : undefined;

    if (decisionRaw === 'reject') {
        const updatedRecord: ArtifactSuggestionRecord = {
            ...target,
            Status: 'Rejected',
            ReviewedByUserID: params.context?.actorUserId ?? params.context?.contextUser?.ID,
            ReviewedAt: new Date().toISOString(),
            ReviewComment: comment,
        };
        const updatedList = [...list];
        updatedList[idx] = updatedRecord;
        SetStoredArtifactSuggestions(storeKey, updatedList);
        return {
            success: true,
            data: {
                suggestionId: updatedRecord.SuggestionID,
                decision: 'reject',
                status: updatedRecord.Status,
                suggestion: updatedRecord,
                suggestions: updatedList,
                configurationPatch: { suggestions: updatedList },
            },
        };
    }

    const applied = await params.applyAcceptedSuggestion(target);
    if (applied.ok === false) {
        return { success: false, data: null, errorMessage: applied.errorMessage };
    }

    const updatedRecord: ArtifactSuggestionRecord = {
        ...target,
        Status: 'Accepted',
        ReviewedByUserID: params.context?.actorUserId ?? params.context?.contextUser?.ID,
        ReviewedAt: new Date().toISOString(),
        ReviewComment: comment,
    };
    const updatedList = [...list];
    updatedList[idx] = updatedRecord;
    SetStoredArtifactSuggestions(storeKey, updatedList);

    // If the store key was content-hashed (ephemeral standalone test), keep a mirror under the new content hash
    if (!params.context?.artifactId?.trim()) {
        const nextKey = ComputeArtifactSuggestionStoreKey(params.domain, applied.updatedContent, params.context);
        SetStoredArtifactSuggestions(nextKey, updatedList);
    }

    return {
        success: true,
        data: {
            suggestionId: updatedRecord.SuggestionID,
            decision: 'accept',
            status: updatedRecord.Status,
            suggestion: updatedRecord,
            suggestions: updatedList,
            configurationPatch: { suggestions: updatedList },
            updatedContent: applied.updatedContent,
            revisionHash: applied.revisionHash,
            ...(applied.xlsxBase64 ? { xlsxBase64: applied.xlsxBase64 } : {}),
            ...(applied.extra ?? {}),
        },
    };
}
