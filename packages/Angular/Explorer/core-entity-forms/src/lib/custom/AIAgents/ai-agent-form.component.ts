import { Component, OnInit } from '@angular/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AIAgentFormComponent } from '../../generated/Entities/AIAgent/aiagent.form.component';
import { ChatMessage } from '@memberjunction/ai';

@RegisterClass(BaseFormComponent, 'AI Agents')
@Component({
    selector: 'mj-ai-agent-form',
    templateUrl: './ai-agent-form.component.html',
    styleUrls: ['./ai-agent-form.component.css']
})
export class AIAgentFormComponentExtended extends AIAgentFormComponent implements OnInit {
    public record!: AIAgentEntity;
    public showExecutionDialog = false;
    
    private _metadata = new Metadata();

    async ngOnInit() {
        await super.ngOnInit();
    }

    /**
     * Determines if the agent can be executed
     */
    public get canExecute(): boolean {
        return !!(this.record?.ID && 
                  this.record.Status === 'Active');
    }

    /**
     * Executes the AI agent
     */
    public executeAIAgent() {
        if (!this.record?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before executing',
                'warning',
                4000
            );
            return;
        }

        if (this.record.Status !== 'Active') {
            MJNotificationService.Instance.CreateSimpleNotification(
                'AI agent must be Active to execute',
                'warning',
                4000
            );
            return;
        }

        this.showExecutionDialog = true;
    }

    /**
     * Gets status badge color
     */
    public getStatusBadgeColor(): string {
        switch (this.record?.Status) {
            case 'Active': return '#28a745';
            case 'Pending': return '#ffc107';
            case 'Disabled': return '#6c757d';
            default: return '#6c757d';
        }
    }

    /**
     * Handles when execution dialog is closed
     */
    public onExecutionDialogClosed() {
        this.showExecutionDialog = false;
    }
}

export function LoadAIAgentFormComponentExtended() {
    // This function is called to ensure the component is loaded and registered
}