import { Component } from '@angular/core';
import { EntityDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityDocumentDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entitydocument-form',
    templateUrl: './entitydocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityDocumentFormComponent extends BaseFormComponent {
    public record!: EntityDocumentEntity;
} 

export function LoadEntityDocumentFormComponent() {
    LoadEntityDocumentDetailsComponent();
}
