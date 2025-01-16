import { Component } from '@angular/core';
import { AIAgentNoteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentNoteDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'AI Agent Notes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentnote-form',
    templateUrl: './aiagentnote.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentNoteFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteEntity;
} 

export function LoadAIAgentNoteFormComponent() {
    LoadAIAgentNoteDetailsComponent();
}
