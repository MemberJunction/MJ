import { Component } from '@angular/core';
import { KnowledgeDeliveryTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeDeliveryTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Delivery Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgedeliverytype-form',
    templateUrl: './knowledgedeliverytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeDeliveryTypeFormComponent extends BaseFormComponent {
    public record!: KnowledgeDeliveryTypeEntity;
} 

export function LoadKnowledgeDeliveryTypeFormComponent() {
    LoadKnowledgeDeliveryTypeDetailsComponent();
}
