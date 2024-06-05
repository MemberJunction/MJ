import { Component } from '@angular/core';
import { EntityDocumentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityDocumentTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Document Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocumenttype-form',
    templateUrl: './entitydocumenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentTypeFormComponent extends BaseFormComponent {
    public record!: EntityDocumentTypeEntity;
} 

export function LoadEntityDocumentTypeFormComponent() {
    LoadEntityDocumentTypeDetailsComponent();
}
