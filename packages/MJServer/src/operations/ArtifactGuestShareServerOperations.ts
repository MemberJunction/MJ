import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
    BaseRemotableOperation,
    type IMetadataProvider,
    LogError,
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
    DocumentLiveBlockEngine,
    GetGuestShareLinksFromConfig,
    MarkGuestShareLinkRevokedInConfig,
    type MJArtifactVersionEntity,
    type ResolveGuestShareLinkInput,
    ResolveGuestShareLinkOperation,
    type ResolveGuestShareLinkOutput,
    type RevokeGuestShareLinkInput,
    RevokeGuestShareLinkOperation,
    type RevokeGuestShareLinkOutput,
    SlideDeckEngine,
    UpsertGuestShareLinkInConfig,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, NormalizeUUID, RegisterClass } from '@memberjunction/global';
import { WriteArtifactComplianceAudit } from './ArtifactComplianceAuditHelper.js';

const MIN_GUEST_SHARE_HOURS = 1;
const MAX_GUEST_SHARE_HOURS = 720;

interface GuestShareTokenClaims {
    v: 1;
    lid: string;
    aid: string;
    vid: string;
    mode: 'Frozen';
    exp: number;
}

let explicitTestSigningSecret: string | null = null;
let fallbackProcessSecret: string | null = null;

/** Configures an explicit guest-share HMAC secret (intended for unit tests and multi-node deployments). */
export function SetGuestShareSigningSecret(secret: string | null): void {
    explicitTestSigningSecret = secret && secret.trim().length > 0 ? secret.trim() : null;
}

function resolveGuestShareSecret(): Buffer {
    const configured =
        explicitTestSigningSecret ||
        process.env.ARTIFACT_GUEST_SHARE_SECRET?.trim() ||
        process.env.MJ_GUEST_SHARE_SECRET?.trim() ||
        DocumentLiveBlockEngine.Instance.GetSigningSecret()?.trim() ||
        process.env.MJ_FROZEN_BLOCK_HMAC_SECRET?.trim() ||
        '';
    if (configured.length >= 16) {
        return Buffer.from(configured, 'utf8');
    }
    if (!fallbackProcessSecret) {
        if (process.env.NODE_ENV === 'production') {
            throw new RemoteOperationError(
                'CONFIG_ERROR',
                'ARTIFACT_GUEST_SHARE_SECRET must be configured before issuing external guest share links in production.',
            );
        }
        LogError(
            '[ArtifactGuestShare] Warning: ARTIFACT_GUEST_SHARE_SECRET is not set; using ephemeral per-process dev secret.',
        );
        fallbackProcessSecret = randomBytes(32).toString('hex');
    }
    return Buffer.from(fallbackProcessSecret, 'utf8');
}

function encodeGuestShareToken(claims: GuestShareTokenClaims): string {
    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const sig = createHmac('sha256', resolveGuestShareSecret()).update(payloadB64, 'utf8').digest('base64url');
    return `${payloadB64}.${sig}`;
}

function decodeAndVerifyGuestShareToken(token: string): GuestShareTokenClaims | null {
    const trimmed = (token ?? '').trim();
    const dotIdx = trimmed.indexOf('.');
    if (dotIdx <= 0 || dotIdx === trimmed.length - 1) {
        return null;
    }
    const payloadB64 = trimmed.slice(0, dotIdx);
    const sigB64 = trimmed.slice(dotIdx + 1);

    const expectedSig = createHmac('sha256', resolveGuestShareSecret()).update(payloadB64, 'utf8').digest('base64url');
    const actualBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
        return null;
    }

    try {
        const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as GuestShareTokenClaims;
        if (
            parsed.v !== 1 ||
            parsed.mode !== 'Frozen' ||
            typeof parsed.lid !== 'string' ||
            typeof parsed.aid !== 'string' ||
            typeof parsed.vid !== 'string' ||
            typeof parsed.exp !== 'number'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Verifies the strict `Frozen`-Only invariant required before an artifact version may be
 * shared via an external guest link (`§6.3`): rejects any document or slide deck containing
 * live/parameterized blocks that have not yet been frozen to immutable snapshots.
 */
function findUnfrozenLiveContentReason(content: string | null | undefined, configuration: string | null | undefined): string | null {
    const raw = (content ?? '').trim();
    if (raw) {
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(raw);
        const nonFrozenDocBlock = segments.find(
            (seg) => seg.Type === 'mj-block' && seg.BlockSpec?.Mode && seg.BlockSpec.Mode !== 'Frozen',
        );
        if (nonFrozenDocBlock?.BlockSpec) {
            return `Document live block '${nonFrozenDocBlock.BlockSpec.BlockID}' is in '${nonFrozenDocBlock.BlockSpec.Mode}' mode. Freeze all live blocks before sharing externally.`;
        }

        if (raw.startsWith('{')) {
            try {
                const parsedJson = JSON.parse(raw) as Record<string, unknown>;
                if (Array.isArray(parsedJson.Slides)) {
                    const deck = SlideDeckEngine.Instance.ParseDeckSpec(raw);
                    for (const slide of deck.Slides) {
                        for (const region of slide.Regions) {
                            const mode = region.BlockSpec?.Mode;
                            if (region.BlockSpec && mode && mode !== 'Frozen') {
                                return `Slide '${slide.SlideID}' region '${region.RegionID}' contains a '${mode}' live block. Freeze all live blocks before sharing externally.`;
                            }
                            if (region.MarkdownContent) {
                                const regSegs = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(region.MarkdownContent);
                                const nonFrozenReg = regSegs.find(
                                    (s) => s.Type === 'mj-block' && s.BlockSpec?.Mode && s.BlockSpec.Mode !== 'Frozen',
                                );
                                if (nonFrozenReg?.BlockSpec) {
                                    return `Slide '${slide.SlideID}' region '${region.RegionID}' contains a '${nonFrozenReg.BlockSpec.Mode}' live block. Freeze all live blocks before sharing externally.`;
                                }
                            }
                        }
                    }
                }
                if (Array.isArray(parsedJson.LiveDataSources)) {
                    const hasUnfrozenSource = parsedJson.LiveDataSources.some((src) => {
                        if (!src || typeof src !== 'object') {
                            return false;
                        }
                        const rec = src as { Mode?: string };
                        return rec.Mode !== undefined && rec.Mode !== 'Frozen';
                    });
                    if (hasUnfrozenSource) {
                        return 'Artifact contains non-frozen live data sources. Freeze all live sources before sharing externally.';
                    }
                }
            } catch {
                // Non-JSON markdown or plain content already checked above
            }
        }
    }

    const cfg = (configuration ?? '').trim();
    if (cfg.startsWith('{')) {
        try {
            const parsedCfg = JSON.parse(cfg) as { liveBlocks?: Array<{ Mode?: string; BlockID?: string }> };
            if (Array.isArray(parsedCfg.liveBlocks)) {
                const unfrozen = parsedCfg.liveBlocks.find((b) => b.Mode && b.Mode !== 'Frozen');
                if (unfrozen) {
                    return `Version configuration references non-frozen live block '${unfrozen.BlockID ?? 'unknown'}'. Freeze before sharing externally.`;
                }
            }
        } catch {
            // Ignore non-JSON configuration text
        }
    }

    return null;
}

/**
 * Server-side Remote Operation implementing `Artifact.CreateGuestShareLink` (`§6.3`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY)
export class CreateGuestShareLinkServerOperation extends CreateGuestShareLinkOperation {
    protected override async Authorize(
        input: CreateGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        const artifactId = (input.ArtifactID ?? '').trim();
        if (!artifactId) {
            throw new RemoteOperationError('INVALID_INPUT', 'ArtifactID is required.');
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        if (!perms.CanShare) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                perms.Reason || `CanShare permission on artifact '${artifactId}' is required to create an external guest link.`,
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: CreateGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<CreateGuestShareLinkOutput> {
        const hoursRaw = Number(input.ExpiresInHours);
        const clampedHours = Number.isFinite(hoursRaw)
            ? Math.min(MAX_GUEST_SHARE_HOURS, Math.max(MIN_GUEST_SHARE_HOURS, hoursRaw))
            : 24;

        const rv = RunView.FromMetadataProvider(provider);
        const versionFilter = input.VersionID?.trim()
            ? `ID='${EscapeSQLString(input.VersionID.trim())}' AND ArtifactID='${EscapeSQLString(input.ArtifactID.trim())}'`
            : `ArtifactID='${EscapeSQLString(input.ArtifactID.trim())}'`;
        const verRes = await rv.RunView<MJArtifactVersionEntity>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: versionFilter,
                OrderBy: 'VersionNumber DESC',
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'entity_object',
            },
            user,
        );
        const version = verRes.Success && verRes.Results?.length ? verRes.Results[0] : null;
        if (!version) {
            throw new RemoteOperationError(
                'NOT_FOUND',
                `Target version for artifact '${input.ArtifactID}' was not found.`,
            );
        }

        const unfrozenReason = findUnfrozenLiveContentReason(version.Content, version.Configuration);
        if (unfrozenReason) {
            throw new RemoteOperationError('FROZEN_REQUIRED', unfrozenReason);
        }

        const linkId = randomUUID();
        const createdAt = new Date().toISOString();
        const expiresAtMs = Date.now() + clampedHours * 60 * 60 * 1000;
        const expiresAt = new Date(expiresAtMs).toISOString();
        const cleanLabel = (input.Label ?? '').trim() || undefined;

        version.Configuration = UpsertGuestShareLinkInConfig(version.Configuration, {
            LinkID: linkId,
            ArtifactID: input.ArtifactID.trim(),
            VersionID: version.ID,
            VersionNumber: version.VersionNumber ?? 1,
            ShareMode: 'Frozen',
            CreatedAt: createdAt,
            CreatedByUserID: user.ID,
            ExpiresAt: expiresAt,
            Label: cleanLabel,
        });

        const saved = await version.Save();
        if (!saved) {
            throw new RemoteOperationError(
                'SAVE_FAILED',
                version.LatestResult?.CompleteMessage || 'Failed to persist external guest share link metadata.',
            );
        }

        const token = encodeGuestShareToken({
            v: 1,
            lid: linkId,
            aid: input.ArtifactID.trim(),
            vid: version.ID,
            mode: 'Frozen',
            exp: expiresAtMs,
        });

        await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID.trim(),
            ArtifactVersionID: version.ID,
            Summary: `Issued Frozen-only external guest share link (${clampedHours}h)${cleanLabel ? ` for ${cleanLabel}` : ''}.`,
            Details: {
                action: 'created',
                linkId,
                shareMode: 'Frozen',
                expiresAt,
                label: cleanLabel ?? null,
            },
        });

        return {
            LinkID: linkId,
            Token: token,
            ShareUrlPath: `/library?guestToken=${encodeURIComponent(token)}`,
            ArtifactID: input.ArtifactID.trim(),
            VersionID: version.ID,
            VersionNumber: version.VersionNumber ?? 1,
            ShareMode: 'Frozen',
            ExpiresAt: expiresAt,
            Label: cleanLabel,
        };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.RevokeGuestShareLink` (`§6.3`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY)
export class RevokeGuestShareLinkServerOperation extends RevokeGuestShareLinkOperation {
    protected override async Authorize(
        input: RevokeGuestShareLinkInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        const provider = context?.provider;
        if (!provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, input.ArtifactID, user);
        if (!perms.CanShare && !perms.CanDelete) {
            throw new RemoteOperationError(
                'ACCESS_DENIED',
                perms.Reason || 'CanShare or CanDelete permission is required to revoke a guest share link.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: RevokeGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RevokeGuestShareLinkOutput> {
        const rv = RunView.FromMetadataProvider(provider);
        const verRes = await rv.RunView<MJArtifactVersionEntity>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID='${EscapeSQLString(input.VersionID)}' AND ArtifactID='${EscapeSQLString(input.ArtifactID)}'`,
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'entity_object',
            },
            user,
        );
        const version = verRes.Success && verRes.Results?.length ? verRes.Results[0] : null;
        if (!version) {
            return { Revoked: false, LinkID: input.LinkID };
        }

        const revokedAt = new Date().toISOString();
        const revokedRes = MarkGuestShareLinkRevokedInConfig(
            version.Configuration,
            input.LinkID,
            user.ID,
            revokedAt,
        );
        if (!revokedRes.Found) {
            return { Revoked: false, LinkID: input.LinkID };
        }

        version.Configuration = revokedRes.UpdatedConfigJson;
        const saved = await version.Save();
        if (!saved) {
            throw new RemoteOperationError(
                'SAVE_FAILED',
                version.LatestResult?.CompleteMessage || 'Failed to revoke external guest share link.',
            );
        }

        await WriteArtifactComplianceAudit(provider, user, {
            AuditLogTypeName: 'Artifact Guest Share Link',
            ArtifactID: input.ArtifactID,
            ArtifactVersionID: version.ID,
            Summary: `Revoked external guest share link '${input.LinkID}'.`,
            Details: {
                action: 'revoked',
                linkId: input.LinkID,
                revokedAt,
            },
        });

        return {
            Revoked: true,
            LinkID: input.LinkID,
            RevokedAt: revokedAt,
        };
    }
}

/**
 * Server-side Remote Operation implementing `Artifact.ResolveGuestShareLink` (`§6.3`).
 */
@RegisterClass(BaseRemotableOperation, ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY)
export class ResolveGuestShareLinkServerOperation extends ResolveGuestShareLinkOperation {
    protected override async Authorize(
        input: ResolveGuestShareLinkInput,
        _user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (!context?.provider) {
            throw new RemoteOperationError('NO_PROVIDER', 'Metadata provider is required.');
        }
        if (!(input.Token ?? '').trim()) {
            throw new RemoteOperationError('INVALID_INPUT', 'Guest share token is required.');
        }
        return true;
    }

    protected override async InternalExecute(
        input: ResolveGuestShareLinkInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ResolveGuestShareLinkOutput> {
        const claims = decodeAndVerifyGuestShareToken(input.Token);
        if (!claims) {
            return {
                Valid: false,
                Reason: 'Invalid or tampered guest share token signature.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }
        if (claims.exp <= Date.now()) {
            return {
                Valid: false,
                Reason: 'This external guest share link has expired.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }

        const reader = UserCache.Instance.GetSystemUser() ?? user;
        const rv = RunView.FromMetadataProvider(provider);
        const verRes = await rv.RunView<{
            ID: string;
            ArtifactID: string;
            VersionNumber?: number | null;
            Content?: string | null;
            Configuration?: string | null;
        }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID='${EscapeSQLString(claims.vid)}' AND ArtifactID='${EscapeSQLString(claims.aid)}'`,
                Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Content', 'Configuration'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            reader,
        );
        const version = verRes.Success && verRes.Results?.length ? verRes.Results[0] : null;
        if (!version) {
            return {
                Valid: false,
                Reason: 'Shared artifact version no longer exists.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }

        const links = GetGuestShareLinksFromConfig(version.Configuration);
        const normClaimLinkId = NormalizeUUID(claims.lid);
        const matched = links.find((l) => NormalizeUUID(l.LinkID) === normClaimLinkId);
        if (!matched) {
            return {
                Valid: false,
                Reason: 'Guest share link registration was not found on this version.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }
        if (matched.RevokedAt) {
            return {
                Valid: false,
                Reason: 'This external guest share link has been revoked.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }
        if (new Date(matched.ExpiresAt).getTime() <= Date.now()) {
            return {
                Valid: false,
                Reason: 'This external guest share link has expired.',
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }

        const unfrozenReason = findUnfrozenLiveContentReason(version.Content, version.Configuration);
        if (unfrozenReason) {
            return {
                Valid: false,
                Reason: unfrozenReason,
                ReadOnly: true,
                ShareMode: 'Frozen',
            };
        }

        const artRes = await rv.RunView<{ ID: string; Name?: string | null; TypeID?: string | null; Type?: string | null }>(
            {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: `ID='${EscapeSQLString(claims.aid)}'`,
                Fields: ['ID', 'Name', 'TypeID', 'Type'],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            reader,
        );
        const art = artRes.Success && artRes.Results?.length ? artRes.Results[0] : null;
        let driverClass: string | undefined;
        if (art?.TypeID) {
            try {
                await ArtifactMetadataEngine.Instance.Config(false, reader, provider);
                const normTypeId = NormalizeUUID(art.TypeID);
                const typeRow = (ArtifactMetadataEngine.Instance.ArtifactTypes ?? []).find(
                    (t) => NormalizeUUID(t.ID) === normTypeId,
                );
                driverClass = typeRow?.DriverClass ?? undefined;
            } catch {
                // Leave driverClass optional if metadata engine unavailable
            }
        }

        return {
            Valid: true,
            ArtifactID: claims.aid,
            VersionID: version.ID,
            VersionNumber: version.VersionNumber ?? 1,
            Title: art?.Name ?? 'Shared Snapshot',
            ArtifactTypeName: art?.Type ?? undefined,
            DriverClass: driverClass,
            Content: version.Content ?? '',
            Configuration: version.Configuration ?? undefined,
            ExpiresAt: matched.ExpiresAt,
            ReadOnly: true,
            ShareMode: 'Frozen',
        };
    }
}

/** Ensures all guest-share server operation classes are retained by tree-shakers and registered in ClassFactory. */
export function LoadArtifactGuestShareOperations(): void {
    void CreateGuestShareLinkServerOperation;
    void RevokeGuestShareLinkServerOperation;
    void ResolveGuestShareLinkServerOperation;
}
