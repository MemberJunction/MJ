import { Component } from '@angular/core';
import { KnowledgeAnswerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeAnswerDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Answers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgeanswer-form',
    templateUrl: './knowledgeanswer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeAnswerFormComponent extends BaseFormComponent {
    public record!: KnowledgeAnswerEntity;
} 

export function LoadKnowledgeAnswerFormComponent() {
    LoadKnowledgeAnswerDetailsComponent();
}
