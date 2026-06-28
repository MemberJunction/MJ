/**
 * @fileoverview Archive Configuration Resource Component
 *
 * Dashboard resource wrapper for the "Configuration" tab in the Archiving application.
 * Delegates all rendering to the reusable mj-archive-config-admin component from
 * @memberjunction/ng-archive-manager.
 *
 * Beyond rendering, this wrapper reports a READ-ONLY summary of the archiving
 * configuration to the AI agent (policy/entity counts, load state) and exposes a
 * single read-only refresh tool. The wrapper owns its summary context by querying
 * the archive entities directly — the inner admin component only loads entities
 * for the currently-selected policy, so cross-policy counts live here.
 *
 * 🔒 SAFETY BOUNDARY (READ-ONLY): this surface NEVER exposes policy mutation to
 * the agent. The following are intentionally NOT wired as client tools:
 * ModifyArchivePolicy / create / edit / delete configurations or entities,
 * RunArchiveNow / execute, PurgeArchivedData, and any save path. The agent can
 * read counts and request a context refresh — nothing more. Saves happen only
 * via direct user interaction with the inner admin UI.
 */

import { Component, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ArchiveConfigAdminComponent } from '@memberjunction/ng-archive-manager';
import { AgentToolResult } from '../../shared/agent-tool-validation';
import {
    buildArchiveConfigAgentContext,
    ArchiveConfigAgentContextInput,
    ARCHIVE_NAME_LIST_CAP,
} from '../archive-agent-context';

/** Active policy statuses — anything other than 'Disabled' counts as active. */
const DISABLED_STATUS = 'disabled';

@RegisterClass(BaseResourceComponent, 'ArchiveConfigResource')
@Component({
    standalone: false,
    selector: 'app-archive-config-resource',
    template: `
        <mj-page-layout>
            <mj-page-header
                Title="Archive Configuration"
                Icon="fa-solid fa-sliders"
                Subtitle="Configure entity archiving policies and schedules">
            </mj-page-header>
            <mj-page-body [Flex]="true" [Padding]="false">
                <mj-archive-config-admin></mj-archive-config-admin>
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
})
export class ArchiveConfigResourceComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
    /** Reference to the inner admin component — used to read its public load state. */
    @ViewChild(ArchiveConfigAdminComponent) private configAdmin?: ArchiveConfigAdminComponent;

    /** Wrapper-owned summary counts (queried directly across all policies). */
    private policyCount = 0;
    private activePolicyCount = 0;
    private entitiesUnderArchive = 0;
    /** Bounded policy + archived-entity names for the agent context. */
    private policyNames: string[] = [];
    private archivedEntityNames: string[] = [];

    async ngAfterViewInit(): Promise<void> {
        await this.loadSummaryCounts();
        this.publishAgentContext();
        this.registerAgentClientTools();
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Archive Configuration';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-sliders';
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS (READ-ONLY)
    // ========================================

    /**
     * Publish the current Archive Configuration summary to the AI agent.
     * Read-only — describes policy/entity counts and load state only.
     */
    private publishAgentContext(): void {
        const input: ArchiveConfigAgentContextInput = {
            PolicyCount: this.policyCount,
            ActivePolicyCount: this.activePolicyCount,
            EntitiesUnderArchive: this.entitiesUnderArchive,
            PolicyNames: this.policyNames,
            ArchivedEntityNames: this.archivedEntityNames,
            IsLoading: this.configAdmin?.IsLoading ?? false,
        };
        this.navigationService.SetAgentContext(this, buildArchiveConfigAgentContext(input));
    }

    /**
     * Register the read-only client tools for this surface.
     *
     * 🔒 Only a refresh tool is exposed. No policy create/edit/delete, no archive
     * execution, no purge — those are deliberately absent (see SAFETY BOUNDARY).
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshArchiveConfig',
                Description:
                    'Reload the archive configuration summary (policy and entity counts). Read-only — does not modify any policy.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => this.toolRefreshArchiveConfig(),
            },
        ]);
    }

    /** Re-query the summary counts and re-publish context. Never throws. */
    private async toolRefreshArchiveConfig(): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
        try {
            await this.loadSummaryCounts();
            this.publishAgentContext();
            return {
                Success: true,
                Data: {
                    PolicyCount: this.policyCount,
                    ActivePolicyCount: this.activePolicyCount,
                    EntitiesUnderArchive: this.entitiesUnderArchive,
                    PolicyNames: this.policyNames.slice(0, ARCHIVE_NAME_LIST_CAP),
                    ArchivedEntityNames: this.archivedEntityNames.slice(0, ARCHIVE_NAME_LIST_CAP),
                },
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to refresh archive configuration.';
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Query the archive entities directly to compute cross-policy summary counts.
     * The inner admin component only loads entities for the selected policy, so the
     * wrapper owns these aggregate counts. Batched into a single RunViews call.
     */
    private async loadSummaryCounts(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const [configResult, entityResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Archive Configurations',
                ExtraFilter: '',
                Fields: ['ID', 'Name', 'Status'],
                OrderBy: 'Name',
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Archive Configuration Entities',
                ExtraFilter: '',
                Fields: ['ID', 'Entity'],
                OrderBy: 'Entity',
                ResultType: 'simple',
            },
        ]);

        const configs = configResult.Success ? configResult.Results : [];
        this.policyCount = configs.length;
        this.activePolicyCount = configs.filter(
            (c) => String(c['Status'] ?? '').toLowerCase() !== DISABLED_STATUS,
        ).length;
        this.policyNames = configs
            .map((c) => String(c['Name'] ?? '').trim())
            .filter((n) => !!n);

        const entities = entityResult.Success ? entityResult.Results : [];
        this.entitiesUnderArchive = entities.length;
        // De-duplicate entity names (a single entity can appear under multiple policies).
        this.archivedEntityNames = Array.from(
            new Set(entities.map((e) => String(e['Entity'] ?? '').trim()).filter((n) => !!n)),
        );
    }
}

export function LoadArchiveConfigResource() {
    // Prevents tree-shaking
}
