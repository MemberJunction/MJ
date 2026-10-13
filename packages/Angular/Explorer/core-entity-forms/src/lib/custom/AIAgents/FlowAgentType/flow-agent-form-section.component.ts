import { Component, ChangeDetectorRef, ViewChild } from '@angular/core';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { TransactionGroupBase } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { FlowAgentEditorComponent } from '@memberjunction/ng-flow-editor';

/**
 * Form section component for Flow Agent types.
 *
 * Wraps `FlowAgentEditorComponent` and — via {@link ContributeToSave} — makes the flow part of the
 * agent record's own atomic save. The editor's own Save button stays hidden here (`ShowSaveControls`
 * defaults to false): the form owns this record, and two save buttons for one record is how a user
 * ends up with an agent that reports "saved" while their step edits are gone.
 */
@Component({
  standalone: false,
    selector: 'mj-flow-agent-form-section',
    templateUrl: './flow-agent-form-section.component.html',
    styleUrls: ['./flow-agent-form-section.component.css']
})
@RegisterClass(BaseFormSectionComponent, 'AI Agents.FlowAgentSection')
export class FlowAgentFormSectionComponent extends BaseFormSectionComponent {
    /** Whether the flow editor is in full-screen mode */
    public IsFullScreen = false;

    @ViewChild(FlowAgentEditorComponent) private flowEditor: FlowAgentEditorComponent | undefined;

    get AgentID(): string | null {
        return this.record && 'ID' in this.record ? (this.record as MJAIAgentEntityExtended).ID : null;
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    /** Surfaces the canvas's dirty state to the host, so the form's Save reflects flow edits. */
    public override get HasPendingChanges(): boolean {
        return this.flowEditor?.HasUnsavedChanges === true;
    }

    /**
     * Queues the flow's steps and paths onto the form's transaction.
     *
     * Queued rather than saved: the host submits, so the agent row and its flow land together or
     * not at all. Returns true when there is nothing to contribute — an untouched canvas must not
     * block the record's save.
     */
    public override async ContributeToSave(transactionGroup: TransactionGroupBase): Promise<boolean> {
        if (!this.flowEditor?.HasUnsavedChanges) {
            return true;
        }
        try {
            await this.flowEditor.QueueSaveInto(transactionGroup);
            return true;
        } catch (error) {
            console.error('Failed to queue flow changes for save:', error);
            return false;
        }
    }

    /** Clears the canvas's dirty state once the form's transaction actually committed. */
    public override OnHostSaveCompleted(): void {
        this.flowEditor?.MarkSaved();
        this.cdr.detectChanges();
    }

    public OnFlowSaved(): void {
        // Trigger form dirty-state refresh if needed
        this.cdr.detectChanges();
    }

    public OnFullScreenToggled(fullScreen: boolean): void {
        this.IsFullScreen = fullScreen;
        this.cdr.detectChanges();
    }
}
