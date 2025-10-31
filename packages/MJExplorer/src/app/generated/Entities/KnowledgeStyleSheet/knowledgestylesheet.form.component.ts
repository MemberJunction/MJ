import { Component } from '@angular/core';
import { KnowledgeStyleSheetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeStyleSheetDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Style Sheets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgestylesheet-form',
    templateUrl: './knowledgestylesheet.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeStyleSheetFormComponent extends BaseFormComponent {
    public record!: KnowledgeStyleSheetEntity;
} 

export function LoadKnowledgeStyleSheetFormComponent() {
    LoadKnowledgeStyleSheetDetailsComponent();
}
