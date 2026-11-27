import { Component, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { BaseEntity, RunView } from '@memberjunction/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RegisterClass, RegisterClassEx, UUIDsEqual } from '@memberjunction/global';
import {
    BaseFormComponent,
    BaseFormPolicy,
    BaseFormSectionComponent,
    type FormChromeContext,
    type FormChromeSpec,
} from '@memberjunction/ng-base-forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJAIAgentFormComponent } from '../../generated/Entities/MJAIAgent/mjaiagent.form.component';

/**
 * Modern AI Agent entity form host.
 *
 * Renders directly through the CodeGen-generated template (`mjaiagent.form.component.html`),
 * inheriting the full modern MJ forms architecture: `<mj-record-form-container>`,
 * left-nav rail (`AIAgentFormPolicy`), `<mj-form-panel-slot>` contributions,
 * `<mj-form-contributions>`, single-batch row-count prefetching, section search,
 * and live `FormSectionIndicatorCoordinator` dirty/error marks.
 *
 * Domain surfaces (Overview Cockpit, dynamic Agent-Type Studio such as Flow Graph,
 * Prompts, Capabilities, Knowledge & Memory, Guardrails & Payload, Runs & Sessions,
 * Governance, and Realtime) mount as modular `BaseFormPanel` contributions under
 * `packages/Angular/Explorer/core-entity-forms/src/lib/panels/ai-agents/`.
 *
 * This host owns only cross-panel coordination:
 * - Resolving the agent's `MJAIAgentTypeEntity` (shared by Overview & Agent-Type Studio)
 * - Tracking the mounted agent-type `BaseFormSectionComponent` (e.g. Flow editor) so its
 *   unsaved edits surface in `HasAdditionalUnsavedChanges` and commit atomically via
 *   `ContributeToSave(transactionGroup)` during `InternalSaveRecord()`
 * - Hosting `OpenTestHarness()` and `ShowPermissionsDialog` state for toolbar actions & hero
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Agents')
@Component({
    standalone: false,
    selector: 'mj-ai-agent-form',
    templateUrl: '../../generated/Entities/MJAIAgent/mjaiagent.form.component.html',
})
export class MJAIAgentFormComponentExtended extends MJAIAgentFormComponent implements OnDestroy {
    public override record!: MJAIAgentEntityExtended;

    /** Resolved AI Agent Type metadata for the active record. */
    public AgentType: MJAIAgentTypeEntity | null = null;

    /** Emits whenever `AgentType` finishes loading or changes (panels subscribe to re-evaluate gating). */
    public readonly AgentTypeChanged$ = new Subject<MJAIAgentTypeEntity | null>();

    /** Controls visibility of `<mj-agent-permissions-dialog>` rendered by `AgentOverviewPanel`. */
    public ShowPermissionsDialog = false;

    /** True when no explicit `MJ: AI Agent Permissions` rows restrict this agent. */
    public IsOpenToEveryone = true;

    private agentTypeSection: BaseFormSectionComponent | null = null;
    private readonly testHarnessService = inject(AITestHarnessDialogService, { optional: true });
    private lastResolvedTypeId: string | null = null;

    /** Full-width default gives the Overview Cockpit bento and Flow Studio canvas ample breathing room. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' {
        return 'full-width';
    }

    /**
     * Surfaces unsaved edits from a dynamically mounted agent-type section (e.g. Flow Graph steps)
     * to the toolbar dirty state and navigate-away guard.
     */
    public override get HasAdditionalUnsavedChanges(): boolean {
        return this.agentTypeSection?.HasPendingChanges === true;
    }

    public override async ngOnInit(): Promise<void> {
        this.tryResolveAgentTypeSync();
        await super.ngOnInit();
        await Promise.all([
            this.ResolveAgentType(),
            this.RefreshPermissionState(),
        ]);
    }

    /**
     * Synchronously resolves `AgentType` from already-loaded `AIEngineBase` cache before the
     * first change-detection pass so `AgentTypeStudioPanel` (e.g. Flow Studio) mounts on frame 1
     * in its proper `sortKey` position right below Overview.
     */
    private tryResolveAgentTypeSync(): void {
        const typeId = this.record?.TypeID ?? null;
        if (!typeId) return;
        const cached = AIEngineBase.Instance.AgentTypes?.find((t) => UUIDsEqual(t.ID, typeId)) ?? null;
        if (cached) {
            this.AgentType = cached;
            this.lastResolvedTypeId = typeId;
        }
    }

    public override ngOnDestroy(): void {
        this.agentTypeSection = null;
        this.AgentTypeChanged$.complete();
        super.ngOnDestroy();
    }

    /**
     * Registers or clears the active agent-type custom section (e.g. `FlowAgentFormSectionComponent`)
     * so its pending edits and `ContributeToSave` join this record's atomic transaction.
     */
    public RegisterAgentTypeSection(section: BaseFormSectionComponent | null): void {
        this.agentTypeSection = section;
    }

    /** Queues a child entity record to be saved or deleted atomically with this agent. */
    public QueuePendingRecord(entityObject: BaseEntity, action: 'save' | 'delete'): void {
        const existing = this.PendingRecords.find((p) => p.entityObject === entityObject);
        if (existing) {
            existing.action = action;
        } else {
            this.PendingRecords.push({ entityObject, action });
        }
    }

    /** Removes a previously queued unsaved child entity record from `PendingRecords`. */
    public UnqueuePendingRecord(entityObject: BaseEntity): void {
        const idx = this.PendingRecords.findIndex((p) => p.entityObject === entityObject);
        if (idx >= 0) {
            this.PendingRecords.splice(idx, 1);
        }
    }

    /** Resolves `MJAIAgentTypeEntity` from `AIEngineBase` (with provider-scoped RunView fallback). */
    public async ResolveAgentType(force = false): Promise<MJAIAgentTypeEntity | null> {
        const typeId = this.record?.TypeID ?? null;
        if (!force && typeId === this.lastResolvedTypeId && (typeId === null || this.AgentType !== null)) {
            return this.AgentType;
        }
        this.lastResolvedTypeId = typeId;
        if (!typeId) {
            this.AgentType = null;
            this.AgentTypeChanged$.next(null);
            return null;
        }

        try {
            await AIEngineBase.Instance.Config(false);
            const cached = AIEngineBase.Instance.AgentTypes?.find((t) => UUIDsEqual(t.ID, typeId)) ?? null;
            if (cached) {
                this.AgentType = cached;
                this.AgentTypeChanged$.next(cached);
                return cached;
            }
        } catch {
            // Fall back to provider-scoped RunView below
        }

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJAIAgentTypeEntity>({
                EntityName: 'MJ: AI Agent Types',
                ExtraFilter: `ID='${typeId}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            });
            const found = result.Success && result.Results.length > 0 ? result.Results[0] : null;
            this.AgentType = found;
            this.AgentTypeChanged$.next(found);
            return found;
        } catch {
            this.AgentType = null;
            this.AgentTypeChanged$.next(null);
            return null;
        }
    }

    /** Checks whether explicit `MJ: AI Agent Permissions` rows exist for this agent. */
    public async RefreshPermissionState(): Promise<void> {
        if (!this.record?.ID) {
            this.IsOpenToEveryone = true;
            return;
        }
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Permissions',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                ResultType: 'count_only',
            });
            this.IsOpenToEveryone = !result.Success || result.TotalRowCount === 0;
        } catch {
            this.IsOpenToEveryone = true;
        }
    }

    /** Opens the AI Test Harness dialog for this agent. */
    public OpenTestHarness(): void {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before running it.',
                'warning',
                3500,
            );
            return;
        }
        if (this.record.Status !== 'Active') {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Only Active agents can be executed.',
                'warning',
                3500,
            );
            return;
        }
        this.testHarnessService?.openForAgent(this.record.ID);
    }

    /** Opens the Agent Permissions dialog hosted by `AgentOverviewPanel`. */
    public OpenPermissionsDialog(): void {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before managing permissions.',
                'warning',
                3500,
            );
            return;
        }
        this.ShowPermissionsDialog = true;
        this.cdr.markForCheck();
    }

    /** Closes the permissions dialog and refreshes the Open / Restricted status badge. */
    public async OnPermissionsDialogClosed(): Promise<void> {
        this.ShowPermissionsDialog = false;
        await this.RefreshPermissionState();
        this.cdr.markForCheck();
    }

    /**
     * Atomically saves the agent record, any pending child records, AND any pending edits
     * from a mounted agent-type custom section (such as Flow Graph steps/paths) in one
     * `TransactionGroup`.
     */
    protected override async InternalSaveRecord(): Promise<boolean> {
        const hasSectionChanges = this.agentTypeSection?.HasPendingChanges === true;
        if (!hasSectionChanges) {
            const saved = await super.InternalSaveRecord();
            if (saved) {
                await this.ResolveAgentType(true);
            }
            return saved;
        }

        if (!this.record) return false;

        const provider = this.ProviderToUse;
        const tg = await provider.CreateTransactionGroup();
        const originalGroup = this.record.TransactionGroup;
        try {
            this.record.TransactionGroup = tg;
            const recordQueued = await this.record.Save();
            if (!recordQueued) {
                return false;
            }

            for (const pending of this.PendingRecords) {
                pending.entityObject.TransactionGroup = tg;
                if (pending.action === 'save') {
                    const ok = await pending.entityObject.Save();
                    if (!ok) return false;
                } else {
                    const ok = await pending.entityObject.Delete();
                    if (!ok) return false;
                }
            }

            const contributed = await this.agentTypeSection!.ContributeToSave(tg);
            if (!contributed) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `The ${this.AgentType?.Name ?? 'agent type'} configuration could not be prepared for saving. Nothing was saved.`,
                    'error',
                    4000,
                );
                return false;
            }

            const submitted = await tg.Submit();
            if (submitted) {
                this.agentTypeSection?.OnHostSaveCompleted();
                await this.ResolveAgentType(true);
            }
            return submitted;
        } finally {
            this.record.TransactionGroup = originalGroup;
        }
    }
}

/**
 * Form chrome policy for `MJ: AI Agents`.
 * Always uses the modern left-nav rail regardless of section count.
 */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: AI Agents', metadata: { entity: 'MJ: AI Agents' } })
export class AIAgentFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return { ...spec, Layout: 'left-nav' };
    }
}

/** Tree-shake guard — keeps the extended form and chrome policy registered. */
export function LoadMJAIAgentFormComponentExtended(): void {
    /* no-op marker */
}
