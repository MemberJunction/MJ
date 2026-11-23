import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentPersonaEntity,
    MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride,
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAIPersonaEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    BuildPolicyDraftFromEntity,
    ChiefOfStaffPage,
    EvaluateInstructionsOverrideSize,
    INSTRUCTIONS_OVERRIDE_WARNING_THRESHOLD,
    InstructionsOverrideSizeReport,
    IsApprovalRequest,
    IsSpentOneShotRoutine,
    PolicyCalendarChannelModeValue,
    PolicyCoordinationModeValue,
    PolicyDataAccessModeValue,
    PolicyEmailChannelModeValue,
    PolicyMessagingChannelModeValue,
    PolicyPhoneChannelModeValue,
    PolicyStatusValue,
    SelectableGovernanceAgent,
} from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage } from './chief-of-staff-page-base';

export type AgentDetailSubTab = 'activity' | 'persona' | 'governance' | 'sharing';

export interface PolicySizeAuditRow {
    PolicyID: string;
    UserName: string;
    Status: PolicyStatusValue;
    Length: number;
    ExceedsThreshold: boolean;
}

export interface ShareRoleOption {
    ID: string;
    Name: string;
}

/**
 * The My Agents application's "Agents" Master-Detail workspace (`ChiefOfStaffGovernance` driver
 * class retained so saved tabs and deep links continue resolving cleanly).
 *
 * Left rail: searchable roster partitioned into `My Agents` (user-owned derived instances) and
 * `Shared` (shared derived instances + runnable platform catalog agents).
 *
 * Right pane: agent hero card (`Make Default Chat Agent`, `Make Primary`, `Personalize` /
 * `+ Create My Own Instance`) + 4 accessible sub-tabs:
 * 1. Approvals & Wakes (scoped to SelectedAgentID)
 * 2. Persona & Instructions (inline editor for owned instances, read-only summary for Shared)
 * 3. Governance Policy (`MJ: AI Agent User Policies` editor with ancestor ceiling banner)
 * 4. Sharing (2x2 RBAC visibility + `MJ: AI Agent Permissions` role grant management)
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffGovernance')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-governance',
    templateUrl: './chief-of-staff-governance.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffGovernanceComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'governance';

    // ── Master-Detail Roster & Sub-Tab State ─────────────────────────────────────────────
    public RosterSearchText = '';
    public ActiveSubTab: AgentDetailSubTab = 'activity';
    public ShowFiredRoutines = false;

    // ── Hero quick actions state ─────────────────────────────────────────────────────────
    public IsUpdatingPrimary = false;

    // ── Inline Persona & Instructions state (owned derived instances) ────────────────────
    public ActivePersonas: MJAIPersonaEntity[] = [];
    public DraftPersonaId: string | null = null;
    public DraftTone = '';
    public DraftSpeakingStyle = '';
    public DraftAdditionalInstructions = '';
    public PersonaDirty = false;
    public IsSavingPersona = false;
    public ConfirmArchiveOpen = false;
    public IsArchivingAgent = false;

    // ── Governance Policy state ──────────────────────────────────────────────────────────
    public IsSavingPolicy = false;
    public PolicyDirty = false;
    public readonly InstructionsWarningThreshold = INSTRUCTIONS_OVERRIDE_WARNING_THRESHOLD;
    public AdminPolicySizeRows: PolicySizeAuditRow[] = [];
    public IsLoadingPolicySizeAudit = false;

    // ── Sharing (`MJ: AI Agent Permissions`) state ───────────────────────────────────────
    public AgentPermissions: MJAIAgentPermissionEntity[] = [];
    public IsLoadingPermissions = false;
    public IsSavingPermission = false;
    public BusyPermissionId: string | null = null;
    public SelectedShareRoleId = '';
    public ShareGrantCanView = true;
    public ShareGrantCanRun = true;

    public readonly StatusOptions: readonly PolicyStatusValue[] = ['Active', 'Paused', 'Disabled'];
    public readonly CoordinationModeOptions: readonly {
        Value: PolicyCoordinationModeValue;
        Label: string;
        Description: string;
    }[] = [
        {
            Value: 'Observer',
            Label: 'Observer',
            Description: 'Monitors signals and prepares briefings; never initiates changes.',
        },
        {
            Value: 'Coordinator',
            Label: 'Coordinator',
            Description: 'Tracks priorities, drafts communications, and requests approval before high-impact actions.',
        },
        {
            Value: 'Autonomous',
            Label: 'Autonomous',
            Description: 'Executes within policy guardrails and auto-approval thresholds.',
        },
    ];
    public readonly DataAccessModeOptions: readonly {
        Value: PolicyDataAccessModeValue;
        Label: string;
    }[] = [
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'AllowListOnly', Label: 'Allow-List Only' },
        { Value: 'UserCeiling', Label: 'User Ceiling (Full Delegated Access)' },
    ];
    public get EmailChannelOptions(): readonly {
        Value: PolicyEmailChannelModeValue;
        Label: string;
    }[] {
        return [
            { Value: 'Disabled', Label: 'Disabled' },
            { Value: 'ReadOnly', Label: 'Read Only' },
            { Value: 'DraftOnly', Label: 'Draft Only' },
            { Value: 'SendAsAgent', Label: `Send as ${this.SelectedAgentName}` },
            { Value: 'SendAsUser', Label: 'Send on Behalf of User' },
        ];
    }
    public readonly CalendarChannelOptions: readonly {
        Value: PolicyCalendarChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'ProposeWithApproval', Label: 'Propose with Approval' },
        { Value: 'Autonomous', Label: 'Autonomous Scheduling' },
    ];
    public readonly PhoneChannelOptions: readonly {
        Value: PolicyPhoneChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'InboundOnly', Label: 'Inbound Only' },
        { Value: 'OutboundWithApproval', Label: 'Outbound with Approval' },
        { Value: 'OutboundAutonomous', Label: 'Outbound Autonomous' },
    ];
    public readonly MessagingChannelOptions: readonly {
        Value: PolicyMessagingChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'Enabled', Label: 'Enabled' },
    ];

    // ── Roster Filtering ─────────────────────────────────────────────────────────────────

    public get FilteredMyOwnedAgents(): SelectableGovernanceAgent[] {
        return this.filterRosterList(this.MyOwnedAgents);
    }

    public get FilteredSharedAgents(): SelectableGovernanceAgent[] {
        return this.filterRosterList(this.SharedCatalogAgents);
    }

    private filterRosterList(list: SelectableGovernanceAgent[]): SelectableGovernanceAgent[] {
        const q = this.RosterSearchText.trim().toLowerCase();
        if (!q) {
            return list;
        }
        return list.filter(
            (a) =>
                a.Name.toLowerCase().includes(q) ||
                (a.BaseAgentName ?? '').toLowerCase().includes(q) ||
                (a.Description ?? '').toLowerCase().includes(q),
        );
    }

    public OnRosterSearchInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.RosterSearchText = event.target.value;
            this.cdr.markForCheck();
        }
    }

    public IsRosterAgentSelected(agentId: string): boolean {
        return Boolean(this.SelectedAgentID && UUIDsEqual(this.SelectedAgentID, agentId));
    }

    public SelectRosterAgent(agent: SelectableGovernanceAgent): void {
        this.OnSelectedAgentChange(agent.ID);
    }

    public SetActiveSubTab(tab: AgentDetailSubTab): void {
        if (this.ActiveSubTab === tab) {
            return;
        }
        this.ActiveSubTab = tab;
        if (tab === 'sharing') {
            void this.LoadAgentPermissions();
        }
        this.cdr.markForCheck();
    }

    // ── Selected Agent Identity & Capabilities ───────────────────────────────────────────

    public get IsSelectedAgentOwnedDerived(): boolean {
        return this.SelectedDerivedAgentEntity !== null;
    }

    public get CanDeriveSelectedSharedAgent(): boolean {
        const entity = this.SelectedAgentEntity;
        if (!entity || this.IsSelectedAgentOwnedDerived) {
            return false;
        }
        return entity.InstantiationMode === 'Optional' || entity.InstantiationMode === 'Required';
    }

    public get CanSetSelectedAsDefaultChatAgent(): boolean {
        const entity = this.SelectedAgentEntity;
        if (!this.SelectedAgentID || !entity) {
            return false;
        }
        if (entity.Status !== 'Active' || entity.InstantiationMode === 'Required') {
            return false;
        }
        return !this.IsDefaultChatAgent(this.SelectedAgentID);
    }

    public get SelectedAgentKindLabel(): string {
        const baseName = this.GetAgentBaseLineageById(this.SelectedAgentID);
        if (this.IsSelectedAgentOwnedDerived) {
            return baseName ? `My Agent · Inherits ${baseName}` : 'My Agent · Personal Instance';
        }
        if (baseName) {
            return `Shared · Inherits ${baseName}`;
        }
        return 'Shared · Platform Agent';
    }

    /** Root-to-leaf inheritance chain labels (e.g. "Chief of Staff -> Pepper") for derived agents. */
    public get SelectedAgentInheritanceChainLabel(): string | null {
        const entity = this.SelectedAgentEntity;
        if (!entity?.BaseAgentID) {
            return null;
        }
        try {
            const chain = this.aiEngine.GetAgentInheritanceChain(entity.ID);
            if (chain.length > 1) {
                return chain.map((a) => a.Name).join(' → ');
            }
        } catch {
            // Fall back to direct base name
        }
        const baseName = this.GetAgentBaseLineageById(entity.ID);
        return baseName ? `${baseName} → ${entity.Name}` : null;
    }

    public get SelectedAgentResolvedPersonaName(): string {
        if (!this.DraftPersonaId) {
            return 'Inherited / Default Voice';
        }
        const match = this.ActivePersonas.find((p) => UUIDsEqual(p.ID, this.DraftPersonaId));
        return match?.Name ?? 'Custom Voice';
    }

    public get SelectedAgentVisibilitySummary(): {
        Variant: 'private' | 'shared' | 'catalog';
        Title: string;
        Description: string;
    } {
        const entity = this.SelectedAgentEntity;
        if (!entity?.BaseAgentID) {
            return {
                Variant: 'catalog',
                Title: 'Shared Platform Catalog',
                Description:
                    this.AgentPermissions.length > 0
                        ? `Root platform agent scoped by ${this.AgentPermissions.length} explicit permission rule(s).`
                        : 'Root platform catalog agent available to authenticated users across your workspace.',
            };
        }
        if (this.AgentPermissions.length === 0) {
            return {
                Variant: 'private',
                Title: 'Private — Only You',
                Description:
                    'Derived instances with zero permission rows are private to their owner. Grant a role below to share this instance into teammates’ Shared section.',
            };
        }
        return {
            Variant: 'shared',
            Title: `Shared (${this.AgentPermissions.length} ${this.AgentPermissions.length === 1 ? 'grant' : 'grants'})`,
            Description:
                'Users matching the role or user grants below can see or run this derived instance (subject to ancestor CanRun permissions).',
        };
    }

    public get AvailableRolesToShare(): ShareRoleOption[] {
        const roles = this.ProviderToUse?.Roles ?? [];
        const existingRoleIds = new Set(
            this.AgentPermissions.map((p) => p.RoleID?.toLowerCase()).filter((id): id is string => Boolean(id)),
        );
        return roles
            .filter((r) => Boolean(r.ID && r.Name) && !existingRoleIds.has(r.ID.toLowerCase()))
            .map((r) => ({ ID: r.ID, Name: r.Name }))
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    public get RecentResolvedRequests(): MJAIAgentRequestEntity[] {
        return this.Requests.filter((r) => r.Status !== 'Requested' && IsApprovalRequest(r)).slice(0, 8);
    }

    public get FiredRoutineCount(): number {
        return this.Routines.filter((r) => IsSpentOneShotRoutine(r)).length;
    }

    public get VisibleAgentRoutines(): MJUserRoutineEntity[] {
        return this.ShowFiredRoutines ? this.SortedRoutines : this.UpcomingRoutines;
    }

    public ToggleShowFiredRoutines(): void {
        this.ShowFiredRoutines = !this.ShowFiredRoutines;
        this.cdr.markForCheck();
    }

    // ── Hero Actions ─────────────────────────────────────────────────────────────────────

    public async SetSelectedAsDefaultChatAgent(): Promise<void> {
        if (!this.SelectedAgentID) {
            return;
        }
        await this.SetDefaultChatAgent(this.SelectedAgentID);
    }

    public async ResetDefaultChatAgentToSage(): Promise<void> {
        await this.SetDefaultChatAgent(null);
    }

    public async MakeSelectedAgentPrimary(): Promise<void> {
        const derived = this.SelectedDerivedAgentEntity;
        const user = this.ProviderToUse?.CurrentUser;
        if (!derived || !user || derived.IsPrimaryInstance || this.IsUpdatingPrimary) {
            return;
        }
        this.IsUpdatingPrimary = true;
        this.cdr.markForCheck();
        try {
            const entity = await this.ProviderToUse.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', user);
            const loaded = await entity.InnerLoad(CompositeKey.FromID(derived.ID));
            if (!loaded) {
                throw new Error(`Could not load "${derived.Name}" to promote as primary.`);
            }
            entity.IsPrimaryInstance = true;
            const saved = await entity.Save();
            if (!saved) {
                throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to update primary instance.');
            }
            this.showBanner('success', `"${derived.Name}" is now your primary instance.`);
            await this.LoadChiefOfStaffData();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to set primary instance: ${msg}`);
        } finally {
            this.IsUpdatingPrimary = false;
            this.cdr.markForCheck();
        }
    }

    // ── Inline Persona & Instructions Actions ────────────────────────────────────────────

    public MarkPersonaDirty(): void {
        this.PersonaDirty = true;
        this.cdr.markForCheck();
    }

    public OnPersonaToneInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftTone = event.target.value;
            this.PersonaDirty = true;
            this.cdr.markForCheck();
        }
    }

    public OnPersonaStyleInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftSpeakingStyle = event.target.value;
            this.PersonaDirty = true;
            this.cdr.markForCheck();
        }
    }

    public OnAdditionalInstructionsInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.DraftAdditionalInstructions = event.target.value;
            this.PersonaDirty = true;
            this.cdr.markForCheck();
        }
    }

    public ResetPersonaDraft(): void {
        this.syncPersonaDraftFromCache();
        this.PersonaDirty = false;
        this.cdr.markForCheck();
    }

    public async SavePersonaAndInstructions(): Promise<void> {
        const derived = this.SelectedDerivedAgentEntity;
        const user = this.ProviderToUse?.CurrentUser;
        if (!derived || !user || this.IsSavingPersona) {
            return;
        }
        this.IsSavingPersona = true;
        this.cdr.markForCheck();
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', user);
            const loaded = await entity.InnerLoad(CompositeKey.FromID(derived.ID));
            if (!loaded) {
                throw new Error(`Could not load "${derived.Name}" for editing.`);
            }
            entity.AdditionalInstructions = this.DraftAdditionalInstructions.trim() || null;
            const savedAgent = await entity.Save();
            if (!savedAgent) {
                throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to save standing instructions.');
            }

            const hasStyle = this.DraftTone.trim().length > 0 || this.DraftSpeakingStyle.trim().length > 0;
            const personaId =
                this.DraftPersonaId ?? (hasStyle ? (this.ActivePersonas[0]?.ID ?? null) : null);
            if (personaId) {
                const rv = RunView.FromMetadataProvider(md);
                const existingRes = await rv.RunView<MJAIAgentPersonaEntity>(
                    {
                        EntityName: 'MJ: AI Agent Personas',
                        ExtraFilter: `AgentID='${EscapeSQLString(derived.ID)}' AND IsDefault=1`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                    },
                    user,
                );
                let link: MJAIAgentPersonaEntity;
                if (existingRes.Success && existingRes.Results.length > 0) {
                    link = existingRes.Results[0];
                } else {
                    link = await md.GetEntityObject<MJAIAgentPersonaEntity>('MJ: AI Agent Personas', user);
                    link.NewRecord();
                    link.AgentID = derived.ID;
                    link.IsDefault = true;
                    link.IsAllowed = true;
                    link.Sequence = 10;
                }
                link.PersonaID = personaId;
                const styleObj: MJAIAgentPersonaEntity_IAIAgentPersonaStyleOverride = {
                    ...(link.StyleOverrideObject ?? {}),
                };
                if (this.DraftTone.trim()) {
                    styleObj.Tone = this.DraftTone.trim();
                } else {
                    delete styleObj.Tone;
                }
                if (this.DraftSpeakingStyle.trim()) {
                    styleObj.SpeakingStyle = this.DraftSpeakingStyle.trim();
                } else {
                    delete styleObj.SpeakingStyle;
                }
                link.StyleOverrideObject =
                    styleObj.Tone || styleObj.SpeakingStyle || styleObj.Visual ? styleObj : null;
                const savedPersona = await link.Save();
                if (!savedPersona) {
                    throw new Error(link.LatestResult?.CompleteMessage || 'Failed to save persona configuration.');
                }
            }

            this.PersonaDirty = false;
            this.showBanner('success', `Saved persona and standing instructions for "${derived.Name}".`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to save persona settings: ${msg}`);
        } finally {
            this.IsSavingPersona = false;
            this.cdr.markForCheck();
        }
    }

    public RequestArchiveSelectedAgent(): void {
        this.ConfirmArchiveOpen = true;
        this.cdr.markForCheck();
    }

    public CancelArchiveSelectedAgent(): void {
        this.ConfirmArchiveOpen = false;
        this.cdr.markForCheck();
    }

    public async ConfirmArchiveSelectedAgent(): Promise<void> {
        const derived = this.SelectedDerivedAgentEntity;
        const user = this.ProviderToUse?.CurrentUser;
        if (!derived || !user || this.IsArchivingAgent) {
            return;
        }
        this.IsArchivingAgent = true;
        this.cdr.markForCheck();
        try {
            const entity = await this.ProviderToUse.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', user);
            const loaded = await entity.InnerLoad(CompositeKey.FromID(derived.ID));
            if (!loaded) {
                throw new Error(`Could not load "${derived.Name}" to archive.`);
            }
            entity.Status = 'Disabled';
            entity.IsPrimaryInstance = false;
            const saved = await entity.Save();
            if (!saved) {
                throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to archive agent instance.');
            }
            this.ConfirmArchiveOpen = false;
            this.PersonaDirty = false;
            await this.OnInstanceArchived();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to archive agent: ${msg}`);
        } finally {
            this.IsArchivingAgent = false;
            this.cdr.markForCheck();
        }
    }

    // ── Sharing (`MJ: AI Agent Permissions`) Actions ─────────────────────────────────────

    public async LoadAgentPermissions(): Promise<void> {
        const targetAgentId = this.SelectedAgentID;
        if (!targetAgentId || this.IsLoadingPermissions) {
            return;
        }
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        if (!rv || typeof rv.RunView !== 'function') {
            return;
        }
        this.IsLoadingPermissions = true;
        this.cdr.markForCheck();
        try {
            const res = await rv.RunView<MJAIAgentPermissionEntity>({
                EntityName: 'MJ: AI Agent Permissions',
                ExtraFilter: `AgentID='${EscapeSQLString(targetAgentId)}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 100,
                ResultType: 'entity_object',
            });
            this.AgentPermissions = res.Success ? res.Results : [];
        } catch {
            this.AgentPermissions = [];
        } finally {
            this.IsLoadingPermissions = false;
            this.cdr.markForCheck();
        }
    }

    public async AddRoleSharePermission(): Promise<void> {
        const derived = this.SelectedDerivedAgentEntity;
        const user = this.ProviderToUse?.CurrentUser;
        if (!derived || !user || !this.SelectedShareRoleId || this.IsSavingPermission) {
            return;
        }
        this.IsSavingPermission = true;
        this.cdr.markForCheck();
        try {
            const perm = await this.ProviderToUse.GetEntityObject<MJAIAgentPermissionEntity>(
                'MJ: AI Agent Permissions',
                user,
            );
            perm.NewRecord();
            perm.AgentID = derived.ID;
            perm.RoleID = this.SelectedShareRoleId;
            perm.UserID = null;
            perm.CanView = this.ShareGrantCanView || this.ShareGrantCanRun;
            perm.CanRun = this.ShareGrantCanRun;
            perm.CanEdit = false;
            perm.CanDelete = false;
            const saved = await perm.Save();
            if (!saved) {
                throw new Error(perm.LatestResult?.CompleteMessage || 'Failed to add sharing permission.');
            }
            this.SelectedShareRoleId = '';
            this.ShareGrantCanView = true;
            this.ShareGrantCanRun = true;
            await this.LoadAgentPermissions();
            this.showBanner('success', `Shared "${derived.Name}" with the selected role.`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to add permission: ${msg}`);
        } finally {
            this.IsSavingPermission = false;
            this.cdr.markForCheck();
        }
    }

    public async RemoveSharePermission(permission: MJAIAgentPermissionEntity): Promise<void> {
        if (!this.IsSelectedAgentOwnedDerived || this.BusyPermissionId) {
            return;
        }
        this.BusyPermissionId = permission.ID;
        this.cdr.markForCheck();
        try {
            const deleted = await permission.Delete();
            if (!deleted) {
                throw new Error(permission.LatestResult?.CompleteMessage || 'Failed to remove sharing permission.');
            }
            this.AgentPermissions = this.AgentPermissions.filter((p) => !UUIDsEqual(p.ID, permission.ID));
            this.showBanner('success', 'Removed sharing permission.');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to remove permission: ${msg}`);
        } finally {
            this.BusyPermissionId = null;
            this.cdr.markForCheck();
        }
    }

    // ── Governance Policy Editor ─────────────────────────────────────────────────────────

    public get DraftInstructionsSize(): InstructionsOverrideSizeReport {
        return EvaluateInstructionsOverrideSize(
            this.DraftPolicy.InstructionsOverride,
            this.InstructionsWarningThreshold,
        );
    }

    public get IsAdminUser(): boolean {
        const user = this.ProviderToUse?.CurrentUser;
        if (!user) {
            return false;
        }
        if (user.Type?.trim().toLowerCase() === 'owner') {
            return true;
        }
        const roles = user.UserRoles ?? [];
        return roles.some((ur) => {
            const name = ur.Role?.trim().toLowerCase() ?? '';
            return (
                name === 'administrator' ||
                name === 'system administrator' ||
                name === 'admin' ||
                name === 'administration'
            );
        });
    }

    public get OversizedPolicyCount(): number {
        return this.AdminPolicySizeRows.filter((r) => r.ExceedsThreshold).length;
    }

    /** A reload replaces the draft with the saved policy and refreshes persona/sharing caches. */
    protected override OnDataLoaded(): void {
        this.PolicyDirty = false;
        this.PersonaDirty = false;
        this.ConfirmArchiveOpen = false;
        this.syncPersonaDraftFromCache();
        void this.LoadAgentPermissions();
        if (this.IsAdminUser) {
            void this.LoadAdminPolicySizeAudit();
        }
    }

    private syncPersonaDraftFromCache(): void {
        try {
            const engine = this.aiEngine;
            this.ActivePersonas = [...(engine.Personas ?? [])]
                .filter((p) => p.IsActive !== false)
                .sort((a, b) => a.Name.localeCompare(b.Name));
            const derived = this.SelectedDerivedAgentEntity;
            if (!derived) {
                this.DraftPersonaId = null;
                this.DraftTone = '';
                this.DraftSpeakingStyle = '';
                this.DraftAdditionalInstructions = '';
                return;
            }
            const resolved = engine.ResolveAgentPersona(derived.ID);
            this.DraftPersonaId = resolved?.Persona?.ID ?? null;
            this.DraftTone = resolved?.Tone ?? '';
            this.DraftSpeakingStyle = resolved?.SpeakingStyle ?? '';
            this.DraftAdditionalInstructions = derived.AdditionalInstructions ?? '';
        } catch {
            // Safe no-op in minimal unit test harnesses
        }
    }

    public async LoadAdminPolicySizeAudit(): Promise<void> {
        const targetAgentId = this.SelectedAgentID ?? this.chiefOfStaffAgentId;
        if (!targetAgentId || !this.IsAdminUser || this.IsLoadingPolicySizeAudit) {
            return;
        }
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        if (!rv || typeof rv.RunView !== 'function') {
            return;
        }
        this.IsLoadingPolicySizeAudit = true;
        this.cdr.markForCheck();
        try {
            const res = await rv.RunView<MJAIAgentUserPolicyEntity>({
                EntityName: 'MJ: AI Agent User Policies',
                ExtraFilter: `AgentID='${EscapeSQLString(targetAgentId)}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: 200,
                ResultType: 'entity_object',
            });
            if (res.Success) {
                this.AdminPolicySizeRows = res.Results.map((p) => {
                    const report = EvaluateInstructionsOverrideSize(
                        p.InstructionsOverride,
                        this.InstructionsWarningThreshold,
                    );
                    return {
                        PolicyID: p.ID,
                        UserName: p.User || p.UserID,
                        Status: p.Status,
                        Length: report.Length,
                        ExceedsThreshold: report.ExceedsThreshold,
                    };
                }).sort((a, b) => b.Length - a.Length);
            }
        } finally {
            this.IsLoadingPolicySizeAudit = false;
            this.cdr.markForCheck();
        }
    }

    public OpenAuditPolicyRecord(policyId: string): void {
        this.navigationService.OpenEntityRecord(
            'MJ: AI Agent User Policies',
            CompositeKey.FromID(policyId),
        );
    }

    protected override HasUnsavedPageEdits(): boolean {
        return this.PolicyDirty || this.PersonaDirty;
    }

    protected override IsPageSaveInFlight(): boolean {
        return this.IsSavingPolicy || this.IsSavingPersona;
    }

    protected override ResetUnsavedPageEdits(): void {
        this.PolicyDirty = false;
        this.PersonaDirty = false;
    }

    public OpenPolicyEntityRecord(): void {
        if (this.PolicyEntity) {
            this.navigationService.OpenEntityRecord(
                'MJ: AI Agent User Policies',
                CompositeKey.FromID(this.PolicyEntity.ID),
            );
        }
    }

    public MarkPolicyDirty(): void {
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public SetCoordinationMode(mode: PolicyCoordinationModeValue): void {
        this.DraftPolicy.CoordinationMode = mode;
        this.MarkPolicyDirty();
    }

    public SetPolicyStatus(status: PolicyStatusValue): void {
        this.DraftPolicy.Status = status;
        this.MarkPolicyDirty();
    }

    public ToggleApprovalGuardrail(
        field:
            | 'AllowInterAgentCoordination'
            | 'RequireApprovalForExternalComms'
            | 'RequireApprovalForFinancials'
            | 'RequireApprovalForDestructiveActions',
    ): void {
        this.DraftPolicy[field] = !this.DraftPolicy[field];
        this.MarkPolicyDirty();
    }

    public OnDisplayNameInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftPolicy.DisplayNameOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInputEvent(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.OnThresholdInput(event.target.value);
        }
    }

    public OnInstructionsOverrideInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.DraftPolicy.InstructionsOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInput(rawValue: string): void {
        const trimmed = rawValue.trim();
        if (!trimmed) {
            this.DraftPolicy.AutoApproveAmountThreshold = null;
        } else {
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && parsed >= 0) {
                this.DraftPolicy.AutoApproveAmountThreshold = parsed;
            }
        }
        this.MarkPolicyDirty();
    }

    public ResetDraftPolicy(): void {
        this.DraftPolicy = BuildPolicyDraftFromEntity(this.PolicyEntity, this.SelectedAgentName);
        this.PolicyDirty = false;
        this.cdr.markForCheck();
    }

    public async SaveGovernancePolicy(): Promise<void> {
        if (this.IsSavingPolicy) {
            return;
        }
        this.IsSavingPolicy = true;
        this.cdr.markForCheck();

        try {
            const targetAgentId = this.SelectedAgentID ?? this.chiefOfStaffAgentId;
            if (!targetAgentId) {
                throw new Error(`The "${this.SelectedAgentName}" agent id has not been resolved; reload the page.`);
            }
            let entity = this.PolicyEntity;
            if (entity && !UUIDsEqual(entity.AgentID, targetAgentId)) {
                throw new Error(
                    `Loaded policy record belongs to a different agent than "${this.SelectedAgentName}". Reload the page and try again.`,
                );
            }
            if (!entity) {
                entity = await this.ProviderToUse.GetEntityObject<MJAIAgentUserPolicyEntity>(
                    'MJ: AI Agent User Policies',
                    this.ProviderToUse.CurrentUser,
                );
                entity.NewRecord();
                entity.AgentID = targetAgentId;
                const currentUserId = this.ProviderToUse.CurrentUser?.ID;
                if (currentUserId) {
                    entity.UserID = currentUserId;
                }
            }

            entity.DisplayNameOverride =
                this.DraftPolicy.DisplayNameOverride.trim().length > 0
                    ? this.DraftPolicy.DisplayNameOverride.trim()
                    : null;
            entity.Status = this.DraftPolicy.Status;
            entity.OnboardingStatus = this.DraftPolicy.OnboardingStatus;
            entity.CoordinationMode = this.DraftPolicy.CoordinationMode;
            entity.DefaultDataAccessMode = this.DraftPolicy.DefaultDataAccessMode;
            entity.EmailChannelMode = this.DraftPolicy.EmailChannelMode;
            entity.CalendarChannelMode = this.DraftPolicy.CalendarChannelMode;
            entity.PhoneChannelMode = this.DraftPolicy.PhoneChannelMode;
            entity.MessagingChannelMode = this.DraftPolicy.MessagingChannelMode;
            entity.AllowInterAgentCoordination = this.DraftPolicy.AllowInterAgentCoordination;
            entity.RequireApprovalForExternalComms =
                this.DraftPolicy.RequireApprovalForExternalComms;
            entity.RequireApprovalForFinancials = this.DraftPolicy.RequireApprovalForFinancials;
            entity.RequireApprovalForDestructiveActions =
                this.DraftPolicy.RequireApprovalForDestructiveActions;
            entity.AutoApproveAmountThreshold = this.DraftPolicy.AutoApproveAmountThreshold;
            entity.InstructionsOverride =
                this.DraftPolicy.InstructionsOverride.trim().length > 0
                    ? this.DraftPolicy.InstructionsOverride.trim()
                    : null;

            const saved = await entity.Save();
            if (saved) {
                this.PolicyEntity = entity;
                this.DraftPolicy = BuildPolicyDraftFromEntity(entity, this.SelectedAgentName);
                this.PolicyDirty = false;
                this.showBanner('success', `${this.SelectedAgentName} governance policy saved.`);
                this.publishAgentContext();
            } else {
                const errText =
                    entity.LatestResult?.CompleteMessage ?? 'Failed to save governance policy.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to save governance policy: ${msg}`);
        } finally {
            this.IsSavingPolicy = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadChiefOfStaffGovernance(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
