import { Component } from '@angular/core';
import { AIAgentNoteTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAIAgentNoteTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'AIAgent Note Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentnotetype-form',
    templateUrl: './aiagentnotetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AIAgentNoteTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteTypeEntity;
} 

export function LoadAIAgentNoteTypeFormComponent() {
    LoadAIAgentNoteTypeDetailsComponent();
}
