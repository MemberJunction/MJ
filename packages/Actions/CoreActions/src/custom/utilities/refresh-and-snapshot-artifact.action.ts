import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    ArtifactPreviewSnapshot,
    ArtifactVersionConfiguration,
    BuildArtifactPreviewSnapshot,
    DocumentBlockExecutionResult,
    DocumentLiveBlockEngine,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
    MJConversationDetailEntity,
    ParseArtifactVersionConfiguration,
    SlideDeckEngine,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';

interface RefreshDigestSummary {
    DigestHash: string;
    PreviewSnapshot: ArtifactPreviewSnapshot | null;
    HighlightLines: string[];
}

/**
 * Scheduled Living Report action (`H3 §5.3`).
 *
 * Refreshes an artifact's live blocks (`LiveTables`, `=MJ.QUERY`, `=MJ.VIEW`, `=MJ.IMPORTRANGE`,
 * and `:::mj-block` directives) under the triggering user's permissions, compares the refreshed
 * output against the previous version's digest, saves `vN+1` when values changed (or forced),
 * computes a human-readable diff summary, and optionally posts a summary card with linked
 * artifact reference to a target Conversation.
 */
@RegisterClass(BaseAction, '__RefreshAndSnapshotArtifact')
export class RefreshAndSnapshotArtifactAction extends BaseAction {
    public static readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        return this.ExecuteRefreshAction(params);
    }

    /**
     * Executes scheduled refresh, diffing, version save, and optional Conversation notification.
     */
    public async ExecuteRefreshAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'ContextUser is required to refresh an artifact.',
                };
            }

            const artifactId = this.getStringParam(params, 'ArtifactID');
            if (!artifactId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_ARTIFACT_ID',
                    Message: 'ArtifactID parameter is required.',
                };
            }

            const freezeRefreshedBlocks = this.getBooleanParam(params, 'FreezeRefreshedBlocks', false);
            const forceSaveIfUnchanged = this.getBooleanParam(params, 'ForceSaveIfUnchanged', false);
            const conversationId = this.getStringParam(params, 'ConversationID');
            const versionComments = this.getStringParam(params, 'VersionComments');

            const md = params.Provider ?? new Metadata();
            const provider = params.Provider ?? Metadata.Provider;

            const perm = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                contextUser,
            );
            if (!perm.CanEdit) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `User does not have edit permission on artifact '${artifactId}'.`,
                };
            }

            const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
            const loaded = await artifact.Load(artifactId);
            if (!loaded) {
                return {
                    Success: false,
                    ResultCode: 'ARTIFACT_NOT_FOUND',
                    Message: `Artifact '${artifactId}' was not found.`,
                };
            }

            const rv = RunView.FromMetadataProvider(provider);
            const safeArtifactId = EscapeSQLString(artifactId);
            const versionRes = await rv.RunView<{
                ID: string;
                VersionNumber: number;
                Content: string | null;
                Configuration: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${safeArtifactId}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'Content', 'Configuration'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                contextUser,
            );

            if (!versionRes.Success || !versionRes.Results || versionRes.Results.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'VERSION_NOT_FOUND',
                    Message: `No artifact versions exist for artifact '${artifactId}'.`,
                };
            }

            const prevVersion = versionRes.Results[0];
            const prevConfig = ParseArtifactVersionConfiguration(prevVersion.Configuration) ?? {};
            const driverClass = await this.resolveDriverClass(artifact.TypeID, provider);
            const refreshed = await this.RefreshArtifactPayload(
                prevVersion.Content ?? '',
                prevVersion.Configuration ?? null,
                driverClass,
                artifact.Name,
                freezeRefreshedBlocks,
                contextUser,
                provider,
            );

            const prevDigestHash =
                typeof prevConfig['livingReportDigest'] === 'string'
                    ? prevConfig['livingReportDigest']
                    : hashStringFNV1a(prevVersion.Content ?? '');
            const changed = refreshed.Digest.DigestHash !== prevDigestHash;

            if (!changed && !forceSaveIfUnchanged) {
                this.setOutputParam(params, 'Changed', false);
                this.setOutputParam(params, 'ArtifactID', artifactId);
                this.setOutputParam(params, 'PreviousVersionID', prevVersion.ID);
                this.setOutputParam(params, 'PreviousVersionNumber', prevVersion.VersionNumber);
                this.setOutputParam(params, 'NewVersionID', prevVersion.ID);
                this.setOutputParam(params, 'NewVersionNumber', prevVersion.VersionNumber);
                this.setOutputParam(params, 'DiffSummary', 'No changes detected.');
                this.setOutputParam(params, 'PostedConversationDetailID', null);
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: `No changes detected for '${artifact.Name}' (v${prevVersion.VersionNumber}).`,
                };
            }

            const prevLines = this.extractPreviousHighlightLines(prevConfig);
            const diffSummary = this.computeDiffSummary(
                artifact.Name,
                prevVersion.VersionNumber,
                prevVersion.VersionNumber + 1,
                prevLines,
                refreshed.Digest.HighlightLines,
            );

            const nextConfig: ArtifactVersionConfiguration = {
                ...prevConfig,
                ...(refreshed.Digest.PreviewSnapshot
                    ? { previewSnapshot: refreshed.Digest.PreviewSnapshot }
                    : {}),
                livingReportDigest: refreshed.Digest.DigestHash,
                livingReportHighlightLines: refreshed.Digest.HighlightLines,
                livingReportRefreshedAt: new Date().toISOString(),
            };

            const nextVersion = await md.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                contextUser,
            );
            nextVersion.NewRecord();
            nextVersion.ArtifactID = artifactId;
            nextVersion.VersionNumber = prevVersion.VersionNumber + 1;
            nextVersion.UserID = contextUser.ID;
            nextVersion.Content = refreshed.UpdatedContent;
            nextVersion.Configuration = JSON.stringify(nextConfig);
            nextVersion.Comments =
                versionComments || `Scheduled refresh from v${prevVersion.VersionNumber}: ${diffSummary}`;

            const savedVersion = await nextVersion.Save();
            if (!savedVersion) {
                return {
                    Success: false,
                    ResultCode: 'SAVE_VERSION_FAILED',
                    Message: `Failed to save refreshed artifact version v${prevVersion.VersionNumber + 1}.`,
                };
            }

            let postedDetailId: string | null = null;
            if (conversationId) {
                postedDetailId = await this.postSummaryToConversation(
                    md,
                    contextUser,
                    conversationId,
                    artifact.Name,
                    nextVersion.ID,
                    nextVersion.VersionNumber,
                    diffSummary,
                );
            }

            this.setOutputParam(params, 'Changed', changed);
            this.setOutputParam(params, 'ArtifactID', artifactId);
            this.setOutputParam(params, 'PreviousVersionID', prevVersion.ID);
            this.setOutputParam(params, 'PreviousVersionNumber', prevVersion.VersionNumber);
            this.setOutputParam(params, 'NewVersionID', nextVersion.ID);
            this.setOutputParam(params, 'NewVersionNumber', nextVersion.VersionNumber);
            this.setOutputParam(params, 'DiffSummary', diffSummary);
            this.setOutputParam(params, 'PostedConversationDetailID', postedDetailId);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Refreshed '${artifact.Name}' to v${nextVersion.VersionNumber}: ${diffSummary}`,
            };
        } catch (err) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `RefreshAndSnapshotArtifactAction error: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    /**
     * Refreshes an artifact's live blocks/formulas based on driver type and computes a deterministic digest.
     */
    public async RefreshArtifactPayload(
        rawContent: string,
        rawConfiguration: string | null,
        driverClass: string,
        title: string,
        freezeBlocks: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ UpdatedContent: string; Digest: RefreshDigestSummary }> {
        const isSheet =
            driverClass === 'SpreadsheetArtifactViewerPlugin' ||
            (rawContent.trim().startsWith('{') && rawContent.includes('"Worksheets"'));
        if (isSheet) {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.ParseWorkbook(rawContent, rawConfiguration);
            await engine.RefreshLiveTables(wb, contextUser, provider, {
                ForceRefreshFrozen: freezeBlocks,
            });
            await engine.EvaluateMjCustomFunctions(wb, contextUser, provider, {
                BypassCache: true,
            });
            engine.EvaluateWorkbook(wb);

            const highlightLines: string[] = [];
            for (const ws of wb.Worksheets) {
                const populated = Object.values(ws.Cells)
                    .sort((a, b) => a.Address.localeCompare(b.Address))
                    .slice(0, 40)
                    .map((c) => `${ws.Name}!${c.Address}=${String(c.ComputedValue ?? c.RawValue ?? '')}`);
                highlightLines.push(...populated);
            }

            if (freezeBlocks) {
                for (const ws of wb.Worksheets) {
                    for (const tbl of ws.LiveTables) {
                        tbl.Mode = 'Frozen';
                    }
                }
            }

            const digestInput = JSON.stringify(highlightLines);
            const updatedContent = engine.SerializeWorkbook(wb);
            const snapshot = BuildArtifactPreviewSnapshot(updatedContent, driverClass, title);
            return {
                UpdatedContent: updatedContent,
                Digest: {
                    DigestHash: hashStringFNV1a(digestInput),
                    PreviewSnapshot: snapshot,
                    HighlightLines: highlightLines,
                },
            };
        }

        const isDeck =
            driverClass === 'SlideDeckArtifactViewerPlugin' ||
            (rawContent.trim().startsWith('{') && rawContent.includes('"Slides"'));
        if (isDeck) {
            const slideEngine = SlideDeckEngine.Instance;
            let deck = slideEngine.ParseDeckSpec(rawContent, title);
            const liveResults = await slideEngine.ExecuteDeckLiveBlocks(deck, provider, contextUser);
            if (freezeBlocks) {
                const resultsMap = new Map<string, DocumentBlockExecutionResult>(Object.entries(liveResults));
                deck = slideEngine.FreezeDeckLiveBlocksForPresentation(deck, resultsMap, contextUser);
            }
            const highlightLines = this.summarizeDeckDigest(deck.Slides, liveResults);
            const updatedContent = slideEngine.SerializeDeckSpec(deck);
            const snapshot = BuildArtifactPreviewSnapshot(updatedContent, driverClass, title);
            return {
                UpdatedContent: updatedContent,
                Digest: {
                    DigestHash: hashStringFNV1a(JSON.stringify(highlightLines)),
                    PreviewSnapshot: snapshot,
                    HighlightLines: highlightLines,
                },
            };
        }

        // Markdown Document with :::mj-block directives
        const docEngine = DocumentLiveBlockEngine.Instance;
        const segments = docEngine.ParseMarkdownDirectives(rawContent);
        const rebuiltParts: string[] = [];
        const highlightLines: string[] = [];
        const liveResults: Record<string, DocumentBlockExecutionResult> = {};

        for (const seg of segments) {
            if (seg.Type === 'markdown') {
                rebuiltParts.push(seg.RawText);
                const textSample = seg.RawText.split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .slice(0, 10);
                highlightLines.push(...textSample);
                continue;
            }
            if (seg.BlockSpec) {
                const res = await docEngine.ExecuteBlock(seg.BlockSpec, contextUser, provider);
                liveResults[seg.BlockSpec.BlockID] = res;
                highlightLines.push(
                    `Block[${seg.BlockSpec.Title || seg.BlockSpec.BlockID}]: rows=${res.TotalRowCount}, top=${JSON.stringify(res.Rows[0] ?? {})}`,
                );
                if (freezeBlocks && seg.BlockSpec.Mode !== 'Frozen') {
                    const frozen = await docEngine.FreezeBlock(seg.BlockSpec, contextUser, true, provider);
                    if (frozen.Success && frozen.UpdatedSpec) {
                        rebuiltParts.push(docEngine.SerializeBlockToMarkdownDirective(frozen.UpdatedSpec));
                        continue;
                    }
                }
            }
            rebuiltParts.push(seg.RawText);
        }

        const updatedContent = freezeBlocks ? rebuiltParts.join('\n') : rawContent;
        const snapshot = BuildArtifactPreviewSnapshot(updatedContent, driverClass, title);
        return {
            UpdatedContent: updatedContent,
            Digest: {
                DigestHash: hashStringFNV1a(JSON.stringify({ updatedContent, highlightLines })),
                PreviewSnapshot: snapshot,
                HighlightLines: highlightLines,
            },
        };
    }

    private summarizeDeckDigest(
        slides: Array<{ SlideID: string; Title: string; Regions: Array<{ RegionID: string; MarkdownContent: string }> }>,
        liveResults: Record<string, DocumentBlockExecutionResult>,
    ): string[] {
        const lines: string[] = [];
        for (const s of slides) {
            lines.push(`Slide[${s.Title}]: ${s.Regions.map((r) => r.MarkdownContent.slice(0, 80)).join(' | ')}`);
        }
        for (const [blockId, res] of Object.entries(liveResults)) {
            lines.push(`Block[${blockId}]: rows=${res.TotalRowCount}, top=${JSON.stringify(res.Rows[0] ?? {})}`);
        }
        return lines;
    }

    private extractPreviousHighlightLines(prevConfig: ArtifactVersionConfiguration): string[] {
        const stored = prevConfig['livingReportHighlightLines'];
        if (Array.isArray(stored)) {
            return stored.filter((v): v is string => typeof v === 'string');
        }
        const snap = prevConfig.previewSnapshot;
        if (snap && snap.Kind === 'doc') {
            return [snap.Heading, snap.Excerpt].filter(Boolean);
        }
        return [];
    }

    private computeDiffSummary(
        artifactName: string,
        prevVersionNumber: number,
        nextVersionNumber: number,
        prevLines: string[],
        nextLines: string[],
    ): string {
        const prevSet = new Set(prevLines);
        const added = nextLines.filter((l) => !prevSet.has(l));
        const nextSet = new Set(nextLines);
        const removed = prevLines.filter((l) => !nextSet.has(l));

        if (added.length === 0 && removed.length === 0) {
            return `Saved '${artifactName}' v${nextVersionNumber} (from v${prevVersionNumber}).`;
        }
        const highlights = added.slice(0, 3).map((l) => `- ${l}`).join('\n');
        return `Updated '${artifactName}' from v${prevVersionNumber} to v${nextVersionNumber} (${added.length} added/changed, ${removed.length} removed)${highlights ? `:\n${highlights}` : '.'}`;
    }

    private async resolveDriverClass(typeId: string | null | undefined, provider: IMetadataProvider): Promise<string> {
        if (!typeId) return '';
        const rv = RunView.FromMetadataProvider(provider);
        const safeId = EscapeSQLString(typeId);
        const res = await rv.RunView<{ DriverClass: string | null }>(
            {
                EntityName: 'MJ: Artifact Types',
                ExtraFilter: `ID='${safeId}'`,
                Fields: ['DriverClass'],
                MaxRows: 1,
                ResultType: 'simple',
            },
        );
        return res.Success && res.Results?.[0]?.DriverClass ? res.Results[0].DriverClass : '';
    }

    private async postSummaryToConversation(
        md: IMetadataProvider | Metadata,
        contextUser: UserInfo,
        conversationId: string,
        artifactName: string,
        versionId: string,
        versionNumber: number,
        diffSummary: string,
    ): Promise<string | null> {
        const detail = await md.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            contextUser,
        );
        detail.NewRecord();
        detail.ConversationID = conversationId;
        detail.Role = 'AI';
        detail.HiddenToUser = false;
        detail.Message = `### Scheduled Living Report Update\n\n**${artifactName}** refreshed to **v${versionNumber}**.\n\n${diffSummary}`;
        if (!(await detail.Save())) {
            return null;
        }

        const link = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts',
            contextUser,
        );
        link.NewRecord();
        link.ConversationDetailID = detail.ID;
        link.ArtifactVersionID = versionId;
        link.Direction = 'Output';
        await link.Save();
        return detail.ID;
    }

    private getStringParam(params: RunActionParams, name: string): string {
        const paramsList = params.Params ?? [];
        const match = paramsList.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type !== 'Output');
        return match?.Value != null ? String(match.Value).trim() : '';
    }

    private getBooleanParam(params: RunActionParams, name: string, defaultVal: boolean): boolean {
        const paramsList = params.Params ?? [];
        const match = paramsList.find((p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type !== 'Output');
        if (match?.Value == null) return defaultVal;
        if (typeof match.Value === 'boolean') return match.Value;
        const normalized = String(match.Value).trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
        return defaultVal;
    }

    private setOutputParam(params: RunActionParams, name: string, value: string | number | boolean | null): void {
        if (!params.Params) {
            params.Params = [];
        }
        const paramsList = params.Params;
        const existing = paramsList.find((p) => p.Name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
            const existingType = existing.Type?.trim().toLowerCase();
            existing.Type = existingType === 'input' || existingType === 'both' ? 'Both' : 'Output';
        } else {
            paramsList.push({
                Name: name,
                Type: 'Output',
                Value: value,
            });
        }
    }
}

function hashStringFNV1a(input: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 ^= ch & 0xff;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (ch >>> 8) & 0xff;
        h2 = Math.imul(h2, 0x01000193);
    }
    return `lr-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
