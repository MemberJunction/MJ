import { Component } from '@angular/core';
import { EntityDocumentRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityDocumentRunDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Document Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumentrun-form',
    templateUrl: './entitydocumentrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentRunFormComponent extends BaseFormComponent {
    public record!: EntityDocumentRunEntity;
} 

export function LoadEntityDocumentRunFormComponent() {
    LoadEntityDocumentRunDetailsComponent();
}
