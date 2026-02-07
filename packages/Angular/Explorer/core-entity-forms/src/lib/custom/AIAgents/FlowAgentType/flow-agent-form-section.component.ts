import { Component, ChangeDetectorRef } from '@angular/core';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Form section component for Flow Agent types.
 * Simply wraps the FlowAgentEditorComponent from @memberjunction/ng-flow-editor
 * and passes through the agent ID and edit mode.
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

    get AgentID(): string | null {
        return this.record && 'ID' in this.record ? (this.record as AIAgentEntityExtended).ID : null;
    }

    constructor(private cdr: ChangeDetectorRef) {
        super();
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
