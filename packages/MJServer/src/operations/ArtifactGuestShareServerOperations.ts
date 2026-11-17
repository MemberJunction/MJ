import { createHash, randomUUID } from 'node:crypto';
import {
    BaseRemotableOperation,
    type IMetadataProvider,
    LogError,
    Metadata,
    RemoteOperationError,
    type RemoteOpServerContext,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
    ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY,
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    BuildBlockIdentityBinding,
    BuildLiveTableIdentityBinding,
    type CreateGuestShareLinkInput,
    CreateGuestShareLinkOperation,
    type CreateGuestShareLinkOutput,
    type DocumentBlockSpec,
    DocumentLiveBlockEngine,
    EvaluateAuthorizationChecks,
    type FrozenBlockSnapshot,
    type FrozenSnapshotIdentityBinding,
    type GuestFrozenProvenanceItem,
    type MJArtifactEntity,
    type MJArtifactGuestShareLinkEntity,
    type MJArtifactGuestShareLinkEntityType,
    type MJArtifactVersionEntity,
    type MJMagicLinkInviteEntity,
    type ParsedDocumentSegment,
    type RevokeGuestShareLinkInput,
    RevokeGuestShareLinkOperation,
    type RevokeGuestShareLinkOutput,
    SlideDeckEngine,
    type SpreadsheetLiveTableSpec,
    ValidateFrozenBlockSnapshot,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, GetGlobalObjectStore, IsValidUUID, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { IsMagicLinkRedirectUrlAllowed, MagicLinkService, RegisterMagicLinkAuthProvider } from '../auth/magicLink/index.js';
import { IsMagicLinkLocalDevEnvironment, MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';
import { configInfo } from '../config.js';
import type { UserPayload } from '../types.js';
import { WriteArtifactComplianceAudit } from './ArtifactComplianceAuditHelper.js';

const MIN_GUEST_SHARE_HOURS = 1;
const MAX_GUEST_SHARE_HOURS = 720;
const MAX_LABEL_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_MAX_KEYS = 5_000;

const GUEST_SHARE_RATE_LIMIT_STORE_KEY = '___SINGLETON__MJ_GUEST_SHARE_RATE_LIMIT_MAP';

interface GuestShareRateLimitEntry {
    Count: number;
    ResetAt: number;
}

export type PublicGuestShareErrorCode =
    | 'ACCESS_DENIED'
    | 'INVALID_TOKEN'
    | 'EXPIRED'
    | 'REVOKED'
    | 'NOT_FOUND'
    | 'FROZEN_REQUIRED'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR';

export interface PublicArtifactGuestShareResolution {
    Success: boolean;
    Valid: boolean;
    ErrorCode?: PublicGuestShareErrorCode;
    ErrorMessage?: string;
    LinkID?: string;
    ArtifactID?: string;
    ArtifactName?: string;
    Title?: string;
    ArtifactTypeName?: string;
    DriverClass?: string;
    VersionID?: string;
    VersionNumber?: number;
    Content?: string;
    Configuration?: string;
    FrozenProvenance?: GuestFrozenProvenanceItem[];
    ExpiresAt?: string;
    Label?: string;
    ShareMode: 'Frozen';
    ReadOnly: true;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function getRateLimitMap(): Map<string, GuestShareRateLimitEntry> {
    const store = GetGlobalObjectStore();
    if (!store[GUEST_SHARE_RATE_LIMIT_STORE_KEY]) {
        store[GUEST_SHARE_RATE_LIMIT_STORE_KEY] = new Map<string, GuestShareRateLimitEntry>();
    }
    return store[GUEST_SHARE_RATE_LIMIT_STORE_KEY] as Map<string, GuestShareRateLimitEntry>;
}

const RATE_LIMIT_MAX_IP_REQUESTS = 180;

/**
 * Builds a scoped rate-limit bucket key combining authenticated user identity (when present),
 * normalized client IP, and a short SHA-256 prefix of the presented token so anonymous guests do
 * not collide on a single global `'graphql-public'` bucket while preventing token/IP abuse.
 */
export function BuildGuestShareRateLimitKey(
    clientIp: string | undefined,
    token: string | undefined,
    userId?: string
): string {
    if (userId && userId.trim().length > 0) {
        return `user:${userId.trim()}`;
    }
    const normIp = (clientIp ?? '').trim() || 'unknown';
    const trimmedTok = (token ?? '').trim();
    const tokPrefix =
        trimmedTok.length > 0
            ? createHash('sha256').update(trimmedTok).digest('hex').slice(0, 12)
            : 'none';
    return `ip:${normIp}:tok:${tokPrefix}`;
}

function checkRateLimitBucket(bucketKey: string, maxRequests: number): boolean {
    const normalizedKey = bucketKey.trim() || 'anonymous';
    const map = getRateLimitMap();
    const now = Date.now();

    if (map.size >= RATE_LIMIT_MAX_KEYS) {
        for (const [k, entry] of map.entries()) {
            if (entry.ResetAt <= now) {
                map.delete(k);
            }
        }
        if (map.size >= RATE_LIMIT_MAX_KEYS) {
            const firstKey = map.keys().next().value;
            if (typeof firstKey === 'string') {
                map.delete(firstKey);
            }
        }
    }

    const existing = map.get(normalizedKey);
    if (!existing || existing.ResetAt <= now) {
        map.set(normalizedKey, { Count: 1, ResetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (existing.Count >= maxRequests) {
        return false;
    }
    existing.Count += 1;
    return true;
}

function checkRateLimit(clientKey: string): boolean {
    if (!checkRateLimitBucket(clientKey, RATE_LIMIT_MAX_REQUESTS)) {
        return false;
    }
    const ipMatch = clientKey.match(/^ip:([^:]+):tok:/);
    if (ipMatch && ipMatch[1]) {
        const ipOnlyKey = `ip-aggregate:${ipMatch[1]}`;
        if (!checkRateLimitBucket(ipOnlyKey, RATE_LIMIT_MAX_IP_REQUESTS)) {
            return false;
        }
    }
    return true;
}

function resolveSystemUser(): UserInfo {
    const sysUser = UserCache.Instance.GetSystemUser();
    if (sysUser) {
        return sysUser;
    }
    throw new RemoteOperationError(
        'SYSTEM_USER_UNAVAILABLE',
        'System user is unavailable for guest share link operations.',
    );
}

const SENSITIVE_KEY_EXACT = new Set([
    'guestsharelinks',
    'connecteddrive',
    'liveblocks',
    'webhook',
    'webhooks',
    'apikey',
    'apikeys',
    'secret',
    'secrets',
    'token',
    'tokens',
    'credential',
    'credentials',
    'password',
    'passwords',
    'authorization',
    'privatekey',
]);

const SENSITIVE_KEY_PATTERN = /(secret|token|apikey|api_key|password|credential|webhook|privatekey)/i;

function scrubJsonValue(val: JsonValue): JsonValue {
    if (val == null || typeof val !== 'object') {
        return val;
    }
    if (Array.isArray(val)) {
        return val.map((item) => scrubJsonValue(item));
    }
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(val)) {
        const lower = k.toLowerCase();
        if (SENSITIVE_KEY_EXACT.has(lower) || SENSITIVE_KEY_PATTERN.test(k)) {
            continue;
        }
        out[k] = scrubJsonValue(v);
    }
    return out;
}

/**
 * Strips sensitive configuration metadata (`guestShareLinks`, `connectedDrive`, `liveBlocks`,
 * credentials, tokens, webhooks) before returning configuration JSON to external guests.
 */
export function SanitizeGuestShareConfiguration(rawConfig: string | null | undefined): string {
    if (!rawConfig || rawConfig.trim().length === 0) {
        return '{}';
    }
    try {
        const parsed = JSON.parse(rawConfig) as JsonValue;
        const scrubbed = scrubJsonValue(parsed);
        return JSON.stringify(scrubbed);
    } catch {
        return '{}';
    }
}

/**
 * Scans a spreadsheet formula expression for any nested or top-level live `MJ.*` invocation
 * (such as `=IF(TRUE, MJ.QUERY(...), 0)`, `=+MJ.AI(...)`, `=CONCAT(MJ.VIEW(...))`), ignoring
 * occurrences inside string literals (`"..."`) or quoted worksheet names (`'...'`).
 */
export function ContainsLiveMJFormula(formula: string | null | undefined): boolean {
    if (typeof formula !== 'string') {
        return false;
    }
    const trimmed = formula.trim();
    if (!trimmed.startsWith('=')) {
        return false;
    }

    const body = trimmed.slice(1);
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let i = 0;

    while (i < body.length) {
        const ch = body[i];
        if (inDoubleQuote) {
            if (ch === '"') {
                if (body[i + 1] === '"') {
                    i += 2;
                    continue;
                }
                inDoubleQuote = false;
            }
            i += 1;
            continue;
        }
        if (inSingleQuote) {
            if (ch === "'") {
                if (body[i + 1] === "'") {
                    i += 2;
                    continue;
                }
                inSingleQuote = false;
            }
            i += 1;
            continue;
        }
        if (ch === '"') {
            inDoubleQuote = true;
            i += 1;
            continue;
        }
        if (ch === "'") {
            inSingleQuote = true;
            i += 1;
            continue;
        }

        const prevCh = i > 0 ? body[i - 1] : '';
        const isBoundary = !prevCh || !/[A-Za-z0-9_.$]/.test(prevCh);
        if (isBoundary && (ch === 'M' || ch === 'm')) {
            const slice = body.slice(i);
            const mjCallMatch = slice.match(/^MJ\s*\.\s*(?:QUERY|VIEW|IMPORTRANGE|AI|[A-Z_][A-Z0-9_]*)\s*\(/i);
            if (mjCallMatch) {
                return true;
            }
        }
        i += 1;
    }

    return false;
}

function buildVerifiedProvenanceEntry(
    targetType: GuestFrozenProvenanceItem['TargetType'],
    targetId: string,
    snapshot: FrozenBlockSnapshot,
    snapshotVerified: boolean,
    extra?: {
        ArtifactID?: string;
        BlockID?: string;
        SlideID?: string;
        RegionID?: string;
        LiveTableID?: string;
    }
): GuestFrozenProvenanceItem {
    return {
        TargetType: targetType,
        TargetID: targetId,
        ...(extra?.ArtifactID ? { ArtifactID: extra.ArtifactID } : {}),
        ...(extra?.BlockID ? { BlockID: extra.BlockID } : {}),
        ...(extra?.SlideID ? { SlideID: extra.SlideID } : {}),
        ...(extra?.RegionID ? { RegionID: extra.RegionID } : {}),
        ...(extra?.LiveTableID ? { LiveTableID: extra.LiveTableID } : {}),
        SnapshotVerified: snapshotVerified,
        FrozenByUserName: snapshot.FrozenByUserName || snapshot.FrozenByUserID || 'Unknown',
        FrozenAt: snapshot.FrozenAt || '',
    };
}

function validateFrozenBlockSpec(
    spec: Partial<DocumentBlockSpec> | undefined | null,
    contextLabel: string,
    provenanceOut?: GuestFrozenProvenanceItem[],
    overrideTargetType?: GuestFrozenProvenanceItem['TargetType'],
    overrideExtra?: {
        ArtifactID?: string;
        BlockID?: string;
        SlideID?: string;
        RegionID?: string;
    },
    hostArtifactId?: string
): string | null {
    if (!spec || typeof spec !== 'object') {
        return `${contextLabel} is missing a valid block specification.`;
    }
    if (spec.Mode !== 'Frozen') {
        return `${contextLabel} ('${spec.Title ?? spec.BlockID ?? 'block'}') must use Mode='Frozen' for guest sharing (found Mode='${String(spec.Mode ?? 'undefined')}').`;
    }
    const expectedBinding = BuildBlockIdentityBinding(
        {
            ...spec,
            BlockID: spec.BlockID ?? '',
            Kind: spec.Kind ?? 'EntityView',
        },
        hostArtifactId
    );
    const validation = ValidateFrozenBlockSnapshot(spec.FrozenSnapshot ?? null, undefined, expectedBinding);
    if (!validation.Valid || !spec.FrozenSnapshot) {
        return `${contextLabel} ('${spec.Title ?? spec.BlockID ?? 'block'}') failed frozen snapshot verification: ${validation.ErrorMessage ?? 'invalid snapshot'}.`;
    }
    if (provenanceOut) {
        const blockId = spec.BlockID ?? '';
        const targetId = overrideExtra?.RegionID || blockId || spec.Title || 'block';
        provenanceOut.push(
            buildVerifiedProvenanceEntry(
                overrideTargetType ?? 'DocumentBlock',
                targetId,
                spec.FrozenSnapshot,
                validation.SnapshotVerified,
                {
                    ArtifactID: overrideExtra?.ArtifactID ?? spec.ArtifactID,
                    BlockID: overrideExtra?.BlockID ?? (blockId || undefined),
                    SlideID: overrideExtra?.SlideID,
                    RegionID: overrideExtra?.RegionID,
                }
            )
        );
    }
    return null;
}

function checkMarkdownSegmentsFrozen(
    markdown: string,
    contextPrefix: string,
    provenanceOut?: GuestFrozenProvenanceItem[],
    slideContext?: { SlideID?: string; RegionID?: string },
    hostArtifactId?: string
): string | null {
    const segments: ParsedDocumentSegment[] = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
    for (const seg of segments) {
        if (seg.Type === 'mj-block') {
            const err = validateFrozenBlockSpec(
                seg.BlockSpec,
                `${contextPrefix} embedded block`,
                provenanceOut,
                'DocumentBlock',
                slideContext,
                hostArtifactId
            );
            if (err) {
                return err;
            }
        }
    }
    return null;
}

interface ParsedConfigCheckShape {
    LiveDataSources?: Array<{
        SourceID?: string;
        Mode?: string;
        Title?: string;
        Name?: string;
        FrozenSnapshot?: FrozenBlockSnapshot | null;
    }>;
    liveBlocks?: Array<Partial<DocumentBlockSpec>>;
}

interface ParsedWorkbookCellShape {
    Formula?: string | null;
}

interface ParsedWorkbookLiveTableShape {
    TableID?: string;
    SourceType?: SpreadsheetLiveTableSpec['SourceType'];
    EntityName?: string;
    ViewID?: string;
    ViewName?: string;
    QueryID?: string;
    QueryName?: string;
    Title?: string;
    Mode?: string;
    FrozenSnapshot?: FrozenBlockSnapshot | null;
}

interface ParsedWorkbookEmbeddedShape {
    EmbedID?: string;
    ArtifactID?: string;
    Title?: string;
    Mode?: string;
    FrozenSnapshot?: FrozenBlockSnapshot | null;
    InlineContentJSON?: string | null;
}

interface ParsedWorksheetShape {
    SheetID?: string;
    Name?: string;
    LiveTables?: ParsedWorkbookLiveTableShape[];
    Cells?: Record<string, ParsedWorkbookCellShape>;
    EmbeddedArtifacts?: ParsedWorkbookEmbeddedShape[];
}

interface ParsedWorkbookShape {
    Worksheets?: ParsedWorksheetShape[];
}

export interface GuestShareFrozenInspectionResult {
    UnfrozenReason: string | null;
    FrozenProvenance: GuestFrozenProvenanceItem[];
}

function inspectFrozenGuestShareContentInternal(
    content: string | null | undefined,
    configuration: string | null | undefined,
    contentMode: string | null | undefined,
    depth: number,
    provenanceOut: GuestFrozenProvenanceItem[],
    hostArtifactId?: string
): string | null {
    if (depth > 4) {
        return 'Nested embedded artifact inspection depth exceeded.';
    }
    if (contentMode === 'File') {
        return 'Binary File artifacts cannot be shared via Frozen-only guest share links.';
    }

    const text = content ?? '';

    // 1. Markdown directives (respects code fences)
    const mdError = checkMarkdownSegmentsFrozen(text, 'Document', provenanceOut, undefined, hostArtifactId);
    if (mdError) {
        return mdError;
    }

    // 2. Try JSON formats (Presentation SlideDeck or Spreadsheet Workbook)
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        let parsedJson: Record<string, JsonValue> | null = null;
        try {
            const raw = JSON.parse(trimmed) as JsonValue;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                parsedJson = raw;
            }
        } catch {
            // Plain text that starts with '{'
        }

        if (parsedJson) {
            if (Array.isArray(parsedJson['Slides'])) {
                try {
                    const deck = SlideDeckEngine.Instance.ParseDeckSpec(text);
                    for (const slide of deck.Slides ?? []) {
                        for (const region of slide.Regions ?? []) {
                            if (region.Kind === 'mj-block') {
                                const err = validateFrozenBlockSpec(
                                    region.BlockSpec,
                                    `Slide ${slide.SlideNumber} region '${region.RegionID}'`,
                                    provenanceOut,
                                    'SlideRegion',
                                    { SlideID: slide.SlideID, RegionID: region.RegionID },
                                    hostArtifactId
                                );
                                if (err) {
                                    return err;
                                }
                            }
                            if (region.MarkdownContent) {
                                const regionMdErr = checkMarkdownSegmentsFrozen(
                                    region.MarkdownContent,
                                    `Slide ${slide.SlideNumber} region '${region.RegionID}'`,
                                    provenanceOut,
                                    { SlideID: slide.SlideID, RegionID: region.RegionID },
                                    hostArtifactId
                                );
                                if (regionMdErr) {
                                    return regionMdErr;
                                }
                            }
                        }
                    }
                } catch {
                    return 'Slide deck specification could not be parsed cleanly to verify frozen blocks.';
                }
            }

            if (Array.isArray(parsedJson['Worksheets'])) {
                const workbook = JSON.parse(trimmed) as ParsedWorkbookShape;
                for (const sheet of workbook.Worksheets ?? []) {
                    const sheetName = sheet.Name ?? sheet.SheetID ?? 'sheet';
                    for (const table of sheet.LiveTables ?? []) {
                        if (table.Mode !== 'Frozen') {
                            return `Spreadsheet '${sheetName}' live table '${table.Title ?? table.TableID ?? 'table'}' must be Frozen for guest sharing (found Mode='${String(table.Mode ?? 'undefined')}').`;
                        }
                        const expectedTableBinding = BuildLiveTableIdentityBinding(
                            {
                                ...table,
                                TableID: table.TableID ?? '',
                                SourceType: table.SourceType ?? 'EntityView',
                            },
                            hostArtifactId
                        );
                        const snapValidation = ValidateFrozenBlockSnapshot(
                            table.FrozenSnapshot ?? null,
                            undefined,
                            expectedTableBinding
                        );
                        if (!snapValidation.Valid || !table.FrozenSnapshot) {
                            return `Spreadsheet '${sheetName}' live table '${table.Title ?? table.TableID ?? 'table'}' failed frozen snapshot verification: ${snapValidation.ErrorMessage ?? 'invalid snapshot'}.`;
                        }
                        const tableId = table.TableID ?? table.Title ?? 'live-table';
                        provenanceOut.push(
                            buildVerifiedProvenanceEntry(
                                'LiveTable',
                                tableId,
                                table.FrozenSnapshot,
                                snapValidation.SnapshotVerified,
                                { LiveTableID: table.TableID }
                            )
                        );
                    }

                    const cells = sheet.Cells ?? {};
                    for (const [addr, cell] of Object.entries(cells)) {
                        if (typeof cell?.Formula === 'string' && ContainsLiveMJFormula(cell.Formula)) {
                            return `Spreadsheet '${sheetName}' cell ${addr} contains a live =MJ.* formula (${cell.Formula.slice(0, 32)}) that cannot run in Frozen-only guest links.`;
                        }
                    }

                    for (const emb of sheet.EmbeddedArtifacts ?? []) {
                        if (emb.Mode !== 'Frozen') {
                            return `Spreadsheet '${sheetName}' embedded artifact '${emb.Title ?? emb.EmbedID ?? 'embed'}' must be Frozen for guest sharing.`;
                        }
                        if (!emb.FrozenSnapshot && !emb.InlineContentJSON) {
                            return `Spreadsheet '${sheetName}' embedded artifact '${emb.Title ?? emb.EmbedID ?? 'embed'}' is missing a verified frozen snapshot.`;
                        }
                        if (emb.FrozenSnapshot) {
                            const embTargetId = emb.ArtifactID ? NormalizeUUID(emb.ArtifactID) : '';
                            const embBinding: FrozenSnapshotIdentityBinding = {
                                ...(hostArtifactId ? { ArtifactID: NormalizeUUID(hostArtifactId) } : {}),
                                ...(emb.EmbedID ? { BlockID: emb.EmbedID.trim() } : {}),
                                Kind: 'EmbeddedArtifact',
                                ...(embTargetId ? { SourceTargetID: embTargetId } : {}),
                            };
                            const snapValidation = ValidateFrozenBlockSnapshot(emb.FrozenSnapshot, undefined, embBinding);
                            if (!snapValidation.Valid) {
                                return `Spreadsheet '${sheetName}' embedded artifact '${emb.Title ?? emb.EmbedID ?? 'embed'}' failed frozen snapshot verification: ${snapValidation.ErrorMessage ?? 'invalid snapshot'}.`;
                            }
                            const embedId = emb.EmbedID ?? emb.ArtifactID ?? emb.Title ?? 'embed';
                            provenanceOut.push(
                                buildVerifiedProvenanceEntry(
                                    'EmbeddedArtifact',
                                    embedId,
                                    emb.FrozenSnapshot,
                                    snapValidation.SnapshotVerified,
                                    { ArtifactID: emb.ArtifactID }
                                )
                            );
                        }
                        if (emb.InlineContentJSON) {
                            const nestedErr = inspectFrozenGuestShareContentInternal(
                                emb.InlineContentJSON,
                                null,
                                null,
                                depth + 1,
                                provenanceOut,
                                emb.ArtifactID ?? hostArtifactId
                            );
                            if (nestedErr) {
                                return nestedErr;
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Check Configuration LiveDataSources / liveBlocks
    if (configuration && configuration.trim().length > 0) {
        try {
            const parsedCfg = JSON.parse(configuration) as ParsedConfigCheckShape;
            if (Array.isArray(parsedCfg.LiveDataSources)) {
                const liveDs = parsedCfg.LiveDataSources.find((d) => d?.Mode !== 'Frozen');
                if (liveDs) {
                    return `Live data source '${liveDs.Title ?? liveDs.Name ?? 'source'}' is not frozen.`;
                }
                for (const ds of parsedCfg.LiveDataSources) {
                    const dsTarget = (ds.SourceID ?? ds.Name ?? '').trim();
                    const dsBinding: FrozenSnapshotIdentityBinding = {
                        ...(hostArtifactId ? { ArtifactID: NormalizeUUID(hostArtifactId) } : {}),
                        ...(ds.SourceID ? { BlockID: ds.SourceID.trim() } : {}),
                        Kind: 'LiveDataSource',
                        ...(dsTarget ? { SourceTargetID: NormalizeUUID(dsTarget) } : {}),
                    };
                    const snapValidation = ValidateFrozenBlockSnapshot(ds?.FrozenSnapshot ?? null, undefined, dsBinding);
                    if (!snapValidation.Valid || !ds?.FrozenSnapshot) {
                        return `Frozen data source '${ds.Title ?? ds.Name ?? 'source'}' failed snapshot verification: ${snapValidation.ErrorMessage ?? 'invalid snapshot'}.`;
                    }
                    const dsId = ds.SourceID ?? ds.Name ?? ds.Title ?? 'data-source';
                    provenanceOut.push(
                        buildVerifiedProvenanceEntry(
                            'LiveDataSource',
                            dsId,
                            ds.FrozenSnapshot,
                            snapValidation.SnapshotVerified
                        )
                    );
                }
            }
            if (Array.isArray(parsedCfg.liveBlocks)) {
                for (const blk of parsedCfg.liveBlocks) {
                    const err = validateFrozenBlockSpec(
                        blk,
                        'Configuration liveBlock',
                        provenanceOut,
                        undefined,
                        undefined,
                        hostArtifactId
                    );
                    if (err) {
                        return err;
                    }
                }
            }
        } catch {
            // Non-JSON configuration does not inject live data sources
        }
    }

    return null;
}

/**
 * Inspects markdown `:::mj-block` directives, Slides regions, Spreadsheet workbooks (`LiveTables`,
 * `=MJ.*` cells, `EmbeddedArtifacts`), `ContentMode`, and artifact `Configuration` to ensure an
 * artifact version contains ZERO unfrozen or tampered live blocks before permitting Frozen-only guest sharing,
 * while collecting server-verified {@link GuestFrozenProvenanceItem} provenance entries.
 */
export function InspectFrozenGuestShareContent(
    content: string | null | undefined,
    configuration: string | null | undefined,
    contentMode?: string | null,
    hostArtifactId?: string
): GuestShareFrozenInspectionResult {
    const provenance: GuestFrozenProvenanceItem[] = [];
    const reason = inspectFrozenGuestShareContentInternal(
        content,
        configuration,
        contentMode,
        0,
        provenance,
        hostArtifactId
    );
    return {
        UnfrozenReason: reason,
        FrozenProvenance: reason ? [] : provenance,
    };
}

/**
 * Inspects markdown `:::mj-block` directives, Slides regions, Spreadsheet workbooks (`LiveTables`,
 * `=MJ.*` cells, `EmbeddedArtifacts`), `ContentMode`, and artifact `Configuration` to ensure an
 * artifact version contains ZERO unfrozen or tampered live blocks before permitting Frozen-only guest sharing.
 */
export function FindUnfrozenLiveContentReason(
    content: string | null | undefined,
    configuration: string | null | undefined,
    contentMode?: string | null,
    depth = 0,
    hostArtifactId?: string
): string | null {
    return inspectFrozenGuestShareContentInternal(content, configuration, contentMode, depth, [], hostArtifactId);
}

function buildFailedPublicResolution(
    code: PublicGuestShareErrorCode,
    message: string,
): PublicArtifactGuestShareResolution {
    return {
        Success: false,
        Valid: false,
        ErrorCode: code,
        ErrorMessage: message,
        ShareMode: 'Frozen',
        ReadOnly: true,
    };
}

/**
 * Viewer plugin driver classes allowed for Frozen external guest shares.
 * Executable / dynamic components (`ComponentArtifactViewerPlugin`) and non-frozen binary plugins
 * are explicitly excluded.
 */
export const SAFE_GUEST_SHARE_DRIVER_CLASSES: ReadonlySet<string> = new Set([
    'MarkdownArtifactViewerPlugin',
    'SpreadsheetArtifactViewerPlugin',
    'SlideDeckArtifactViewerPlugin',
    'SvgArtifactViewerPlugin',
    'HtmlArtifactViewerPlugin',
    'JsonArtifactViewerPlugin',
    'CodeArtifactViewerPlugin',
    'TextArtifactViewerPlugin',
    'CsvArtifactViewerPlugin',
    'DataArtifactViewerPlugin',
    'WhiteboardArtifactViewerPlugin',
]);

/**
 * Verifies that an artifact's type, viewer plugin driver class, and content mode are permitted for
 * Frozen-only external guest sharing. Returns a rejection message or `null` when allowed.
 */
export function IsGuestShareSupportedArtifactType(
    artifactTypeName: string | null | undefined,
    driverClass: string | null | undefined,
    contentMode: string | null | undefined,
): string | null {
    if (contentMode === 'File') {
        return 'Binary File artifacts cannot be shared via Frozen-only guest share links.';
    }
    const normalizedType = artifactTypeName?.trim().toLowerCase() ?? '';
    if (normalizedType === 'component') {
        return "Artifact type 'Component' executes client code and cannot be shared via external guest links.";
    }
    const trimmedDriver = driverClass?.trim() ?? '';
    if (!trimmedDriver || !SAFE_GUEST_SHARE_DRIVER_CLASSES.has(trimmedDriver)) {
        return `Artifact viewer '${trimmedDriver || artifactTypeName || 'Unknown'}' is not allowlisted for external Frozen guest sharing.`;
    }
    return null;
}

async function resolveArtifactTypeDetails(
    typeId: string | null | undefined,
    provider: IMetadataProvider,
    systemUser: UserInfo,
): Promise<{ artifactTypeName?: string; driverClass?: string }> {
    if (!typeId) {
        return {};
    }
    await ArtifactMetadataEngine.Instance.Config(false, systemUser, provider);
    const findType = (id: string) =>
        ArtifactMetadataEngine.Instance.ArtifactTypes.find((t) => UUIDsEqual(t.ID, id));

    const direct = findType(typeId);
    if (!direct) {
        return {};
    }
    let driverClass = direct.DriverClass ?? undefined;
    let cursor = direct;
    let guard = 0;
    while (!driverClass && cursor.ParentID && guard < 6) {
        const parent = findType(cursor.ParentID);
        if (!parent) {
            break;
        }
        driverClass = parent.DriverClass ?? undefined;
        cursor = parent;
        guard += 1;
    }
    return {
        artifactTypeName: direct.Name ?? undefined,
        driverClass,
    };
}

function scrubWorkbookEmbeddedInlineJson(content: string): string {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) {
        return content;
    }
    try {
        const parsed = JSON.parse(trimmed) as {
            Worksheets?: Array<{
                EmbeddedArtifacts?: Array<{
                    FrozenSnapshot?: FrozenBlockSnapshot | null;
                    InlineContentJSON?: string | null;
                }>;
            }>;
        };
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.Worksheets)) {
            return content;
        }
        let modified = false;
        for (const sheet of parsed.Worksheets) {
            for (const emb of sheet.EmbeddedArtifacts ?? []) {
                if (emb.FrozenSnapshot && Object.prototype.hasOwnProperty.call(emb, 'InlineContentJSON')) {
                    delete emb.InlineContentJSON;
                    modified = true;
                }
            }
        }
        return modified ? JSON.stringify(parsed) : content;
    } catch {
        return content;
    }
}

function resolveDefaultServerPublicUrl(): string {
    const rawPublic = configInfo.publicUrl?.trim();
    if (rawPublic) {
        return rawPublic.replace(/\/$/, '');
    }
    const base = (configInfo.baseUrl?.trim() || 'http://localhost').replace(/\/$/, '');
    const port = configInfo.graphqlPort;
    return port ? `${base}:${port}` : base;
}

/**
 * Resolves the concrete Explorer frontend `/guest/artifact` redirect URL for Magic Link guest shares.
 * Rejects wildcard CORS configs and unconfigured deployments with `CONFIG_ERROR` rather than
 * minting a broken link that renders raw JSON in a recipient's browser.
 */
function resolveGuestShareRedirectUrl(requestOrigin?: string): string {
    const explicitExplorer = (
        configInfo.magicLink?.explorerUrl?.trim() ||
        process.env.MJ_MAGIC_LINK_EXPLORER_URL?.trim() ||
        ''
    ).replace(/\/$/, '');
    if (explicitExplorer) {
        return `${explicitExplorer}/guest/artifact`;
    }

    const concreteAllowedOrigins = [
        ...(configInfo.magicLink?.allowedRedirectOrigins ?? []),
        ...(configInfo.cors?.allowedOrigins ?? []),
    ]
        .map((origin) => origin?.trim() ?? '')
        .filter((origin) => origin.length > 0 && origin !== '*');

    const candidateOrigin = requestOrigin?.trim().replace(/\/$/, '') ?? '';
    if (candidateOrigin) {
        const candidateRedirect = `${candidateOrigin}/guest/artifact`;
        if (IsMagicLinkRedirectUrlAllowed(candidateRedirect, concreteAllowedOrigins)) {
            return candidateRedirect;
        }
    }

    throw new RemoteOperationError(
        'CONFIG_ERROR',
        'External guest sharing requires magicLink.explorerUrl, MJ_MAGIC_LINK_EXPLORER_URL, or a matching origin in magicLink.allowedRedirectOrigins / non-wildcard cors.allowedOrigins so redeemed links redirect to /guest/artifact.',
    );
}

function resolveGuestShareMagicLinkService(): MagicLinkService {
    const existing = MagicLinkService.GetActiveInstance();
    if (existing) {
        return existing;
    }
    const publicUrl = resolveDefaultServerPublicUrl();
    const service = new MagicLinkService(publicUrl, configInfo.magicLink);
    MagicLinkService.SetActiveInstance(service);
    RegisterMagicLinkAuthProvider(publicUrl, configInfo.magicLink);
    return service;
}

function isArtifactGuestSharingEnabled(): boolean {
    return configInfo.magicLink?.artifactGuestSharing?.enabled === true;
}

function assertArtifactGuestSharingEnabled(): void {
    if (!isArtifactGuestSharingEnabled()) {
        throw new RemoteOperationError(
            'GUEST_SHARING_DISABLED',
            'External artifact guest sharing is disabled on this server (magicLink.artifactGuestSharing.enabled must be true).',
        );
    }
    if (
        !IsMagicLinkLocalDevEnvironment(process.env) &&
        MagicLinkKeyManager.Instance.IsInitialized &&
        MagicLinkKeyManager.Instance.IsEphemeral
    ) {
        throw new RemoteOperationError(
            'CONFIG_ERROR',
            'Refusing to mint external guest share tokens with an ephemeral RSA key in production.',
        );
    }
}

async function resolveResourceShareScopeTargets(
    provider: IMetadataProvider,
    systemUser: UserInfo,
): Promise<{ applicationId: string; roleId: string; resourceTypeId: string }> {
    const guestCfg = configInfo.magicLink?.artifactGuestSharing;
    const roleName = (guestCfg?.roleName || configInfo.magicLink?.restrictedRoleName || 'Magic Link Baseline').trim();
    const roleMatch = provider.Roles.find((r) => r.Name.trim().toLowerCase() === roleName.toLowerCase());
    if (!roleMatch?.ID || !IsValidUUID(roleMatch.ID)) {
        throw new RemoteOperationError(
            'CONFIG_ERROR',
            `Configured guest share role '${roleName}' was not found in MJ Roles metadata.`,
        );
    }

    const applicationName = (guestCfg?.applicationName || 'Chat').trim();
    const appMatch = provider.Applications.find((a) => a.Name.trim().toLowerCase() === applicationName.toLowerCase());
    if (!appMatch?.ID || !IsValidUUID(appMatch.ID)) {
        throw new RemoteOperationError(
            'CONFIG_ERROR',
            `Configured guest share application '${applicationName}' was not found in MJ Applications metadata.`,
        );
    }

    const resourceTypeName = (guestCfg?.resourceTypeName || 'Artifacts').trim();
    const rv = RunView.FromMetadataProvider(provider);
    const rtRes = await rv.RunView<{ ID?: string }>(
        {
            EntityName: 'MJ: Resource Types',
            ExtraFilter: `Name='${EscapeSQLString(resourceTypeName)}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        systemUser,
    );
    const foundRtId = rtRes.Success ? rtRes.Results?.[0]?.ID : undefined;
    if (!foundRtId || !IsValidUUID(foundRtId)) {
        throw new RemoteOperationError(
            'CONFIG_ERROR',
            `Configured guest share resource type '${resourceTypeName}' was not found in MJ Resource Types metadata.`,
        );
    }

    return {
        applicationId: appMatch.ID,
        roleId: roleMatch.ID,
        resourceTypeId: foundRtId,
    };
}

/**
 * Resolves and validates a Frozen external guest artifact snapshot for an authenticated
 * Magic Link `anonymous` `resource-share` session (`ResourceType === 'Artifacts'`).
 * Enforces invite status/expiry, active inviter check, viewer allowlist, Frozen-only invariants,
 * and scrubs sensitive config keys. Never writes access counters directly (redemptions audit per use).
 */
export async function ResolveGuestArtifactSnapshotForSession(
    userPayload: UserPayload | undefined,
    provider: IMetadataProvider,
    clientIp?: string,
): Promise<PublicArtifactGuestShareResolution> {
    if (!isArtifactGuestSharingEnabled()) {
        return buildFailedPublicResolution(
            'ACCESS_DENIED',
            'External artifact guest sharing is disabled on this server.',
        );
    }
    if (
        !IsMagicLinkLocalDevEnvironment(process.env) &&
        MagicLinkKeyManager.Instance.IsInitialized &&
        MagicLinkKeyManager.Instance.IsEphemeral
    ) {
        return buildFailedPublicResolution(
            'ACCESS_DENIED',
            'External guest share tokens signed by an ephemeral key cannot be redeemed in production.',
        );
    }
    const sessionUser = userPayload?.userRecord as UserInfo | undefined;
    if (!userPayload || !sessionUser) {
        return buildFailedPublicResolution('ACCESS_DENIED', 'Authentication is required to view a guest artifact share.');
    }
    const scope = sessionUser.MagicLinkScope;
    if (!sessionUser.IsMagicLinkAnonymous || !scope || scope.ResourceType !== 'Artifacts' || !IsValidUUID(scope.ResourceID)) {
        return buildFailedPublicResolution(
            'ACCESS_DENIED',
            'A Magic Link anonymous resource-share session scoped to Artifacts is required.',
        );
    }

    const artifactId = scope.ResourceID.trim();
    const matchingScopeClaim = (userPayload.magicLinkScopes ?? []).find(
        (entry) =>
            entry.resourceType === 'Artifacts' &&
            entry.resourceId &&
            UUIDsEqual(entry.resourceId, artifactId) &&
            IsValidUUID(entry.inviteId),
    );
    const inviteId = matchingScopeClaim?.inviteId?.trim();
    if (!inviteId || !IsValidUUID(inviteId)) {
        return buildFailedPublicResolution(
            'INVALID_TOKEN',
            'Magic Link session token is missing a valid inviteId binding for this artifact.',
        );
    }

    const rateKey = BuildGuestShareRateLimitKey(clientIp, inviteId, `${sessionUser.ID}:${inviteId}`);
    if (!checkRateLimit(rateKey)) {
        return buildFailedPublicResolution('RATE_LIMITED', 'Too many guest share resolution requests. Please wait before retrying.');
    }

    let systemUser: UserInfo;
    try {
        systemUser = resolveSystemUser();
    } catch {
        return buildFailedPublicResolution('INTERNAL_ERROR', 'System user is unavailable for guest share resolution.');
    }
    const rv = RunView.FromMetadataProvider(provider);

    try {
        const [inviteRes, linkRes] = await rv.RunViews<Record<string, string | number | boolean | Date | null>>(
            [
                {
                    EntityName: 'MJ: Magic Link Invites',
                    ExtraFilter: `ID='${EscapeSQLString(inviteId)}'`,
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: Artifact Guest Share Links',
                    ExtraFilter: `MagicLinkInviteID='${EscapeSQLString(inviteId)}' AND ArtifactID='${EscapeSQLString(artifactId)}'`,
                    MaxRows: 1,
                    ResultType: 'simple',
                },
            ],
            systemUser,
        );

        const inviteRow = inviteRes.Success ? inviteRes.Results?.[0] : undefined;
        if (!inviteRow) {
            return buildFailedPublicResolution('NOT_FOUND', 'Guest share invite could not be found.');
        }

        if (
            String(inviteRow['Kind'] ?? '') !== 'resource-share' ||
            String(inviteRow['IdentityMode'] ?? '') !== 'anonymous' ||
            !UUIDsEqual(String(inviteRow['ResourceID'] ?? ''), artifactId)
        ) {
            return buildFailedPublicResolution('INVALID_TOKEN', 'Magic Link invite does not authorize this artifact share.');
        }

        const status = String(inviteRow['Status'] ?? '');
        if (status === 'Revoked') {
            return buildFailedPublicResolution('REVOKED', 'This guest share link has been revoked.');
        }
        if (status === 'Expired') {
            return buildFailedPublicResolution('EXPIRED', 'Guest share link has expired.');
        }
        // S6: Once an invite reaches MaxUses, MagicLinkService sets Status = 'Consumed',
        // which blocks NEW redemptions while already-issued guest session JWTs MUST still load the snapshot.
        if (status !== 'Active' && status !== 'Consumed') {
            return buildFailedPublicResolution('ACCESS_DENIED', `Guest share invite status '${status}' is not active.`);
        }

        const dbExpiresRaw = inviteRow['ExpiresAt'];
        if (dbExpiresRaw == null) {
            return buildFailedPublicResolution('EXPIRED', 'Guest share link is missing an expiration timestamp.');
        }
        const dbExpiresMs = dbExpiresRaw instanceof Date ? dbExpiresRaw.getTime() : Date.parse(String(dbExpiresRaw));
        if (!Number.isFinite(dbExpiresMs) || dbExpiresMs <= Date.now()) {
            return buildFailedPublicResolution('EXPIRED', 'Guest share link has expired.');
        }

        const inviterId = String(inviteRow['CreatedByUserID'] ?? '').trim();
        if (!IsValidUUID(inviterId)) {
            return buildFailedPublicResolution('REVOKED', 'Guest share invite creator metadata is invalid.');
        }
        let inviterUser: UserInfo | undefined = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, inviterId));
        if (!inviterUser && UserCache.Instance.Users.length === 0) {
            const inviterRes = await rv.RunView<{ ID?: string; Name?: string; Email?: string; IsActive?: boolean; Type?: string }>(
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter: `ID='${EscapeSQLString(inviterId)}'`,
                    Fields: ['ID', 'Name', 'Email', 'IsActive', 'Type'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                systemUser,
            );
            const inviterRow = inviterRes.Success ? inviterRes.Results?.[0] : undefined;
            if (inviterRow && inviterRow.ID) {
                inviterUser = new UserInfo(provider, {
                    ID: String(inviterRow.ID),
                    Name: inviterRow.Name ?? undefined,
                    Email: inviterRow.Email ?? undefined,
                    IsActive: Boolean(inviterRow.IsActive),
                    Type: inviterRow.Type ?? undefined,
                });
            }
        }
        if (!inviterUser || !inviterUser.IsActive) {
            return buildFailedPublicResolution('REVOKED', 'The user who issued this share link is no longer active.');
        }

        const inviterPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            artifactId,
            inviterUser,
        );
        if (!inviterPerms.CanShare) {
            return buildFailedPublicResolution('REVOKED', 'The creator no longer holds permission to share this artifact.');
        }

        const linkRow = linkRes.Success ? linkRes.Results?.[0] : undefined;
        if (!linkRow) {
            return buildFailedPublicResolution('NOT_FOUND', 'Guest share link binding could not be found.');
        }

        const linkArtifactId = String(linkRow['ArtifactID'] ?? '');
        const linkVersionId = String(linkRow['ArtifactVersionID'] ?? '');
        if (!UUIDsEqual(linkArtifactId, artifactId) || !IsValidUUID(linkVersionId)) {
            return buildFailedPublicResolution('INVALID_TOKEN', 'Guest share link metadata is invalid.');
        }

        const [verRes, artRes] = await rv.RunViews<Record<string, string | number | boolean | Date | null>>(
            [
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ID='${EscapeSQLString(linkVersionId)}' AND ArtifactID='${EscapeSQLString(artifactId)}'`,
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
                    MaxRows: 1,
                    ResultType: 'simple',
                },
            ],
            systemUser,
        );

        const versionRow = verRes.Success ? verRes.Results?.[0] : undefined;
        if (!versionRow) {
            return buildFailedPublicResolution('NOT_FOUND', 'Shared artifact version could not be found.');
        }

        const artRow = artRes.Success ? artRes.Results?.[0] : undefined;
        const content = versionRow['Content'] != null ? String(versionRow['Content']) : '';
        const configuration = versionRow['Configuration'] != null ? String(versionRow['Configuration']) : '{}';
        const contentMode = versionRow['ContentMode'] != null ? String(versionRow['ContentMode']) : null;

        const typeId = artRow?.['TypeID'] != null ? String(artRow['TypeID']) : '';
        const resolvedType = await resolveArtifactTypeDetails(typeId, provider, systemUser);
        const artifactTypeName =
            resolvedType.artifactTypeName ??
            (artRow?.['Type'] != null ? String(artRow['Type']) : undefined);
        const driverClass = resolvedType.driverClass;

        const typeRejection = IsGuestShareSupportedArtifactType(artifactTypeName, driverClass, contentMode);
        if (typeRejection) {
            return buildFailedPublicResolution('FROZEN_REQUIRED', typeRejection);
        }

        const inspection = InspectFrozenGuestShareContent(content, configuration, contentMode, artifactId);
        if (inspection.UnfrozenReason) {
            return buildFailedPublicResolution(
                'FROZEN_REQUIRED',
                `Guest share refused because artifact version is no longer strictly Frozen: ${inspection.UnfrozenReason}`,
            );
        }

        const title =
            (versionRow['Name'] != null && String(versionRow['Name']).trim().length > 0
                ? String(versionRow['Name'])
                : undefined) ??
            (artRow?.['Name'] != null ? String(artRow['Name']) : 'Shared Artifact');

        const expiresIso = Number.isFinite(dbExpiresMs)
            ? new Date(dbExpiresMs).toISOString()
            : userPayload.tokenExpiresAtMs
              ? new Date(userPayload.tokenExpiresAtMs).toISOString()
              : undefined;
        const label = linkRow['Label'] != null ? String(linkRow['Label']) : undefined;

        return {
            Success: true,
            Valid: true,
            LinkID: String(linkRow['ID']),
            ArtifactID: artifactId,
            ArtifactName: artRow?.['Name'] != null ? String(artRow['Name']) : title,
            Title: title,
            ArtifactTypeName: artifactTypeName,
            DriverClass: driverClass,
            VersionID: linkVersionId,
            VersionNumber: Number(versionRow['VersionNumber'] ?? 1),
            Content: scrubWorkbookEmbeddedInlineJson(content),
            Configuration: SanitizeGuestShareConfiguration(configuration),
            FrozenProvenance: inspection.FrozenProvenance,
            ExpiresAt: expiresIso,
            Label: label,
            ShareMode: 'Frozen',
            ReadOnly: true,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LogError(`ResolveGuestArtifactSnapshotForSession failed: ${msg}`);
        return buildFailedPublicResolution('INTERNAL_ERROR', 'Failed to resolve guest share snapshot.');
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.CreateGuestShareLink` (`§6.3`, `NW-1`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY)
export class CreateGuestShareLinkServerOperation extends CreateGuestShareLinkOperation {
    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }

    public override GetScopeResourceIds(input: CreateGuestShareLinkInput): string[] {
        return input?.ArtifactID ? [input.ArtifactID] : [];
    }

    protected override async Authorize(
        input: CreateGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            throw new RemoteOperationError('FORBIDDEN', 'Magic Link sessions cannot create guest share links.');
        }
        assertArtifactGuestSharingEnabled();
        const provider = context?.provider ?? Metadata.Provider;
        if (!IsValidUUID(input.ArtifactID)) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactID must be a valid UUID.');
        }
        if (input.VersionID && !IsValidUUID(input.VersionID)) {
            throw new RemoteOperationError('INVALID_INPUT', 'VersionID must be a valid UUID.');
        }
        const requiredAuth = configInfo.magicLink?.artifactGuestSharing?.requiredAuthorizationName?.trim();
        if (requiredAuth) {
            const authRows = EvaluateAuthorizationChecks([requiredAuth], user, provider.Authorizations ?? []);
            if (!authRows[0]?.Allowed) {
                throw new RemoteOperationError(
                    'ACCESS_DENIED',
                    `Creating a guest share link requires authorization '${requiredAuth}'.`,
                );
            }
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            input.ArtifactID,
            user,
        );
        if (!perms.CanShare) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                'Creating a guest share link requires CanShare permission on the artifact.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: CreateGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<CreateGuestShareLinkOutput> {
        const systemUser = resolveSystemUser();
        const rv = RunView.FromMetadataProvider(provider);
        const extraFilter = input.VersionID
            ? `ID='${EscapeSQLString(input.VersionID)}' AND ArtifactID='${EscapeSQLString(input.ArtifactID)}'`
            : `ArtifactID='${EscapeSQLString(input.ArtifactID)}'`;
        const artifactId = input.ArtifactID.trim();
        const normalizedArtifactId = NormalizeUUID(artifactId);

        const [verRes, artRes] = await rv.RunViews<MJArtifactVersionEntity | MJArtifactEntity>(
            [
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: extraFilter,
                    OrderBy: 'VersionNumber DESC',
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
            ],
            systemUser,
        );

        const version = verRes.Success ? (verRes.Results?.[0] as MJArtifactVersionEntity | undefined) : undefined;
        if (!version) {
            throw new RemoteOperationError(
                'NOT_FOUND',
                `Target version not found for artifact '${input.ArtifactID}'.`,
            );
        }
        const artifact = artRes.Success ? (artRes.Results?.[0] as MJArtifactEntity | undefined) : undefined;

        const { artifactTypeName, driverClass } = await resolveArtifactTypeDetails(
            artifact?.TypeID ?? null,
            provider,
            systemUser,
        );
        const typeRejection = IsGuestShareSupportedArtifactType(
            artifactTypeName,
            driverClass,
            version.ContentMode,
        );
        if (typeRejection) {
            throw new RemoteOperationError('FROZEN_REQUIRED', typeRejection);
        }

        const unfrozenReason = FindUnfrozenLiveContentReason(
            version.Content,
            version.Configuration,
            version.ContentMode,
            0,
            artifactId,
        );
        if (unfrozenReason) {
            throw new RemoteOperationError(
                'FROZEN_REQUIRED',
                `Guest sharing only supports Frozen snapshots: ${unfrozenReason} Convert live blocks/tables/formulas to Frozen snapshots before creating a guest share link.`,
            );
        }

        const guestCfg = configInfo.magicLink?.artifactGuestSharing;
        const maxHours = Math.max(MIN_GUEST_SHARE_HOURS, guestCfg?.maxExpiresInHours ?? MAX_GUEST_SHARE_HOURS);
        const rawHours = Number.isFinite(input.ExpiresInHours) ? Number(input.ExpiresInHours) : Math.min(168, maxHours);
        const expiresInHours = Math.max(MIN_GUEST_SHARE_HOURS, Math.min(maxHours, rawHours));
        const configuredMaxUses = guestCfg?.maxUses ?? 100;
        const sanitizedLabel = input.Label ? input.Label.trim().slice(0, MAX_LABEL_LENGTH) : null;

        const mlService = resolveGuestShareMagicLinkService();
        const { applicationId, roleId, resourceTypeId } = await resolveResourceShareScopeTargets(
            provider,
            systemUser,
        );
        const redirectUrl = resolveGuestShareRedirectUrl(context?.requestOrigin);

        const inviteRes = await mlService.CreateResourceShareInvite(
            {
                Kind: 'resource-share',
                IdentityMode: 'anonymous',
                ApplicationId: applicationId,
                RoleId: roleId,
                ResourceTypeID: resourceTypeId,
                ResourceID: normalizedArtifactId,
                ExpiresInHours: expiresInHours,
                MaxUses: configuredMaxUses,
                SendEmail: false,
                RedirectUrl: redirectUrl,
            },
            user,
            provider,
        );
        if (!inviteRes.success || !inviteRes.inviteId || !inviteRes.rawToken) {
            throw new RemoteOperationError(
                'INVITE_CREATE_FAILED',
                inviteRes.error || 'Failed to issue Magic Link resource-share invite.',
            );
        }

        const linkId = randomUUID();
        const linkEntity = await provider.GetEntityObject<MJArtifactGuestShareLinkEntity>(
            'MJ: Artifact Guest Share Links',
            systemUser,
        );
        linkEntity.NewRecord();
        linkEntity.ID = linkId;
        linkEntity.MagicLinkInviteID = inviteRes.inviteId;
        linkEntity.ArtifactID = input.ArtifactID;
        linkEntity.ArtifactVersionID = version.ID;
        linkEntity.CreatedByUserID = user.ID;
        linkEntity.Label = sanitizedLabel;

        const saved = await linkEntity.Save();
        if (!saved) {
            await mlService.RevokeResourceShareInvite(inviteRes.inviteId, user, provider).catch(() => undefined);
            throw new RemoteOperationError(
                'PERSIST_FAILED',
                linkEntity.LatestResult?.CompleteMessage || 'Failed to persist guest share link.',
            );
        }

        const expiresAtIso =
            inviteRes.expiresAt ?? new Date(Date.now() + expiresInHours * 3600_000).toISOString();

        const auditRes = await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: version.ID,
            Summary: `Created Frozen guest share link ${linkId} (MagicLinkInvite ${inviteRes.inviteId}, expires ${expiresAtIso})`,
            Details: {
                action: 'Create',
                linkId,
                magicLinkInviteId: inviteRes.inviteId,
                label: sanitizedLabel ?? undefined,
                expiresAt: expiresAtIso,
                shareMode: 'Frozen',
            },
        });
        if (!auditRes.Recorded) {
            await linkEntity.Delete().catch(() => undefined);
            await mlService.RevokeResourceShareInvite(inviteRes.inviteId, user, provider).catch(() => undefined);
            throw new RemoteOperationError(
                'AUDIT_FAILED',
                'Required compliance audit logging failed for external guest share link creation.',
            );
        }

        return {
            LinkID: linkId,
            MagicLinkInviteID: inviteRes.inviteId,
            Token: inviteRes.rawToken,
            ShareUrlPath: inviteRes.redemptionUrl ?? `/magic-link/redeem?token=${encodeURIComponent(inviteRes.rawToken)}`,
            ArtifactID: input.ArtifactID,
            VersionID: version.ID,
            VersionNumber: version.VersionNumber,
            ExpiresAt: expiresAtIso,
            ShareMode: 'Frozen',
            ...(sanitizedLabel ? { Label: sanitizedLabel } : {}),
        };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.RevokeGuestShareLink` (`§6.3`, `NW-1`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY)
export class RevokeGuestShareLinkServerOperation extends RevokeGuestShareLinkOperation {
    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }

    public override GetScopeResourceIds(input: RevokeGuestShareLinkInput): string[] {
        return input?.ArtifactID ? [input.ArtifactID] : [];
    }

    protected override async Authorize(
        input: RevokeGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (user.IsMagicLinkAnonymous || user.MagicLinkScope) {
            throw new RemoteOperationError('FORBIDDEN', 'Magic Link sessions cannot revoke guest share links.');
        }
        const provider = context?.provider ?? Metadata.Provider;
        if (!IsValidUUID(input.ArtifactID) || !IsValidUUID(input.LinkID)) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactID and LinkID must be valid UUIDs.');
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            input.ArtifactID,
            user,
        );
        if (!perms.CanShare && !perms.CanDelete) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                'Revoking a guest share link requires CanShare or CanDelete permission.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: RevokeGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RevokeGuestShareLinkOutput> {
        const systemUser = resolveSystemUser();
        const linkEntity = await provider.GetEntityObject<MJArtifactGuestShareLinkEntity>(
            'MJ: Artifact Guest Share Links',
            systemUser,
        );
        const loaded = await linkEntity.Load(input.LinkID);
        if (!loaded || !UUIDsEqual(linkEntity.ArtifactID, input.ArtifactID)) {
            return {
                Revoked: false,
                LinkID: input.LinkID,
            };
        }

        const mlService = resolveGuestShareMagicLinkService();
        const revokeRes = await mlService.RevokeResourceShareInvite(
            linkEntity.MagicLinkInviteID,
            user,
            provider,
        );
        if (!revokeRes.success && revokeRes.errorCode !== 'not_found') {
            throw new RemoteOperationError(
                'PERSIST_FAILED',
                revokeRes.error || 'Failed to revoke backing Magic Link invite.',
            );
        }

        await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: linkEntity.ArtifactVersionID,
            Summary: `Revoked guest share link ${input.LinkID} (MagicLinkInvite ${linkEntity.MagicLinkInviteID})`,
            Details: {
                action: 'Revoke',
                linkId: input.LinkID,
                magicLinkInviteId: linkEntity.MagicLinkInviteID,
            },
        });

        return {
            Revoked: true,
            LinkID: linkEntity.ID,
            RevokedAt: new Date().toISOString(),
        };
    }
}

export function LoadArtifactGuestShareOperations(): void {
    void CreateGuestShareLinkServerOperation;
    void RevokeGuestShareLinkServerOperation;
}

export function ResolveGuestShareProviderFallback(): IMetadataProvider {
    return Metadata.Provider; // global-provider-ok: fallback for unit tests without GraphQL provider context
}

export interface ArtifactGuestShareLinkSummary {
    ID: string;
    MagicLinkInviteID?: string | null;
    ArtifactID: string;
    ArtifactVersionID?: string | null;
    Label?: string | null;
    ShareMode: string;
    Status?: string | null;
    AccessCount?: number | null;
    ExpiresAt?: string | null;
    RevokedAt?: string | null;
    CreatedAt?: string | null;
}

export interface ListArtifactGuestShareLinksResponse {
    Success: boolean;
    ErrorMessage?: string;
    Links: ArtifactGuestShareLinkSummary[];
}

function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    return String(value);
}

/**
 * Lists active (non-revoked) guest share links for an artifact on behalf of an authorized
 * sharer/owner (`CanShare || CanDelete`), joining status/expiry/use-count metadata from
 * their backing `MJ: Magic Link Invites`.
 */
export async function ListArtifactGuestShareLinksForOwner(
    artifactId: string,
    provider: IMetadataProvider,
    actor: UserInfo | undefined,
): Promise<ListArtifactGuestShareLinksResponse> {
    if (!actor) {
        return {
            Success: false,
            ErrorMessage: 'Authentication required to list guest share links.',
            Links: [],
        };
    }
    const trimmedArtifactId = (artifactId ?? '').trim();
    if (!IsValidUUID(trimmedArtifactId)) {
        return {
            Success: false,
            ErrorMessage: 'Valid ArtifactID UUID is required.',
            Links: [],
        };
    }

    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
        provider,
        trimmedArtifactId,
        actor,
    );
    if (!perms.CanShare && !perms.CanDelete) {
        return {
            Success: false,
            ErrorMessage: 'Listing guest share links requires CanShare or CanDelete permission.',
            Links: [],
        };
    }

    const systemUser = resolveSystemUser();
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJArtifactGuestShareLinkEntityType>(
        {
            EntityName: 'MJ: Artifact Guest Share Links',
            Fields: ['ID', 'MagicLinkInviteID', 'ArtifactID', 'ArtifactVersionID', 'Label', '__mj_CreatedAt'],
            ExtraFilter: `ArtifactID='${EscapeSQLString(trimmedArtifactId)}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'simple',
        },
        systemUser,
    );
    if (!result.Success) {
        return {
            Success: false,
            ErrorMessage: result.ErrorMessage || 'Failed to load guest share links.',
            Links: [],
        };
    }

    const linkRows = (result.Results ?? []).filter((row) => typeof row.ID === 'string' && row.ID.length > 0);
    const inviteIds = Array.from(
        new Set(
            linkRows
                .map((row) => (typeof row.MagicLinkInviteID === 'string' ? row.MagicLinkInviteID.trim() : ''))
                .filter((id) => IsValidUUID(id)),
        ),
    );

    const inviteMap = new Map<string, MJMagicLinkInviteEntity>();
    if (inviteIds.length > 0) {
        const inClause = inviteIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const inviteRes = await rv.RunView<MJMagicLinkInviteEntity>(
            {
                EntityName: 'MJ: Magic Link Invites',
                Fields: ['ID', 'Status', 'ExpiresAt', 'UseCount', '__mj_UpdatedAt'],
                ExtraFilter: `ID IN (${inClause})`,
                ResultType: 'simple',
            },
            systemUser,
        );
        if (inviteRes.Success && inviteRes.Results) {
            for (const inv of inviteRes.Results) {
                if (inv?.ID) {
                    inviteMap.set(NormalizeUUID(inv.ID), inv);
                }
            }
        }
    }

    const links: ArtifactGuestShareLinkSummary[] = [];
    for (const row of linkRows) {
        const invite = row.MagicLinkInviteID
            ? inviteMap.get(NormalizeUUID(row.MagicLinkInviteID))
            : undefined;
        if (invite && invite.Status === 'Revoked') {
            continue;
        }
        links.push({
            ID: row.ID,
            MagicLinkInviteID: row.MagicLinkInviteID ?? null,
            ArtifactID: row.ArtifactID ?? trimmedArtifactId,
            ArtifactVersionID: row.ArtifactVersionID ?? null,
            Label: row.Label ?? null,
            ShareMode: 'Frozen',
            Status: invite?.Status ?? 'Active',
            AccessCount: typeof invite?.UseCount === 'number' ? invite.UseCount : 0,
            ExpiresAt: toIsoStringOrNull(invite?.ExpiresAt),
            RevokedAt: null,
            CreatedAt: toIsoStringOrNull(row.__mj_CreatedAt),
        });
    }

    return {
        Success: true,
        Links: links,
    };
}
