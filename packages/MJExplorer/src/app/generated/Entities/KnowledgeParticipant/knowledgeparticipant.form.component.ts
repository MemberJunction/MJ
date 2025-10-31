import { Component } from '@angular/core';
import { KnowledgeParticipantEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeParticipantDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Knowledge Participants') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgeparticipant-form',
    templateUrl: './knowledgeparticipant.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeParticipantFormComponent extends BaseFormComponent {
    public record!: KnowledgeParticipantEntity;
} 

export function LoadKnowledgeParticipantFormComponent() {
    LoadKnowledgeParticipantDetailsComponent();
}
