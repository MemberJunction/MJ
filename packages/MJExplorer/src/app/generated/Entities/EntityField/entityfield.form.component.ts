import { Component } from '@angular/core';
import { EntityFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityFieldDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityfield-form',
    templateUrl: './entityfield.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityFieldFormComponent extends BaseFormComponent {
    public record: EntityFieldEntity | null = null;
} 

export function LoadEntityFieldFormComponent() {
    LoadEntityFieldDetailsComponent();
}
