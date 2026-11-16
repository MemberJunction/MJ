import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
    BaseRemotableOperation,
    type IMetadataProvider,
    LogError,
    Metadata,
    RemoteOperationError,
    type RemoteOpServerContext,
    RunView,
    type UserInfo,
} from '@memberjunction/core';
import {
    ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY,
    ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY,
    ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY,
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    type CreateGuestShareLinkInput,
    CreateGuestShareLinkOperation,
    type CreateGuestShareLinkOutput,
    type DocumentBlockSpec,
    DocumentLiveBlockEngine,
    type FrozenBlockSnapshot,
    type GuestFrozenProvenanceItem,
    type MJArtifactEntity,
    type MJArtifactGuestShareLinkEntity,
    type MJArtifactGuestShareLinkEntityType,
    type MJArtifactVersionEntity,
    type ParsedDocumentSegment,
    type ResolveGuestShareLinkInput,
    ResolveGuestShareLinkOperation,
    type ResolveGuestShareLinkOutput,
    type RevokeGuestShareLinkInput,
    RevokeGuestShareLinkOperation,
    type RevokeGuestShareLinkOutput,
    SlideDeckEngine,
    ValidateFrozenBlockSnapshot,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, IsValidUUID, MJGlobal, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { WriteArtifactComplianceAudit } from './ArtifactComplianceAuditHelper.js';

const MIN_GUEST_SHARE_HOURS = 1;
const MAX_GUEST_SHARE_HOURS = 720;
const MIN_SECRET_BYTES = 32;
const MAX_LABEL_LENGTH = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_MAX_KEYS = 5_000;

const GUEST_SHARE_SECRET_STORE_KEY = '___SINGLETON__MJ_GUEST_SHARE_SECRET_STATE';
const GUEST_SHARE_RATE_LIMIT_STORE_KEY = '___SINGLETON__MJ_GUEST_SHARE_RATE_LIMIT_MAP';

interface GuestShareSecretState {
    ExplicitSecret: string | null;
    EphemeralDevSecret: string | null;
}

interface GuestShareRateLimitEntry {
    Count: number;
    ResetAt: number;
}

interface GuestShareTokenClaims {
    v: 1;
    lid: string;
    aid: string;
    vid: string;
    mode: 'Frozen';
    exp: number;
}

export type PublicGuestShareErrorCode =
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

function getSecretState(): GuestShareSecretState {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (!store[GUEST_SHARE_SECRET_STORE_KEY]) {
        store[GUEST_SHARE_SECRET_STORE_KEY] = {
            ExplicitSecret: null,
            EphemeralDevSecret: null,
        } satisfies GuestShareSecretState;
    }
    return store[GUEST_SHARE_SECRET_STORE_KEY] as GuestShareSecretState;
}

function getRateLimitMap(): Map<string, GuestShareRateLimitEntry> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
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

/**
 * Configures an explicit guest-share HMAC secret (intended for unit tests and multi-node deployments).
 * Rejects non-null secrets shorter than 32 bytes.
 */
export function SetGuestShareSigningSecret(secret: string | null): void {
    const state = getSecretState();
    if (secret == null || secret.trim().length === 0) {
        state.ExplicitSecret = null;
        return;
    }
    const trimmed = secret.trim();
    if (Buffer.byteLength(trimmed, 'utf8') < MIN_SECRET_BYTES) {
        throw new Error(`Guest share signing secret must be at least ${MIN_SECRET_BYTES} bytes.`);
    }
    state.ExplicitSecret = trimmed;
}

function resolveGuestShareSecret(): Buffer {
    const state = getSecretState();
    const configured =
        state.ExplicitSecret ||
        process.env.MJ_ARTIFACT_GUEST_SHARE_SECRET?.trim() ||
        process.env.ARTIFACT_GUEST_SHARE_SECRET?.trim() ||
        process.env.MJ_GUEST_SHARE_SECRET?.trim() ||
        null;

    if (configured) {
        if (Buffer.byteLength(configured, 'utf8') < MIN_SECRET_BYTES) {
            throw new RemoteOperationError(
                'SECRET_CONFIGURATION_ERROR',
                `Configured MJ_ARTIFACT_GUEST_SHARE_SECRET must be at least ${MIN_SECRET_BYTES} bytes.`,
            );
        }
        return Buffer.from(configured, 'utf8');
    }

    if (process.env.NODE_ENV === 'production') {
        throw new RemoteOperationError(
            'SECRET_CONFIGURATION_ERROR',
            'MJ_ARTIFACT_GUEST_SHARE_SECRET (>= 32 bytes) must be configured in production to issue or verify guest share tokens.',
        );
    }

    if (!state.EphemeralDevSecret) {
        state.EphemeralDevSecret = randomBytes(32).toString('hex');
    }
    return Buffer.from(state.EphemeralDevSecret, 'utf8');
}

function computeTokenHash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

function signTokenClaims(claims: GuestShareTokenClaims): string {
    const secret = resolveGuestShareSecret();
    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const sigB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sigB64}`;
}

function verifyTokenClaims(token: string): { Valid: boolean; Claims?: GuestShareTokenClaims; Reason?: string; Expired?: boolean } {
    if (typeof token !== 'string' || token.trim().length === 0 || token.length > 4096) {
        return { Valid: false, Reason: 'Missing or malformed guest share token.' };
    }
    const parts = token.trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { Valid: false, Reason: 'Malformed guest share token.' };
    }
    const [payloadB64, sigB64] = parts;
    const secret = resolveGuestShareSecret();
    const expectedSigB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const actualBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
        return { Valid: false, Reason: 'Invalid guest share token signature.' };
    }

    try {
        const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<GuestShareTokenClaims>;
        if (
            parsed.v !== 1 ||
            parsed.mode !== 'Frozen' ||
            typeof parsed.lid !== 'string' ||
            !IsValidUUID(parsed.lid) ||
            typeof parsed.aid !== 'string' ||
            !IsValidUUID(parsed.aid) ||
            typeof parsed.vid !== 'string' ||
            !IsValidUUID(parsed.vid) ||
            typeof parsed.exp !== 'number' ||
            !Number.isFinite(parsed.exp)
        ) {
            return { Valid: false, Reason: 'Invalid guest share token claims.' };
        }
        if (parsed.exp <= Date.now()) {
            return { Valid: false, Expired: true, Reason: 'Guest share link has expired.' };
        }
        return { Valid: true, Claims: parsed as GuestShareTokenClaims };
    } catch {
        return { Valid: false, Reason: 'Unparseable guest share token payload.' };
    }
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
    }
): string | null {
    if (!spec || typeof spec !== 'object') {
        return `${contextLabel} is missing a valid block specification.`;
    }
    if (spec.Mode !== 'Frozen') {
        return `${contextLabel} ('${spec.Title ?? spec.BlockID ?? 'block'}') must use Mode='Frozen' for guest sharing (found Mode='${String(spec.Mode ?? 'undefined')}').`;
    }
    const validation = ValidateFrozenBlockSnapshot(spec.FrozenSnapshot ?? null);
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
    slideContext?: { SlideID?: string; RegionID?: string }
): string | null {
    const segments: ParsedDocumentSegment[] = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
    for (const seg of segments) {
        if (seg.Type === 'mj-block') {
            const err = validateFrozenBlockSpec(
                seg.BlockSpec,
                `${contextPrefix} embedded block`,
                provenanceOut,
                'DocumentBlock',
                slideContext
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
    provenanceOut: GuestFrozenProvenanceItem[]
): string | null {
    if (depth > 4) {
        return 'Nested embedded artifact inspection depth exceeded.';
    }
    if (contentMode === 'File') {
        return 'Binary File artifacts cannot be shared via Frozen-only guest share links.';
    }

    const text = content ?? '';

    // 1. Markdown directives (respects code fences)
    const mdError = checkMarkdownSegmentsFrozen(text, 'Document', provenanceOut);
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
                                    { SlideID: slide.SlideID, RegionID: region.RegionID }
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
                                    { SlideID: slide.SlideID, RegionID: region.RegionID }
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
                        const snapValidation = ValidateFrozenBlockSnapshot(table.FrozenSnapshot ?? null);
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
                        if (emb.FrozenSnapshot) {
                            const snapValidation = ValidateFrozenBlockSnapshot(emb.FrozenSnapshot);
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
                        } else if (emb.InlineContentJSON) {
                            const nestedErr = inspectFrozenGuestShareContentInternal(
                                emb.InlineContentJSON,
                                null,
                                null,
                                depth + 1,
                                provenanceOut
                            );
                            if (nestedErr) {
                                return nestedErr;
                            }
                        } else {
                            return `Spreadsheet '${sheetName}' embedded artifact '${emb.Title ?? emb.EmbedID ?? 'embed'}' is missing a verified frozen snapshot.`;
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
                    const snapValidation = ValidateFrozenBlockSnapshot(ds?.FrozenSnapshot ?? null);
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
                    const err = validateFrozenBlockSpec(blk, 'Configuration liveBlock', provenanceOut);
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
    contentMode?: string | null
): GuestShareFrozenInspectionResult {
    const provenance: GuestFrozenProvenanceItem[] = [];
    const reason = inspectFrozenGuestShareContentInternal(
        content,
        configuration,
        contentMode,
        0,
        provenance
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
): string | null {
    return inspectFrozenGuestShareContentInternal(content, configuration, contentMode, depth, []);
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
 * Resolves and validates a public/guest frozen artifact share token, returning the locked
 * `PublicArtifactGuestShareResult` contract used by both `/guest-share/resolve` REST and
 * `@Public() ResolvePublicArtifactGuestShare` GraphQL.
 */
export async function ResolvePublicArtifactGuestShareData(
    token: string,
    provider: IMetadataProvider,
    rateLimitClientKey = 'anonymous',
): Promise<PublicArtifactGuestShareResolution> {
    if (!checkRateLimit(rateLimitClientKey)) {
        return buildFailedPublicResolution('RATE_LIMITED', 'Too many guest share resolution requests. Please wait before retrying.');
    }

    const tokenCheck = verifyTokenClaims(token);
    if (!tokenCheck.Valid || !tokenCheck.Claims) {
        return buildFailedPublicResolution(
            tokenCheck.Expired ? 'EXPIRED' : 'INVALID_TOKEN',
            tokenCheck.Reason ?? 'Invalid guest share token.',
        );
    }

    const claims = tokenCheck.Claims;
    const tokenHash = computeTokenHash(token.trim());
    let systemUser: UserInfo;
    try {
        systemUser = resolveSystemUser();
    } catch {
        return buildFailedPublicResolution('INTERNAL_ERROR', 'System user is unavailable for guest share resolution.');
    }
    const rv = RunView.FromMetadataProvider(provider);

    try {
        const linkRes = await rv.RunView<Record<string, string | number | boolean | Date | null>>(
            {
                EntityName: 'MJ: Artifact Guest Share Links',
                ExtraFilter: `TokenHash='${EscapeSQLString(tokenHash)}' AND ID='${EscapeSQLString(claims.lid)}'`,
                MaxRows: 1,
                ResultType: 'simple',
            },
            systemUser,
        );

        const linkRow = linkRes.Success ? linkRes.Results?.[0] : undefined;
        if (!linkRow) {
            return buildFailedPublicResolution('NOT_FOUND', 'Guest share link could not be found.');
        }

        const linkArtifactId = String(linkRow['ArtifactID'] ?? '');
        const linkVersionId = String(linkRow['ArtifactVersionID'] ?? '');
        if (!UUIDsEqual(linkArtifactId, claims.aid) || !UUIDsEqual(linkVersionId, claims.vid)) {
            return buildFailedPublicResolution('INVALID_TOKEN', 'Guest share token does not match stored link metadata.');
        }

        if (linkRow['RevokedAt'] != null && String(linkRow['RevokedAt']).trim().length > 0) {
            return buildFailedPublicResolution('REVOKED', 'This guest share link has been revoked.');
        }

        const dbExpiresRaw = linkRow['ExpiresAt'];
        if (dbExpiresRaw != null) {
            const dbExpiresMs = dbExpiresRaw instanceof Date ? dbExpiresRaw.getTime() : Date.parse(String(dbExpiresRaw));
            if (Number.isFinite(dbExpiresMs) && dbExpiresMs <= Date.now()) {
                return buildFailedPublicResolution('EXPIRED', 'Guest share link has expired.');
            }
        }

        const [verRes, artRes] = await rv.RunViews<Record<string, string | number | boolean | Date | null>>(
            [
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ID='${EscapeSQLString(claims.vid)}' AND ArtifactID='${EscapeSQLString(claims.aid)}'`,
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(claims.aid)}'`,
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

        const inspection = InspectFrozenGuestShareContent(content, configuration, contentMode);
        if (inspection.UnfrozenReason) {
            return buildFailedPublicResolution(
                'FROZEN_REQUIRED',
                `Guest share refused because artifact version is no longer strictly Frozen: ${inspection.UnfrozenReason}`,
            );
        }

        await ArtifactMetadataEngine.Instance.Config(false, systemUser, provider);
        const typeId = artRow?.['TypeID'] != null ? String(artRow['TypeID']) : '';
        const typeMeta = typeId
            ? ArtifactMetadataEngine.Instance.ArtifactTypes.find((t) => UUIDsEqual(t.ID, typeId))
            : undefined;
        const artifactTypeName = typeMeta?.Name ?? (artRow?.['Type'] != null ? String(artRow['Type']) : undefined);
        const driverClass = typeMeta?.DriverClass ?? undefined;

        const title =
            (versionRow['Name'] != null && String(versionRow['Name']).trim().length > 0
                ? String(versionRow['Name'])
                : undefined) ??
            (artRow?.['Name'] != null ? String(artRow['Name']) : 'Shared Artifact');

        // Best-effort access tracking via SystemUser
        try {
            const linkEntity = await provider.GetEntityObject<MJArtifactGuestShareLinkEntity>(
                'MJ: Artifact Guest Share Links',
                systemUser,
            );
            if (await linkEntity.Load(String(linkRow['ID']))) {
                linkEntity.AccessCount = Number(linkEntity.AccessCount ?? 0) + 1;
                linkEntity.LastAccessedAt = new Date();
                await linkEntity.Save();
            }
        } catch (err) {
            LogError(`Failed to update guest share link access telemetry for ${claims.lid}: ${err instanceof Error ? err.message : String(err)}`);
        }

        const expiresIso = new Date(claims.exp).toISOString();
        const label = linkRow['Label'] != null ? String(linkRow['Label']) : undefined;

        return {
            Success: true,
            Valid: true,
            ArtifactID: claims.aid,
            ArtifactName: artRow?.['Name'] != null ? String(artRow['Name']) : title,
            Title: title,
            ArtifactTypeName: artifactTypeName,
            DriverClass: driverClass,
            VersionID: claims.vid,
            VersionNumber: Number(versionRow['VersionNumber'] ?? 1),
            Content: content,
            Configuration: SanitizeGuestShareConfiguration(configuration),
            FrozenProvenance: inspection.FrozenProvenance,
            ExpiresAt: expiresIso,
            Label: label,
            ShareMode: 'Frozen',
            ReadOnly: true,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LogError(`ResolvePublicArtifactGuestShareData failed: ${msg}`);
        return buildFailedPublicResolution('INTERNAL_ERROR', 'Failed to resolve guest share link.');
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.CreateGuestShareLink` (`§6.3`, `NW-1`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY)
export class CreateGuestShareLinkServerOperation extends CreateGuestShareLinkOperation {
    protected override async Authorize(
        input: CreateGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider ?? Metadata.Provider;
        if (!IsValidUUID(input.ArtifactID)) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactID must be a valid UUID.');
        }
        if (input.VersionID && !IsValidUUID(input.VersionID)) {
            throw new RemoteOperationError('INVALID_INPUT', 'VersionID must be a valid UUID.');
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
    ): Promise<CreateGuestShareLinkOutput> {
        const systemUser = resolveSystemUser();
        const rv = RunView.FromMetadataProvider(provider);
        const extraFilter = input.VersionID
            ? `ID='${EscapeSQLString(input.VersionID)}' AND ArtifactID='${EscapeSQLString(input.ArtifactID)}'`
            : `ArtifactID='${EscapeSQLString(input.ArtifactID)}'`;
        const res = await rv.RunView<MJArtifactVersionEntity>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: extraFilter,
                OrderBy: 'VersionNumber DESC',
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            systemUser,
        );

        const version = res.Success ? res.Results?.[0] : undefined;
        if (!version) {
            throw new RemoteOperationError(
                'NOT_FOUND',
                `Target version not found for artifact '${input.ArtifactID}'.`,
            );
        }

        const unfrozenReason = FindUnfrozenLiveContentReason(
            version.Content,
            version.Configuration,
            version.ContentMode,
        );
        if (unfrozenReason) {
            throw new RemoteOperationError(
                'FROZEN_REQUIRED',
                `Guest sharing only supports Frozen snapshots: ${unfrozenReason} Convert live blocks/tables/formulas to Frozen snapshots before creating a guest share link.`,
            );
        }

        const rawHours = Number.isFinite(input.ExpiresInHours) ? Number(input.ExpiresInHours) : 168;
        const expiresInHours = Math.max(MIN_GUEST_SHARE_HOURS, Math.min(MAX_GUEST_SHARE_HOURS, rawHours));
        const expiresAtMs = Date.now() + expiresInHours * 3600_000;
        const expiresAtDate = new Date(expiresAtMs);
        const expiresAtIso = expiresAtDate.toISOString();
        const linkId = randomUUID();
        const normalizedArtifactId = NormalizeUUID(input.ArtifactID);
        const normalizedVersionId = NormalizeUUID(version.ID);

        const token = signTokenClaims({
            v: 1,
            lid: NormalizeUUID(linkId),
            aid: normalizedArtifactId,
            vid: normalizedVersionId,
            mode: 'Frozen',
            exp: expiresAtMs,
        });
        const tokenHash = computeTokenHash(token);
        const sanitizedLabel = input.Label ? input.Label.trim().slice(0, MAX_LABEL_LENGTH) : null;

        const linkEntity = await provider.GetEntityObject<MJArtifactGuestShareLinkEntity>(
            'MJ: Artifact Guest Share Links',
            systemUser,
        );
        linkEntity.NewRecord();
        linkEntity.ID = linkId;
        linkEntity.ArtifactID = input.ArtifactID;
        linkEntity.ArtifactVersionID = version.ID;
        linkEntity.CreatedByUserID = user.ID;
        linkEntity.TokenHash = tokenHash;
        linkEntity.Label = sanitizedLabel;
        linkEntity.ExpiresAt = expiresAtDate;

        const saved = await linkEntity.Save();
        if (!saved) {
            throw new RemoteOperationError(
                'PERSIST_FAILED',
                linkEntity.LatestResult?.CompleteMessage || 'Failed to persist guest share link.',
            );
        }

        await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: version.ID,
            Summary: `Created Frozen guest share link ${linkId} (expires ${expiresAtIso})`,
            Details: {
                action: 'Create',
                linkId,
                label: sanitizedLabel ?? undefined,
                expiresAt: expiresAtIso,
                shareMode: 'Frozen',
            },
        });

        return {
            LinkID: linkId,
            Token: token,
            ShareUrlPath: `/guest/artifact/${encodeURIComponent(token)}`,
            ArtifactID: input.ArtifactID,
            VersionID: version.ID,
            VersionNumber: version.VersionNumber,
            ExpiresAt: expiresAtIso,
            ShareMode: 'Frozen',
        };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.RevokeGuestShareLink` (`§6.3`, `NW-1`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY)
export class RevokeGuestShareLinkServerOperation extends RevokeGuestShareLinkOperation {
    protected override async Authorize(
        input: RevokeGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
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

        if (!linkEntity.RevokedAt) {
            linkEntity.RevokedAt = new Date();
            linkEntity.RevokedByUserID = user.ID;
            const saved = await linkEntity.Save();
            if (!saved) {
                throw new RemoteOperationError(
                    'PERSIST_FAILED',
                    linkEntity.LatestResult?.CompleteMessage || 'Failed to revoke guest share link.',
                );
            }
        }

        await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: linkEntity.ArtifactVersionID,
            Summary: `Revoked guest share link ${input.LinkID}`,
            Details: {
                action: 'Revoke',
                linkId: input.LinkID,
            },
        });

        return {
            Revoked: true,
            LinkID: linkEntity.ID,
        };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.ResolveGuestShareLink` (`§6.3`, `NW-1`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY)
export class ResolveGuestShareLinkServerOperation extends ResolveGuestShareLinkOperation {
    protected override async Authorize(
        _input: ResolveGuestShareLinkInput,
        user: UserInfo,
    ): Promise<boolean> {
        if (!user) {
            throw new RemoteOperationError('UNAUTHORIZED', 'Authentication required.');
        }
        return true;
    }

    protected override async InternalExecute(
        input: ResolveGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ResolveGuestShareLinkOutput> {
        const resolved = await ResolvePublicArtifactGuestShareData(
            input.Token,
            provider,
            `user:${user.ID}`,
        );
        if (!resolved.Valid) {
            return {
                Valid: false,
                ShareMode: 'Frozen',
                ReadOnly: true,
                Reason: resolved.ErrorMessage ?? 'Invalid guest share token.',
            };
        }

        return {
            Valid: true,
            ArtifactID: resolved.ArtifactID,
            VersionID: resolved.VersionID,
            VersionNumber: resolved.VersionNumber,
            Title: resolved.Title,
            ArtifactTypeName: resolved.ArtifactTypeName,
            DriverClass: resolved.DriverClass,
            Content: resolved.Content,
            Configuration: resolved.Configuration,
            FrozenProvenance: resolved.FrozenProvenance,
            ExpiresAt: resolved.ExpiresAt,
            ShareMode: 'Frozen',
            ReadOnly: true,
        };
    }
}

export function LoadArtifactGuestShareOperations(): void {
    void CreateGuestShareLinkServerOperation;
    void RevokeGuestShareLinkServerOperation;
    void ResolveGuestShareLinkServerOperation;
}

export function ResolveGuestShareProviderFallback(): IMetadataProvider {
    return Metadata.Provider; // global-provider-ok: public guest share route has no authenticated per-request provider
}

export interface ArtifactGuestShareLinkSummary {
    ID: string;
    ArtifactID: string;
    ArtifactVersionID?: string | null;
    Label?: string | null;
    ShareMode: string;
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
 * sharer/owner (`CanShare || CanDelete`), returning only non-secret summary fields (`TokenHash` omitted).
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
            Fields: ['ID', 'ArtifactID', 'ArtifactVersionID', 'Label', 'ExpiresAt', 'RevokedAt', '__mj_CreatedAt'],
            ExtraFilter: `ArtifactID='${EscapeSQLString(trimmedArtifactId)}' AND RevokedAt IS NULL`,
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

    const links: ArtifactGuestShareLinkSummary[] = (result.Results ?? [])
        .filter((row) => typeof row.ID === 'string' && row.ID.length > 0)
        .map((row) => ({
            ID: row.ID,
            ArtifactID: row.ArtifactID ?? trimmedArtifactId,
            ArtifactVersionID: row.ArtifactVersionID ?? null,
            Label: row.Label ?? null,
            ShareMode: 'Frozen',
            ExpiresAt: toIsoStringOrNull(row.ExpiresAt),
            RevokedAt: toIsoStringOrNull(row.RevokedAt),
            CreatedAt: toIsoStringOrNull(row.__mj_CreatedAt),
        }));

    return {
        Success: true,
        Links: links,
    };
}
