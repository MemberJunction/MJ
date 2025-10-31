import { Component } from '@angular/core';
import { KnowledgeTrackingTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeTrackingTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Tracking Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgetrackingtype-form',
    templateUrl: './knowledgetrackingtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeTrackingTypeFormComponent extends BaseFormComponent {
    public record!: KnowledgeTrackingTypeEntity;
} 

export function LoadKnowledgeTrackingTypeFormComponent() {
    LoadKnowledgeTrackingTypeDetailsComponent();
}
