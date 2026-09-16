import { Component, ViewContainerRef, ViewChild, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { MJActionEntity, MJAIAgentActionEntity, MJAIAgentLearningCycleEntity, MJAIAgentNoteEntity, MJAIAgentPromptEntity, MJAIAgentTypeEntity, MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended, MJAIPromptEntityExtended, MJAIAgentEntityExtended, } from "@memberjunction/ai-core-plus";
import { RegisterClass, MJGlobal , UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseFormComponent, BaseFormSectionComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { CompositeKey, KeyValuePair, Metadata, RunView } from '@memberjunction/core';
import { TreeBranchConfig } from '@memberjunction/ng-trees';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJAIAgentFormComponent } from '../../generated/Entities/MJAIAgent/mjaiagent.form.component';
import { MJDialogService, type TabConfig } from '@memberjunction/ng-ui-components';
import { BuildAgentFormTabs, HasDesignerTab, type AgentFormTabContext } from './agent-form-tabs';
import { SharedService } from '@memberjunction/ng-shared';
import { AIAgentManagementService } from './ai-agent-management.service';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PromptSelectorResult } from './prompt-selector-dialog.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { PromptSelectorDialogComponent } from './prompt-selector-dialog.component';
import { CreateAgentService, CreateAgentResult, type AgentInvocationOpenRequestedEventArgs } from '@memberjunction/ng-agents';
import { SearchScopeChildGridColumn } from '@memberjunction/ng-search';
// AgentPermissionsDialogComponent is now from @memberjunction/ng-agents (shown via ShowPermissionsDialog flag)

/**
 * Type for sub-agent filter options
 */
export type SubAgentFilterType = 'all' | 'child' | 'related';

/**
 * Interface for unified sub-agent display
 */
export interface UnifiedSubAgent {
    agent: MJAIAgentEntityExtended;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    type: 'child' | 'related';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    relationship?: MJAIAgentRelationshipEntity;  // Only for related sub-agents — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Narrowed read-only row from 'MJ: AI Agent Sessions' (ResultType 'simple').
 * Note: the simple shape uses the raw view column name `Config` (the entity
 * property is `Config_` only because of the BaseEntity name-collision rename).
 */
interface AgentSessionListRow {
    ID: string;
    AgentID: string;
    Agent: string | null;
    UserID: string;
    User: string;
    Status: 'Active' | 'Closed' | 'Idle';
    ConversationID: string | null;
    Conversation: string | null;
    HostInstanceID: string | null;
    Config: string | null;
    LastActiveAt: Date | string;
    ClosedAt: Date | string | null;
    __mj_CreatedAt: Date | string;
}

/**
 * A voice/realtime session shown in the agent's Execution History section,
 * decorated with its role relative to the open agent and display metrics.
 */
export interface AgentSessionHistoryItem {
    row: AgentSessionListRow;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Config.targetAgentID parsed from the session's Config JSON, when present */
    targetAgentID: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Resolved target agent name (via AIEngineBase agent cache) */
    targetAgentName: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** True when the open agent IS the session's co-agent (AIAgentSession.AgentID) */
    isCoAgent: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** True when the open agent is the session's delegation target (Config.targetAgentID) */
    isTarget: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Number of channel instances attached to the session */
    channelCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Enhanced AI Agent form component that extends the auto-generated base form
 * with comprehensive agent management capabilities including test harness integration,
 * related entity management, and execution history tracking.
 * 
 * ## Key Features:
 * - **Integrated Test Harness**: Built-in access to agent testing capabilities
 * - **Related Entity Management**: Display and manage sub-agents, prompts, and actions
 * - **Execution History**: View recent agent runs with status and timing information
 * - **Rich UI Components**: Enhanced cards, badges, and status indicators
 * - **Navigation Support**: Links to related entities and management functions
 * 
 * ## Form Sections:
 * - **Agent Details**: Basic agent configuration and settings
 * - **Sub-Agents**: Hierarchical agent relationships
 * - **Prompts**: Associated prompts with priority ordering
 * - **Actions**: Available actions and configurations
 * - **Execution History**: Recent runs with detailed status information
 * 
 * ## Usage:
 * This component is automatically loaded when editing AI Agent entities through
 * the MemberJunction form system. It extends the base generated form with
 * additional functionality while maintaining full compatibility.
 * 
 * @example
 * ```html
 * <!-- Automatically used by form system -->
 * <mj-ai-agent-form [recordId]="agentId"></mj-ai-agent-form>
 * ```
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Agents')
@Component({
  standalone: false,
    selector: 'mj-ai-agent-form',
    templateUrl: './ai-agent-form.component.html',
    styleUrls: ['./ai-agent-form.component.css']
})
export class MJAIAgentFormComponentExtended extends MJAIAgentFormComponent implements OnDestroy {
    /** The AI Agent entity being edited */
    public record!: MJAIAgentEntityExtended;

    /** Toolbar config — hide right-hand section controls since this form has a custom layout */
    public readonly ToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** @deprecated Use {@link ToolbarConfig}. */
    public get toolbarConfig() {
      return this.ToolbarConfig;
    }

    /** Custom-layout AI Agent form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }
    
    /** Subject for managing component lifecycle and cleaning up subscriptions */
    private destroy$ = new Subject<void>();
    
    /** Track active timeouts for cleanup */
    private activeTimeouts: number[] = [];
    
    /** Helper method to create tracked setTimeout calls */
    private setTrackedTimeout(callback: () => void, delay: number): number {
        const timeoutId = setTimeout(() => {
            // Remove from tracking array when timeout executes
            this.removeTimeoutFromTracking(timeoutId);
            callback();
        }, delay) as any as number;
        
        this.activeTimeouts.push(timeoutId);
        return timeoutId;
    }
    
    /** Remove timeout from tracking array */
    private removeTimeoutFromTracking(timeoutId: number): void {
        const index = this.activeTimeouts.indexOf(timeoutId);
        if (index > -1) {
            this.activeTimeouts.splice(index, 1);
        }
    }
    
    /** ViewChild for dynamic custom section container */
    private _customSectionContainer!: ViewContainerRef;
    @ViewChild('customSectionContainer', { read: ViewContainerRef }) 
    set CustomSectionContainer(container: ViewContainerRef) {
        this._customSectionContainer = container;
        // When the container becomes available, load the custom section if needed
        if (container && this.AgentType?.UIFormSectionKey && !this.customSectionLoaded) {
            this.setTrackedTimeout(() => this.loadCustomFormSection(), 0);
        }
    }
    get CustomSectionContainer(): ViewContainerRef {
        return this._customSectionContainer;
    }

    /** @deprecated Use {@link CustomSectionContainer} instead. */
    set customSectionContainer(container: ViewContainerRef) {
        this.CustomSectionContainer = container;
    }
    /** @deprecated Use {@link CustomSectionContainer} instead. */
    get customSectionContainer(): ViewContainerRef {
        return this.CustomSectionContainer;
    }
    
    /** The agent type entity for this agent */
    public AgentType: MJAIAgentTypeEntity | null = null;

    /** @deprecated Use {@link AgentType}. */
    public get agentType(): MJAIAgentTypeEntity | null {
      return this.AgentType;
    }
    /** @deprecated Use {@link AgentType}. */
    public set agentType(value: MJAIAgentTypeEntity | null) {
      this.AgentType = value;
    }
    
    /** Reference to the dynamically loaded custom section component */
    private customSectionComponent: BaseFormSectionComponent | null = null;
    
    /** Track if custom section has been loaded to avoid reloading */
    private customSectionLoaded = false;
    
    /** Track the component reference to check if it still exists */
    private customSectionComponentRef: any = null;
    
    /** Update custom section when EditMode changes */
    ngDoCheck() {
        if (this.customSectionComponent && this.customSectionComponent.EditMode !== this.EditMode) {
            this.customSectionComponent.EditMode = this.EditMode;
        }
    }
    
    
    
    // === Related Entity Counts ===
    /** Number of sub-agents under this agent (for backward compatibility) */
    public get SubAgentCount(): number {
        return this.allSubAgents.length;
    }

    /** @deprecated Use {@link SubAgentCount}. */
    public get subAgentCount(): number {
      return this.SubAgentCount;
    }

    /** Number of child sub-agents (ParentID-based) */
    public get ChildSubAgentCount(): number {
        return this.allSubAgents.filter(s => s.type === 'child').length;
    }

    /** @deprecated Use {@link ChildSubAgentCount}. */
    public get childSubAgentCount(): number {
      return this.ChildSubAgentCount;
    }

    /** Number of related sub-agents (Relationship-based) */
    public get RelatedSubAgentCount(): number {
        return this.allSubAgents.filter(s => s.type === 'related').length;
    }

    /** @deprecated Use {@link RelatedSubAgentCount}. */
    public get relatedSubAgentCount(): number {
      return this.RelatedSubAgentCount;
    }

    /** Total number of sub-agents across both types */
    public get TotalSubAgentCount(): number {
        return this.allSubAgents.length;
    }

    /** @deprecated Use {@link TotalSubAgentCount}. */
    public get totalSubAgentCount(): number {
      return this.TotalSubAgentCount;
    }

    /** Number of prompts associated with this agent */
    public get PromptCount(): number {
        return this.AgentPrompts.length;
    }

    /** @deprecated Use {@link PromptCount}. */
    public get promptCount(): number {
      return this.PromptCount;
    }

    /** Number of actions configured for this agent */
    public get ActionCount(): number {
        return this.AgentActions.length;
    }

    /** @deprecated Use {@link ActionCount}. */
    public get actionCount(): number {
      return this.ActionCount;
    }

    /** Number of learning cycles for this agent */
    public get LearningCycleCount(): number {
        return this.LearningCycles.length;
    }

    /** @deprecated Use {@link LearningCycleCount}. */
    public get learningCycleCount(): number {
      return this.LearningCycleCount;
    }

    /** Number of notes associated with this agent */
    public get NoteCount(): number {
        return this.AgentNotes.length;
    }

    /** @deprecated Use {@link NoteCount}. */
    public get noteCount(): number {
      return this.NoteCount;
    }

    /** Number of execution history records */
    public get ExecutionHistoryCount(): number {
        return this.RecentExecutions.length;
    }

    /** @deprecated Use {@link ExecutionHistoryCount}. */
    public get executionHistoryCount(): number {
      return this.ExecutionHistoryCount;
    }

    // === Related Entity Data for Display ===
    /** Array of sub-agent entities for card display (DEPRECATED - use allSubAgents) */
    public SubAgents: MJAIAgentEntityExtended[] = [];

    /** @deprecated Use {@link SubAgents}. */
    public get subAgents(): MJAIAgentEntityExtended[] {
      return this.SubAgents;
    }
    /** @deprecated Use {@link SubAgents}. */
    public set subAgents(value: MJAIAgentEntityExtended[]) {
      this.SubAgents = value;
    }

    /** Unified sub-agent data (both child and related) */
    private allSubAgents: UnifiedSubAgent[] = [];

    /** Current filter for sub-agents display */
    public SubAgentFilter: SubAgentFilterType = 'all';

    /** @deprecated Use {@link SubAgentFilter}. */
    public get subAgentFilter(): SubAgentFilterType {
      return this.SubAgentFilter;
    }
    /** @deprecated Use {@link SubAgentFilter}. */
    public set subAgentFilter(value: SubAgentFilterType) {
      this.SubAgentFilter = value;
    }

    /** Filtered sub-agents based on current filter */
    public get FilteredSubAgents(): UnifiedSubAgent[] {
        switch (this.SubAgentFilter) {
            case 'child':
                return this.allSubAgents.filter(s => s.type === 'child');
            case 'related':
                return this.allSubAgents.filter(s => s.type === 'related');
            default:
                return this.allSubAgents;
        }
    }

    /** @deprecated Use {@link FilteredSubAgents}. */
    public get filteredSubAgents(): UnifiedSubAgent[] {
      return this.FilteredSubAgents;
    }
    
    /** Array of agent prompt entities for card display */
    public AgentPrompts: MJAIPromptEntityExtended[] = [];

    /** @deprecated Use {@link AgentPrompts}. */
    public get agentPrompts(): MJAIPromptEntityExtended[] {
      return this.AgentPrompts;
    }
    /** @deprecated Use {@link AgentPrompts}. */
    public set agentPrompts(value: MJAIPromptEntityExtended[]) {
      this.AgentPrompts = value;
    }
    
    /** Array of agent action entities for card display */
    public AgentActions: MJActionEntity[] = [];

    /** @deprecated Use {@link AgentActions}. */
    public get agentActions(): MJActionEntity[] {
      return this.AgentActions;
    }
    /** @deprecated Use {@link AgentActions}. */
    public set agentActions(value: MJActionEntity[]) {
      this.AgentActions = value;
    }
    
    
    /** Array of learning cycle entities for display */
    public LearningCycles: MJAIAgentLearningCycleEntity[] = [];

    /** @deprecated Use {@link LearningCycles}. */
    public get learningCycles(): MJAIAgentLearningCycleEntity[] {
      return this.LearningCycles;
    }
    /** @deprecated Use {@link LearningCycles}. */
    public set learningCycles(value: MJAIAgentLearningCycleEntity[]) {
      this.LearningCycles = value;
    }
    
    /** Array of agent note entities for display */
    public AgentNotes: MJAIAgentNoteEntity[] = [];

    /** @deprecated Use {@link AgentNotes}. */
    public get agentNotes(): MJAIAgentNoteEntity[] {
      return this.AgentNotes;
    }
    /** @deprecated Use {@link AgentNotes}. */
    public set agentNotes(value: MJAIAgentNoteEntity[]) {
      this.AgentNotes = value;
    }
    
    /** Array of recent execution records for history display */
    public RecentExecutions: MJAIAgentRunEntityExtended[] = [];

    /** @deprecated Use {@link RecentExecutions}. */
    public get recentExecutions(): MJAIAgentRunEntityExtended[] {
      return this.RecentExecutions;
    }
    /** @deprecated Use {@link RecentExecutions}. */
    public set recentExecutions(value: MJAIAgentRunEntityExtended[]) {
      this.RecentExecutions = value;
    }
    public TotalExecutionHistoryCount: number = 0;

    /** @deprecated Use {@link TotalExecutionHistoryCount}. */
    public get totalExecutionHistoryCount(): number {
      return this.TotalExecutionHistoryCount;
    }
    /** @deprecated Use {@link TotalExecutionHistoryCount}. */
    public set totalExecutionHistoryCount(value: number) {
      this.TotalExecutionHistoryCount = value;
    }
    /** Track which execution cards are expanded */
    public ExpandedExecutions: { [key: string]: boolean } = {};

    /** @deprecated Use {@link ExpandedExecutions}. */
    public get expandedExecutions(): { [key: string]: boolean } {
      return this.ExpandedExecutions;
    }
    /** @deprecated Use {@link ExpandedExecutions}. */
    public set expandedExecutions(value: { [key: string]: boolean }) {
      this.ExpandedExecutions = value;
    }

    /** Search functionality for execution history */
    public ExecutionSearchText: string = '';

    /** @deprecated Use {@link ExecutionSearchText}. */
    public get executionSearchText(): string {
      return this.ExecutionSearchText;
    }
    /** @deprecated Use {@link ExecutionSearchText}. */
    public set executionSearchText(value: string) {
      this.ExecutionSearchText = value;
    }
    public FilteredExecutions: MJAIAgentRunEntityExtended[] = [];

    /** @deprecated Use {@link FilteredExecutions}. */
    public get filteredExecutions(): MJAIAgentRunEntityExtended[] {
      return this.FilteredExecutions;
    }
    /** @deprecated Use {@link FilteredExecutions}. */
    public set filteredExecutions(value: MJAIAgentRunEntityExtended[]) {
      this.FilteredExecutions = value;
    }

    /** Message shown when the execution-history search matches nothing. */
    public get ExecutionSearchEmptyMessage(): string {
        return `No execution history found matching "${this.ExecutionSearchText}"`;
    }

    /** Which record type the Execution History section shows: agent runs (default) or realtime voice sessions */
    public ExecutionHistoryView: 'runs' | 'sessions' = 'runs';

    /** @deprecated Use {@link ExecutionHistoryView}. */
    public get executionHistoryView(): 'runs' | 'sessions' {
      return this.ExecutionHistoryView;
    }
    /** @deprecated Use {@link ExecutionHistoryView}. */
    public set executionHistoryView(value: 'runs' | 'sessions') {
      this.ExecutionHistoryView = value;
    }

    /** Voice/realtime sessions where this agent is the co-agent or the delegation target */
    public AgentSessions: AgentSessionHistoryItem[] = [];

    /** @deprecated Use {@link AgentSessions}. */
    public get agentSessions(): AgentSessionHistoryItem[] {
      return this.AgentSessions;
    }
    /** @deprecated Use {@link AgentSessions}. */
    public set agentSessions(value: AgentSessionHistoryItem[]) {
      this.AgentSessions = value;
    }
    public TotalSessionCount: number = 0;

    /** @deprecated Use {@link TotalSessionCount}. */
    public get totalSessionCount(): number {
      return this.TotalSessionCount;
    }
    /** @deprecated Use {@link TotalSessionCount}. */
    public set totalSessionCount(value: number) {
      this.TotalSessionCount = value;
    }
    public LoadingSessions: boolean = false;

    /** @deprecated Use {@link LoadingSessions}. */
    public get loadingSessions(): boolean {
      return this.LoadingSessions;
    }
    /** @deprecated Use {@link LoadingSessions}. */
    public set loadingSessions(value: boolean) {
      this.LoadingSessions = value;
    }

    /** Pagination state for execution history */
    public ExecutionHistoryPageSize: number = 20;

    /** @deprecated Use {@link ExecutionHistoryPageSize}. */
    public get executionHistoryPageSize(): number {
      return this.ExecutionHistoryPageSize;
    }
    /** @deprecated Use {@link ExecutionHistoryPageSize}. */
    public set executionHistoryPageSize(value: number) {
      this.ExecutionHistoryPageSize = value;
    }
    public ExecutionHistoryCurrentPage: number = 1;

    /** @deprecated Use {@link ExecutionHistoryCurrentPage}. */
    public get executionHistoryCurrentPage(): number {
      return this.ExecutionHistoryCurrentPage;
    }
    /** @deprecated Use {@link ExecutionHistoryCurrentPage}. */
    public set executionHistoryCurrentPage(value: number) {
      this.ExecutionHistoryCurrentPage = value;
    }
    public IsLoadingPage: boolean = false;

    /** @deprecated Use {@link IsLoadingPage}. */
    public get isLoadingPage(): boolean {
      return this.IsLoadingPage;
    }
    /** @deprecated Use {@link IsLoadingPage}. */
    public set isLoadingPage(value: boolean) {
      this.IsLoadingPage = value;
    }
    /** Cache all loaded execution records for pagination */
    private allLoadedExecutions: MJAIAgentRunEntityExtended[] = [];
    
    // === Loading States ===
    /** Main loading state for initial data load */
    public IsLoadingData = true;

    /** @deprecated Use {@link IsLoadingData}. */
    public get isLoadingData() {
      return this.IsLoadingData;
    }
    /** @deprecated Use {@link IsLoadingData}. */
    public set isLoadingData(value) {
      this.IsLoadingData = value;
    }
    
    /** Individual loading states for each section, start off true until loading complete */
    public LoadingStates = {
        executionHistory: true,
        subAgents: true,
        prompts: true,
        actions: true,
        learningCycles: true,
        notes: true,
        customSection: true,
        searchScopes: false
    };

    /** @deprecated Use {@link LoadingStates}. */
    public get loadingStates() {
      return this.LoadingStates;
    }
    /** @deprecated Use {@link LoadingStates}. */
    public set loadingStates(value) {
      this.LoadingStates = value;
    }

    /** Column spec for the AIAgentSearchScope child grid (mockup #5). */
    public readonly AgentSearchScopeColumns: SearchScopeChildGridColumn[] = [
        { Field: 'SearchScopeID', Label: 'Scope', Type: 'lookup', LookupEntityName: 'MJ: Search Scopes', LookupFilter: "Status='Active'", Width: '200px' },
        { Field: 'Phase', Label: 'Phase', Type: 'select', Options: [
            { Label: 'Pre-Execution (injected before LLM)', Value: 'PreExecution' },
            { Label: 'Agent-Invoked (tool-callable)', Value: 'AgentInvoked' },
            { Label: 'Both', Value: 'Both' },
        ], Width: '220px' },
        { Field: 'Priority', Label: 'Priority', Type: 'number', Placeholder: 'e.g. 10', Width: '90px' },
        { Field: 'MaxResults', Label: 'Max Results', Type: 'number', Placeholder: '10', Width: '110px' },
        { Field: 'MinScore', Label: 'Min Score', Type: 'number', Placeholder: '0.35', Width: '110px' },
        { Field: 'QueryTemplateID', Label: 'Query Template', Type: 'lookup', LookupEntityName: 'Templates', Width: '180px' },
        { Field: 'FusionWeightsOverride', Label: 'Fusion Weights Override', Type: 'code', Placeholder: '{ "vector": 2.0, "fulltext": 1.0 }' },
        { Field: 'IsDefault', Label: 'Default', Type: 'checkbox', Width: '80px' },
    ];

    /**
     * Read-only summary of SearchScopePermission rows that apply to the
     * scopes this agent is assigned to. Drives a small audit table inside
     * the agent form's Search section so an agent owner can see at a glance
     * who has access to the scopes their agent uses, without navigating
     * away to the Knowledge Hub Config dashboard's full audit surface.
     *
     * Each entry pairs a scope name with a list of permission rows
     * (principal type + name + level). Rebuilt whenever the agent's
     * AIAgentSearchScope assignments change.
     */
    public PermissionSummary: Array<{
        ScopeName: string;
        ScopeID: string;
        Permissions: Array<{
            Principal: string;
            PrincipalType: 'User' | 'Role';
            Level: string;
        }>;
    }> = [];

    public IsLoadingPermissions = false;

    /**
     * Loads the permission summary for the scopes currently assigned to
     * this agent. Called on agent load and after AIAgentSearchScope edits.
     */
    public async LoadPermissionSummary(): Promise<void> {
        if (!this.record?.ID) {
            this.PermissionSummary = [];
            return;
        }
        this.IsLoadingPermissions = true;
        try {
            const rv = new RunView();
            // 1. Fetch the agent's assigned scope IDs.
            const assigned = await rv.RunView<{ SearchScopeID: string; SearchScope?: string }>({
                EntityName: 'MJ: AI Agent Search Scopes',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                Fields: ['SearchScopeID', 'SearchScope'],
                ResultType: 'simple',
            });
            if (!assigned.Success || !assigned.Results?.length) {
                this.PermissionSummary = [];
                return;
            }
            const scopeIds = assigned.Results.map(r => r.SearchScopeID);
            const scopeNames = new Map<string, string>(
                assigned.Results.map(r => [r.SearchScopeID, r.SearchScope ?? r.SearchScopeID])
            );

            // 2. Fetch all permission rows for those scopes in one batch.
            const idList = scopeIds.map(id => `'${id}'`).join(',');
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

            // 3. Group by scope.
            this.PermissionSummary = scopeIds.map(scopeId => ({
                ScopeID: scopeId,
                ScopeName: scopeNames.get(scopeId) ?? scopeId,
                Permissions: rows
                    .filter(r => UUIDsEqual(r.SearchScopeID, scopeId))
                    .map(r => ({
                        Principal: r.UserID ? (r.User ?? 'unknown user') : (r.Role ?? 'unknown role'),
                        PrincipalType: (r.UserID ? 'User' : 'Role') as 'User' | 'Role',
                        Level: r.PermissionLevel,
                    })),
            }));
        } finally {
            this.IsLoadingPermissions = false;
        }
    }

    // === User Preferences ===
    private static readonly PREFS_KEY = 'ai-agent-form/preferences';
    private preferencesLoaded = false;

    /** Whether the form header is collapsed to a single compact line */
    public HeaderCollapsed = false;

    /** Tracked expanded/collapsed state for each panelbar section */
    public SectionStates: Record<string, boolean> = {};

    // === Form Tabs ===
    //
    // For an agent type that ships a designer (Flow being the one that does today), the diagram IS
    // the agent — burying it in a collapsed accordion below ten sibling panels, behind a dynamic
    // component that only instantiates when that panel is expanded, made the most important view of
    // the record the hardest one to reach. Tabs put it first.
    //
    // Every agent also gets Invocations, because "what runs this thing when I'm not looking?" is a
    // question you can ask of any agent, not just a Flow.

    /**
     * Which pane is showing. Persisted per user, so returning to a record lands where you left.
     *
     * Starts null rather than `'details'`: null means "nobody has chosen yet", which lets
     * {@link refreshFormTabs} fall through to the first tab — the designer, when the agent type has
     * one. A hardcoded default would open every Flow agent on Details and bury its diagram again.
     */
    public ActiveFormTab: string | null = null;

    /** Tab chrome, recomputed only when the agent type or record identity changes. */
    public FormTabs: TabConfig[] = [];

    /** True when this agent's type contributes a designer pane (Flow does; Loop does not). */
    public get HasDesignerTab(): boolean {
        return HasDesignerTab(this.formTabContext);
    }

    /** The slice of state the tab rules read — kept small so the rules stay unit-testable. */
    private get formTabContext(): AgentFormTabContext {
        return {
            AgentTypeName: this.AgentType?.Name ?? null,
            UIFormSectionKey: this.AgentType?.UIFormSectionKey ?? null,
            HasRecordID: !!this.record?.ID,
        };
    }

    /**
     * Rebuilds the tab strip.
     *
     * A field rather than a getter: a getter would allocate a new array on every change-detection
     * pass, and `mj-tab-nav` would see a changed input each time. The rules themselves live in
     * `agent-form-tabs.ts` — they are small, but each has a failure mode that renders as a blank
     * form rather than an error, and none is reachable in a test from inside this component.
     */
    private refreshFormTabs(): void {
        const plan = BuildAgentFormTabs(this.formTabContext, this.ActiveFormTab);
        this.FormTabs = plan.Tabs;
        this.ActiveFormTab = plan.ActiveKey;
    }

    public OnFormTabChange(key: string): void {
        this.ActiveFormTab = key;
        this.persistPreferences();
        // The designer's container is created once and kept mounted (see the template), so the only
        // thing a tab switch has to do is make sure it got loaded — which matters when the user's
        // saved tab was Details and the designer has therefore never been visible.
        if (key === 'designer' && !this.customSectionLoadedForTab) {
            this.setTrackedTimeout(() => this.loadCustomFormSection(), 0);
        }
        this.cdr.detectChanges();
    }

    /** Mirrors `customSectionLoaded` for the tab path without reaching into a private field from the template. */
    private get customSectionLoadedForTab(): boolean {
        return this.customSectionLoaded;
    }

    // === Dropdown Data ===
    /** Model selection mode options for the dropdown */
    public ModelSelectionModes = [
        { text: 'Agent Type', value: 'Agent Type' },
        { text: 'Agent', value: 'Agent' }
    ];

    /** @deprecated Use {@link ModelSelectionModes}. */
    public get modelSelectionModes() {
      return this.ModelSelectionModes;
    }
    /** @deprecated Use {@link ModelSelectionModes}. */
    public set modelSelectionModes(value) {
      this.ModelSelectionModes = value;
    }

    /** Agent status options for the dropdown */
    public StatusOptions = [
        { text: 'Active', value: 'Active' },
        { text: 'Pending', value: 'Pending' },
        { text: 'Disabled', value: 'Disabled' }
    ];

    /** @deprecated Use {@link StatusOptions}. */
    public get statusOptions() {
      return this.StatusOptions;
    }
    /** @deprecated Use {@link StatusOptions}. */
    public set statusOptions(value) {
      this.StatusOptions = value;
    }

    /** Agent types loaded from the database */
    public AgentTypes: any[] = [];

    /** @deprecated Use {@link AgentTypes}. */
    public get agentTypes(): any[] {
      return this.AgentTypes;
    }
    /** @deprecated Use {@link AgentTypes}. */
    public set agentTypes(value: any[]) {
      this.AgentTypes = value;
    }

    /** TreeDropdown configuration for the agent category field */
    public CategoryBranchConfig: TreeBranchConfig = {
        EntityName: 'MJ: AI Agent Categories',
        DisplayField: 'Name',
        ParentIDField: 'ParentID',
        DefaultIcon: 'fa-solid fa-folder',
        OrderBy: 'Name ASC',
        DescriptionField: 'Description'
    };

    /** Current category selection for the TreeDropdown */
    public SelectedCategoryKey: CompositeKey | null = null;

    /** Handle category selection change from the TreeDropdown */
    public OnCategoryChange(value: CompositeKey | CompositeKey[] | null): void {
        if (value && !Array.isArray(value)) {
            const idValue = value.KeyValuePairs?.find((kv: KeyValuePair) => kv.FieldName === 'ID')?.Value;
            this.record.CategoryID = idValue ?? null;
        } else {
            this.record.CategoryID = null;
        }
        this.SelectedCategoryKey = Array.isArray(value) ? null : value;
    }

    /** Currently selected context compression prompt */
    public SelectedContextCompressionPrompt: any = null;

    /** @deprecated Use {@link SelectedContextCompressionPrompt}. */
    public get selectedContextCompressionPrompt(): any {
      return this.SelectedContextCompressionPrompt;
    }
    /** @deprecated Use {@link SelectedContextCompressionPrompt}. */
    public set selectedContextCompressionPrompt(value: any) {
      this.SelectedContextCompressionPrompt = value;
    }

    /**
     * Loads agent types from the database for the dropdown
     * @private
     */
    private async loadAgentTypes(): Promise<void> {
        this.AgentTypes = AIEngineBase.Instance.AgentTypes
    }

    /**
     * Loads the context compression prompt details for display
     * @private
     */
    private async loadContextCompressionPrompt(): Promise<void> {
        if (!this.record?.ContextCompressionPromptID) {
            this.SelectedContextCompressionPrompt = null;
            return;
        }

        this.SelectedContextCompressionPrompt = AIEngineBase.Instance.Prompts.find(p => UUIDsEqual(p.ID, this.record.ContextCompressionPromptID));
        if (!this.SelectedContextCompressionPrompt) {
            console.warn('Context compression prompt not found:', this.record.ContextCompressionPromptID);
        }
    }

    /**
     * Opens the prompt selector dialog for context compression prompt
     */
    public async OpenContextCompressionPromptSelector(): Promise<void> {
        try {
            const dialogRef = this.dialogService.open({
                title: 'Select Context Compression Prompt',
                content: PromptSelectorDialogComponent,
                width: 800,
                height: 600
            });

            const promptSelector = dialogRef.Content!.instance as unknown as PromptSelectorDialogComponent;

            // Configure the prompt selector for single selection
            promptSelector.config = {
                Title: 'Select Context Compression Prompt',
                MultiSelect: false,
                SelectedPromptIds: this.record.ContextCompressionPromptID ? [this.record.ContextCompressionPromptID] : [],
                ShowCreateNew: false
            };

            // Subscribe to the result
            promptSelector.result.subscribe({
                next: (result: PromptSelectorResult | null) => {
                    if (result && result.SelectedPrompts.length > 0) {
                        const selectedPrompt = result.SelectedPrompts[0];
                        this.record.ContextCompressionPromptID = selectedPrompt.ID;
                        this.SelectedContextCompressionPrompt = selectedPrompt;
                        this.cdr.detectChanges();
                    }
                },
                error: (error: any) => {
                    console.error('Error in prompt selector dialog:', error);
                }
            });
        } catch (error) {
            console.error('Error opening context compression prompt selector:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error opening prompt selector. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link OpenContextCompressionPromptSelector}. */
    public async openContextCompressionPromptSelector(): Promise<void> {
      return this.OpenContextCompressionPromptSelector();
    }

    /**
     * Clears the selected context compression prompt
     */
    public ClearContextCompressionPrompt(): void {
        this.record.ContextCompressionPromptID = null;
        this.SelectedContextCompressionPrompt = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link ClearContextCompressionPrompt}. */
    public clearContextCompressionPrompt(): void {
      return this.ClearContextCompressionPrompt();
    }

    // === Permission Checks for Related Entities ===
    /** Cache for permission checks to avoid repeated calculations */
    private _permissionCache = new Map<string, boolean>();

    // Main AI Agent permissions inherited from BaseFormComponent:
    // - UserCanEdit (Update permission)
    // - UserCanRead (Read permission) 
    // - UserCanCreate (Create permission)
    // - UserCanDelete (Delete permission)

    /** Check if user can create AI Agent Actions */
    public get UserCanCreateActions(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Actions', 'Create');
    }

    /** Check if user can update AI Agent Actions */
    public get UserCanUpdateActions(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Actions', 'Update');
    }

    /** Check if user can delete AI Agent Actions */
    public get UserCanDeleteActions(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Actions', 'Delete');
    }

    /** Check if user can create AI Agent Prompts */
    public get UserCanCreatePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Create');
    }

    /** Check if user can update AI Agent Prompts */
    public get UserCanUpdatePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Update');
    }

    /** Check if user can delete AI Agent Prompts */
    public get UserCanDeletePrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Prompts', 'Delete');
    }

    /** Check if user can create AI Agents (for sub-agents) */
    public get UserCanCreateSubAgents(): boolean {
        return this.checkEntityPermission('MJ: AI Agents', 'Create');
    }

    /** Check if user can update AI Agents (for sub-agents) */
    public get UserCanUpdateSubAgents(): boolean {
        return this.checkEntityPermission('MJ: AI Agents', 'Update');
    }

    /** Check if user can delete AI Agents (for sub-agents) */
    public get UserCanDeleteSubAgents(): boolean {
        return this.checkEntityPermission('MJ: AI Agents', 'Delete');
    }

    /** Check if user can create AI Agent Notes */
    public get UserCanCreateNotes(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Notes', 'Create');
    }

    /** Check if user can update AI Agent Notes */
    public get UserCanUpdateNotes(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Notes', 'Update');
    }

    /** Check if user can delete AI Agent Notes */
    public get UserCanDeleteNotes(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Notes', 'Delete');
    }

    /** Check if user can view AI Agent Learning Cycles */
    public get UserCanViewLearningCycles(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Learning Cycles', 'Read');
    }

    /** Check if user can view AI Agent Runs (execution history) */
    public get UserCanViewExecutionHistory(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Runs', 'Read');
    }

    /** Check if user can view AI Agent Sessions (realtime voice session history) */
    public get UserCanViewSessions(): boolean {
        return this.checkEntityPermission('MJ: AI Agent Sessions', 'Read');
    }

    /** Check if user can create AI Prompts (needed for creating new prompts) */
    public get UserCanCreateAIPrompts(): boolean {
        return this.checkEntityPermission('MJ: AI Prompts', 'Create');
    }

    /** Check if user can create both AI Prompts and AI Agent Prompts (for createNewPrompt functionality) */
    public get UserCanCreateNewPrompts(): boolean {
        return this.UserCanCreateAIPrompts && this.UserCanCreatePrompts;
    }

    /**
     * Helper method to check entity permissions with caching
     * @param entityName - The name of the entity to check permissions for
     * @param permissionType - The type of permission to check (Create, Read, Update, Delete)
     * @returns boolean indicating if user has the permission
     */
    private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
        const cacheKey = `${entityName}_${permissionType}`;
        
        if (this._permissionCache.has(cacheKey)) {
            return this._permissionCache.get(cacheKey)!;
        }

        try {
            const md = this.ProviderToUse;
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            
            if (!entityInfo) {
                console.warn(`Entity '${entityName}' not found for permission check`);
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(md.CurrentUser);
            let hasPermission = false;

            switch (permissionType) {
                case 'Create':
                    hasPermission = userPermissions.CanCreate;
                    break;
                case 'Read':
                    hasPermission = userPermissions.CanRead;
                    break;
                case 'Update':
                    hasPermission = userPermissions.CanUpdate;
                    break;
                case 'Delete':
                    hasPermission = userPermissions.CanDelete;
                    break;
            }

            this._permissionCache.set(cacheKey, hasPermission);
            return hasPermission;
        } catch (error) {
            console.error(`Error checking ${permissionType} permission for ${entityName}:`, error);
            this._permissionCache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * Clears the permission cache. Call this when user context changes or permissions are updated.
     */
    public ClearPermissionCache(): void {
        this._permissionCache.clear();
    }

    /** @deprecated Use {@link ClearPermissionCache}. */
    public clearPermissionCache(): void {
      return this.ClearPermissionCache();
    }

    // === Transaction-based editing support ===
    /** Now using BaseFormComponent's PendingRecords system exclusively */
    
    /**
     * True until the form knows what it is going to render.
     *
     * The tab strip and every pane depend on the agent's TYPE, which is loaded asynchronously. Until
     * it arrives there are no tabs, no designer pane, and `ActiveFormTab` is null — so the details
     * pane is hidden too and the form renders its header over an empty area for as long as the load
     * takes. That reads as a broken page, not as a slow one.
     */
    public IsFormInitializing = true;

    /** Flag to indicate if there are unsaved changes */
    public HasUnsavedChanges = false;

    /** @deprecated Use {@link HasUnsavedChanges}. */
    public get hasUnsavedChanges() {
      return this.HasUnsavedChanges;
    }
    /** @deprecated Use {@link HasUnsavedChanges}. */
    public set hasUnsavedChanges(value) {
      this.HasUnsavedChanges = value;
    }

    /**
     * Surfaces the type section's own edits to the toolbar and the navigate-away guard.
     *
     * A flow canvas edit changes no field on the agent row, so `record.Dirty` stays false and the
     * form would otherwise report itself clean while the user is looking at unsaved steps.
     */
    public override get HasAdditionalUnsavedChanges(): boolean {
        return this.customSectionComponent?.HasPendingChanges === true;
    }
    
    // Emergency circuit breaker to prevent infinite loops
    private _changeDetectionCount = 0;
    private static readonly MAX_CHANGE_DETECTIONS = 50;

    // === Original State for Cancel/Revert ===
    /** Snapshots of original data for reverting UI changes */
    private originalSnapshots: {
        agentPrompts: MJAIPromptEntityExtended[];
        agentActions: MJActionEntity[];
        subAgents: MJAIAgentEntityExtended[];
        promptCount: number;
        actionCount: number;
        subAgentCount: number;
        learningCycleCount: number;
        noteCount: number;
        executionHistoryCount: number;
    } | null = null;

    // Dependency injection using inject() function
    private sharedService = inject(SharedService);
    private dialogService = inject(MJDialogService);
    private viewContainerRef = inject(ViewContainerRef);
    private agentManagementService = inject(AIAgentManagementService);
    private testHarnessService = inject(AITestHarnessDialogService);
    private createAgentService = inject(CreateAgentService);
    
    /**
     * After view initialization, load any custom form section if defined
     */
    async ngOnInit() {
        await super.ngOnInit();
        try {
            await this.initializeForm();
        } finally {
            // In a finally on purpose: a failure part-way through init must still reveal the form.
            // Stranding the spinner would turn a partial load into a page that never arrives.
            this.IsFormInitializing = false;
            this.cdr.markForCheck();
        }
    }

    /** The async work ngOnInit performs. Extracted so its completion can be signalled in one place. */
    private async initializeForm(): Promise<void> {
        // Restore user preferences (header state, section expand/collapse)
        this.loadUserPreferences();

        // Load agent types for dropdown (needed for both new and existing records)
        await AIEngineBase.Instance.Config(false); // in UI context user and provider default to global
        await ActionEngineBase.Instance.Config(false);

        await this.loadAgentTypes();

        // Initialize category selection from the record's CategoryID
        const categoryId = this.record?.CategoryID;
        if (categoryId) {
            this.SelectedCategoryKey = CompositeKey.FromID(categoryId); // first-pk-ok: FK target — AI Agent CategoryID references the single-column ID key of AI Agent Categories
        }

        // Load context compression prompt if one is set
        if (this.record?.ContextCompressionPromptID) {
            await this.loadContextCompressionPrompt();
        }
        
        if (this.record?.ID) {
            await this.loadRelatedCounts(false); // no need to force refresh on initial load
            await this.loadCurrentAgentType();

            // Phase 2A: load the permission summary for the scopes this
            // agent is assigned to. Fire-and-forget — the panel renders an
            // IsLoadingPermissions skeleton while it resolves.
            void this.LoadPermissionSummary();

            // Schedule change detection - safer than manual detectChanges()
            this.cdr.markForCheck();

            // Defer custom section loading to next tick after DOM updates
            this.setTrackedTimeout(() => {
                this.loadCustomFormSection();
            }, 0);

            // Start background timer for running time updates
            this.startRunningTimeUpdater();
        }

        // Built unconditionally, not only on the agent-type path: a new record has no type to load
        // from, and an agent whose TypeID is unset returns early from loadCurrentAgentType — either
        // way the strip still needs its Details tab, and without this the form would render no tabs
        // and no panes at all.
        this.refreshFormTabs();
        this.cdr.markForCheck();
    }

    /**
     * Loads counts and preview data for all related entities including sub-agents,
     * prompts, actions, learning cycles, notes, and execution history. 
     * This data populates the various expander panels in the enhanced form interface.
     * @private
     */
    private async loadRelatedCounts(forceRefresh: boolean): Promise<void> {
        if (!this.record?.ID) return;

        // Reset pagination state on refresh
        if (forceRefresh) {
            this.ExecutionHistoryCurrentPage = 1;
            this.IsLoadingPage = false;
            this.allLoadedExecutions = [];
            // Don't clear recentExecutions - keep existing data visible while loading
        }

        // Set loading state
        this.IsLoadingData = true;
        this.LoadingStates = {
            executionHistory: true,
            subAgents: true,
            prompts: true,
            actions: true,
            learningCycles: true,
            notes: true,
            customSection: true,
            searchScopes: false
        };
        // markForCheck (not detectChanges) — we're invoked from inside ngOnInit's
        // await chain, which still sits within the host's CD pass. A synchronous
        // detectChanges() here forces a check whose results dev-mode checkNoChanges
        // re-verifies against state that further awaits below mutate (totalSubAgentCount
        // 0→1 etc.), producing NG0100. markForCheck schedules a future CD pass that
        // runs against fully-settled state.
        this.cdr.markForCheck();

        if (forceRefresh) {
            await AIEngineBase.Instance.Config(true); // force refresh
        }

        try {
            // Build into a LOCAL array and assign this.allSubAgents ONCE at the end (after the awaits
            // below). The synchronous child-agent population runs inside ngOnInit's await chain, which
            // still sits within the host's CD pass — mutating this.allSubAgents incrementally there
            // changes totalSubAgentCount 0→N mid-pass and trips NG0100. Building locally keeps the
            // bound count stable until we swap in the final list outside the CD pass.
            const newSubAgents: UnifiedSubAgent[] = [];

            // Track agent IDs we've already added so the same agent doesn't appear twice
            // when it's both a structural child (ParentID) AND has an entry in the
            // AI Agent Relationships table. Without this dedup, `filteredSubAgents`
            // emits two items with the same `agent.ID`, the @for(track item.agent.ID)
            // trips NG0955 ("duplicated keys") on every CD pass, and `totalSubAgentCount`
            // becomes inconsistent with the visible list. Normalize the UUID for the
            // Set key — see guides/UUID_COMPARISON_GUIDE.md.
            const seenSubAgentIds = new Set<string>();

            // Load child sub-agents (ParentID-based) — these take precedence over
            // relationship-based entries since ParentID is a structural relationship.
            const childAgents = AIEngineBase.Instance.Agents.filter(a => UUIDsEqual(a.ParentID, this.record.ID));
            for (const agent of childAgents) {
                const key = NormalizeUUID(agent.ID);
                if (seenSubAgentIds.has(key)) continue;
                seenSubAgentIds.add(key);
                newSubAgents.push({
                    agent,
                    type: 'child'
                });
            }

            // Also populate the deprecated subAgents array for backward compatibility
            this.SubAgents = [...childAgents];

            // Load related sub-agents (Relationship-based)
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const relationshipsResult = await rv.RunView<MJAIAgentRelationshipEntity>({
                EntityName: 'MJ: AI Agent Relationships',
                ExtraFilter: `AgentID='${this.record.ID}' AND Status='Active'`,
                ResultType: 'entity_object'
            });

            if (relationshipsResult.Success && relationshipsResult.Results) {
                for (const relationship of relationshipsResult.Results) {
                    const agent = AIEngineBase.Instance.Agents.find(
                        a => UUIDsEqual(a.ID, relationship.SubAgentID)
                    );

                    if (!agent) continue;
                    const key = NormalizeUUID(agent.ID);
                    // Skip if the agent is already in the list as a child OR as another
                    // active Relationship row pointing to the same SubAgentID.
                    if (seenSubAgentIds.has(key)) continue;
                    seenSubAgentIds.add(key);
                    newSubAgents.push({
                        agent,
                        type: 'related',
                        relationship
                    });
                }
            }

            // Sort: child agents first, then by name
            newSubAgents.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'child' ? -1 : 1;
                }
                return (a.agent.Name || '').localeCompare(b.agent.Name || '');
            });

            // Single assignment — happens AFTER the awaits above, i.e. outside the host's CD pass, so
            // totalSubAgentCount changes exactly once against settled state (no NG0100).
            this.allSubAgents = newSubAgents;

            this.AgentPrompts = AIEngineBase.Instance.Prompts.filter(p => {
                const filteredAgentPrompts = AIEngineBase.Instance.AgentPrompts.filter(ap => UUIDsEqual(ap.AgentID, this.record.ID));
                return filteredAgentPrompts.some(ap => UUIDsEqual(ap.PromptID, p.ID));
            });

            this.AgentActions = ActionEngineBase.Instance.Actions.filter(a => {
                const filteredAgentActions = AIEngineBase.Instance.AgentActions.filter(aa => UUIDsEqual(aa.AgentID, this.record.ID));
                return filteredAgentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID));
            });

            // Execute all queries in a single batch for better performance
            const results = await rv.RunViews([
                // Learning cycles
                {
                    EntityName: 'MJ: AI Agent Learning Cycles',
                    // limit fields
                    Fields: ["ID","Name","StartedAt", "EndedAt","Status","AgentID"],
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    OrderBy: 'StartedAt DESC'
                },
                // Notes
                {
                    EntityName: 'MJ: AI Agent Notes',
                    // limit fields
                    Fields: ["ID","Name", "AgentID", "AgentNoteType","AgentNoteTypeID","UserID"],
                    ExtraFilter: `AgentID='${this.record.ID}'`
                },
                // Execution history (initial page)
                {
                    EntityName: 'MJ: AI Agent Runs',
                    Fields: [ // limit what we take from runs as this is where we can have a LOT come down if we include JSON fields
                        "ID","AgentID","ParentRunID","Status","StartedAt","CompletedAt",
                        "Success","TotalTokensUsed","TotalCost","TotalCostRollUp","TotalTokensUsedRollUp",
                        "Configuration","ConversationID","Result","ErrorMessage","__mj_CreatedAt"
                    ],
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: this.ExecutionHistoryPageSize
                },
                // Agent permissions (to determine open-to-everyone state)
                {
                    EntityName: 'MJ: AI Agent Permissions',
                    Fields: ['ID'],
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    ResultType: 'simple'
                }
            ]);

            // Process results in the same order as queries
            if (results && results.length > 0) {
                this.LearningCycles = results[0].Results as MJAIAgentLearningCycleEntity[] || [];

                this.AgentNotes = results[1].Results as MJAIAgentNoteEntity[] || [];

                this.RecentExecutions = results[2].Results as MJAIAgentRunEntityExtended[] || [];
                this.TotalExecutionHistoryCount = results[2].TotalRowCount;

                // Initialize cache with first page of results
                this.allLoadedExecutions = [...this.RecentExecutions];

                // Initialize filtered executions
                this.FilteredExecutions = [...this.RecentExecutions];

                // Determine open-to-everyone state from permissions query
                const permissionRows = results[3]?.Results || [];
                this.IsOpenToEveryone = permissionRows.length === 0;
            }

            // Voice/realtime sessions are a peer record type in the Execution
            // History section — loaded fire-and-forget with their own loading
            // flag so the runs list renders immediately.
            void this.loadAgentSessions();

            // Create snapshot for cancel/revert functionality
            this.createOriginalSnapshot();
        } catch (error) {
            console.error('Error loading related data:', error);
            // Set all counts to 0 on error to ensure UI shows proper empty states
        } finally {
            // Clear loading states
            this.IsLoadingData = false;
            this.LoadingStates = {
                executionHistory: false,
                subAgents: false,
                prompts: false,
                actions: false,
                learningCycles: false,
                notes: false,
                customSection: false,
                searchScopes: false
            };
            // See the comment on the matching call at the top of this method:
            // markForCheck instead of detectChanges so we don't fight the parent
            // CD pass (this method runs inside ngOnInit's await chain).
            this.cdr.markForCheck();
        }
    }

    /**
     * Creates a snapshot of the current UI state for cancel/revert functionality
     * @private
     */
    private createOriginalSnapshot() {
        this.originalSnapshots = {
            agentPrompts: [...this.AgentPrompts], // Deep copy of arrays
            agentActions: [...this.AgentActions],
            subAgents: [...this.SubAgents],
            promptCount: this.PromptCount,
            actionCount: this.ActionCount,
            subAgentCount: this.SubAgentCount,
            learningCycleCount: this.LearningCycleCount,
            noteCount: this.NoteCount,
            executionHistoryCount: this.ExecutionHistoryCount
        };
    }

    /**
     * Navigates to the next page of execution history
     */
    public async GoToNextPage(): Promise<void> {
        if (!this.HasNextPage || this.IsLoadingPage || !this.record?.ID) {
            return;
        }

        const nextPage = this.ExecutionHistoryCurrentPage + 1;
        await this.loadPage(nextPage);
    }

    /** @deprecated Use {@link GoToNextPage}. */
    public async goToNextPage(): Promise<void> {
      return this.GoToNextPage();
    }

    /**
     * Navigates to the previous page of execution history
     */
    public async GoToPreviousPage(): Promise<void> {
        if (!this.HasPreviousPage || this.IsLoadingPage) {
            return;
        }

        const previousPage = this.ExecutionHistoryCurrentPage - 1;
        await this.loadPage(previousPage);
    }

    /** @deprecated Use {@link GoToPreviousPage}. */
    public async goToPreviousPage(): Promise<void> {
      return this.GoToPreviousPage();
    }

    /**
     * Loads a specific page of execution history, using cache when available
     */
    private async loadPage(pageNumber: number): Promise<void> {
        if (!this.record?.ID) {
            return;
        }

        this.IsLoadingPage = true;
        this.cdr.detectChanges();

        try {
            const startIndex = (pageNumber - 1) * this.ExecutionHistoryPageSize;
            const endIndex = startIndex + this.ExecutionHistoryPageSize;

            // Check if we have this page in cache
            const cachedPageData = this.allLoadedExecutions.slice(startIndex, endIndex);
            const hasFullPageInCache = cachedPageData.length === this.ExecutionHistoryPageSize;
            const isLastPage = endIndex >= this.TotalExecutionHistoryCount;
            const hasPartialPageInCache = isLastPage && cachedPageData.length > 0 &&
                                         cachedPageData.length === (this.TotalExecutionHistoryCount - startIndex);

            if (hasFullPageInCache || hasPartialPageInCache) {
                // We have the page in cache (either full page or complete last page)
                this.ExecutionHistoryCurrentPage = pageNumber;
                this.RecentExecutions = cachedPageData;
                await this.applySearchFilter();
            } else {
                // Need to load from database
                const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                const result = await rv.RunView<MJAIAgentRunEntityExtended>({
                    EntityName: 'MJ: AI Agent Runs',
                    Fields: [
                        "ID","AgentID","ParentRunID","Status","StartedAt","CompletedAt",
                        "Success","TotalTokensUsed","TotalCost","TotalCostRollUp","TotalTokensUsedRollUp",
                        "Configuration","ConversationID","Result","ErrorMessage","__mj_CreatedAt"
                    ],
                    ExtraFilter: `AgentID='${this.record.ID}'`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: this.ExecutionHistoryPageSize,
                    StartRow: startIndex > 0 ? startIndex : undefined,
                    ResultType: 'entity_object'
                });

                if (result.Success && result.Results) {
                    // Update cache - ensure we have enough space
                    while (this.allLoadedExecutions.length < startIndex) {
                        this.allLoadedExecutions.push(null as any);
                    }

                    // Insert the new results into cache
                    this.allLoadedExecutions.splice(startIndex, result.Results.length, ...result.Results);

                    this.ExecutionHistoryCurrentPage = pageNumber;
                    this.RecentExecutions = result.Results;
                    await this.applySearchFilter();
                }
            }
        } catch (error) {
            console.error('Error loading page:', error);
        } finally {
            this.IsLoadingPage = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Checks if there is a next page available
     */
    public get HasNextPage(): boolean {
        const maxPage = Math.ceil(this.TotalExecutionHistoryCount / this.ExecutionHistoryPageSize);
        return this.ExecutionHistoryCurrentPage < maxPage;
    }

    /** @deprecated Use {@link HasNextPage}. */
    public get hasNextPage(): boolean {
      return this.HasNextPage;
    }

    /**
     * Checks if there is a previous page available
     */
    public get HasPreviousPage(): boolean {
        return this.ExecutionHistoryCurrentPage > 1;
    }

    /** @deprecated Use {@link HasPreviousPage}. */
    public get hasPreviousPage(): boolean {
      return this.HasPreviousPage;
    }

    /**
     * Gets the total number of pages
     */
    public get TotalPages(): number {
        return Math.ceil(this.TotalExecutionHistoryCount / this.ExecutionHistoryPageSize);
    }

    /** @deprecated Use {@link TotalPages}. */
    public get totalPages(): number {
      return this.TotalPages;
    }

    /**
     * Loads the agent type entity for this agent
     * @private
     */
    private async loadCurrentAgentType(): Promise<void> {
        if (!this.record?.TypeID) {
            return;
        }
        
        try {
            const md = this.ProviderToUse;
            this.AgentType = await md.GetEntityObject<MJAIAgentTypeEntity>('MJ: AI Agent Types');
            if (this.AgentType) {
                await this.AgentType.Load(this.record.TypeID);
            }
        } catch (error) {
            console.error('Error loading agent type:', error);
            this.AgentType = null;
        }
        // The tab strip depends on the type (only some types ship a designer), so it cannot be built
        // until the type is known.
        this.refreshFormTabs();
    }
    
    /**
     * Dynamically loads a custom form section if the agent type defines one
     * @private
     */
    private loadCustomFormSection(): void {
        if (!this.AgentType?.UIFormSectionKey || !this.customSectionContainer) {
            return;
        }

        // Check if component still exists in container
        if (this.customSectionLoaded && this.customSectionContainer.length > 0) {
            return;
        }

        this.LoadingStates.customSection = true;
        this.cdr.markForCheck();

        try {
            // Build the full registration key (Entity.Section pattern)
            const sectionKey = `AI Agents.${this.AgentType.UIFormSectionKey}`;

            // Get the component registration from the class factory
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormSectionComponent, sectionKey);

            if (registration && registration.SubClass) {
                // Clear any existing custom section
                this.customSectionContainer.clear();

                // Create the component
                const componentRef = this.customSectionContainer.createComponent(registration.SubClass);
                this.customSectionComponent = componentRef.instance as BaseFormSectionComponent;
                this.customSectionComponentRef = componentRef;

                // Pass the record and edit mode to the custom section
                this.customSectionComponent.record = this.record;
                this.customSectionComponent.EditMode = this.EditMode;

                // Mark as loaded
                this.customSectionLoaded = true;
            }
        } catch (error) {
            console.error('Error loading custom form section:', error);
        } finally {
            this.LoadingStates.customSection = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Handles state change events for the custom section panel
     * @param event The panel bar state change event
     */
    public OnCustomSectionStateChange(event: { expanded: boolean }): void {
        // When panel is expanded, check if we need to load or reload the custom section
        if (event.expanded && this.AgentType?.UIFormSectionKey) {
            // Always try to load on expand to handle cases where container might have been recreated
            this.setTrackedTimeout(() => {
                this.loadCustomFormSection();
            }, 0);
        }
    }

    /** @deprecated Use {@link OnCustomSectionStateChange}. */
    public onCustomSectionStateChange(event: { expanded: boolean }): void {
      return this.OnCustomSectionStateChange(event);
    }

    // === User Preferences (Header & Section State) ===

    /** Load saved preferences for header state and section expand/collapse */
    private loadUserPreferences(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(MJAIAgentFormComponentExtended.PREFS_KEY);
            if (raw) {
                const prefs = JSON.parse(raw);
                this.HeaderCollapsed = prefs.headerCollapsed ?? false;
                this.SectionStates = prefs.sectionStates ?? {};
                // Validated against the real tab set in refreshFormTabs() — a stored key whose tab no
                // longer exists must not leave every pane hidden.
                this.ActiveFormTab = typeof prefs.activeTab === 'string' ? prefs.activeTab : null;
            }
        } catch (error) {
            console.error('Error loading AI Agent form preferences:', error);
        }
        this.preferencesLoaded = true;
    }

    /** Persist preferences with debounce */
    private persistPreferences(): void {
        if (!this.preferencesLoaded) return;
        const prefs = {
            headerCollapsed: this.HeaderCollapsed,
            sectionStates: this.SectionStates,
            activeTab: this.ActiveFormTab
        };
        UserInfoEngine.Instance.SetSettingDebounced(
            MJAIAgentFormComponentExtended.PREFS_KEY,
            JSON.stringify(prefs)
        );
    }

    /** Toggle the header between expanded and collapsed modes */
    public ToggleHeaderCollapsed(): void {
        this.HeaderCollapsed = !this.HeaderCollapsed;
        this.persistPreferences();
        this.cdr.detectChanges();
    }

    /** Get the expanded state for a panelbar section, falling back to a default */
    public GetSectionExpanded(sectionId: string, defaultValue: boolean): boolean {
        if (this.preferencesLoaded && sectionId in this.SectionStates) {
            return this.SectionStates[sectionId];
        }
        return defaultValue;
    }

    /** Handle panelbar stateChange — fires when any section expands or collapses */
    public OnPanelBarStateChange(event: { items: Array<{ id: string; expanded: boolean }> }): void {
        if (!event?.items) return;
        for (const item of event.items) {
            if (item.id) {
                this.SectionStates[item.id] = item.expanded;

                // Keep existing custom section load logic
                if (item.id === 'custom' && item.expanded) {
                    this.OnCustomSectionStateChange({ expanded: true });
                }
            }
        }
        this.persistPreferences();
    }

    /**
     * Restores the UI to its original state using saved snapshots
     * @private
     */
    private restoreFromSnapshots() {
        if (this.originalSnapshots) {
            // Restore arrays (create new copies to ensure reactivity)
            this.AgentPrompts = [...this.originalSnapshots.agentPrompts];
            this.AgentActions = [...this.originalSnapshots.agentActions];
            this.SubAgents = [...this.originalSnapshots.subAgents];
            
            // Reset other UI state
            this.HasUnsavedChanges = false;
                        
            // Mark for check instead of forcing immediate detection
            this.cdr.markForCheck();
        }
    }

    /**
     * Override CancelEdit to restore UI state when user cancels changes
     */
    public override CancelEdit(): void {
        
        // Set flag to indicate we're performing a cancel operation
        this.isPerformingCancel = true;
        
        try {
            // CRITICAL: Clear our pending records BEFORE calling parent
            // This ensures that any prompt/action/sub-agent changes we added don't persist
            this.PendingRecords.length = 0;
            
            // Call the parent CancelEdit first (this handles main record revert and pending records)
            super.CancelEdit();
            
            // Restore our UI state after parent cancel
            this.restoreFromSnapshots();
            
            // Reset the unsaved changes flag
            this.HasUnsavedChanges = false;
        } finally {
            // Always reset the flag
            this.isPerformingCancel = false;
        }
    }

    /**
     * Opens the integrated test harness for the current agent.
     * Validates that the agent has been saved before allowing testing.
     * Shows a notification if the agent needs to be saved first.
     */
    public OpenTestHarness() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before testing',
                'warning',
                4000
            );
            return;
        }

        // Use the new test harness dialog service
        // Don't pass viewContainerRef so window is top-level
        this.testHarnessService.openForAgent(this.record.ID);
    }

    /** @deprecated Use {@link OpenTestHarness}. */
    public openTestHarness() {
      return this.OpenTestHarness();
    }

    /**
     * Opens the permissions management dialog for this agent.
     * Allows viewing and editing user/role-based permissions for the agent.
     */
    /** Controls visibility of the new permissions dialog from @memberjunction/ng-agents */
    public ShowPermissionsDialog = false;

    /** True when no explicit permission records exist (agent is open to everyone) */
    public IsOpenToEveryone = true;

    public OpenPermissionsDialog() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before managing permissions',
                'warning',
                4000
            );
            return;
        }
        this.ShowPermissionsDialog = true;
    }

    /** @deprecated Use {@link OpenPermissionsDialog}. */
    public openPermissionsDialog() {
      return this.OpenPermissionsDialog();
    }

    public async OnPermissionsDialogClosed() {
        this.ShowPermissionsDialog = false;
        // Refresh open-to-everyone state in case permissions were added/removed
        await this.refreshPermissionState();
    }

    /** @deprecated Use {@link OnPermissionsDialogClosed}. */
    public async onPermissionsDialogClosed() {
      return this.OnPermissionsDialogClosed();
    }

    private async refreshPermissionState(): Promise<void> {
        if (!this.record?.ID) return;
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ID: string}>({
            EntityName: 'MJ: AI Agent Permissions',
            Fields: ['ID'],
            ExtraFilter: `AgentID='${this.record.ID}'`,
            ResultType: 'simple'
        });
        if (result.Success) {
            this.IsOpenToEveryone = (result.Results || []).length === 0;
            this.cdr.markForCheck();
        }
    }

    /**
     * Returns the appropriate color for the agent status badge.
     * Uses standard color coding: green for active, yellow for pending, gray for disabled.
     * @returns CSS color value for the status badge
     */
    public GetStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Active': return 'var(--mj-status-success)';
            case 'Pending': return 'var(--mj-status-warning)';
            case 'Disabled': return 'var(--mj-text-muted)';
            default: return 'var(--mj-text-muted)';
        }
    }

    /** @deprecated Use {@link GetStatusBadgeColor}. */
    public getStatusBadgeColor(): string {
      return this.GetStatusBadgeColor();
    }

    /**
     * Event handler for test harness visibility changes.
     * Updates the component state when the test harness is opened or closed.
     * @param isVisible - Whether the test harness is currently visible
     */

    /**
     * Gets the count of sub-agents
     */
    public GetSubAgentCount(): number {
        return this.SubAgentCount;
    }

    /** @deprecated Use {@link GetSubAgentCount}. */
    public getSubAgentCount(): number {
      return this.GetSubAgentCount();
    }

    /**
     * Gets the count of prompts
     */
    public GetPromptCount(): number {
        return this.PromptCount;
    }

    /** @deprecated Use {@link GetPromptCount}. */
    public getPromptCount(): number {
      return this.GetPromptCount();
    }

    /**
     * Gets the count of actions
     */
    public GetActionCount(): number {
        return this.ActionCount;
    }

    /** @deprecated Use {@link GetActionCount}. */
    public getActionCount(): number {
      return this.GetActionCount();
    }

    /**
     * Gets the icon for the execution mode
     */
    public GetExecutionModeIcon(mode: string): string {
        switch (mode) {
            case 'Sequential':
                return 'fa-solid fa-list-ol';
            case 'Parallel':
                return 'fa-solid fa-layer-group';
            default:
                return 'fa-solid fa-robot';
        }
    }

    /** @deprecated Use {@link GetExecutionModeIcon}. */
    public getExecutionModeIcon(mode: string): string {
      return this.GetExecutionModeIcon(mode);
    }

    /**
     * Gets the agent's display icon
     * Prioritizes LogoURL, falls back to IconClass, then default robot icon
     */
    public GetAgentIcon(): string {
        if (this.record?.LogoURL) {
            // LogoURL is used in img tag, not here
            return '';
        }
        return this.record?.IconClass || 'fa-solid fa-robot';
    }

    /** @deprecated Use {@link GetAgentIcon}. */
    public getAgentIcon(): string {
      return this.GetAgentIcon();
    }

    /**
     * Checks if the agent has a logo URL (for image display)
     */
    public HasLogoURL(): boolean {
        return !!this.record?.LogoURL;
    }

    /** @deprecated Use {@link HasLogoURL}. */
    public hasLogoURL(): boolean {
      return this.HasLogoURL();
    }

    /**
     * Gets the icon for a sub-agent
     * Prioritizes LogoURL, falls back to IconClass, then default robot icon
     */
    public GetSubAgentIcon(subAgent: MJAIAgentEntityExtended): string {
        if (subAgent?.LogoURL) {
            // LogoURL is used in img tag, not here
            return '';
        }
        return subAgent?.IconClass || 'fa-solid fa-robot';
    }

    /** @deprecated Use {@link GetSubAgentIcon}. */
    public getSubAgentIcon(subAgent: MJAIAgentEntityExtended): string {
      return this.GetSubAgentIcon(subAgent);
    }
    
    /**
     * Gets the icon class for an action
     * Falls back to default bolt icon if no IconClass is set
     */
    public GetActionIcon(action: MJActionEntity): string {
        return action?.IconClass || 'fa-solid fa-bolt';
    }

    /** @deprecated Use {@link GetActionIcon}. */
    public getActionIcon(action: MJActionEntity): string {
      return this.GetActionIcon(action);
    }

    /**
     * Checks if a sub-agent has a logo URL
     */
    public HasSubAgentLogoURL(subAgent: MJAIAgentEntityExtended): boolean {
        return !!subAgent?.LogoURL;
    }

    /** @deprecated Use {@link HasSubAgentLogoURL}. */
    public hasSubAgentLogoURL(subAgent: MJAIAgentEntityExtended): boolean {
      return this.HasSubAgentLogoURL(subAgent);
    }

    /**
     * Creates a new sub-agent using the CreateAgentService slide-in panel.
     * Uses the new unified agent creation UI from @memberjunction/ng-agents.
     */
    public async CreateSubAgent() {
        try {
            this.createAgentService.OpenSubAgentSlideIn(
                this.record.ID,
                this.record.Name || 'Agent'
            ).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (dialogResult) => {
                    if (!dialogResult.Cancelled && dialogResult.Result) {
                        await this.handleSubAgentCreated(dialogResult.Result);
                    }
                },
                error: (error) => {
                    console.error('Error in create sub-agent slide-in:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening sub-agent creation panel. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in createSubAgent:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating sub-agent. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link CreateSubAgent}. */
    public async createSubAgent() {
      return this.CreateSubAgent();
    }

    /**
     * Handles the result from the create sub-agent slide-in.
     * Adds entities to PendingRecords for atomic save with parent.
     */
    private async handleSubAgentCreated(result: CreateAgentResult): Promise<void> {
        try {
            const subAgent = result.Agent;

            // Handle deferred sub-agent creation if parent is not saved
            if (!this.record.IsSaved) {
                // Store a temporary reference to the parent - will be resolved during save
                subAgent.Set('_tempParentId', this.record.ID);
            }

            // Add the sub-agent to pending records
            this.PendingRecords.push({
                entityObject: subAgent,
                action: 'save'
            });

            // Add agent prompt links to pending records
            if (result.AgentPrompts) {
                for (const agentPrompt of result.AgentPrompts) {
                    this.PendingRecords.push({
                        entityObject: agentPrompt,
                        action: 'save'
                    });
                }
            }

            // Add agent action links to pending records
            if (result.AgentActions) {
                for (const agentAction of result.AgentActions) {
                    this.PendingRecords.push({
                        entityObject: agentAction,
                        action: 'save'
                    });
                }
            }

            // Update UI to show the new sub-agent
            this.SubAgents.push(subAgent);
            this.HasUnsavedChanges = true;

            // Mark for check instead of forcing immediate detection
            this.cdr.markForCheck();

            MJNotificationService.Instance.CreateSimpleNotification(
                `Sub-agent "${subAgent.Name}" created and will be saved when you save the parent agent`,
                'success',
                4000
            );
        } catch (error) {
            console.error('Error processing created sub-agent:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error processing created sub-agent. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Adds a new prompt to the agent (deferred until save)
     */
    public async AddPrompt() {
        // Get currently linked and pending prompt IDs for pre-selection
        const currentPromptIds = this.AgentPrompts.map(ap => ap.ID);
        const pendingAddIds = this.PendingRecords
            .filter(p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Prompts' && p.action === 'save')
            .map(p => p.entityObject.Get('PromptID'));
        const allLinkedIds = [...currentPromptIds, ...pendingAddIds];
        
        try {
            this.agentManagementService.openPromptSelectorDialog({
                title: 'Add Prompts to Agent',
                multiSelect: true,
                selectedPromptIds: [],
                showCreateNew: true,
                linkedPromptIds: allLinkedIds,
                viewContainerRef: this.viewContainerRef
            }).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (result) => {
                    if (result && result.SelectedPrompts.length > 0) {
                        // Filter out already linked or pending prompts
                        const newPrompts = result.SelectedPrompts.filter(prompt =>
                            !allLinkedIds.some(id => UUIDsEqual(id, prompt.ID))
                        );
                        
                        if (newPrompts.length === 0) {
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'All selected prompts are already linked to this agent',
                                'info',
                                3000
                            );
                            return;
                        }
                        
                        // Add to pending changes (defer until save)
                        const md = this.ProviderToUse;
                        for (const prompt of newPrompts) {
                            const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts');
                            agentPrompt.NewRecord();
                            agentPrompt.AgentID = this.record.ID;
                            agentPrompt.PromptID = prompt.ID;
                            agentPrompt.Status = 'Active';
                            agentPrompt.ExecutionOrder = 1;
                            
                            this.PendingRecords.push({
                                entityObject: agentPrompt,
                                action: 'save'
                            });
                        }
                        
                        this.HasUnsavedChanges = true;
                        
                        // Update UI to show the new prompts (cast to extended type for display)
                        this.AgentPrompts.push(...(newPrompts as MJAIPromptEntityExtended[]));
                        
                        // Mark for check instead of forcing immediate detection
                        this.cdr.markForCheck();
                        
                        // Show success notification
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `${newPrompts.length} prompt${newPrompts.length === 1 ? '' : 's'} will be added when you save the agent`,
                            'info',
                            4000
                        );
                    } else if (result && result.createNew) {
                        // User wants to create a new prompt
                        await this.createNewPrompt();
                    }
                },
                error: (error) => {
                    console.error('Error opening prompt selector:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening prompt selector. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in addPrompt:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding prompts. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link AddPrompt}. */
    public async addPrompt() {
      return this.AddPrompt();
    }

    /**
     * Handle context compression toggle and reset related fields when disabled
     */
    public OnContextCompressionToggle(value: any) {
        const enabled = value === true || value === 'true';
        if (!enabled) {
            // Reset context compression related fields to null when disabled
            this.record.ContextCompressionMessageThreshold = null;
            this.record.ContextCompressionPromptID = null;
            this.record.ContextCompressionMessageRetentionCount = null;
            
            // Mark for check instead of forcing immediate detection
            this.cdr.markForCheck();
        }
    }

    /** @deprecated Use {@link OnContextCompressionToggle}. */
    public onContextCompressionToggle(value: any) {
      return this.OnContextCompressionToggle(value);
    }

    /**
     * Opens the modern Add Action dialog for selecting actions (deferred until save)
     */
    public async ConfigureActions() {
        // Get currently linked and pending action IDs for pre-selection
        const currentActionIds = this.AgentActions.map(aa => aa.ID);
        const pendingAddIds = this.PendingRecords
            .filter(p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Actions' && p.action === 'save')
            .map(p => p.entityObject.Get('ActionID'));
        const allLinkedIds = [...currentActionIds, ...pendingAddIds];
        
        this.agentManagementService.openAddActionDialog({
            agentId: this.record.ID,
            agentName: this.record.Name || 'Agent',
            existingActionIds: allLinkedIds,
            viewContainerRef: this.viewContainerRef
        }).pipe(takeUntil(this.destroy$)).subscribe({
            next: async (selectedActions) => {
                if (selectedActions && selectedActions.length > 0) {
                    // Filter out already linked or pending actions
                    const newActions = selectedActions.filter(action =>
                        !allLinkedIds.some(id => UUIDsEqual(id, action.ID))
                    );
                    
                    if (newActions.length === 0) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'All selected actions are already linked to this agent',
                            'info',
                            3000
                        );
                        return;
                    }
                    
                    // Add to pending changes (defer until save)
                    const md = this.ProviderToUse;
                    for (const action of newActions) {
                        const agentAction = await md.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions');
                        agentAction.NewRecord();
                        agentAction.AgentID = this.record.ID;
                        agentAction.ActionID = action.ID;
                        agentAction.Status = 'Active';
                        
                        this.PendingRecords.push({
                            entityObject: agentAction,
                            action: 'save'
                        });
                    }
                    
                    this.HasUnsavedChanges = true;
                    
                    // Update UI to show the new actions
                    this.AgentActions.push(...newActions);
                    
                    // Mark for check instead of forcing immediate detection
                    this.cdr.markForCheck();
                    
                    // Show success notification
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `${newActions.length} action${newActions.length === 1 ? '' : 's'} will be added when you save the agent`,
                        'info',
                        4000
                    );
                }
            },
            error: (error) => {
                console.error('Error in add action dialog:', error);
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Error opening action selection dialog. Please try again.',
                    'error',
                    3000
                );
            }
        });
    }

    /** @deprecated Use {@link ConfigureActions}. */
    public async configureActions() {
      return this.ConfigureActions();
    }

    /**
     * Gets the status icon for execution runs
     */
    public GetExecutionStatusIcon(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return 'fa-solid fa-check-circle';
            case 'failed':
            case 'error':
                return 'fa-solid fa-exclamation-triangle';
            case 'running':
            case 'in_progress':
                return 'fa-solid fa-spinner fa-spin';
            case 'pending':
                return 'fa-solid fa-clock';
            default:
                return 'fa-solid fa-question-circle';
        }
    }

    /** @deprecated Use {@link GetExecutionStatusIcon}. */
    public getExecutionStatusIcon(status: string): string {
      return this.GetExecutionStatusIcon(status);
    }

    /**
     * Gets the status color for execution runs
     */
    public GetExecutionStatusColor(status: string): string {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'success':
                return 'var(--mj-status-success)';
            case 'failed':
            case 'error':
                return 'var(--mj-status-error)';
            case 'running':
            case 'in_progress':
                return 'var(--mj-status-info)';
            case 'pending':
                return 'var(--mj-status-warning)';
            default:
                return 'var(--mj-text-muted)';
        }
    }

    /** @deprecated Use {@link GetExecutionStatusColor}. */
    public getExecutionStatusColor(status: string): string {
      return this.GetExecutionStatusColor(status);
    }

    // ────────────────────────────────────────────────────────────────────
    // Voice/Realtime Sessions (Execution History peer record type)
    // ────────────────────────────────────────────────────────────────────

    /** Switches the Execution History section between agent runs and voice sessions. */
    public SetExecutionHistoryView(view: 'runs' | 'sessions'): void {
        this.ExecutionHistoryView = view;
    }

    /** @deprecated Use {@link SetExecutionHistoryView}. */
    public setExecutionHistoryView(view: 'runs' | 'sessions'): void {
      return this.SetExecutionHistoryView(view);
    }

    /**
     * Loads the realtime voice sessions this agent participated in — either as
     * the session's co-agent (AIAgentSession.AgentID = this agent) or as the
     * delegation target (Config JSON carries targetAgentID = this agent). The
     * target side can't be expressed as a relational filter, so a pragmatic
     * LIKE over the Config JSON narrows server-side and the parsed Config
     * confirms client-side (false positives are filtered out).
     */
    private async loadAgentSessions(): Promise<void> {
        if (!this.record?.ID || !this.UserCanViewSessions) {
            return;
        }
        this.LoadingSessions = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<AgentSessionListRow>({
                EntityName: 'MJ: AI Agent Sessions',
                Fields: ['ID', 'AgentID', 'Agent', 'UserID', 'User', 'Status', 'ConversationID', 'Conversation',
                         'HostInstanceID', 'Config', 'LastActiveAt', 'ClosedAt', '__mj_CreatedAt'],
                ExtraFilter: `AgentID='${this.record.ID}' OR Config LIKE '%${this.record.ID}%'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'simple'
            });
            if (result.Success) {
                const items = (result.Results ?? [])
                    .map(row => this.buildSessionHistoryItem(row))
                    .filter(item => item.isCoAgent || item.isTarget);
                this.AgentSessions = items;
                this.TotalSessionCount = items.length;
                await this.loadSessionChannelCounts(items);
            } else {
                console.error('Failed to load agent sessions:', result.ErrorMessage);
            }
        } catch (error) {
            console.error('Error loading agent sessions:', error);
        } finally {
            this.LoadingSessions = false;
            this.cdr.markForCheck();
        }
    }

    /** Decorates a raw session row with its role relative to this agent and the resolved target-agent name. */
    private buildSessionHistoryItem(row: AgentSessionListRow): AgentSessionHistoryItem {
        let targetAgentID: string | null = null;
        if (row.Config) {
            try {
                const parsed = JSON.parse(row.Config) as { targetAgentID?: unknown };
                if (typeof parsed.targetAgentID === 'string' && parsed.targetAgentID.length > 0) {
                    targetAgentID = parsed.targetAgentID;
                }
            } catch {
                // malformed Config JSON — treat as no target
            }
        }
        const targetAgent = targetAgentID
            ? AIEngineBase.Instance.Agents?.find(a => UUIDsEqual(a.ID, targetAgentID)) ?? null
            : null;
        return {
            row,
            targetAgentID,
            targetAgentName: targetAgent?.Name ?? null,
            isCoAgent: UUIDsEqual(row.AgentID, this.record.ID),
            isTarget: targetAgentID != null && UUIDsEqual(targetAgentID, this.record.ID),
            channelCount: 0
        };
    }

    /** Counts channel instances per session in one batched query (sessions list is capped at 50). */
    private async loadSessionChannelCounts(items: AgentSessionHistoryItem[]): Promise<void> {
        if (items.length === 0) return;
        const idList = items.map(i => `'${i.row.ID}'`).join(',');
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string; AgentSessionID: string }>({
            EntityName: 'MJ: AI Agent Session Channels',
            Fields: ['ID', 'AgentSessionID'],
            ExtraFilter: `AgentSessionID IN (${idList})`,
            ResultType: 'simple'
        });
        if (result.Success) {
            const counts = new Map<string, number>();
            for (const row of result.Results ?? []) {
                const key = NormalizeUUID(row.AgentSessionID);
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
            for (const item of items) {
                item.channelCount = counts.get(NormalizeUUID(item.row.ID)) ?? 0;
            }
        }
    }

    /** Status color for a session lifecycle status (Active / Idle / Closed). */
    public GetSessionStatusColor(status: string): string {
        switch (status) {
            case 'Active':
                return 'var(--mj-status-success)';
            case 'Idle':
                return 'var(--mj-status-warning)';
            case 'Closed':
                return 'var(--mj-text-muted)';
            default:
                return 'var(--mj-text-muted)';
        }
    }

    /** @deprecated Use {@link GetSessionStatusColor}. */
    public getSessionStatusColor(status: string): string {
      return this.GetSessionStatusColor(status);
    }

    /** Status icon for a session lifecycle status. */
    public GetSessionStatusIcon(status: string): string {
        switch (status) {
            case 'Active':
                return 'fa-solid fa-tower-broadcast';
            case 'Idle':
                return 'fa-solid fa-moon';
            case 'Closed':
                return 'fa-solid fa-circle-stop';
            default:
                return 'fa-solid fa-question-circle';
        }
    }

    /** @deprecated Use {@link GetSessionStatusIcon}. */
    public getSessionStatusIcon(status: string): string {
      return this.GetSessionStatusIcon(status);
    }

    /** Session duration: created → closed (terminal) or last-active (still open). */
    public FormatSessionDuration(item: AgentSessionHistoryItem): string {
        const end = item.row.ClosedAt ?? item.row.LastActiveAt;
        if (!end) return 'N/A';
        return this.FormatExecutionTimeFromDates(
            item.row.__mj_CreatedAt as Date,
            end as Date
        );
    }

    /** @deprecated Use {@link FormatSessionDuration}. */
    public formatSessionDuration(item: AgentSessionHistoryItem): string {
      return this.FormatSessionDuration(item);
    }

    /** Opens an AI Agent Session record (renders via the custom session form). */
    public OpenSessionRecord(sessionId: string): void {
        this.sharedService.OpenEntityRecord('MJ: AI Agent Sessions', CompositeKey.FromID(sessionId));
    }

    /** @deprecated Use {@link OpenSessionRecord}. */
    public openSessionRecord(sessionId: string): void {
      return this.OpenSessionRecord(sessionId);
    }

    public FormatExecutionTimeFromDates(startDate: Date, endDate: Date): string {
        if (!startDate || !endDate) return 'N/A';

        // check to see if we have dates or timestamps
        let startTime;
        let endTime;
        if (typeof startDate === 'string') {
            startTime = new Date(startDate).getTime();
        }
        else if (typeof startDate === 'number') {   
            startTime = startDate;
        }
        else {
            startTime = startDate.getTime();
        }
        if (typeof endDate === 'string') {
            endTime = new Date(endDate).getTime();
        }
        else if (typeof endDate === 'number') {
            endTime = endDate;
        }
        else {
            endTime = endDate.getTime();
        }

        if (isNaN(startTime) || isNaN(endTime)) 
            return 'N/A';        
        const milliseconds = endTime - startTime;
        return this.FormatExecutionTime(milliseconds);
    }

    /** @deprecated Use {@link FormatExecutionTimeFromDates}. */
    public formatExecutionTimeFromDates(startDate: Date, endDate: Date): string {
      return this.FormatExecutionTimeFromDates(startDate, endDate);
    }

    /**
     * Formats execution time
     */
    public FormatExecutionTime(milliseconds: number): string {
        if (!milliseconds) return 'N/A';
        
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(1)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    /** @deprecated Use {@link FormatExecutionTime}. */
    public formatExecutionTime(milliseconds: number): string {
      return this.FormatExecutionTime(milliseconds);
    }

    /**
     * Formats token count with appropriate units (K for thousands, M for millions)
     */
    public FormatTokenCount(tokens: number | null): string {
        if (tokens == null || tokens === 0) return '0';
        
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        } else {
            return tokens.toString();
        }
    }

    /** @deprecated Use {@link FormatTokenCount}. */
    public formatTokenCount(tokens: number | null): string {
      return this.FormatTokenCount(tokens);
    }

    /**
     * Formats cost with appropriate precision
     */
    public FormatCost(cost: number | null): string {
        if (cost == null || cost === 0) return '0.00';
        
        if (cost >= 1) {
            return cost.toFixed(2);
        } else if (cost >= 0.01) {
            return cost.toFixed(3);
        } else {
            return cost.toFixed(4);
        }
    }

    /** @deprecated Use {@link FormatCost}. */
    public formatCost(cost: number | null): string {
      return this.FormatCost(cost);
    }

    /**
     * Gets the running time for an execution that hasn't completed yet
     * Uses a cached timestamp to avoid ExpressionChangedAfterItHasBeenCheckedError
     */
    private _runningTimeCache = new Map<string, { time: string, timestamp: number }>();
    private _runningTimeUpdater: any = null;
    
    public GetRunningTime(startDate: Date): string {
        if (!startDate) return 'N/A';
        
        const startTime = new Date(startDate).getTime();
        if (isNaN(startTime)) return 'N/A';
        
        const cacheKey = startTime.toString();
        const now = Date.now();
        const cached = this._runningTimeCache.get(cacheKey);
        
        // Update cache every second to avoid constant changes
        if (!cached || now - cached.timestamp > 1000) {
            const milliseconds = now - startTime;
            const timeString = this.FormatExecutionTime(milliseconds);
            this._runningTimeCache.set(cacheKey, { time: timeString, timestamp: now });
            
            // Don't trigger change detection here - let the background timer handle it
            return timeString;
        }
        
        return cached.time;
    }

    /** @deprecated Use {@link GetRunningTime}. */
    public getRunningTime(startDate: Date): string {
      return this.GetRunningTime(startDate);
    }

    /**
     * Starts the background timer for updating running times
     */
    private startRunningTimeUpdater() {
        if (!this._runningTimeUpdater) {
            this._runningTimeUpdater = setInterval(() => {
                if (!this.destroy$.closed) {
                    // Force cache refresh by clearing old entries
                    const now = Date.now();
                    for (const [key, cached] of this._runningTimeCache.entries()) {
                        if (now - cached.timestamp > 500) { // Refresh every 500ms
                            this._runningTimeCache.delete(key);
                        }
                    }
                    this.cdr.markForCheck();
                }
            }, 1000); // Update every second
        }
    }

    /**
     * Gets the priority badge color
     */
    public GetPriorityBadgeColor(priority: number): string {
        if (priority <= 1) return 'var(--mj-status-error)'; // High priority - red
        if (priority <= 5) return 'var(--mj-status-warning)'; // Medium priority - yellow
        return 'var(--mj-status-success)'; // Low priority - green
    }

    /** @deprecated Use {@link GetPriorityBadgeColor}. */
    public getPriorityBadgeColor(priority: number): string {
      return this.GetPriorityBadgeColor(priority);
    }

    /**
     * Gets the priority label
     */
    public GetPriorityLabel(priority: number): string {
        if (priority <= 1) return 'High';
        if (priority <= 5) return 'Medium';
        return 'Low';
    }

    /** @deprecated Use {@link GetPriorityLabel}. */
    public getPriorityLabel(priority: number): string {
      return this.GetPriorityLabel(priority);
    }

    /**
     * Navigates to a related entity
     */
    public NavigateToEntity(entityName: string, recordId: string) {
        this.sharedService.OpenEntityRecord(entityName, CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(entityName), recordId));
    }

    /** @deprecated Use {@link NavigateToEntity}. */
    public navigateToEntity(entityName: string, recordId: string) {
      return this.NavigateToEntity(entityName, recordId);
    }
    
    /**
     * Toggles the expanded state of an execution card
     */
    public ToggleExecutionExpanded(executionId: string) {
        this.ExpandedExecutions[executionId] = !this.ExpandedExecutions[executionId];
    }

    /** @deprecated Use {@link ToggleExecutionExpanded}. */
    public toggleExecutionExpanded(executionId: string) {
      return this.ToggleExecutionExpanded(executionId);
    }

    /**
     * Handles search text changes - debounced to avoid excessive processing
     */
    public OnExecutionSearchChange(): void {
        // Debounce search to avoid excessive processing during typing
        if (this._searchDebounceTimer) {
            clearTimeout(this._searchDebounceTimer);
        }

        this._searchDebounceTimer = setTimeout(() => {
            this.applySearchFilter();
        }, 300);
    }

    /** @deprecated Use {@link OnExecutionSearchChange}. */
    public onExecutionSearchChange(): void {
      return this.OnExecutionSearchChange();
    }

    private _searchDebounceTimer: any = null;

    /**
     * Applies search filter across all cached records and loads from database if needed
     */
    private async applySearchFilter(): Promise<void> {
        if (!this.ExecutionSearchText || this.ExecutionSearchText.trim() === '') {
            // No search text - show current page's executions
            this.FilteredExecutions = [...this.RecentExecutions];
            return;
        }

        const searchLower = this.ExecutionSearchText.toLowerCase().trim();

        // First, search across all cached records
        const cachedMatches = this.allLoadedExecutions.filter(execution =>
            execution && execution.ID.toLowerCase().includes(searchLower)
        );

        if (cachedMatches.length > 0) {
            // Found matches in cache
            this.FilteredExecutions = cachedMatches;
        } else {
            // No matches in cache - search database
            await this.searchExecutionsFromDatabase(searchLower);
        }
    }

    /**
     * Searches execution history from database when not found in cache
     */
    private async searchExecutionsFromDatabase(searchText: string): Promise<void> {
        if (!this.record?.ID) {
            return;
        }

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJAIAgentRunEntityExtended>({
                EntityName: 'MJ: AI Agent Runs',
                Fields: [
                    "ID","AgentID","ParentRunID","Status","StartedAt","CompletedAt",
                    "Success","TotalTokensUsed","TotalCost","TotalCostRollUp","TotalTokensUsedRollUp",
                    "Configuration","ConversationID","Result","ErrorMessage","__mj_CreatedAt"
                ],
                ExtraFilter: `AgentID='${this.record.ID}' AND ID LIKE '%${searchText}%'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 100, // Limit search results
                ResultType: 'entity_object'
            });

            if (result.Success && result.Results) {
                this.FilteredExecutions = result.Results;
            } else {
                this.FilteredExecutions = [];
            }
        } catch (error) {
            console.error('Error searching executions:', error);
            this.FilteredExecutions = [];
        }
    }

    /**
     * Opens the full execution record in a new view
     */
    public OpenExecutionRecord(executionId: string) {
        this.sharedService.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(executionId));
    }

    /** @deprecated Use {@link OpenExecutionRecord}. */
    public openExecutionRecord(executionId: string) {
      return this.OpenExecutionRecord(executionId);
    }
    
    /**
     * Gets a preview of the execution result for collapsed view
     */
    public GetExecutionResultPreview(execution: MJAIAgentRunEntityExtended, trimLongMessages: boolean): string {
        try {
            if (!execution.Result) return 'No result';
            
            // Try to parse the result as JSON
            const parsed = JSON.parse(execution.Result);
            
            // Extract the user message if it exists
            if (parsed.returnValue?.nextStep?.userMessage) {
                const message = parsed.returnValue.nextStep.userMessage;
                if (trimLongMessages)
                    return message.length > 120 ? message.substring(0, 120) + '...' : message;
                else
                    return message;
            }
            
            // Otherwise return the stringified result
            const stringified = JSON.stringify(parsed, null, 2);
            if (trimLongMessages)
                return stringified.length > 120 ? stringified.substring(0, 120) + '...' : stringified;
            else
                return stringified;
        } catch {
            // If not JSON, just return the string
            const result = execution.Result || '';
            if (trimLongMessages)
                return result.length > 120 ? result.substring(0, 120) + '...' : result;
            else
                return result;
        }
    }

    /** @deprecated Use {@link GetExecutionResultPreview}. */
    public getExecutionResultPreview(execution: MJAIAgentRunEntityExtended, trimLongMessages: boolean): string {
      return this.GetExecutionResultPreview(execution, trimLongMessages);
    }
    
    /**
     * Gets the full execution result message for expanded view
     */
    public GetExecutionResultMessage(execution: MJAIAgentRunEntityExtended): string {
        try {
            if (!execution.Result) return 'No result';
            
            // Try to parse the result as JSON
            const parsed = JSON.parse(execution.Result);
            
            // Extract the user message if it exists
            if (parsed.returnValue?.nextStep?.userMessage) {
                return parsed.returnValue.nextStep.userMessage;
            }
            
            // Otherwise return the pretty-printed JSON
            return JSON.stringify(parsed, null, 2);
        } catch {
            // If not JSON, just return the string
            return execution.Result || '';
        }
    }

    /** @deprecated Use {@link GetExecutionResultMessage}. */
    public getExecutionResultMessage(execution: MJAIAgentRunEntityExtended): string {
      return this.GetExecutionResultMessage(execution);
    }

    /**
     * Refreshes the related data and updates snapshots
     */
    public async RefreshRelatedData() {
        if (this.record?.ID) {
            await this.loadRelatedCounts(true); // force refresh
            MJNotificationService.Instance.CreateSimpleNotification(
                'Related data refreshed',
                'success',
                2000
            );
        }
    }

    /** @deprecated Use {@link RefreshRelatedData}. */
    public async refreshRelatedData() {
      return this.RefreshRelatedData();
    }

    /**
     * Manually refreshes the snapshot for cancel/revert functionality
     * Useful when you want to reset the "original state" to the current state
     */
    public RefreshSnapshot() {
        this.createOriginalSnapshot();
        MJNotificationService.Instance.CreateSimpleNotification(
            'Current state saved as new baseline',
            'info',
            2000
        );
    }

    /** @deprecated Use {@link RefreshSnapshot}. */
    public refreshSnapshot() {
      return this.RefreshSnapshot();
    }

    /**
     * Debug method to check current pending records state
     * Useful for troubleshooting cancel/revert issues
     */
    public DebugPendingRecords() {
        // Debug method for troubleshooting - console output removed for production
    }

    /** @deprecated Use {@link DebugPendingRecords}. */
    public debugPendingRecords() {
      return this.DebugPendingRecords();
    }

    /**
     * Adds a new note to the agent
     */
    public AddNote() {
        MJNotificationService.Instance.CreateSimpleNotification(
            'Opening new note form...',
            'info',
            2000
        );
        
        // In a full implementation, this would open a new AI Agent Note form
        // with AgentID pre-populated to this.record.ID
    }

    /** @deprecated Use {@link AddNote}. */
    public addNote() {
      return this.AddNote();
    }

    /**
     * Creates a new prompt and links it to the agent
     */
    private async createNewPrompt() {
        try {
            this.agentManagementService.openCreatePromptDialog({
                title: `Create New Prompt for ${this.record.Name || 'Agent'}`,
                initialName: '',
                viewContainerRef: this.viewContainerRef
            }).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (result) => {
                    if (result && result.prompt) {
                        try {
                            // Get current user using proper MJ pattern
                            const md = this.ProviderToUse;
                            const currentUserId = md.CurrentUser.ID;

                            // Add the prompt to PendingRecords (will be saved with agent)
                            this.PendingRecords.push({
                                entityObject: result.prompt,
                                action: 'save'
                            });

                            // Add template to PendingRecords if created
                            if (result.Template) {
                                // Set UserID on template (required field)
                                result.Template.UserID = currentUserId;
                                this.PendingRecords.push({
                                    entityObject: result.Template,
                                    action: 'save'
                                });
                            }

                            // Add template contents to PendingRecords if created
                            if (result.templateContents && result.templateContents.length > 0) {
                                for (const content of result.templateContents) {
                                    // Template content does not have UserID field, no manual user assignment needed
                                    this.PendingRecords.push({
                                        entityObject: content,
                                        action: 'save'
                                    });
                                }
                            }

                            // Create the AI Agent Prompt link
                            const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts');
                            agentPrompt.NewRecord();
                            agentPrompt.AgentID = this.record.ID;
                            agentPrompt.PromptID = result.prompt.ID;
                            agentPrompt.Status = 'Active';
                            agentPrompt.ExecutionOrder = 1;
                            
                            // AI Agent Prompt does not have UserID field, no manual user assignment needed
                            
                            this.PendingRecords.push({
                                entityObject: agentPrompt,
                                action: 'save'
                            });

                            this.HasUnsavedChanges = true;

                            // Update UI to show the new prompt
                            this.AgentPrompts.push(result.prompt);

                            // Trigger change detection to update UI
                            this.cdr.detectChanges();

                            MJNotificationService.Instance.CreateSimpleNotification(
                                `New prompt "${result.prompt.Name}" will be created and linked when you save the agent`,
                                'success',
                                4000
                            );
                        } catch (error) {
                            console.error('Error processing created prompt:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error processing created prompt. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error in create prompt dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening prompt creation dialog. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in createNewPrompt:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error creating new prompt. Please try again.',
                'error',
                3000
            );
        }
    }

    /**
     * Removes a prompt from the agent (deferred until save)
     */
    public async RemovePrompt(prompt: MJAIPromptEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Prompt',
            content: `Are you sure you want to remove the prompt "${prompt.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.Result);
            if (result && typeof result === 'object' && 'text' in result && (result as Record<string, unknown>)['text'] === 'Remove') {
                try {
                    // Check if this is a pending add (not yet in database)
                    const pendingAddIndex = this.PendingRecords.findIndex(
                        p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Prompts' && 
                             p.action === 'save' && 
                             UUIDsEqual(p.entityObject.Get('PromptID'), prompt.ID)
                    );

                    if (pendingAddIndex >= 0) {
                        // Remove from pending adds
                        this.PendingRecords.splice(pendingAddIndex, 1);
                    } else {
                        // Find the existing AI Agent Prompt link record for deferred deletion
                        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                        const linkResult = await rv.RunView<MJAIAgentPromptEntity>({
                            EntityName: 'MJ: AI Agent Prompts',
                            ExtraFilter: `AgentID='${this.record.ID}' AND PromptID='${prompt.ID}'`,
                            ResultType: 'entity_object'
                        });

                        if (linkResult.Success && linkResult.Results && linkResult.Results.length > 0) {
                            const agentPromptToDelete = linkResult.Results[0];
                            
                            // Add to pending deletions
                            this.PendingRecords.push({
                                entityObject: agentPromptToDelete,
                                action: 'delete'
                            });
                        } else {
                            throw new Error('AI Agent Prompt link not found');
                        }
                    }

                    // Remove from UI immediately
                    const promptIndex = this.AgentPrompts.findIndex(p => UUIDsEqual(p.ID, prompt.ID));
                    if (promptIndex >= 0) {
                        this.AgentPrompts.splice(promptIndex, 1);
                    }

                    this.HasUnsavedChanges = true;

                    // Mark for check instead of forcing immediate detection
                    this.cdr.markForCheck();

                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Prompt "${prompt.Name}" will be removed when you save the agent`,
                        'info',
                        4000
                    );
                } catch (error) {
                    console.error('Error removing prompt from agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove prompt',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with dialog:', dialogError);
        }
    }

    /** @deprecated Use {@link RemovePrompt}. */
    public async removePrompt(prompt: MJAIPromptEntityExtended, event: Event) {
      return this.RemovePrompt(prompt, event);
    }

    /**
     * Updates payload field values from code editor
     */
    public UpdatePayloadField(fieldName: string, value: any) {
        if (this.record) {
            // Handle the value - it might be a string or an event
            const newValue = typeof value === 'string' ? value : value?.target?.value || value;
            (this.record as any)[fieldName] = newValue;
        }
    }

    /** @deprecated Use {@link UpdatePayloadField}. */
    public updatePayloadField(fieldName: string, value: any) {
      return this.UpdatePayloadField(fieldName, value);
    }

    /**    
     * Opens the sub-agent selector dialog for adding sub-agents (deferred until save)
     */
    public async AddSubAgents() {
        try {
            // Get list of already pending sub-agent IDs to filter duplicates
            const pendingSubAgentIds = this.PendingRecords
                .filter(p => p.entityObject.EntityInfo.Name === 'MJ: AI Agents' && 
                            p.action === 'save' && 
                            p.entityObject.Get('ParentID') === this.record.ID)
                .map(p => p.entityObject.Get('ID'));
            const existingSubAgentIds = this.SubAgents.map(agent => agent.ID);
            const allLinkedIds = [...pendingSubAgentIds, ...existingSubAgentIds];

            this.agentManagementService.openSubAgentSelectorDialog({
                title: 'Add Sub-Agents',
                multiSelect: true,
                parentAgentId: this.record.ID,
                showCreateNew: true,
                viewContainerRef: this.viewContainerRef
            }).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (result) => {
                    if (result && result.SelectedAgents && result.SelectedAgents.length > 0) {
                        // Filter out already linked or pending agents
                        const newAgents = result.SelectedAgents.filter(agent =>
                            !allLinkedIds.some(id => UUIDsEqual(id, agent.ID))
                        );
                        
                        if (newAgents.length === 0) {
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'All selected agents are already linked to this agent',
                                'info',
                                3000
                            );
                            return;
                        }
                        
                        // Add to pending changes (defer until save)
                        const md = this.ProviderToUse;
                        for (const agent of newAgents) {
                            const subAgentToUpdate = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
                            await subAgentToUpdate.Load(agent.ID);
                            subAgentToUpdate.ParentID = this.record.ID;
                            // Database constraint requires ExposeAsAction = false for sub-agents
                            subAgentToUpdate.ExposeAsAction = false;
                            
                            this.PendingRecords.push({
                                entityObject: subAgentToUpdate,
                                action: 'save'
                            });
                        }
                        
                        this.HasUnsavedChanges = true;
                        
                        // Update UI to show the new sub-agents
                        this.SubAgents.push(...newAgents);
                        
                        // Mark for check instead of forcing immediate detection
                        this.cdr.markForCheck();
                        
                        // Show success notification
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `${newAgents.length} agent${newAgents.length === 1 ? '' : 's'} will be converted to sub-agent${newAgents.length === 1 ? '' : 's'} when you save`,
                            'info',
                            4000
                        );
                    } else if (result && result.CreateNew) {
                        // User wants to create a new sub-agent
                        await this.CreateSubAgent();
                    }
                },
                error: (error) => {
                    console.error('Error opening sub-agent selector:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening sub-agent selector. Please try again.',
                        'error',
                        3000
                    );
                }
            });
        } catch (error) {
            console.error('Error in addSubAgents:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error adding sub-agents. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link AddSubAgents}. */
    public async addSubAgents() {
      return this.AddSubAgents();
    }

    /**
     * Removes a sub-agent from this agent (deferred until save)
     */
    public async RemoveSubAgent(subAgent: MJAIAgentEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Sub-Agent',
            content: `Are you sure you want to remove "${subAgent.Name}" as a sub-agent? This will make it an independent root agent.`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.Result);
            if (result && typeof result === 'object' && 'text' in result && (result as Record<string, unknown>)['text'] === 'Remove') {
                try {
                    // Check if this is a pending add (not yet in database)
                    const pendingAddIndex = this.PendingRecords.findIndex(
                        p => p.entityObject.EntityInfo.Name === 'MJ: AI Agents' && 
                             p.action === 'save' && 
                             UUIDsEqual(p.entityObject.Get('ID'), subAgent.ID) &&
                             p.entityObject.Get('ParentID') === this.record.ID
                    );

                    if (pendingAddIndex >= 0) {
                        // Remove from pending adds
                        this.PendingRecords.splice(pendingAddIndex, 1);
                    } else {
                        // Add to pending removals (will restore to root agent)
                        const md = this.ProviderToUse;
                        const subAgentToUpdate = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
                        await subAgentToUpdate.Load(subAgent.ID);
                        subAgentToUpdate.ParentID = null; // Will become a root agent
                        
                        this.PendingRecords.push({
                            entityObject: subAgentToUpdate,
                            action: 'save'
                        });
                    }

                    // Remove from UI immediately
                    const subAgentIndex = this.SubAgents.findIndex(sa => UUIDsEqual(sa.ID, subAgent.ID));
                    if (subAgentIndex >= 0) {
                        this.SubAgents.splice(subAgentIndex, 1);
                    }

                    this.HasUnsavedChanges = true;

                    // Mark for check instead of forcing immediate detection
                    this.cdr.markForCheck();

                    MJNotificationService.Instance.CreateSimpleNotification(
                        `"${subAgent.Name}" will be removed as a sub-agent when you save`,
                        'info',
                        4000
                    );
                } catch (error) {
                    console.error('Error removing sub-agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove sub-agent',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with dialog:', dialogError);
        }
    }

    /** @deprecated Use {@link RemoveSubAgent}. */
    public async removeSubAgent(subAgent: MJAIAgentEntityExtended, event: Event) {
      return this.RemoveSubAgent(subAgent, event);
    }

    /**
     * Sets the sub-agent filter to show all, child, or related sub-agents
     */
    public SetSubAgentFilter(filter: SubAgentFilterType): void {
        this.SubAgentFilter = filter;
    }

    /** @deprecated Use {@link SetSubAgentFilter}. */
    public setSubAgentFilter(filter: SubAgentFilterType): void {
      return this.SetSubAgentFilter(filter);
    }

    /**
     * Gets the badge color for a sub-agent based on its type
     */
    public GetSubAgentBadgeColor(item: UnifiedSubAgent): string {
        return item.type === 'child' ? 'var(--mj-status-info)' : 'var(--mj-brand-primary)';
    }

    /** @deprecated Use {@link GetSubAgentBadgeColor}. */
    public getSubAgentBadgeColor(item: UnifiedSubAgent): string {
      return this.GetSubAgentBadgeColor(item);
    }

    /**
     * Gets the badge icon for a sub-agent based on its type
     */
    public GetSubAgentBadgeIcon(item: UnifiedSubAgent): string {
        return item.type === 'child' ? 'fa-solid fa-link' : 'fa-solid fa-share-nodes';
    }

    /** @deprecated Use {@link GetSubAgentBadgeIcon}. */
    public getSubAgentBadgeIcon(item: UnifiedSubAgent): string {
      return this.GetSubAgentBadgeIcon(item);
    }

    /**
     * Gets the badge text for a sub-agent based on its type
     */
    public GetSubAgentBadgeText(item: UnifiedSubAgent): string {
        return item.type === 'child' ? 'CHILD' : 'RELATED';
    }

    /** @deprecated Use {@link GetSubAgentBadgeText}. */
    public getSubAgentBadgeText(item: UnifiedSubAgent): string {
      return this.GetSubAgentBadgeText(item);
    }

    /**
     * Gets the payload information string for display
     */
    public GetSubAgentPayloadInfo(item: UnifiedSubAgent): string {
        if (item.type === 'child') {
            return 'Shared Payload';
        } else if (item.relationship?.SubAgentOutputMapping) {
            try {
                const mapping = JSON.parse(item.relationship.SubAgentOutputMapping);
                const entries = Object.entries(mapping);
                if (entries.length === 1 && entries[0][0] === '*') {
                    return `Mapped: * → ${entries[0][1]}`;
                }
                return `Mapped: ${entries.length} path${entries.length === 1 ? '' : 's'}`;
            } catch {
                return 'Mapped Payload';
            }
        }
        return 'No Mapping';
    }

    /** @deprecated Use {@link GetSubAgentPayloadInfo}. */
    public getSubAgentPayloadInfo(item: UnifiedSubAgent): string {
      return this.GetSubAgentPayloadInfo(item);
    }

    /**
     * Opens a dialog to configure the output mapping for a related sub-agent
     */
    public async ConfigureOutputMapping(item: UnifiedSubAgent, event: Event): Promise<void> {
        event.stopPropagation();
        if (item.type !== 'related' || !item.relationship) return;

        // TODO: Implement JSON editor dialog for SubAgentOutputMapping
        MJNotificationService.Instance.CreateSimpleNotification(
            'Output mapping configuration coming soon',
            'info',
            3000
        );
    }

    /** @deprecated Use {@link ConfigureOutputMapping}. */
    public async configureOutputMapping(item: UnifiedSubAgent, event: Event): Promise<void> {
      return this.ConfigureOutputMapping(item, event);
    }

    /**
     * Unlinks a related sub-agent (removes the relationship)
     */
    public async UnlinkRelatedSubAgent(item: UnifiedSubAgent, event: Event): Promise<void> {
        event.stopPropagation();
        if (item.type !== 'related' || !item.relationship) return;

        const confirmDialog = this.dialogService.open({
            title: 'Unlink Related Sub-Agent',
            content: `Are you sure you want to unlink "${item.agent.Name}"? This will remove the relationship but keep the agent itself.`,
            actions: [
                { text: 'Cancel' },
                { text: 'Unlink', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.Result);
            if (result && typeof result === 'object' && 'text' in result && (result as Record<string, unknown>)['text'] === 'Unlink') {
                try {
                    const success = await item.relationship.Delete();
                    if (success) {
                        // Remove from unified list
                        const index = this.allSubAgents.findIndex(s =>
                            s.type === 'related' && UUIDsEqual(s.relationship?.ID, item.relationship!.ID)
                        );
                        if (index >= 0) {
                            this.allSubAgents.splice(index, 1);
                        }

                        this.cdr.markForCheck();

                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Unlinked "${item.agent.Name}" successfully`,
                            'success',
                            3000
                        );
                    } else {
                        throw new Error('Delete operation failed');
                    }
                } catch (error) {
                    console.error('Error unlinking related sub-agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to unlink sub-agent',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with dialog:', dialogError);
        }
    }

    /** @deprecated Use {@link UnlinkRelatedSubAgent}. */
    public async unlinkRelatedSubAgent(item: UnifiedSubAgent, event: Event): Promise<void> {
      return this.UnlinkRelatedSubAgent(item, event);
    }

    /**
     * Removes a child sub-agent (updated to work with UnifiedSubAgent)
     */
    public async RemoveChildSubAgent(item: UnifiedSubAgent, event: Event): Promise<void> {
        // Delegate to existing removeSubAgent method
        await this.RemoveSubAgent(item.agent, event);
    }

    /** @deprecated Use {@link RemoveChildSubAgent}. */
    public async removeChildSubAgent(item: UnifiedSubAgent, event: Event): Promise<void> {
      return this.RemoveChildSubAgent(item, event);
    }

    /**
     * Creates a new child sub-agent (renamed from createSubAgent for clarity)
     */
    public async CreateChildSubAgent(): Promise<void> {
        await this.CreateSubAgent();
    }

    /** @deprecated Use {@link CreateChildSubAgent}. */
    public async createChildSubAgent(): Promise<void> {
      return this.CreateChildSubAgent();
    }

    /**
     * Opens dialog to link an existing agent as a related sub-agent
     */
    public async LinkRelatedSubAgent(): Promise<void> {
        // TODO: Implement dialog to select existing agents and create relationship
        MJNotificationService.Instance.CreateSimpleNotification(
            'Link related sub-agent dialog coming soon',
            'info',
            3000
        );
    }

    /** @deprecated Use {@link LinkRelatedSubAgent}. */
    public async linkRelatedSubAgent(): Promise<void> {
      return this.LinkRelatedSubAgent();
    }

    /**
     * Removes an action from the agent (deferred until save)
     */
    public async RemoveAction(action: MJActionEntity, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        const confirmDialog = this.dialogService.open({
            title: 'Remove Action',
            content: `Are you sure you want to remove the action "${action.Name}" from this agent?`,
            actions: [
                { text: 'Cancel' },
                { text: 'Remove', themeColor: 'error' }
            ],
            width: 450,
            height: 200
        });

        try {
            const result = await firstValueFrom(confirmDialog.Result);
            if (result && typeof result === 'object' && 'text' in result && (result as Record<string, unknown>)['text'] === 'Remove') {
                try {
                // Check if this is a pending add (not yet in database)
                const pendingAddIndex = this.PendingRecords.findIndex(
                    p => p.entityObject.EntityInfo.Name === 'MJ: AI Agent Actions' && 
                         p.action === 'save' && 
                         UUIDsEqual(p.entityObject.Get('ActionID'), action.ID)
                );

                if (pendingAddIndex >= 0) {
                    // Remove from pending adds
                    this.PendingRecords.splice(pendingAddIndex, 1);
                } else {
                    // Find the existing AI Agent Action link record for deferred deletion
                    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                    const linkResult = await rv.RunView<MJAIAgentActionEntity>({
                        EntityName: 'MJ: AI Agent Actions',
                        ExtraFilter: `AgentID='${this.record.ID}' AND ActionID='${action.ID}'`,
                        ResultType: 'entity_object'
                    });

                    if (linkResult.Success && linkResult.Results && linkResult.Results.length > 0) {
                        const agentActionToDelete = linkResult.Results[0];
                        
                        // Add to pending deletions
                        this.PendingRecords.push({
                            entityObject: agentActionToDelete,
                            action: 'delete'
                        });
                    } else {
                        throw new Error('AI Agent Action link not found');
                    }
                }

                // Remove from UI immediately
                const actionIndex = this.AgentActions.findIndex(a => UUIDsEqual(a.ID, action.ID));
                if (actionIndex >= 0) {
                    this.AgentActions.splice(actionIndex, 1);
                }

                this.HasUnsavedChanges = true;

                // Mark for check instead of forcing immediate detection
                this.cdr.markForCheck();

                MJNotificationService.Instance.CreateSimpleNotification(
                    `Action "${action.Name}" will be removed when you save the agent`,
                    'info',
                    4000
                );
                } catch (error) {
                    console.error('Error removing action from agent:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to remove action',
                        'error',
                        3000
                    );
                }
            }
        } catch (dialogError) {
            console.error('Error with action dialog:', dialogError);
        }
    }

    /** @deprecated Use {@link RemoveAction}. */
    public async removeAction(action: MJActionEntity, event: Event) {
      return this.RemoveAction(action, event);
    }

    /**
     * Opens the advanced settings dialog for a prompt
     */
    public async OpenPromptAdvancedSettings(prompt: MJAIPromptEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        try {
            // Find the corresponding MJAIAgentPromptEntity for this prompt
            // Get all agent prompts for validation

            const allAgentPrompts = AIEngineBase.Instance.AgentPrompts.filter(ap => UUIDsEqual(ap.AgentID, this.record.ID));
            const agentPrompt = allAgentPrompts.find(ap => UUIDsEqual(ap.PromptID, prompt.ID));
            if (!agentPrompt) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Unable to find prompt configuration for advanced settings',
                    'error',
                    3000
                );
                return;
            }

            this.agentManagementService.openAgentPromptAdvancedSettingsDialog({
                agentPrompt: agentPrompt,
                allAgentPrompts: allAgentPrompts,
                viewContainerRef: this.viewContainerRef
            }).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (formData) => {
                    if (formData) {
                        try {
                            // Update the agent prompt entity with new values
                            agentPrompt.ExecutionOrder = formData.ExecutionOrder;
                            agentPrompt.Purpose = formData.Purpose;
                            agentPrompt.ConfigurationID = formData.ConfigurationID;
                            agentPrompt.ContextBehavior = formData.ContextBehavior;
                            agentPrompt.ContextMessageCount = formData.ContextMessageCount;
                            agentPrompt.Status = formData.Status;

                            // Save immediately to database
                            const saveResult = await agentPrompt.Save();
                            if (saveResult) {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Prompt settings updated successfully',
                                    'success',
                                    3000
                                );

                                // Refresh the related data to reflect changes
                                await this.loadRelatedCounts(true);
                            } else {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Failed to save prompt settings. Please try again.',
                                    'error',
                                    3000
                                );
                            }
                        } catch (error) {
                            console.error('Error saving prompt advanced settings:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error saving prompt settings. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error opening prompt advanced settings dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening advanced settings. Please try again.',
                        'error',
                        3000
                    );
                }
            });

        } catch (error) {
            console.error('Error in openPromptAdvancedSettings:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error opening prompt advanced settings. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link OpenPromptAdvancedSettings}. */
    public async openPromptAdvancedSettings(prompt: MJAIPromptEntityExtended, event: Event) {
      return this.OpenPromptAdvancedSettings(prompt, event);
    }

    /**
     * Opens the advanced settings dialog for a sub-agent
     */
    public async OpenSubAgentAdvancedSettings(subAgentEntity: MJAIAgentEntityExtended, event: Event) {
        event.stopPropagation(); // Prevent navigation
        
        try {
            // Get all sub-agents under the same parent for validation
            const allSubAgents = AIEngineBase.Instance.Agents.filter(sa => UUIDsEqual(sa.ParentID, subAgentEntity.ParentID));

            this.agentManagementService.openSubAgentAdvancedSettingsDialog({
                subAgent: subAgentEntity,
                allSubAgents: allSubAgents,
                viewContainerRef: this.viewContainerRef
            }).pipe(takeUntil(this.destroy$)).subscribe({
                next: async (formData) => {
                    if (formData) {
                        try {
                            // Update the sub-agent entity with new values
                            subAgentEntity.ExecutionOrder = formData.ExecutionOrder;
                            subAgentEntity.ExecutionMode = formData.ExecutionMode;
                            subAgentEntity.Status = formData.Status;
                            subAgentEntity.TypeID = formData.TypeID;
                            subAgentEntity.ExposeAsAction = formData.ExposeAsAction;

                            // Save immediately to database
                            const saveResult = await subAgentEntity.Save();
                            if (saveResult) {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Sub-agent settings updated successfully',
                                    'success',
                                    3000
                                );

                                // Update the local sub-agent data to reflect changes
                                const localSubAgent = this.SubAgents.find(sa => UUIDsEqual(sa.ID, subAgentEntity.ID));
                                if (localSubAgent) {
                                    localSubAgent.ExecutionOrder = formData.ExecutionOrder;
                                    localSubAgent.ExecutionMode = formData.ExecutionMode;
                                    localSubAgent.Status = formData.Status;
                                    localSubAgent.TypeID = formData.TypeID;
                                    localSubAgent.ExposeAsAction = formData.ExposeAsAction;
                                }

                                // Mark for check instead of forcing immediate detection
                                this.cdr.markForCheck();
                            } else {
                                MJNotificationService.Instance.CreateSimpleNotification(
                                    'Failed to save sub-agent settings. Please try again.',
                                    'error',
                                    3000
                                );
                            }
                        } catch (error) {
                            console.error('Error saving sub-agent advanced settings:', error);
                            MJNotificationService.Instance.CreateSimpleNotification(
                                'Error saving sub-agent settings. Please try again.',
                                'error',
                                3000
                            );
                        }
                    }
                },
                error: (error) => {
                    console.error('Error opening sub-agent advanced settings dialog:', error);
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Error opening advanced settings. Please try again.',
                        'error',
                        3000
                    );
                }
            });

        } catch (error) {
            console.error('Error in openSubAgentAdvancedSettings:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error opening sub-agent advanced settings. Please try again.',
                'error',
                3000
            );
        }
    }

    /** @deprecated Use {@link OpenSubAgentAdvancedSettings}. */
    public async openSubAgentAdvancedSettings(subAgentEntity: MJAIAgentEntityExtended, event: Event) {
      return this.OpenSubAgentAdvancedSettings(subAgentEntity, event);
    }

    /**
     * Override PopulatePendingRecords to preserve our pending records before parent clears them
     * However, during cancel operations, we want to clear all pending records completely
     */
    protected PopulatePendingRecords() {
        // If we're in the middle of a cancel operation, don't preserve pending records
        // The base class CancelEdit will handle reverting pending records appropriately
        if (this.isPerformingCancel) {
            super.PopulatePendingRecords();
            return;
        }

        // IMPORTANT: The parent method clears the pending records array, so we need to preserve
        // any records we've added before calling the parent method during normal operations
        const currentPendingRecords = [...this.PendingRecords]; // Make a copy
        
        // Call parent first to get child component pending records (this clears the array)
        super.PopulatePendingRecords();
        
        // Re-add our preserved records (only during normal save operations)
        for (const record of currentPendingRecords) {
            this.PendingRecords.push(record);
        }
    }

    /** Flag to track if we're currently performing a cancel operation */
    private isPerformingCancel = false;

    /**
     * Override InternalSaveRecord to handle agent-specific transaction logic
     * AI Agent must be saved first since related entities depend on it
     */
    /**
     * The base SaveRecord() method will call this InternalSaveRecord() method
     * after handling validation and pending record population
     */

    protected async InternalSaveRecord(): Promise<boolean> {
        if (!this.record) {
            return false;
        }

        try {
            // Reset context compression fields if EnableContextCompression is false
            if (!this.record.EnableContextCompression) {
                this.record.ContextCompressionMessageThreshold = null;
                this.record.ContextCompressionPromptID = null;
                this.record.ContextCompressionMessageRetentionCount = null;
                this.SelectedContextCompressionPrompt = null;
            }

            const md = this.ProviderToUse;
            const transactionGroup = await md.CreateTransactionGroup();

            // Set transaction group on main record first
            this.record.TransactionGroup = transactionGroup;

            // Save entities in dependency order to avoid foreign key constraint errors
            // We need to save Templates and Template Contents BEFORE the main AI Agent
            // since AI Prompts depend on Templates, and AI Agent Prompts depend on AI Agents
            
            // 1. First save Templates (they have no dependencies)
            const templateRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'MJ: Templates'
            );
            for (const templateRecord of templateRecords) {
                templateRecord.entityObject.TransactionGroup = transactionGroup;
                if (templateRecord.action === 'save') {
                    const saveResult = await templateRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save Template "${templateRecord.entityObject.Get('Name')}". Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await templateRecord.entityObject.Delete();
                }
            }

            // 2. Save Template Contents (depend on Templates)
            const templateContentRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'MJ: Template Contents'
            );
            for (const contentRecord of templateContentRecords) {
                contentRecord.entityObject.TransactionGroup = transactionGroup;
                if (contentRecord.action === 'save') {
                    const saveResult = await contentRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save Template Content. Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await contentRecord.entityObject.Delete();
                }
            }

            // 3. Save AI Prompts (depend on Templates)
            const promptRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'MJ: AI Prompts'
            );
            for (const promptRecord of promptRecords) {
                promptRecord.entityObject.TransactionGroup = transactionGroup;
                if (promptRecord.action === 'save') {
                    const saveResult = await promptRecord.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save AI Prompt "${promptRecord.entityObject.Get('Name')}". Please check the data and try again.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await promptRecord.entityObject.Delete();
                }
            }

            // 4. Save the main AI Agent record (other entity links depend on it)
            // The record transaction group was already set above
            const agentSaveResult = await this.record.Save();
            if (!agentSaveResult) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save AI agent "${this.record.Name}". Please check the data and try again.`,
                    'error',
                    4000
                );
                return false;
            }

            // 4.1. Handle deferred sub-agent creation - set ParentID on any sub-agents created before parent was saved
            const subAgentRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name === 'MJ: AI Agents' && 
                p.action === 'save' && 
                p.entityObject.Get('_tempParentId') === this.record.ID
            );
            
            for (const subAgentRecord of subAgentRecords) {
                // Cast to MJAIAgentEntityExtended to access ParentID property
                const subAgent = subAgentRecord.entityObject as MJAIAgentEntityExtended;
                // Set the proper ParentID now that parent is saved
                subAgent.ParentID = this.record.ID;
                // Clear the temporary reference
                subAgent.Set('_tempParentId', null);
            }

            // 5. Save all other pending records (AI Agent Actions, AI Agent Prompts, etc.)
            const otherRecords = this.PendingRecords.filter(p => 
                p.entityObject.EntityInfo.Name !== 'MJ: Templates' &&
                p.entityObject.EntityInfo.Name !== 'MJ: Template Contents' &&
                p.entityObject.EntityInfo.Name !== 'MJ: AI Prompts'
            );
            for (const record of otherRecords) {
                record.entityObject.TransactionGroup = transactionGroup;
                if (record.action === 'save') {
                    const saveResult = await record.entityObject.Save();
                    if (!saveResult) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            `Failed to save ${record.entityObject.EntityInfo.Name}. Transaction will be rolled back.`,
                            'error',
                            4000
                        );
                        return false;
                    }
                } else {
                    await record.entityObject.Delete();
                }
            }

            // A custom type section (the Flow designer today) may hold edits of its own — steps and
            // paths the form knows nothing about. Queuing them here is what makes the record atomic:
            // before this, the section's Save was the ONLY path that wrote them, so hiding that
            // button would have made flow edits unsavable.
            if (this.customSectionComponent) {
                const contributed = await this.customSectionComponent.ContributeToSave(transactionGroup);
                if (!contributed) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `The ${this.AgentType?.Name ?? 'type'} configuration could not be prepared for saving. Nothing was saved.`,
                        'error',
                        4000
                    );
                    return false;
                }
            }

            // Execute all operations atomically
            const success = await transactionGroup.Submit();
            if (success) {
                // Only now is the section's work actually committed — telling it earlier would mark
                // edits saved that a failed submit had discarded.
                this.customSectionComponent?.OnHostSaveCompleted();

                // Clear our local state since save was successful
                this.HasUnsavedChanges = false;
                
                // Clear pending records since they've been saved
                this.PendingRecords.length = 0;
                
                // Reload related data to reflect database state
                await this.loadRelatedCounts(true);

                MJNotificationService.Instance.CreateSimpleNotification(
                    'AI Agent and all related changes saved successfully',
                    'success',
                    3000
                );
                
                return true;
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Save failed. Please try again.',
                    'error',
                    4000
                );
                return false;
            }
        } catch (error) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
                'error',
                5000
            );
            return false;
        }
    }

    /**
     * Navigates to the parent agent when the "Child of..." badge is clicked
     */
    public NavigateToParentAgent(): void {
        if (this.record.ParentID) {
            this.NavigateToEntity('MJ: AI Agents', this.record.ParentID);
        }
    }

    /** @deprecated Use {@link NavigateToParentAgent}. */
    public navigateToParentAgent(): void {
      return this.NavigateToParentAgent();
    }

    /**
     * Opens the substrate behind an invocation pathway.
     *
     * The Invocations widget names the row but never navigates to it — it is a `widgets`-layer
     * component with no Router by construction. Translating that intent into navigation is exactly
     * the job of this layer.
     */
    public OnInvocationOpenRequested(event: AgentInvocationOpenRequestedEventArgs): void {
        this.NavigateToEntity(event.EntityName, event.RecordID);
    }

    /**
     * Component cleanup - critical for preventing memory leaks
     */
    ngOnDestroy(): void {
        // Signal all subscriptions to complete
        this.destroy$.next();
        this.destroy$.complete();
        
        // Clear all active timeouts
        this.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.activeTimeouts.length = 0;
        
        // Clear running time updater
        if (this._runningTimeUpdater) {
            clearInterval(this._runningTimeUpdater);
            this._runningTimeUpdater = null;
        }
        
        // Clear all data arrays to release memory
        this.SubAgents.length = 0;
        this.AgentPrompts.length = 0;
        this.AgentActions.length = 0;
        this.RecentExecutions.length = 0;
        this.LearningCycles.length = 0;
        this.AgentNotes.length = 0;

        // Reset pagination state
        this.ExecutionHistoryCurrentPage = 1;
        this.TotalExecutionHistoryCount = 0;
        this.IsLoadingPage = false;
        this.allLoadedExecutions = [];

        // Clear maps and objects
        this._permissionCache.clear();
        this._runningTimeCache.clear();
        this.ExpandedExecutions = {};
        this.originalSnapshots = null as any;
        
        // Clean up component references
        if (this.customSectionComponentRef) {
            this.customSectionComponentRef.destroy();
            this.customSectionComponentRef = null;
        }
        this.customSectionComponent = null;
        this.AgentType = null;
    }
    
}
