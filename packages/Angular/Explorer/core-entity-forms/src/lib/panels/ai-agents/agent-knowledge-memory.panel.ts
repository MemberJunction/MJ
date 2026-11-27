import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { GroupByUUID, RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { SearchScopeChildGridColumn } from '@memberjunction/ng-search';
import { SharedService } from '@memberjunction/ng-shared';
import { AGENT_SECTION_KEYS } from './agent-form-helpers';

interface ScopePermissionAuditGroup {
    ScopeID: string;
    ScopeName: string;
    Permissions: Array<{
        Principal: string;
        PrincipalType: 'User' | 'Role';
        Level: string;
    }>;
}

interface AgentNotePreviewRow {
    ID: string;
    Type: string | null;
    Note: string | null;
    __mj_CreatedAt: Date | string;
}

/**
 * Knowledge & Memory panel (`BaseFormPanel` — `after-fields`, `sortKey: 160`, `inclusion: 'Primary'`).
 *
 * Claims `MJ: AI Agent Search Scopes` and presents:
 * - Scoped Search Access radio cards (`All` / `Assigned` / `None`)
 * - `<mj-search-scope-child-grid>` for scope assignments
 * - Effective Scope Permissions audit table
 * - Recent Memory Notes summary (`AllowMemoryWrite`, quick links to `MJ: AI Agent Notes`)
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:knowledge-memory',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 160,
        contributionKey: AGENT_SECTION_KEYS.Knowledge,
        sectionKey: AGENT_SECTION_KEYS.Knowledge,
        relatedEntity: 'MJ: AI Agent Search Scopes',
        relatedJoinField: 'AgentID',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-knowledge-memory-panel',
    templateUrl: './agent-knowledge-memory.panel.html',
    styleUrls: ['./agent-knowledge-memory.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentKnowledgeMemoryPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    public readonly SectionKey = AGENT_SECTION_KEYS.Knowledge;

    public readonly SearchScopeColumns: SearchScopeChildGridColumn[] = [
        { Field: 'SearchScopeID', Label: 'Scope', Type: 'lookup', LookupEntityName: 'MJ: Search Scopes', LookupFilter: "Status='Active'", Width: '200px' },
        {
            Field: 'Phase',
            Label: 'Phase',
            Type: 'select',
            Options: [
                { Label: 'Pre-Execution (injected before LLM)', Value: 'PreExecution' },
                { Label: 'Agent-Invoked (tool-callable)', Value: 'AgentInvoked' },
                { Label: 'Both', Value: 'Both' },
            ],
            Width: '220px',
        },
        { Field: 'Priority', Label: 'Priority', Type: 'number', Placeholder: 'e.g. 10', Width: '90px' },
        { Field: 'MaxResults', Label: 'Max Results', Type: 'number', Placeholder: '10', Width: '110px' },
        { Field: 'MinScore', Label: 'Min Score', Type: 'number', Placeholder: '0.35', Width: '110px' },
        { Field: 'QueryTemplateID', Label: 'Query Template', Type: 'lookup', LookupEntityName: 'Templates', Width: '180px' },
        { Field: 'FusionWeightsOverride', Label: 'Fusion Weights Override', Type: 'code', Placeholder: '{ "vector": 2.0, "fulltext": 1.0 }' },
        { Field: 'IsDefault', Label: 'Default', Type: 'checkbox', Width: '80px' },
    ];

    public LoadingPermissions = false;
    public PermissionSummary: ScopePermissionAuditGroup[] = [];
    public RecentNotes: AgentNotePreviewRow[] = [];

    public async ngOnInit(): Promise<void> {
        await Promise.all([this.LoadPermissionSummary(), this.loadRecentNotes()]);
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void Promise.all([this.LoadPermissionSummary(), this.loadRecentNotes()]);
    }

    public SetSearchScopeAccess(mode: MJAIAgentEntity['SearchScopeAccess']): void {
        if (!this.EditMode || !this.Record) return;
        this.Record.SearchScopeAccess = mode;
        this.cdr.markForCheck();
    }

    public OpenNote(id: string): void {
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Notes', CompositeKey.FromID(id));
    }

    public NoteSnippet(note: AgentNotePreviewRow): string {
        const text = note.Note ?? '';
        return text.length > 130 ? `${text.substring(0, 130)}...` : text;
    }

    public async LoadPermissionSummary(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) {
            this.PermissionSummary = [];
            return;
        }
        this.LoadingPermissions = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const assigned = await rv.RunView<{ SearchScopeID: string; SearchScope?: string }>({
                EntityName: 'MJ: AI Agent Search Scopes',
                ExtraFilter: `AgentID='${agentId}'`,
                Fields: ['SearchScopeID', 'SearchScope'],
                ResultType: 'simple',
            });
            if (!assigned.Success || !assigned.Results?.length) {
                this.PermissionSummary = [];
                return;
            }
            const scopeIds = assigned.Results.map((r) => r.SearchScopeID);
            const scopeNames = new Map<string, string>(
                assigned.Results.map((r) => [r.SearchScopeID, r.SearchScope ?? r.SearchScopeID]),
            );
            const idList = scopeIds.map((id) => `'${id}'`).join(',');
            const perms = await rv.RunView<{
                SearchScopeID: string;
                UserID: string | null;
                RoleID: string | null;
                User?: string;
                Role?: string;
                PermissionLevel: string;
            }>({
                EntityName: 'MJ: Search Scope Permissions',
                ExtraFilter: `SearchScopeID IN (${idList})`,
                Fields: ['SearchScopeID', 'UserID', 'RoleID', 'User', 'Role', 'PermissionLevel'],
                ResultType: 'simple',
            });
            const rows = perms.Success ? (perms.Results ?? []) : [];
            const permsByScope = GroupByUUID(rows, (r) => r.SearchScopeID);
            this.PermissionSummary = scopeIds.map((scopeId) => ({
                ScopeID: scopeId,
                ScopeName: scopeNames.get(scopeId) ?? scopeId,
                Permissions: (permsByScope.Get(scopeId) ?? []).map((r) => ({
                    Principal: r.UserID ? (r.User ?? 'Unknown user') : (r.Role ?? 'Unknown role'),
                    PrincipalType: r.UserID ? 'User' : 'Role',
                    Level: r.PermissionLevel,
                })),
            }));
        } catch (err) {
            console.error('Error loading search scope permission summary:', err);
        } finally {
            this.LoadingPermissions = false;
            this.cdr.markForCheck();
        }
    }

    private async loadRecentNotes(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const res = await rv.RunView<AgentNotePreviewRow>({
                EntityName: 'MJ: AI Agent Notes',
                Fields: ['ID', 'Type', 'Note', '__mj_CreatedAt'],
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 5,
                ResultType: 'simple',
            });
            this.RecentNotes = res.Success ? (res.Results ?? []) : [];
            this.cdr.markForCheck();
        } catch {
            // Non-blocking
        }
    }
}

export function LoadAgentKnowledgeMemoryPanel(): void {
    /* no-op marker */
}
