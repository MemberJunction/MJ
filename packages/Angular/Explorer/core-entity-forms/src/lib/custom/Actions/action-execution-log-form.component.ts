import { Component, OnInit } from '@angular/core';
import { ActionExecutionLogEntity, ActionEntity, UserEntity } from '@memberjunction/core-entities';
import { RegisterClass, ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { ActionExecutionLogFormComponent } from '../../generated/Entities/ActionExecutionLog/actionexecutionlog.form.component';

interface ActionParameter {
    Name: string;
    Value: unknown;
    Type: 'Input' | 'Output' | 'Both';
}

@RegisterClass(BaseFormComponent, 'Action Execution Logs')
@Component({
  standalone: false,
    selector: 'mj-action-execution-log-form',
    templateUrl: './action-execution-log-form.component.html',
    styleUrls: ['./action-execution-log-form.component.css']
})
export class ActionExecutionLogFormComponentExtended extends ActionExecutionLogFormComponent implements OnInit {
    public record!: ActionExecutionLogEntity;
    
    // Related entities
    public action: ActionEntity | null = null;
    public user: UserEntity | null = null;
    
    // Parameter counts for visibility
    public hasInputParams = false;
    public hasOutputParams = false;
    public hasBothParams = false;
    
    // Loading states
    public isLoadingAction = false;
    public isLoadingUser = false;
    
    // Formatted JSON fields
    public formattedParams: string = '';
    public formattedMessage: string = '';
    public formattedInputParams: string = '';
    public formattedOutputParams: string = '';
    public formattedBothParams: string = '';
    
    // UI state
    public expandedSections = {
        execution: true,
        input: true,
        output: true,
        inputParams: true,
        outputParams: true,
        bothParams: true,
        metadata: false
    };

    async ngOnInit() {
        await super.ngOnInit();
        
        if (this.record?.IsSaved) {
            // Load related data
            await Promise.all([
                this.loadAction(),
                this.loadUser()
            ]);
            
            // Format JSON fields
            this.formatJSONFields();
        }
    }

    private async loadAction() {
        if (!this.record.ActionID) return;
        
        this.isLoadingAction = true;
        try {
            const md = new Metadata();
            this.action = await md.GetEntityObject<ActionEntity>('Actions');
            if (this.action) {
                await this.action.Load(this.record.ActionID);
            }
        } catch (error) {
            console.error('Error loading action:', error);
        } finally {
            this.isLoadingAction = false;
        }
    }

    private async loadUser() {
        if (!this.record.UserID) return;
        
        this.isLoadingUser = true;
        try {
            const md = new Metadata();
            this.user = await md.GetEntityObject<UserEntity>('Users');
            if (this.user) {
                await this.user.Load(this.record.UserID);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        } finally {
            this.isLoadingUser = false;
        }
    }

    private formatJSONFields() {
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        // Format Params with recursive JSON parsing
        if (this.record.Params) {
            try {
                const parsed = JSON.parse(this.record.Params);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                this.formattedParams = JSON.stringify(recursivelyParsed, null, 2);
                
                // Format parameter-specific views if params is an array of ActionParameter objects
                if (Array.isArray(recursivelyParsed)) {
                    this.formatParameterSections(recursivelyParsed as ActionParameter[]);
                }
            } catch (e) {
                this.formattedParams = this.record.Params;
            }
        }
        
        // Format Message field with recursive JSON parsing
        if (this.record.Message) {
            try {
                const parsed = JSON.parse(this.record.Message);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                this.formattedMessage = JSON.stringify(recursivelyParsed, null, 2);
            } catch (e) {
                this.formattedMessage = this.record.Message;
            }
        }
    }

    private formatParameterSections(params: ActionParameter[]) {
        // Reset visibility flags
        this.hasInputParams = false;
        this.hasOutputParams = false;
        this.hasBothParams = false;
        
        // Arrays to collect parameters by type
        const inputParams: ActionParameter[] = [];
        const outputParams: ActionParameter[] = [];
        const bothParams: ActionParameter[] = [];
        
        // Sort parameters by type
        for (const param of params) {
            switch (param.Type) {
                case 'Input':
                    inputParams.push(param);
                    this.hasInputParams = true;
                    break;
                case 'Output':
                    outputParams.push(param);
                    this.hasOutputParams = true;
                    break;
                case 'Both':
                    bothParams.push(param);
                    this.hasBothParams = true;
                    break;
            }
        }
        
        // Format input parameters
        if (inputParams.length > 0) {
            this.formattedInputParams = JSON.stringify(inputParams, null, 2);
        }
        
        // Format output parameters
        if (outputParams.length > 0) {
            this.formattedOutputParams = JSON.stringify(outputParams, null, 2);
        }
        
        // Format both parameters
        if (bothParams.length > 0) {
            this.formattedBothParams = JSON.stringify(bothParams, null, 2);
        }
    }

    // Navigation
    navigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }

    navigateToAction() {
        if (this.record.ActionID) {
            this.navigateToEntity('Actions', this.record.ActionID);
        }
    }

    navigateToUser() {
        if (this.record.UserID) {
            this.navigateToEntity('Users', this.record.UserID);
        }
    }

    // UI Helpers
    getExecutionDuration(): number {
        if (!this.record.StartedAt || !this.record.EndedAt) return 0;
        return new Date(this.record.EndedAt).getTime() - new Date(this.record.StartedAt).getTime();
    }

    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
    }

    getResultCodeColor(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return '#28a745';
        }
        return '#dc3545';
    }

    getResultCodeIcon(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return 'fa-check-circle';
        }
        return 'fa-times-circle';
    }

    // Save handlers for JSON fields
    async saveParams() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.formattedParams);
            this.record.Params = this.formattedParams;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Params field:', e);
            // Could show notification here
        }
    }

    async saveMessage() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.formattedMessage);
            this.record.Message = this.formattedMessage;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Message field:', e);
            // Could show notification here
        }
    }
    
    async copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            // Could show a toast notification here
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    }
}
