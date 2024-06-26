import { Component } from '@angular/core';
import { EntityDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityDocumentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

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
