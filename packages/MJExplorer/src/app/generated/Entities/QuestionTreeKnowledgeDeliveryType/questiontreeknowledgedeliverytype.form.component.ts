import { Component } from '@angular/core';
import { QuestionTreeKnowledgeDeliveryTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionTreeKnowledgeDeliveryTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Question Tree Knowledge Delivery Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questiontreeknowledgedeliverytype-form',
    templateUrl: './questiontreeknowledgedeliverytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionTreeKnowledgeDeliveryTypeFormComponent extends BaseFormComponent {
    public record!: QuestionTreeKnowledgeDeliveryTypeEntity;
} 

export function LoadQuestionTreeKnowledgeDeliveryTypeFormComponent() {
    LoadQuestionTreeKnowledgeDeliveryTypeDetailsComponent();
}
