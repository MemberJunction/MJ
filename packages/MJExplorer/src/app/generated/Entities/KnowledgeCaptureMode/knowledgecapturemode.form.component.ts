import { Component } from '@angular/core';
import { KnowledgeCaptureModeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKnowledgeCaptureModeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Knowledge Capture Modes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-knowledgecapturemode-form',
    templateUrl: './knowledgecapturemode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KnowledgeCaptureModeFormComponent extends BaseFormComponent {
    public record!: KnowledgeCaptureModeEntity;
} 

export function LoadKnowledgeCaptureModeFormComponent() {
    LoadKnowledgeCaptureModeDetailsComponent();
}
