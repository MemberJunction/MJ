import { Component, OnInit, ChangeDetectorRef, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ActionEntity, ActionParamEntity, ActionResultCodeEntity, ActionCategoryEntity, ActionExecutionLogEntity, ActionLibraryEntity, LibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { ActionFormComponent } from '../../generated/Entities/Action/action.form.component';
import { DialogService } from '@progress/kendo-angular-dialog';
import { ActionParamDialogComponent } from './action-param-dialog.component';

@RegisterClass(BaseFormComponent, 'Actions')
@Component({
    selector: 'mj-action-form',
    templateUrl: './action-form.component.html',
    styleUrls: ['./action-form.component.css']
})
export class ActionFormComponentExtended extends ActionFormComponent implements OnInit {
    public record!: ActionEntity;
    
    // Related entities
    public category: ActionCategoryEntity | null = null;
    public actionParams: ActionParamEntity[] = [];
    public resultCodes: ActionResultCodeEntity[] = [];
    public recentExecutions: ActionExecutionLogEntity[] = [];
    public actionLibraries: ActionLibraryEntity[] = [];
    public libraries: LibraryEntity[] = [];
    
    // Cached filtered params
    private _inputParams: ActionParamEntity[] = [];
    private _outputParams: ActionParamEntity[] = [];
    
    // Track params to delete
    private paramsToDelete: ActionParamEntity[] = [];
    
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
    
    constructor(
        elementRef: ElementRef,
        sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        public cdr: ChangeDetectorRef,
        private dialogService: DialogService
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }

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
        }
    }

    private async loadCategory() {
        if (!this.record.CategoryID) return;
        
        try {
            const md = new Metadata();
            this.category = await md.GetEntityObject<ActionCategoryEntity>('Action Categories');
            if (this.category) {
                await this.category.Load(this.record.CategoryID);
            }
        } catch (error) {
            // Error loading category
        }
    }

    private async loadActionParams() {
        this.isLoadingParams = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<ActionParamEntity>({
                EntityName: 'Action Params',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'Name',
                ResultType: 'entity_object'
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
            this.cdr.detectChanges(); // Force change detection
        }
    }

    private async loadResultCodes() {
        this.isLoadingResultCodes = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<ActionResultCodeEntity>({
                EntityName: 'Action Result Codes',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'IsSuccess DESC, ResultCode',
                ResultType: 'entity_object'
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

    private async loadRecentExecutions() {
        this.isLoadingExecutions = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<ActionExecutionLogEntity>({
                EntityName: 'Action Execution Logs',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'StartedAt DESC',
                MaxRows: 10,
                ResultType: 'entity_object'
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
            const rv = new RunView();
            const result = await rv.RunView<ActionLibraryEntity>({
                EntityName: 'Action Libraries',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'Library',
                ResultType: 'entity_object'
            });
            
            if (result.Success) {
                this.actionLibraries = result.Results || [];
            
                // Load library details
                if (this.actionLibraries.length > 0) {
                    const libraryIds = this.actionLibraries.map(al => al.LibraryID).filter(id => id);
                    const md = new Metadata();
                    this.libraries = [];
                    
                    for (const libId of libraryIds) {
                        const lib = await md.GetEntityObject<LibraryEntity>('Libraries');
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
            const rv = new RunView();
            // Load ALL executions for accurate statistics
            const result = await rv.RunView<ActionExecutionLogEntity>({
                EntityName: 'Action Execution Logs',
                ExtraFilter: `ActionID='${this.record.ID}'`,
                OrderBy: 'StartedAt DESC',
                ResultType: 'entity_object'
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
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#dc3545';
            default: return '#6c757d';
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
        return this.record.Type === 'Generated' ? '#6f42c1' : '#007bff';
    }

    getTypeIcon(): string {
        return this.record.Type === 'Generated' ? 'fa-robot' : 'fa-code';
    }

    getApprovalStatusColor(): string {
        switch (this.record.CodeApprovalStatus) {
            case 'Approved': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Rejected': return '#dc3545';
            default: return '#6c757d';
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
            case 'Input': return '#007bff';
            case 'Output': return '#28a745';
            case 'Both': return '#6f42c1';
            default: return '#6c757d';
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
            this.navigateToEntity('Action Categories', this.record.CategoryID);
        }
    }

    navigateToExecution(executionId: string) {
        this.navigateToEntity('Action Execution Logs', executionId);
    }

    navigateToLibrary(libraryId: string) {
        this.navigateToEntity('Libraries', libraryId);
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

    toggleSection(section: keyof typeof this.expandedSections) {
        this.expandedSections[section] = !this.expandedSections[section];
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
    getInputParams(): ActionParamEntity[] {
        // Sort by IsRequired (required first) then by Name
        return this._inputParams.sort((a, b) => {
            if (a.IsRequired === b.IsRequired) {
                return (a.Name || '').localeCompare(b.Name || '');
            }
            return a.IsRequired ? -1 : 1;
        });
    }

    getOutputParams(): ActionParamEntity[] {
        // Sort by Name
        return this._outputParams.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
    }

    isExecutionSuccess(execution: ActionExecutionLogEntity): boolean {
        const code = execution.ResultCode?.toLowerCase();
        // First check if we have a result code definition
        const resultCode = this.resultCodes.find(rc => rc.ResultCode === execution.ResultCode);
        if (resultCode) {
            return resultCode.IsSuccess;
        }
        // Fallback to common success patterns if no result code defined
        return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
    }

    getExecutionDuration(execution: ActionExecutionLogEntity): number {
        if (!execution.EndedAt) return 0;
        
        const startTime = new Date(execution.StartedAt).getTime();
        const endTime = new Date(execution.EndedAt).getTime();
        const duration = endTime - startTime;
        
        // Return absolute value to handle timezone mismatches
        return Math.abs(duration);
    }

    getSuccessRateColor(): string {
        const rate = this.executionStats.successRate;
        if (rate >= 80) return '#28a745'; // green
        if (rate >= 60) return '#ffc107'; // yellow
        return '#dc3545'; // red
    }

    // Parameter management methods
    async addParameter(type: 'Input' | 'Output' | 'Both') {
        if (!this.EditMode || !this.record.IsSaved) return;
        
        const md = new Metadata();
        const newParam = await md.GetEntityObject<ActionParamEntity>('Action Params');
        
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
            appendTo: this.elementRef.nativeElement
        });
        
        const dialog = dialogRef.content.instance;
        dialog.param = newParam;
        dialog.isNew = true;
        dialog.editMode = true;
        
        dialogRef.result.subscribe(result => {
            if (result && (result as any).save) {
                // Add to local array and mark as new/dirty
                this.actionParams.push(newParam);
                // New params are not saved yet, they'll be detected by !IsSaved
                // Update the filtered arrays
                this.updateParamArrays();
                this.cdr.detectChanges();
            }
        });
    }

    async editParameter(param: ActionParamEntity) {
        const dialogRef = this.dialogService.open({
            content: ActionParamDialogComponent,
            width: 500,
            appendTo: this.elementRef.nativeElement
        });
        
        const dialog = dialogRef.content.instance;
        dialog.param = param;
        dialog.isNew = false;
        dialog.editMode = this.EditMode;
        
        dialogRef.result.subscribe(result => {
            if (result && (result as any).save && this.EditMode) {
                // Param will be dirty from property changes in dialog
                // Update the local arrays
                this.updateParamArrays();
                this.cdr.detectChanges();
            }
        });
    }
    
    onParamClick(param: ActionParamEntity, event: Event) {
        // Prevent event bubbling if clicking on edit/delete buttons
        const target = event.target as HTMLElement;
        if (target.closest('.param-edit-btn') || target.closest('.param-delete-btn')) {
            return;
        }
        
        // Show the parameter dialog
        this.editParameter(param);
    }

    async deleteParameter(param: ActionParamEntity) {
        if (!this.EditMode) return;
        
        if (confirm(`Are you sure you want to delete parameter "${param.Name}"?`)) {
            if (param.IsSaved) {
                // Track for deletion using a separate array
                if (!this.paramsToDelete) this.paramsToDelete = [];
                this.paramsToDelete.push(param);
            } else {
                // Remove from local array if it's new
                const index = this.actionParams.indexOf(param);
                if (index > -1) {
                    this.actionParams.splice(index, 1);
                }
            }
            // Update the filtered arrays
            await this.updateParamArrays();
            this.cdr.detectChanges();
        }
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
    
    // Override to populate pending records with our action params
    protected PopulatePendingRecords() {
        super.PopulatePendingRecords();
        
        // Add our action params to pending records
        if (this.actionParams && this.actionParams.length > 0) {
            for (const param of this.actionParams) {
                if (param.Dirty || (this.paramsToDelete && this.paramsToDelete.includes(param)) || !param.IsSaved) {
                    const action = (this.paramsToDelete && this.paramsToDelete.includes(param)) ? 'delete' : 'save';
                    this.PendingRecords.push({
                        entityObject: param,
                        action: action
                    });
                }
            }
        }
    }
}

// Loader function required for the component to be properly registered
export function LoadActionFormComponentExtended() {
    // This function is called to ensure the form is loaded and registered
}