import { Component } from '@angular/core';
import { KnowledgeResultDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeResultDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Knowledge Result Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgeresultdetail-form',
    templateUrl: './knowledgeresultdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeResultDetailFormComponent extends BaseFormComponent {
    public record!: KnowledgeResultDetailEntity;
} 

export function LoadKnowledgeResultDetailFormComponent() {
    LoadKnowledgeResultDetailDetailsComponent();
}
