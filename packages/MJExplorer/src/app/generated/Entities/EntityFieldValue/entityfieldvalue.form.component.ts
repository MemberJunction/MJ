import { Component } from '@angular/core';
import { EntityFieldValueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityFieldValueDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Field Values') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityfieldvalue-form',
    templateUrl: './entityfieldvalue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityFieldValueFormComponent extends BaseFormComponent {
    public record: EntityFieldValueEntity | null = null;
} 

export function LoadEntityFieldValueFormComponent() {
    LoadEntityFieldValueDetailsComponent();
}
