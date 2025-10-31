import { Component } from '@angular/core';
import { KnowledgeStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgestatus-form',
    templateUrl: './knowledgestatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeStatusFormComponent extends BaseFormComponent {
    public record!: KnowledgeStatusEntity;
} 

export function LoadKnowledgeStatusFormComponent() {
    LoadKnowledgeStatusDetailsComponent();
}
