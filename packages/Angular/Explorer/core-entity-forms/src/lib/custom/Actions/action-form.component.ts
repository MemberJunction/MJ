import { Component, OnInit, inject, ViewContainerRef } from '@angular/core';
import { MJActionEntity, MJActionEntity_IRuntimeActionConfiguration, MJActionParamEntity, MJActionResultCodeEntity, MJActionCategoryEntity, MJActionExecutionLogEntity, MJActionLibraryEntity, MJLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MJActionFormComponent } from '../../generated/Entities/MJAction/mjaction.form.component';
import { MJDialogService, MJDialogRef } from '@memberjunction/ng-ui-components';
import { ActionParamDialogComponent, ActionResultCodeDialogComponent } from '@memberjunction/ng-actions';

@RegisterClass(BaseFormComponent, 'MJ: Actions')
@Component({
  standalone: false,
    selector: 'mj-action-form',
    templateUrl: './action-form.component.html',
    styleUrls: ['./action-form.component.css']
})
export class MJActionFormComponentExtended extends MJActionFormComponent implements OnInit {
    public record!: MJActionEntity;

    // This form has a fully custom layout (header panel + accordion
    // sections we manage ourselves), so the toolbar's section-search,
    // expand/collapse, manage-sections, and width-toggle widgets don't
    // apply. `CUSTOM_LAYOUT_TOOLBAR_CONFIG` hides the entire right-hand
    // group while keeping favorite / history / tags / list buttons intact.
    public readonly toolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** Custom-layout Action form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    // Related entities
    public category: MJActionCategoryEntity | null = null;
    public actionParams: MJActionParamEntity[] = [];
    public resultCodes: MJActionResultCodeEntity[] = [];
    public recentExecutions: MJActionExecutionLogEntity[] = [];
    public actionLibraries: MJActionLibraryEntity[] = [];
    public libraries: MJLibraryEntity[] = [];
    
    // Cached filtered params
    private _inputParams: MJActionParamEntity[] = [];
    private _outputParams: MJActionParamEntity[] = [];
    
    // Track params to delete
    private paramsToDelete: MJActionParamEntity[] = [];
    
    // Track result codes to delete
    private resultCodesToDelete: MJActionResultCodeEntity[] = [];
    
    // Loading states
    public isLoadingParams = false;
    public isLoadingResultCodes = false;
    public isLoadingExecutions = false;
    public isLoadingLibraries = false;
    
    // UI state
    public expandedSections = {
        overview: true,
        code: true,
        params: true,
        resultCodes: true,
        execution: false,
        configuration: false
    };
    
    // Test harness state
    public showTestHarness = false;
    
    // Execution stats
    public executionStats = {
        totalRuns: 0,
        successRate: 0,
        avgDuration: 0,
        lastRun: null as Date | null
    };
    
    // Code editor config
    public codeLanguage = 'typescript';
    public showCodeComments = false;
    
    private dialogService = inject(MJDialogService);
    private viewContainerRef = inject(ViewContainerRef);
    private sharedService = inject(SharedService);

    async ngOnInit() {
        await super.ngOnInit();
        
        if (this.record?.IsSaved) {
            // Load all related data in parallel
            await Promise.all([
                this.loadCategory(),
                this.loadActionParams(),
                this.loadResultCodes(),
                this.loadRecentExecutions(),
                this.loadActionLibraries(),
                this.loadExecutionStats()
            ]);
            this.cdr.detectChanges();
        }
    }
    
    /**
     * Override InternalSaveRecord to handle Action and related ActionParams in a transaction
     * This follows the same pattern as MJAIAgentFormComponent
     */
    protected async InternalSaveRecord(): Promise<boolean> {
        if (!this.record) {
            return false;
        }
        
        try {
            const md = this.ProviderToUse;
            const transactionGroup = await md.CreateTransactionGroup();
            
            // Set transaction group on the Action record
            this.record.TransactionGroup = transactionGroup;
            
            // Save the Action record first
            const actionSaved = await this.record.Save();
            
            if (!actionSaved) {
                console.error('Failed to save Action record');
                this.sharedService.CreateSimpleNotification('Failed to save Action record', 'error', 5000);
                return false;
            }
            
            // Process all pending records (params and result codes to save or delete)
            for (const pendingRecord of this.PendingRecords) {
                if (pendingRecord.entityObject.EntityInfo.Name === 'MJ: Action Params') {
                    const param = pendingRecord.entityObject as MJActionParamEntity;
                    
                    // Ensure ActionID is set for new params
                    if (!param.ActionID) {
                        param.ActionID = this.record.ID;
                    }
                    
                    param.TransactionGroup = transactionGroup;
                    
                    if (pendingRecord.action === 'save') {
                        const saved = await param.Save();
                        if (!saved) {
                            console.error('Failed to save parameter:', param.Name);
                            return false;
                        }
                    } else if (pendingRecord.action === 'delete') {
                        const deleted = await param.Delete();
                        if (!deleted) {
                            console.error('Failed to delete parameter:', param.Name);
                            return false;
                        }
                    }
                } else if (pendingRecord.entityObject.EntityInfo.Name === 'MJ: Action Result Codes') {
                    const resultCode = pendingRecord.entityObject as MJActionResultCodeEntity;
                    
                    // Ensure ActionID is set for new result codes
                    if (!resultCode.ActionID) {
                        resultCode.ActionID = this.record.ID;
                    }
                    
                    resultCode.TransactionGroup = transactionGroup;
                    
                    if (pendingRecord.action === 'save') {
                        const saved = await resultCode.Save();
                        if (!saved) {
                            console.error('Failed to save result code:', resultCode.ResultCode);
                            return false;
                        }
                    } else if (pendingRecord.action === 'delete') {
                        const deleted = await resultCode.Delete();
                        if (!deleted) {
                            console.error('Failed to delete result code:', resultCode.ResultCode);
                            return false;
                        }
                    }
                }
            }
            
            // Submit the transaction
            const success = await transactionGroup.Submit();
            
            if (success) {
                // Clear pending records after successful save
                this.PendingRecords.length = 0;
                this.paramsToDelete = [];
                this.resultCodesToDelete = [];

                // Note: the base SaveRecord() already emits a "Record saved
                // successfully" toast on success — don't emit another one
                // from here or users get two toasts for one save.

                // Defer the post-save reload so the template's post-save CD
                // pass completes before `actionParams` / `resultCodes` mutate.
                // We also run the reload *silently* (no isLoadingParams flash)
                // and batch the final state into a single `detectChanges()`
                // to avoid NG0100: previously the spinner toggle + array
                // replacement generated multiple interleaved CD passes that
                // saw `actionParams.length` change between check/verify.
                queueMicrotask(() => {
                    void this.reloadAfterSaveSilent();
                });
            }

            return success;
            
        } catch (error) {
            console.error('Error saving Action and parameters:', error);
            this.sharedService.CreateSimpleNotification('Error saving Action: ' + error, 'error', 5000);
            return false;
        }
    }

    private async loadCategory() {
        if (!this.record.CategoryID) return;

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories');
            const loaded = await entity.Load(this.record.CategoryID);
            if (loaded) {
                this.category = entity;
            }
        } catch (error) {
            // Error loading category
        }
    }

    private async loadActionParams() {
        this.isLoadingParams = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJActionParamEntity>({
                EntityName: 'MJ: Action Params',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'Name',
                ResultType: 'entity_object'  // This ensures we get proper entity instances
            });
            
            if (result.Success) {
                this.actionParams = result.Results || [];
                // Update cached filtered params - trim and lowercase Type values to handle any whitespace and case
                this._inputParams = this.actionParams.filter(p => {
                    const type = p.Type?.trim().toLowerCase();
                    return type === 'input' || type === 'both';
                });
                this._outputParams = this.actionParams.filter(p => {
                    const type = p.Type?.trim().toLowerCase();
                    return type === 'output' || type === 'both';
                });
            } else {
                // Failed to load action params
                this.actionParams = [];
                this._inputParams = [];
                this._outputParams = [];
            }
        } catch (error) {
            // Error loading action params
            this.actionParams = [];
            this._inputParams = [];
            this._outputParams = [];
        } finally {
            this.isLoadingParams = false;
        }
    }

    private async loadResultCodes() {
        this.isLoadingResultCodes = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJActionResultCodeEntity>({
                EntityName: 'MJ: Action Result Codes',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'IsSuccess DESC, ResultCode',
                ResultType: 'entity_object'  // This ensures we get proper entity instances
            });
            
            if (result.Success) {
                this.resultCodes = result.Results || [];
            } else {
                // Failed to load result codes
                this.resultCodes = [];
            }
        } catch (error) {
            // Error loading result codes
            this.resultCodes = [];
        } finally {
            this.isLoadingResultCodes = false;
        }
    }

    /**
     * Silent post-save reload. Unlike `loadActionParams` / `loadResultCodes`,
     * this version:
     *   - Does NOT toggle `isLoadingParams` / `isLoadingResultCodes`. No
     *     spinner is needed; the form is already back in read mode.
     *   - Runs both RunViews in parallel off a single network round-trip.
     *   - Commits the results in one synchronous block, then calls
     *     `detectChanges()` once so Angular sees a single CD pass rather
     *     than the three-or-four passes the original flow produced.
     *
     * This is what eliminates the NG0100 "`actionParams.length` changed
     * from 33 to 35" error we were seeing after save: previously the
     * length flipped between the check and verify phases of a CD pass
     * triggered by the spinner-flag updates.
     */
    private async reloadAfterSaveSilent(): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [paramResult, codeResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Action Params',
                    ExtraFilter: `ActionID='${this.record.ID}'`,
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Action Result Codes',
                    ExtraFilter: `ActionID='${this.record.ID}'`,
                    OrderBy: 'IsSuccess DESC, ResultCode',
                    ResultType: 'entity_object'
                }
            ]);

            const params = (paramResult.Success ? paramResult.Results : []) as MJActionParamEntity[];
            const codes = (codeResult.Success ? codeResult.Results : []) as MJActionResultCodeEntity[];

            // Single synchronous commit — all template-observable arrays
            // swap at once, avoiding interleaved CD passes.
            this.actionParams = params;
            this._inputParams = params.filter((p) => {
                const type = p.Type?.trim().toLowerCase();
                return type === 'input' || type === 'both';
            });
            this._outputParams = params.filter((p) => {
                const type = p.Type?.trim().toLowerCase();
                return type === 'output' || type === 'both';
            });
            this.resultCodes = codes;

            this.cdr.detectChanges();
        } catch (e) {
            console.error('Post-save reload failed:', e);
        }
    }

    private async loadRecentExecutions() {
        this.isLoadingExecutions = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJActionExecutionLogEntity>({
                EntityName: 'MJ: Action Execution Logs',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'StartedAt DESC',
                MaxRows: 10 
            });
            
            if (result.Success) {
                this.recentExecutions = result.Results || [];
            } else {
                // Failed to load executions
                this.recentExecutions = [];
            }
        } catch (error) {
            // Error loading executions
            this.recentExecutions = [];
        } finally {
            this.isLoadingExecutions = false;
        }
    }

    private async loadActionLibraries() {
        this.isLoadingLibraries = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJActionLibraryEntity>({
                EntityName: 'MJ: Action Libraries',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'Library' 
            });
            
            if (result.Success) {
                this.actionLibraries = result.Results || [];
            
                // Load library details
                if (this.actionLibraries.length > 0) {
                    const libraryIds = this.actionLibraries.map(al => al.LibraryID).filter(id => id);
                    const md = this.ProviderToUse;
                    this.libraries = [];
                    
                    for (const libId of libraryIds) {
                        const lib = await md.GetEntityObject<MJLibraryEntity>('MJ: Libraries');
                        if (lib && libId) {
                            await lib.Load(libId);
                            this.libraries.push(lib);
                        }
                    }
                }
            }
        } catch (error) {
            // Error loading libraries
        } finally {
            this.isLoadingLibraries = false;
        }
    }

    private async loadExecutionStats() {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            // Load ALL executions for accurate statistics
            const result = await rv.RunView<MJActionExecutionLogEntity>({
                EntityName: 'MJ: Action Execution Logs',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'StartedAt DESC' 
            });
            
            if (result.Success && result.Results && result.Results.length > 0) {
                const allExecutions = result.Results;
                this.executionStats.totalRuns = allExecutions.length;
                
                // Calculate success rate based on result codes
                const successfulRuns = allExecutions.filter(e => {
                    const resultCode = this.resultCodes.find(rc => rc.ResultCode === e.ResultCode);
                    return resultCode?.IsSuccess || false;
                });
                
                this.executionStats.successRate = this.executionStats.totalRuns > 0 
                    ? (successfulRuns.length / this.executionStats.totalRuns) * 100 
                    : 0;
                
                // Calculate average duration from ALL completed executions
                const completedExecutions = allExecutions.filter(e => e.StartedAt && e.EndedAt);
                if (completedExecutions.length > 0) {
                    const totalDuration = completedExecutions.reduce((sum, e) => {
                        const duration = new Date(e.EndedAt!).getTime() - new Date(e.StartedAt).getTime();
                        // Use absolute value to handle any swapped dates
                        return sum + Math.abs(duration);
                    }, 0);
                    this.executionStats.avgDuration = totalDuration / completedExecutions.length;
                }
                
                // Get last run date from most recent execution
                this.executionStats.lastRun = new Date(allExecutions[0].StartedAt);
            }
        } catch (error) {
            // Error loading execution stats
        }
    }

    // UI Helper Methods
    getStatusColor(): string {
        switch (this.record.Status) {
            case 'Active': return 'var(--mj-status-success)';
            case 'Pending': return 'var(--mj-status-warning)';
            case 'Disabled': return 'var(--mj-status-error)';
            default: return 'var(--mj-text-muted)';
        }
    }

    getStatusIcon(): string {
        switch (this.record.Status) {
            case 'Active': return 'fa-check-circle';
            case 'Pending': return 'fa-clock';
            case 'Disabled': return 'fa-ban';
            default: return 'fa-question-circle';
        }
    }

    getTypeColor(): string {
        switch (this.record.Type) {
            case 'Runtime':
                return 'var(--mj-status-warning)';
            case 'Generated':
            case 'Custom':
            default:
                return 'var(--mj-brand-primary)';
        }
    }

    getTypeIcon(): string {
        switch (this.record.Type) {
            case 'Runtime': return 'fa-wand-magic-sparkles';
            case 'Generated': return 'fa-robot';
            case 'Custom':
            default: return 'fa-code';
        }
    }

    // =====================================================================
    // Runtime Actions — approval-UI helpers (Phase 1i)
    //
    // Only relevant when `record.Type === 'Runtime'`. Each method reads the
    // typed `RuntimeActionConfigurationObject` accessor emitted by CodeGen
    // (via the JSONType metadata system) so consumers never hand-parse the
    // raw JSON string. The approval panel uses these to surface the
    // permission set an approver is implicitly blessing.
    // =====================================================================

    public get isRuntimeAction(): boolean {
        return this.record?.Type === 'Runtime';
    }

    public get runtimeConfig(): MJActionEntity_IRuntimeActionConfiguration | null {
        if (!this.isRuntimeAction) return null;
        const accessor = (this.record as unknown as {
            RuntimeActionConfigurationObject?: MJActionEntity_IRuntimeActionConfiguration | null;
        });
        return accessor.RuntimeActionConfigurationObject ?? null;
    }

    public getAllowedEntities(): Array<{ id: string; name: string }> {
        return this.runtimeConfig?.permissions?.allowedEntities ?? [];
    }

    public getAllowedActions(): Array<{ id: string; name: string }> {
        return this.runtimeConfig?.permissions?.allowedActions ?? [];
    }

    public getAllowedAgents(): Array<{ id: string; name: string }> {
        return this.runtimeConfig?.permissions?.allowedAgents ?? [];
    }

    public getRequestedLibraries(): Array<{ name: string; version?: string }> {
        return this.runtimeConfig?.sandbox?.additionalLibraries ?? [];
    }

    public getRuntimeLimits(): { maxMemoryMB: number; maxBridgeCalls: number } {
        const limits = this.runtimeConfig?.limits ?? {};
        return {
            maxMemoryMB: limits.maxMemoryMB ?? 128,
            maxBridgeCalls: limits.maxBridgeCalls ?? 100
        };
    }

    public getRuntimeConfigSummary(): string {
        const perms = this.runtimeConfig?.permissions;
        if (!perms) return 'No permissions declared';
        const e = perms.allowedEntities?.length ?? 0;
        const a = perms.allowedActions?.length ?? 0;
        const ag = perms.allowedAgents?.length ?? 0;
        const wildcards = this.getWildcardFlags();
        const parts: string[] = [];
        parts.push(wildcards.entity ? 'ANY entity' : `${e} entit${e === 1 ? 'y' : 'ies'}`);
        parts.push(wildcards.action ? 'ANY action' : `${a} action${a === 1 ? '' : 's'}`);
        parts.push(wildcards.agent ? 'ANY agent' : `${ag} agent${ag === 1 ? '' : 's'}`);
        return parts.join(', ');
    }

    /**
     * Returns which wildcard permission flags are set on the runtime
     * configuration. Any `true` flag is a prominent security-relevant
     * concession to the action — the approval UI renders a warning banner
     * when any of these are on so the approver sees the blast radius.
     */
    public getWildcardFlags(): { entity: boolean; action: boolean; agent: boolean; any: boolean } {
        const perms = this.runtimeConfig?.permissions as
            | { allowAnyEntity?: boolean; allowAnyAction?: boolean; allowAnyAgent?: boolean }
            | undefined;
        const entity = perms?.allowAnyEntity === true;
        const action = perms?.allowAnyAction === true;
        const agent = perms?.allowAnyAgent === true;
        return { entity, action, agent, any: entity || action || agent };
    }

    /**
     * Both Generated and Runtime actions carry executable code gated by
     * `CodeApprovalStatus` — the RuntimeActionExecutor refuses to run
     * anything that isn't `Approved`, and CodeGen blocks unapproved
     * Generated code from being emitted. Custom actions run registered
     * TypeScript classes and don't have this gate.
     *
     * Getter rather than method so Angular's change detector can't
     * observe inconsistent results across check/verify passes — this
     * is the standard fix for NG0100 when a conditional's expression
     * depends on a method call.
     */
    get hasCodeApproval(): boolean {
        return this.record?.Type === 'Generated' || this.record?.Type === 'Runtime';
    }

    getApprovalStatusColor(): string {
        switch (this.record.CodeApprovalStatus) {
            case 'Approved': return 'var(--mj-status-success)';
            case 'Pending': return 'var(--mj-status-warning)';
            case 'Rejected': return 'var(--mj-status-error)';
            default: return 'var(--mj-text-muted)';
        }
    }

    getApprovalStatusIcon(): string {
        switch (this.record.CodeApprovalStatus) {
            case 'Approved': return 'fa-check-circle';
            case 'Pending': return 'fa-clock';
            case 'Rejected': return 'fa-times-circle';
            default: return 'fa-question-circle';
        }
    }

    getParamTypeIcon(type: string): string {
        switch (type) {
            case 'Input': return 'fa-sign-in-alt';
            case 'Output': return 'fa-sign-out-alt';
            case 'Both': return 'fa-exchange-alt';
            default: return 'fa-question';
        }
    }

    getParamTypeColor(type: string): string {
        switch (type) {
            case 'Input': return 'var(--mj-brand-primary)';
            case 'Output': return 'var(--mj-status-success)';
            case 'Both': return 'var(--mj-brand-primary)';
            default: return 'var(--mj-text-muted)';
        }
    }

    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    }

    formatDate(date: Date | string | null): string {
        if (!date) return 'Never';
        const d = typeof date === 'string' ? new Date(date) : date;
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
        
        return d.toLocaleDateString();
    }

    // Navigation
    navigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }

    navigateToCategory() {
        if (this.record.CategoryID) {
            this.navigateToEntity('MJ: Action Categories', this.record.CategoryID);
        }
    }

    navigateToExecution(executionId: string) {
        this.navigateToEntity('MJ: Action Execution Logs', executionId);
    }

    navigateToLibrary(libraryId: string) {
        this.navigateToEntity('MJ: Libraries', libraryId);
    }

    // Actions
    openTestHarness() {
        if (!this.record || !this.record.ID || !this.record.IsSaved || this.record.Status !== 'Active') {
            // Cannot open test harness: Action must be saved and active
            return;
        }
        
        this.showTestHarness = true;
    }
    
    /**
     * Event handler for test harness visibility changes
     */
    public onTestHarnessVisibilityChanged(isVisible: boolean) {
        this.showTestHarness = isVisible;
    }

    async regenerateCode() {
        if (!this.EditMode) return;
        
        this.record.ForceCodeGeneration = true;
        await this.record.Save();
        // Reload related data after save
        await this.loadResultCodes();
    }

    toggleCodeComments() {
        this.showCodeComments = !this.showCodeComments;
    }

    async approveCode() {
        if (!this.EditMode) return;
        
        this.record.CodeApprovalStatus = 'Approved';
        this.record.CodeApprovedAt = new Date();
        // Note: CodeApprovedByUserID would be set server-side
        await this.record.Save();
    }

    async rejectCode() {
        if (!this.EditMode) return;

        this.record.CodeApprovalStatus = 'Rejected';
        await this.record.Save();
    }

    async copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            // Could add a notification here
        } catch (err) {
            // Failed to copy
        }
    }

    // Helper methods for template filtering
    getInputParams(): MJActionParamEntity[] {
        // Sort by IsRequired (required first) then by Name
        return this._inputParams.sort((a, b) => {
            if (a.IsRequired === b.IsRequired) {
                return (a.Name || '').localeCompare(b.Name || '');
            }
            return a.IsRequired ? -1 : 1;
        });
    }

    getOutputParams(): MJActionParamEntity[] {
        // Sort by Name
        return this._outputParams.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }

    isExecutionSuccess(execution: MJActionExecutionLogEntity): boolean {
        const code = execution.ResultCode?.toLowerCase();
        // First check if we have a result code definition
        const resultCode = this.resultCodes.find(rc => rc.ResultCode === execution.ResultCode);
        if (resultCode) {
            return resultCode.IsSuccess;
        }
        // Fallback to common success patterns if no result code defined
        return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
    }

    getExecutionDuration(execution: MJActionExecutionLogEntity): number {
        if (!execution.EndedAt) return 0;
        
        const startTime = new Date(execution.StartedAt).getTime();
        const endTime = new Date(execution.EndedAt).getTime();
        const duration = endTime - startTime;
        
        // Return absolute value to handle timezone mismatches
        return Math.abs(duration);
    }

    getSuccessRateColor(): string {
        const rate = this.executionStats.successRate;
        if (rate >= 80) return 'var(--mj-status-success)';
        if (rate >= 60) return 'var(--mj-status-warning)';
        return 'var(--mj-status-error)';
    }

    // Parameter management methods
    async addParameter(type: 'Input' | 'Output' | 'Both') {
        if (!this.EditMode || !this.record.IsSaved) return;
        
        const md = this.ProviderToUse;
        const newParam = await md.GetEntityObject<MJActionParamEntity>('MJ: Action Params');
        
        // Set default values
        newParam.ActionID = this.record.ID;
        newParam.Name = '';
        newParam.Type = type;
        newParam.ValueType = 'Scalar';
        newParam.IsRequired = false;
        newParam.IsArray = false;
        
        const dialogRef = this.dialogService.open({
            content: ActionParamDialogComponent,
            width: 500,
            appendTo: this.viewContainerRef
        });

        const dialog = dialogRef.Content!.instance;
        dialog['param'] = newParam;
        dialog['isNew'] = true;
        dialog['editMode'] = true;

        dialogRef.Result.subscribe(result => {
            if (result && typeof result === 'object' && 'save' in result) {
                // The dialog has already modified the newParam entity directly
                // New entities are automatically dirty (IsSaved = false)

                // Add to local array
                this.actionParams.push(newParam);

                // Add to pending records for saving
                this.PendingRecords.push({
                    entityObject: newParam,
                    action: 'save'
                });

                // Update the filtered arrays
                this.updateParamArrays();
                this.cdr.detectChanges();
            }
        });
    }

    async editParameter(param: MJActionParamEntity) {
        const dialogRef = this.dialogService.open({
            content: ActionParamDialogComponent,
            width: 500,
            appendTo: this.viewContainerRef
        });

        const dialog = dialogRef.Content!.instance;
        dialog['param'] = param;
        dialog['isNew'] = false;
        dialog['editMode'] = this.EditMode;

        dialogRef.Result.subscribe(result => {
            if (result && typeof result === 'object' && 'save' in result && this.EditMode) {
                // Param will be dirty from property changes in dialog
                // Ensure it's in pending records if modified
                if (param.Dirty) {
                    const exists = this.PendingRecords.some(pr =>
                        pr.entityObject === param && pr.action === 'save'
                    );
                    if (!exists) {
                        this.PendingRecords.push({
                            entityObject: param,
                            action: 'save'
                        });
                    }
                }

                // Update the local arrays
                this.updateParamArrays();
                this.cdr.detectChanges();
            }
        });
    }
    
    onParamClick(param: MJActionParamEntity, event: Event) {
        // Prevent event bubbling if clicking on edit/delete buttons
        const target = event.target as HTMLElement;
        if (target.closest('.param-edit-btn') || target.closest('.param-delete-btn')) {
            return;
        }
        
        // Show the parameter dialog
        this.editParameter(param);
    }

    
    private async updateParamArrays() {
        // Update cached filtered params - exclude deleted items
        const activeParams = this.actionParams.filter(p => !this.paramsToDelete || !this.paramsToDelete.includes(p));
        
        this._inputParams = activeParams.filter(p => {
            const type = p.Type?.trim().toLowerCase();
            return type === 'input' || type === 'both';
        });
        
        this._outputParams = activeParams.filter(p => {
            const type = p.Type?.trim().toLowerCase();
            return type === 'output' || type === 'both';
        });
    }
    
    // Override to populate pending records with our action params and result codes
    protected PopulatePendingRecords() {
        // Preserve existing pending records before base class clears them
        const currentPendingRecords = [...this.PendingRecords];
        
        // Call parent to handle child components
        super.PopulatePendingRecords();
        
        // Re-add our preserved records
        for (const record of currentPendingRecords) {
            // Only re-add if it's an Action Param or Result Code (avoid duplicates)
            if (record.entityObject.EntityInfo.Name === 'MJ: Action Params' || 
                record.entityObject.EntityInfo.Name === 'MJ: Action Result Codes') {
                const exists = this.PendingRecords.some(pr => 
                    pr.entityObject === record.entityObject
                );
                if (!exists) {
                    this.PendingRecords.push(record);
                }
            }
        }
        
        // Add action params that need saving
        for (const param of this.actionParams) {
            if (!param.IsSaved || param.Dirty) {
                // Check if not already in pending records
                const exists = this.PendingRecords.some(pr => 
                    pr.entityObject === param
                );
                if (!exists) {
                    this.PendingRecords.push({
                        entityObject: param,
                        action: 'save'
                    });
                }
            }
        }
        
        // Add params marked for deletion
        for (const param of this.paramsToDelete) {
            if (param.IsSaved) {
                // Check if not already in pending records
                const exists = this.PendingRecords.some(pr => 
                    pr.entityObject === param
                );
                if (!exists) {
                    this.PendingRecords.push({
                        entityObject: param,
                        action: 'delete'
                    });
                }
            }
        }
        
        // Add result codes that need saving
        for (const resultCode of this.resultCodes) {
            if (!resultCode.IsSaved || resultCode.Dirty) {
                // Check if not already in pending records
                const exists = this.PendingRecords.some(pr => 
                    pr.entityObject === resultCode
                );
                if (!exists) {
                    this.PendingRecords.push({
                        entityObject: resultCode,
                        action: 'save'
                    });
                }
            }
        }
        
        // Add result codes marked for deletion
        for (const resultCode of this.resultCodesToDelete) {
            if (resultCode.IsSaved) {
                // Check if not already in pending records
                const exists = this.PendingRecords.some(pr => 
                    pr.entityObject === resultCode
                );
                if (!exists) {
                    this.PendingRecords.push({
                        entityObject: resultCode,
                        action: 'delete'
                    });
                }
            }
        }
    }
    
    /**
     * Gets the action's display icon
     * Falls back to default cog icon if no IconClass is set
     */
    public getActionIcon(): string {
        return this.record?.IconClass || 'fa-solid fa-cog';
    }
    
    // Result Code management methods
    async addResultCode() {
        if (!this.EditMode || !this.record.IsSaved) return;
        
        const md = this.ProviderToUse;
        const newResultCode = await md.GetEntityObject<MJActionResultCodeEntity>('MJ: Action Result Codes');
        
        // Set default values
        newResultCode.ActionID = this.record.ID;
        newResultCode.ResultCode = '';
        newResultCode.Description = '';
        newResultCode.IsSuccess = false;
        
        const dialogRef = this.dialogService.open({
            content: ActionResultCodeDialogComponent,
            width: 500,
            appendTo: this.viewContainerRef
        });

        const dialog = dialogRef.Content!.instance;
        dialog['resultCode'] = newResultCode;
        dialog['isNew'] = true;
        dialog['editMode'] = true;

        dialogRef.Result.subscribe(result => {
            if (result && typeof result === 'object' && 'save' in result) {
                // Add to local array
                this.resultCodes.push(newResultCode);

                // Add to pending records for saving
                this.PendingRecords.push({
                    entityObject: newResultCode,
                    action: 'save'
                });

                this.cdr.detectChanges();
            }
        });
    }
    
    async editResultCode(resultCode: MJActionResultCodeEntity) {
        const dialogRef = this.dialogService.open({
            content: ActionResultCodeDialogComponent,
            width: 500,
            appendTo: this.viewContainerRef
        });

        const dialog = dialogRef.Content!.instance;
        dialog['resultCode'] = resultCode;
        dialog['isNew'] = false;
        dialog['editMode'] = this.EditMode;

        dialogRef.Result.subscribe(result => {
            if (result && typeof result === 'object' && 'save' in result && this.EditMode) {
                // Ensure it's in pending records if modified
                if (resultCode.Dirty) {
                    const exists = this.PendingRecords.some(pr =>
                        pr.entityObject === resultCode && pr.action === 'save'
                    );
                    if (!exists) {
                        this.PendingRecords.push({
                            entityObject: resultCode,
                            action: 'save'
                        });
                    }
                }

                this.cdr.detectChanges();
            }
        });
    }
    
    onResultCodeClick(resultCode: MJActionResultCodeEntity, event: Event) {
        // Prevent event bubbling if clicking on edit/delete buttons
        const target = event.target as HTMLElement;
        if (target.closest('.result-edit-btn') || target.closest('.result-delete-btn')) {
            return;
        }
        
        // Show the result code dialog
        this.editResultCode(resultCode);
    }
    
    /**
     * Delete a result code (marks for deletion on save)
     */
    deleteResultCode(resultCode: MJActionResultCodeEntity) {
        if (!this.EditMode) return;
        
        // Remove from main array
        const index = this.resultCodes.indexOf(resultCode);
        if (index > -1) {
            this.resultCodes.splice(index, 1);
        }
        
        // Handle pending records
        if (resultCode.IsSaved) {
            // Add to deletion list for saved result codes
            this.resultCodesToDelete.push(resultCode);
            
            // Add to pending records for deletion
            this.PendingRecords.push({
                entityObject: resultCode,
                action: 'delete'
            });
        } else {
            // For unsaved result codes, just remove from pending records
            const pendingIndex = this.PendingRecords.findIndex(pr => 
                pr.entityObject === resultCode && pr.action === 'save'
            );
            if (pendingIndex >= 0) {
                this.PendingRecords.splice(pendingIndex, 1);
            }
        }
        
        this.cdr.detectChanges();
    }
    
    /**
     * Delete a parameter (marks for deletion on save)
     */
    deleteParameter(param: MJActionParamEntity) {
        if (!this.EditMode) return;
        
        // Remove from main array
        const index = this.actionParams.indexOf(param);
        if (index > -1) {
            this.actionParams.splice(index, 1);
        }
        
        // Handle pending records
        if (param.IsSaved) {
            // Add to deletion list for saved params
            this.paramsToDelete.push(param);
            
            // Add to pending records for deletion
            this.PendingRecords.push({
                entityObject: param,
                action: 'delete'
            });
        } else {
            // For unsaved params, just remove from pending records
            const pendingIndex = this.PendingRecords.findIndex(pr => 
                pr.entityObject === param && pr.action === 'save'
            );
            if (pendingIndex >= 0) {
                this.PendingRecords.splice(pendingIndex, 1);
            }
        }
        
        // Update filtered arrays
        this.updateParamArrays();
        this.cdr.detectChanges();
    }
}
