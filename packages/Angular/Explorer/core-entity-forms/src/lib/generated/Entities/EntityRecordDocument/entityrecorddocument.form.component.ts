import { Component } from '@angular/core';
import { EntityRecordDocumentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityRecordDocumentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Entity Record Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrecorddocument-form',
    templateUrl: './entityrecorddocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityRecordDocumentFormComponent extends BaseFormComponent {
    public record!: EntityRecordDocumentEntity;
} 

export function LoadEntityRecordDocumentFormComponent() {
    LoadEntityRecordDocumentDetailsComponent();
}
